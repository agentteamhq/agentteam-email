import { useRouter } from '@tanstack/react-router'

import { EmailStatusScreen } from './email-status-screen'

export function RecoveryEmailSentRouteScreen() {
  const router = useRouter()

  return (
    <EmailStatusScreen
      publicEnv={router.options.context.publicEnv}
      type='recovery'
    />
  )
}
