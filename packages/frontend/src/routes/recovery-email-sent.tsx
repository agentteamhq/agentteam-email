import { createFileRoute } from '@tanstack/react-router'

import { RecoveryEmailSentRouteScreen } from '../screens/recovery-email-sent-route-screen'
import { formatSiteTitle } from '../strings'

export const Route = createFileRoute('/recovery-email-sent')({
  head: () => ({
    meta: [
      {
        title: formatSiteTitle('Password reset sent')
      },
      {
        name: 'description',
        content: 'A password reset link has been sent to your email. Check your inbox to reset your password.'
      }
    ]
  }),
  component: RecoveryEmailSentRouteScreen
})
