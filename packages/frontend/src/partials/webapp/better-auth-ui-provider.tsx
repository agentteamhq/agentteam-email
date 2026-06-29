import { useSession } from '@better-auth-ui/react'
import { useLocation, useRouter } from '@tanstack/react-router'
import debug from 'debug'
import { useTheme } from 'next-themes'
import { useCallback, useEffect, useRef } from 'react'

import { AuthProvider } from '../../components/auth/auth-provider'
import { apiKeyPlugin } from '../../lib/auth/api-key-plugin'
import { deleteUserPlugin } from '../../lib/auth/delete-user-plugin'
import { magicLinkPlugin } from '../../lib/auth/magic-link-plugin'
import { multiSessionPlugin } from '../../lib/auth/multi-session-plugin'
import { organizationPlugin } from '../../lib/auth/organization-plugin'
import { passkeyPlugin } from '../../lib/auth/passkey-plugin'
import { themePlugin } from '../../lib/auth/theme-plugin'
import { authReactClient } from '../../lib/auth-react-client'
import { clearPersistedStore } from '../../store/use-store'

import { Link } from '../../components/link'
import { useEnvContext } from './env-context'
import type { ReactNode } from 'react'
import type { AuthProviderProps } from '@better-auth-ui/react'

const log = debug('app:auth-setup')

function resolveNavigationHref(to: string, baseURL: string) {
  const publicURL = new URL(baseURL)
  const targetURL = new URL(to, publicURL)

  if (targetURL.origin === publicURL.origin) {
    return `${targetURL.pathname}${targetURL.search}${targetURL.hash}`
  }

  return targetURL.toString()
}

export interface BetterAuthUIProviderProps {
  authClient?: AuthProviderProps['authClient']
  children: ReactNode
  redirectTo?: string
  sessionCleanupEnabled?: boolean
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
  redirectTo = '/dashboard/',
  sessionCleanupEnabled = true
}: BetterAuthUIProviderProps) {
  const { publicEnv } = useEnvContext()
  const currentPath = useLocation({ select: (location) => location.pathname })
  const router = useRouter()

  const navigateToHref = useCallback(
    (href: string, replace?: boolean) => {
      router.navigate({ href, replace }).catch((error: unknown) => {
        log('navigation failed', error)
      })
    },
    [router]
  )

  const navigate: AuthProviderProps['navigate'] = useCallback(
    ({ to, replace }) => {
      const targetUrl = new URL(to, publicEnv.PUBLIC_HOSTNAME)
      const targetHref = resolveNavigationHref(to, publicEnv.PUBLIC_HOSTNAME)
      const targetPath = targetUrl.pathname

      log('current path', currentPath, targetPath)

      if (currentPath.startsWith('/forgot-password') && targetPath.startsWith('/signin')) {
        log('intercepting forgot-password -> signin, redirecting to recovery-email')
        navigateToHref('/recovery-email-sent/', true)
        return
      }

      if (currentPath.startsWith('/reset-password') && targetPath.startsWith('/signin')) {
        log('intercepting reset-password -> signin, adding reset_success param')
        targetUrl.searchParams.set('reset_success', '1')
        navigateToHref(resolveNavigationHref(targetUrl.toString(), publicEnv.PUBLIC_HOSTNAME), true)
        return
      }

      if (currentPath.startsWith('/signup') && targetPath.startsWith('/signin')) {
        navigateToHref('/verification-email-sent/', true)
        return
      }

      navigateToHref(targetHref, replace)
    },
    [currentPath, navigateToHref, publicEnv.PUBLIC_HOSTNAME]
  )

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
      plugins={[
        magicLinkPlugin(),
        passkeyPlugin(),
        multiSessionPlugin(),
        organizationPlugin(),
        apiKeyPlugin({ organization: true }),
        themePlugin({ useTheme }),
        deleteUserPlugin({ sendDeleteAccountVerification: true })
      ]}
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
          security: 'security',
          organizations: 'organizations'
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
      {sessionCleanupEnabled ? <AuthSessionCleanup authClient={authClient} /> : null}
      {children}
    </AuthProvider>
  )
}
