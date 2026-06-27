import { HeadContent, Scripts, createRootRouteWithContext, useRouter } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { throwRouteRedirect } from '../lib/route-redirect'
import { NotFoundPage } from '../partials/webapp/not-found-page'
import { SiteMeta } from '../partials/webapp/site-meta'
import { serializePublicEnv } from '../public-env'
import { resolveFrontendServerRouteContext } from '../server-route-context'
import '../styles.css'
import { SITE_STRINGS } from '../strings'
import type { FrontendRouterContext } from '../types'

const ADMIN_SETUP_PATHS = new Set(['/admin/setup', '/admin/setup/'])

export const Route = createRootRouteWithContext<FrontendRouterContext>()({
  beforeLoad: async (loaderInput) => {
    const serverRouteContext = resolveFrontendServerRouteContext(loaderInput)

    if (!serverRouteContext?.serverRouteHandlers.loadAppRouteGate) {
      return
    }

    const routeGate = await serverRouteContext.serverRouteHandlers.loadAppRouteGate(
      serverRouteContext.request
    )

    if (routeGate.setupRequired && !ADMIN_SETUP_PATHS.has(loaderInput.location.pathname)) {
      throwRouteRedirect(routeGate.redirectTo)
    }
  },
  head: () => ({
    meta: [
      { charSet: 'UTF-8' },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1.0'
      },
      {
        title: SITE_STRINGS.DEFAULT_TITLE
      },
      {
        name: 'description',
        content: SITE_STRINGS.DEFAULT_DESCRIPTION
      }
    ]
  }),
  notFoundComponent: NotFoundPage,
  shellComponent: RootDocument
})

function RootDocument({ children }: { children: ReactNode }) {
  const router = useRouter()
  const publicEnv = router.options.context.publicEnv

  return (
    <html lang='en'>
      <head>
        <HeadContent />
        <SiteMeta publicEnv={publicEnv} />
      </head>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__WEBAPP_PUBLIC_ENV__=${serializePublicEnv(publicEnv)};`
          }}
        />
        {children}
        <Scripts />
      </body>
    </html>
  )
}
