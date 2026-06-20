import * as React from 'react'

type CopyStatus = 'idle' | 'copied' | 'error'

interface UseCopyToClipboardReturn {
  copy: (text: string) => Promise<boolean>
  status: CopyStatus
  reset: () => void
}

function isClipboardAvailable(): boolean {
  return (
    typeof globalThis.navigator !== 'undefined' &&
    typeof globalThis.navigator.clipboard !== 'undefined' &&
    typeof globalThis.navigator.clipboard.writeText === 'function'
  )
}

function isDocumentAvailable(): boolean {
  return typeof globalThis.document !== 'undefined'
}

async function copyWithClipboardApi(text: string): Promise<boolean> {
  if (!isClipboardAvailable()) {
    return false
  }
  try {
    await globalThis.navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

function copyWithExecCommand(text: string): boolean {
  if (!isDocumentAvailable()) {
    return false
  }

  const textarea = globalThis.document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  textarea.style.top = '-9999px'
  textarea.setAttribute('readonly', '')

  globalThis.document.body.appendChild(textarea)
  textarea.select()

  let success = false
  try {
    // execCommand is deprecated but needed as fallback for older browsers
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    success = globalThis.document.execCommand('copy')
  } catch {
    success = false
  }

  globalThis.document.body.removeChild(textarea)
  return success
}

export function useCopyToClipboard(resetDelay = 2000): UseCopyToClipboardReturn {
  const [status, setStatus] = React.useState<CopyStatus>('idle')
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const reset = React.useCallback(() => {
    setStatus('idle')
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  const copy = React.useCallback(
    async (text: string): Promise<boolean> => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current)
      }

      let success = await copyWithClipboardApi(text)

      if (!success) {
        success = copyWithExecCommand(text)
      }

      setStatus(success ? 'copied' : 'error')

      if (resetDelay > 0) {
        timeoutRef.current = setTimeout(() => {
          setStatus('idle')
          timeoutRef.current = null
        }, resetDelay)
      }

      return success
    },
    [resetDelay]
  )

  React.useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  return { copy, status, reset }
}
