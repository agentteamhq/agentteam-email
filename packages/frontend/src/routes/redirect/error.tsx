/* eslint-disable react-refresh/only-export-components */
import { createFileRoute } from '@tanstack/react-router'

import {
  createRedirectErrorDiagnosticLogDetails,
  createRedirectErrorViewState
} from '../../lib/redirect-error-page'
import { RedirectErrorPage } from '../../partials/webapp/redirect-error-page'
import { SITE_STRINGS, formatSiteTitle } from '../../strings'
import type { FrontendLoaderInput } from '../../server-route-context'
import type { RedirectErrorViewState } from '../../lib/redirect-error-page'

export type RedirectErrorLoaderInput = FrontendLoaderInput & {
  location: {
    href: string
  }
}

export const Route = createFileRoute('/redirect/error')({
  loader: (loaderInput) => loadRedirectErrorRouteState(loaderInput),
  head: () => ({
    meta: [
      {
        title: formatSiteTitle('Redirect error')
      },
      {
        name: 'description',
        content: `A sign-in or connection redirect for ${SITE_STRINGS.APP_DISPLAY_NAME} did not complete.`
      }
    ]
  }),
  component: RedirectErrorRoute
})

export function loadRedirectErrorRouteState(loaderInput: RedirectErrorLoaderInput): RedirectErrorViewState {
  const occurredAt = new Date()
  const options = {
    occurredAt,
    publicHostname: loaderInput.context.publicEnv.PUBLIC_HOSTNAME,
    url: loaderInput.location.href
  }
  const state = createRedirectErrorViewState(options)

  loaderInput.serverContext?.logRedirectError?.(createRedirectErrorDiagnosticLogDetails(options))

  return state
}

function RedirectErrorRoute() {
  const state = Route.useLoaderData()

  return <RedirectErrorPage state={state} />
}
