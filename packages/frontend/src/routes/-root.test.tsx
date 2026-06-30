import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { NotFoundPage } from '../partials/webapp/not-found-page'
import { RootDocument } from './__root'
import type { PublicEnv } from '../types'

const rootRouteTestState = vi.hoisted(() => ({
  publicEnv: {
    DEV: false,
    NODE_ENV: 'test',
    PROD: false,
    PUBLIC_GOOGLE_CLIENT_ID: undefined,
    PUBLIC_HOSTNAME: 'https://mail.example.com',
    PUBLIC_HTTPS_PROTO: true,
    PUBLIC_LINKEDIN_CLIENT_ID: undefined,
    TEST: true
  } satisfies PublicEnv
}))

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()

  return {
    ...actual,
    HeadContent: () => null,
    Scripts: () => null,
    useRouter: () => ({
      options: {
        context: {
          publicEnv: rootRouteTestState.publicEnv
        }
      }
    }),
    useRouterState: ({
      select
    }: {
      select: (state: {
        location: { pathname: string }
        matches: Array<{ meta: Array<unknown> }>
      }) => unknown
    }) =>
      select({
        location: {
          pathname: '/nope/'
        },
        matches: [{ meta: [] }]
      })
  }
})

describe('root document', () => {
  it('provides public env context to root not-found content', () => {
    const html = renderToStaticMarkup(
      <RootDocument>
        <NotFoundPage />
      </RootDocument>
    )

    expect(html).toContain('Resource not found')
    expect(html).toContain('href="/"')
  })
})
