import { stat } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'

export async function resolveClientStaticAssetPath(clientDist: string, pathname: string): Promise<string | null> {
  if (!pathname.startsWith('/')) {
    return null
  }

  const decodedPathname = decodePathname(pathname)

  if (!decodedPathname || decodedPathname.includes('\0')) {
    return null
  }

  const staticRoot = resolve(clientDist)
  const filePath = resolve(staticRoot, `.${decodedPathname}`)

  if (!isPathInside(staticRoot, filePath)) {
    return null
  }

  const fileStats = await stat(filePath).catch((error: unknown) => {
    if (isMissingPathError(error)) {
      return null
    }

    throw error
  })

  return fileStats?.isFile() ? pathname : null
}

function decodePathname(pathname: string): string | null {
  try {
    return decodeURIComponent(pathname)
  } catch {
    return null
  }
}

function isPathInside(root: string, filePath: string): boolean {
  const relativePath = relative(root, filePath)

  return relativePath !== '' && !relativePath.startsWith('..') && !isAbsolute(relativePath)
}

function isMissingPathError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error.code === 'ENOENT' || error.code === 'ENOTDIR')
  )
}
