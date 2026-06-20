import { HeadContent, Scripts, createRootRouteWithContext, useRouter } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { SiteMeta } from '../partials/webapp/site-meta'
import { serializePublicEnv } from '../public-env'
import '../styles.css'
import { SITE_STRINGS } from '../strings'
import type { FrontendRouterContext } from '../types'

export const Route = createRootRouteWithContext<FrontendRouterContext>()({
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
