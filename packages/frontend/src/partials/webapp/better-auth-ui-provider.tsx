import type { AuthProviderProps } from '@better-auth-ui/react'
import { useSession } from '@better-auth-ui/react'
import debug from 'debug'
import { useEffect, useRef, type ReactNode } from 'react'

import { AuthProvider } from '../../components/auth/auth-provider'
import { deleteUserPlugin } from '../../lib/auth/delete-user-plugin'
import { magicLinkPlugin } from '../../lib/auth/magic-link-plugin'
import { authReactClient } from '../../lib/auth-react-client'
import { clearPersistedStore } from '../../store/use-store'

import { Link } from '../../components/link'
import { useEnvContext } from './env-context'

const log = debug('app:auth-setup')

export interface BetterAuthUIProviderProps {
  authClient?: AuthProviderProps['authClient']
  children: ReactNode
  redirectTo?: string
}

function AuthSessionCleanup({ authClient }: { authClient: AuthProviderProps['authClient'] }) {
  const { data, isPending } = useSession(authClient)
  const hadSessionRef = useRef<boolean | null>(null)

  useEffect(() => {
    if (isPending) {
      return
    }

    const hasSession = Boolean(data?.session)
    if (hadSessionRef.current === true && !hasSession) {
      log('cleaning up for signout...')
      clearPersistedStore()
    }
    hadSessionRef.current = hasSession
  }, [data?.session, isPending])

  return null
}

export function BetterAuthUIProvider({
  authClient = authReactClient,
  children,
  redirectTo = '/dashboard/'
}: BetterAuthUIProviderProps) {
  const { publicEnv } = useEnvContext()

  const navigate: AuthProviderProps['navigate'] = ({ to, replace }) => {
    if (typeof globalThis.window === 'undefined') {
      log('navigate called during SSR, ignoring', { to, replace })
      return
    }

    const currentPath = globalThis.window.location.pathname
    const targetUrl = new URL(to, globalThis.window.location.origin)
    const targetPath = targetUrl.pathname

    log('current path', currentPath, targetPath)

    if (currentPath.startsWith('/forgot-password') && targetPath.startsWith('/signin')) {
      log('intercepting forgot-password -> signin, redirecting to recovery-email')
      globalThis.window.location.assign('/recovery-email-sent/')
      return
    }

    if (currentPath.startsWith('/reset-password') && targetPath.startsWith('/signin')) {
      log('intercepting reset-password -> signin, adding reset_success param')
      targetUrl.searchParams.set('reset_success', '1')
      globalThis.window.location.assign(targetUrl.toString())
      return
    }

    if (currentPath.startsWith('/signup') && targetPath.startsWith('/signin')) {
      globalThis.window.location.assign('/verification-email-sent/')
      return
    }

    if (replace) {
      globalThis.window.location.replace(to)
    } else {
      globalThis.window.location.assign(to)
    }
  }

  return (
    <AuthProvider
      authClient={authClient}
      basePaths={{
        auth: '',
        organization: '/organization',
        settings: '/settings'
      }}
      baseURL={publicEnv.PUBLIC_HOSTNAME}
      emailAndPassword={{
        enabled: true,
        confirmPassword: true,
        forgotPassword: true,
        maxPasswordLength: 128,
        minPasswordLength: 8,
        name: true
      }}
      redirectTo={redirectTo}
      navigate={navigate}
      plugins={[magicLinkPlugin(), deleteUserPlugin({ sendDeleteAccountVerification: true })]}
      Link={Link}
      viewPaths={{
        auth: {
          signIn: 'signin',
          signOut: 'signout',
          signUp: 'signup',
          forgotPassword: 'forgot-password',
          resetPassword: 'reset-password'
        },
        settings: {
          account: 'account',
          security: 'account'
        }
      }}
      socialProviders={[
        ...(typeof publicEnv.PUBLIC_GOOGLE_CLIENT_ID === 'string' ? ['google' as const] : []),
        ...(typeof publicEnv.PUBLIC_LINKEDIN_CLIENT_ID === 'string' ? ['linkedin' as const] : [])
      ]}
      avatar={{
        enabled: false,
        extension: 'webp',
        resize: async (file) => file
      }}
    >
      <AuthSessionCleanup authClient={authClient} />
      {children}
    </AuthProvider>
  )
}
