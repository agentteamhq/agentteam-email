import * as React from 'react'
import { CheckCircleIcon, DesktopTowerIcon, ShieldCheckIcon, XCircleIcon } from '@phosphor-icons/react'

import { Alert, AlertDescription } from '../components/ui/alert'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Spinner } from '../components/ui/spinner'
import { formatDeviceUserCode, normalizeDeviceUserCode } from '../lib/device-auth-api'
import { AuthScreenFrame } from './auth-view-screen'

type DeviceCodePhase = 'idle' | 'verifying'
type DeviceDecisionPhase = 'idle' | 'approving' | 'denying' | 'approved' | 'denied'

export interface DeviceCodeVerificationScreenProps {
  initialError?: string | null
  initialUserCode?: string | null
  onVerify: (userCode: string) => Promise<void>
}

export interface DeviceCodeApprovalScreenProps {
  initialError?: string | null
  onApprove: (userCode: string) => Promise<void>
  onDeny: (userCode: string) => Promise<void>
  userCode: string | null
  userEmail?: string | null
  userName?: string | null
}

export function DeviceCodeVerificationScreen({
  initialError = null,
  initialUserCode,
  onVerify
}: DeviceCodeVerificationScreenProps) {
  const [userCode, setUserCode] = React.useState(formatDeviceUserCode(initialUserCode ?? ''))
  const [phase, setPhase] = React.useState<DeviceCodePhase>('idle')
  const [error, setError] = React.useState<string | null>(initialError)

  const submit = React.useCallback(
    (event: React.SyntheticEvent<HTMLFormElement>) => {
      event.preventDefault()
      const normalized = normalizeDeviceUserCode(userCode)
      if (normalized === '') {
        setError('Enter the code shown by at-email.')
        return
      }

      setError(null)
      setPhase('verifying')
      Promise.resolve(onVerify(normalized)).catch((caught: unknown) => {
        setPhase('idle')
        setError(caught instanceof Error ? caught.message : 'Device verification failed.')
      })
    },
    [onVerify, userCode]
  )

  return (
    <AuthScreenFrame>
      <section
        className='border-border bg-card text-card-foreground w-full max-w-md rounded-lg border p-6 shadow-sm'
      >
        <div className='mb-6 flex items-start gap-3'>
          <div
            className='bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center
              rounded-md'
          >
            <DesktopTowerIcon className='size-5' />
          </div>
          <div>
            <h1 className='text-xl font-semibold'>Authorize at-email</h1>
            <p className='text-muted-foreground mt-1 text-sm'>
              Enter the code printed by the CLI to connect it to this account.
            </p>
          </div>
        </div>

        <form
          className='space-y-4'
          onSubmit={submit}
        >
          <div className='space-y-2'>
            <Label htmlFor='device-user-code'>Device code</Label>
            <Input
              id='device-user-code'
              autoComplete='one-time-code'
              autoFocus
              className='font-mono text-base uppercase'
              disabled={phase === 'verifying'}
              inputMode='text'
              maxLength={12}
              onChange={(event) => {
                setUserCode(formatDeviceUserCode(event.target.value))
              }}
              placeholder='ABCD-EFGH'
              value={userCode}
            />
          </div>

          {error ? (
            <Alert variant='destructive'>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <Button
            className='w-full'
            disabled={phase === 'verifying'}
            type='submit'
          >
            {phase === 'verifying' ? <Spinner /> : <ShieldCheckIcon />}
            Continue
          </Button>
        </form>
      </section>
    </AuthScreenFrame>
  )
}

export function DeviceCodeApprovalScreen({
  initialError = null,
  onApprove,
  onDeny,
  userCode,
  userEmail,
  userName
}: DeviceCodeApprovalScreenProps) {
  const [phase, setPhase] = React.useState<DeviceDecisionPhase>('idle')
  const [error, setError] = React.useState<string | null>(initialError)
  const formattedUserCode = userCode ? formatDeviceUserCode(userCode) : null
  const accountLabel = userEmail ?? userName ?? 'this account'
  const busy = phase === 'approving' || phase === 'denying'

  const approve = React.useCallback(() => {
    if (!userCode) {
      setError('Device code is missing.')
      return
    }
    setError(null)
    setPhase('approving')
    Promise.resolve(onApprove(userCode))
      .then(() => {
        setPhase('approved')
      })
      .catch((caught: unknown) => {
        setPhase('idle')
        setError(caught instanceof Error ? caught.message : 'Device approval failed.')
      })
  }, [onApprove, userCode])

  const deny = React.useCallback(() => {
    if (!userCode) {
      setError('Device code is missing.')
      return
    }
    setError(null)
    setPhase('denying')
    Promise.resolve(onDeny(userCode))
      .then(() => {
        setPhase('denied')
      })
      .catch((caught: unknown) => {
        setPhase('idle')
        setError(caught instanceof Error ? caught.message : 'Device denial failed.')
      })
  }, [onDeny, userCode])

  return (
    <AuthScreenFrame>
      <section
        className='border-border bg-card text-card-foreground w-full max-w-md rounded-lg border p-6 shadow-sm'
      >
        <div className='mb-6 flex items-start gap-3'>
          <div
            className='bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center
              rounded-md'
          >
            <ShieldCheckIcon className='size-5' />
          </div>
          <div>
            <h1 className='text-xl font-semibold'>Approve at-email CLI</h1>
            <p className='text-muted-foreground mt-1 text-sm'>
              This gives the CLI a revocable session for {accountLabel}.
            </p>
          </div>
        </div>

        <div className='space-y-4'>
          <div className='bg-muted/50 rounded-md border p-4'>
            <p className='text-muted-foreground text-xs font-medium uppercase'>Device code</p>
            <p className='mt-1 font-mono text-lg'>{formattedUserCode ?? 'Missing'}</p>
          </div>

          <div className='bg-muted/50 rounded-md border p-4'>
            <p className='text-muted-foreground text-xs font-medium uppercase'>Signed in as</p>
            <p className='mt-1 truncate text-sm font-medium'>{accountLabel}</p>
          </div>

          {phase === 'approved' ? (
            <Alert>
              <CheckCircleIcon />
              <AlertDescription>at-email is connected. Return to the CLI.</AlertDescription>
            </Alert>
          ) : null}

          {phase === 'denied' ? (
            <Alert>
              <XCircleIcon />
              <AlertDescription>The device request was denied. Return to the CLI.</AlertDescription>
            </Alert>
          ) : null}

          {error ? (
            <Alert variant='destructive'>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <div className='grid grid-cols-2 gap-3'>
            <Button
              disabled={busy || phase === 'approved' || phase === 'denied'}
              onClick={deny}
              type='button'
              variant='outline'
            >
              {phase === 'denying' ? <Spinner /> : <XCircleIcon />}
              Deny
            </Button>
            <Button
              disabled={busy || phase === 'approved' || phase === 'denied'}
              onClick={approve}
              type='button'
            >
              {phase === 'approving' ? <Spinner /> : <CheckCircleIcon />}
              Approve
            </Button>
          </div>
        </div>
      </section>
    </AuthScreenFrame>
  )
}
