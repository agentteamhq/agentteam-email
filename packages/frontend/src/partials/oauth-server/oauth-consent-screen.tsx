import * as React from 'react'
import {
  ArrowSquareOutIcon,
  CheckCircleIcon,
  PlugsConnectedIcon,
  WarningCircleIcon,
  XCircleIcon
} from '@phosphor-icons/react'

import { Alert, AlertDescription } from '../../components/ui/alert'
import { Button } from '../../components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '../../components/ui/card'

export type OAuthConsentDecisionPhase = 'idle' | 'approving' | 'denying' | 'approved' | 'denied'

export interface OAuthConsentClientView {
  clientId: string
  contacts: readonly string[]
  iconUrl: string | null
  name: string
  policyUrl: string | null
  tosUrl: string | null
  uri: string | null
}

export interface OAuthConsentScopeView {
  description: string
  label: string
  scope: string
  tone?: 'default' | 'sensitive'
}

export interface OAuthConsentScreenProps {
  client: OAuthConsentClientView | null
  clientError?: string | null
  clientLoading?: boolean
  decisionError?: string | null
  decisionPhase?: OAuthConsentDecisionPhase
  invalidMessage?: string | null
  onApprove: () => void
  onDeny: () => void
  scopes: readonly OAuthConsentScopeView[]
  signedInEmail?: string | null
  signedInName?: string | null
}

export function OAuthConsentScreen({
  client,
  clientError = null,
  clientLoading = false,
  decisionError = null,
  decisionPhase = 'idle',
  invalidMessage = null,
  onApprove,
  onDeny,
  scopes,
  signedInEmail,
  signedInName
}: OAuthConsentScreenProps) {
  const busy = decisionPhase === 'approving' || decisionPhase === 'denying'
  const final = decisionPhase === 'approved' || decisionPhase === 'denied'
  const canDecide = Boolean(client && !clientLoading && !clientError && !invalidMessage && !final)
  const clientName = client?.name ?? 'application'
  const accountLabel = signedInEmail ?? signedInName ?? 'current account'
  const permissionItems = oauthConsentPermissionItems(scopes)

  return (
    <Card className='w-full max-w-md gap-0 py-5 shadow-none'>
      <CardHeader className='gap-4 px-5'>
        <div className='flex items-start gap-3'>
          <OAuthConsentClientIcon client={client} />
          <div className='min-w-0'>
            <CardTitle className='text-lg'>
              {clientLoading ? 'Connect application' : `Connect ${clientName}`}
            </CardTitle>
            <CardDescription className='mt-1'>
              {clientLoading
                ? 'Loading application details.'
                : `${clientName} wants access to AgentTeam Email for this organization.`}
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className='grid gap-4 px-5 pt-4'>
        {invalidMessage ? <OAuthConsentError message={invalidMessage} /> : null}
        {clientError ? <OAuthConsentError message={clientError} /> : null}
        {decisionError ? <OAuthConsentError message={decisionError} /> : null}

        <div className='grid gap-1 text-sm'>
          <p className='text-muted-foreground'>Signed in as</p>
          <p className='truncate font-medium'>{accountLabel}</p>
        </div>

        <div className='grid gap-2 text-sm'>
          <p className='font-medium'>Allow this app to:</p>
          <ul className='grid gap-2'>
            {permissionItems.map((item) => (
              <li
                className='flex items-start gap-2 text-sm'
                key={item}
              >
                <CheckCircleIcon className='text-muted-foreground mt-0.5 size-4 shrink-0' />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        {client?.policyUrl || client?.tosUrl ? (
          <div className='text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-xs'>
            {client.policyUrl ? <OAuthConsentClientLink href={client.policyUrl}>Privacy</OAuthConsentClientLink> : null}
            {client.tosUrl ? <OAuthConsentClientLink href={client.tosUrl}>Terms</OAuthConsentClientLink> : null}
          </div>
        ) : null}

        {final ? (
          <p className='text-muted-foreground text-sm'>
            {decisionPhase === 'approved' ? 'Approved. Redirecting...' : 'Canceled. Redirecting...'}
          </p>
        ) : null}
      </CardContent>

      <CardFooter className='grid gap-2 px-5 pt-5 sm:grid-cols-2'>
        <Button
          disabled={!canDecide || busy}
          onClick={onApprove}
        >
          {decisionPhase === 'approving' ? null : <CheckCircleIcon />}
          {decisionPhase === 'approving' ? 'Allowing' : 'Allow'}
        </Button>
        <Button
          disabled={!canDecide || busy}
          onClick={onDeny}
          variant='outline'
        >
          {decisionPhase === 'denying' ? null : <XCircleIcon />}
          {decisionPhase === 'denying' ? 'Canceling' : 'Cancel'}
        </Button>
      </CardFooter>
    </Card>
  )
}

function OAuthConsentClientIcon({ client }: { client: OAuthConsentClientView | null }) {
  return (
    <div className='bg-muted flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md'>
      {client?.iconUrl ? (
        <img
          alt=''
          aria-hidden='true'
          className='size-full object-cover'
          draggable={false}
          src={client.iconUrl}
        />
      ) : (
        <PlugsConnectedIcon className='text-muted-foreground size-5' />
      )}
    </div>
  )
}

function OAuthConsentError({ message }: { message: string }) {
  return (
    <Alert variant='destructive'>
      <WarningCircleIcon />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  )
}

function OAuthConsentClientLink({ children, href }: { children: React.ReactNode; href: string }) {
  return (
    <a
      className='hover:text-foreground inline-flex items-center gap-1 underline-offset-4 hover:underline'
      href={href}
      rel='noreferrer'
      target='_blank'
    >
      {children}
      <ArrowSquareOutIcon className='size-3.5' />
    </a>
  )
}

function oauthConsentPermissionItems(scopes: readonly OAuthConsentScopeView[]) {
  const requestedScopes = new Set(scopes.map((scope) => scope.scope))
  const items: string[] = []

  if (requestedScopes.has('email.full_access')) {
    items.push('Use AgentTeam Email mail APIs')
  }

  if (requestedScopes.has('offline_access')) {
    items.push('Stay connected until revoked')
  }

  if (['openid', 'profile', 'email'].some((scope) => requestedScopes.has(scope))) {
    items.push('Read basic account details')
  }

  const knownScopes = new Set(['email.full_access', 'email', 'offline_access', 'openid', 'profile'])
  if (scopes.some((scope) => !knownScopes.has(scope.scope))) {
    items.push('Request additional access')
  }

  return items.length > 0 ? items : ['Continue without additional permissions']
}
