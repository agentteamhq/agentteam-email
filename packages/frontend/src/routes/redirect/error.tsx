/* eslint-disable react-refresh/only-export-components */
import { createFileRoute } from '@tanstack/react-router'

import { createRedirectErrorViewState } from '../../lib/redirect-error-page'
import { RedirectErrorPage } from '../../partials/webapp/redirect-error-page'
import { SITE_STRINGS, formatSiteTitle } from '../../strings'

export const Route = createFileRoute('/redirect/error')({
  loader: (loaderInput) =>
    createRedirectErrorViewState({
      publicHostname: loaderInput.context.publicEnv.PUBLIC_HOSTNAME,
      url: loaderInput.location.href
    }),
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

function RedirectErrorRoute() {
  const state = Route.useLoaderData()

  return <RedirectErrorPage state={state} />
}
