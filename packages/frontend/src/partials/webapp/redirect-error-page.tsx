import {
  ArrowClockwiseIcon,
  ChatCircleTextIcon,
  EnvelopeSimpleIcon,
  WarningCircleIcon
} from '@phosphor-icons/react'

import { Link } from '../../components/link'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '../../components/ui/card'
import { Separator } from '../../components/ui/separator'
import type { RedirectErrorViewState } from '../../lib/redirect-error-page'

export interface RedirectErrorPageProps {
  state: RedirectErrorViewState
}

export function RedirectErrorPage({ state }: RedirectErrorPageProps) {
  return (
    <div className='flex min-h-screen w-full items-start justify-center px-4 py-6 sm:items-center'>
      <Card className='mx-auto w-full max-w-2xl'>
        <CardHeader className='space-y-3 pb-4 text-center'>
          <div className='flex justify-center'>
            <WarningCircleIcon
              aria-hidden='true'
              className='text-destructive size-14'
            />
          </div>
          <div className='flex flex-wrap justify-center gap-2'>
            <Badge variant='secondary'>{state.providerLabel}</Badge>
            <Badge variant='outline'>{state.flowLabel}</Badge>
          </div>
          <div className='space-y-2'>
            <CardTitle className='text-2xl sm:text-3xl'>{state.title}</CardTitle>
            <CardDescription className='text-base'>{state.description}</CardDescription>
          </div>
        </CardHeader>
        <CardContent className='space-y-4'>
          {state.providerMessage ? (
            <div className='bg-muted/40 rounded-md border px-4 py-3'>
              <p className='text-muted-foreground text-xs font-medium uppercase'>Provider message</p>
              <p className='mt-1 text-sm'>{state.providerMessage}</p>
            </div>
          ) : null}

          <Separator />

          <dl className='grid gap-2.5 text-sm'>
            <RedirectErrorDetail
              label='Error code'
              value={state.errorCode}
            />
            <RedirectErrorDetail
              label='Callback URI'
              value={state.callbackUri}
            />
            <RedirectErrorDetail
              label='Page URI'
              value={state.pageUri}
            />
            <RedirectErrorDetail
              label='Support reference'
              value={state.supportReference}
            />
            {state.redactedQueryKeys.length > 0 ? (
              <RedirectErrorDetail
                label='Redacted fields'
                value={state.redactedQueryKeys.join(', ')}
              />
            ) : null}
          </dl>
        </CardContent>
        <CardFooter className='flex flex-col gap-3 pt-2 sm:flex-row sm:justify-center'>
          <Button asChild>
            <Link
              href={state.retryHref}
              unstyled
            >
              <ArrowClockwiseIcon aria-hidden='true' />
              Try again
            </Link>
          </Button>
          <Button
            asChild
            variant='outline'
          >
            <Link
              href={state.supportEmailHref}
              unstyled
            >
              <EnvelopeSimpleIcon aria-hidden='true' />
              Email support
            </Link>
          </Button>
          <Button
            asChild
            variant='outline'
          >
            <Link
              href={state.discordHref}
              unstyled
            >
              <ChatCircleTextIcon aria-hidden='true' />
              Open Discord
            </Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}

function RedirectErrorDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className='grid gap-1 sm:grid-cols-[9rem_1fr] sm:gap-4'>
      <dt className='text-muted-foreground font-medium'>{label}</dt>
      <dd className='break-all font-mono text-xs sm:text-sm'>{value}</dd>
    </div>
  )
}
