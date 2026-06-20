import { createFileRoute } from '@tanstack/react-router'

import { VerificationEmailSentRouteScreen } from '../screens/verification-email-sent-route-screen'
import { formatSiteTitle } from '../strings'

export const Route = createFileRoute('/verification-email-sent')({
  head: () => ({
    meta: [
      {
        title: formatSiteTitle('Verification email sent')
      },
      {
        name: 'description',
        content: 'A verification link has been sent to your email. Check your inbox to verify your email.'
      }
    ]
  }),
  component: VerificationEmailSentRouteScreen
})
