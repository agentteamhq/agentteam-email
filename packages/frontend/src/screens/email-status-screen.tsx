import { RecoveryEmailSentPage } from '../partials/webapp/recovery-email-sent-page'
import { AuthScreenFrame } from './auth-view-screen'

export function EmailStatusScreen() {
  return (
    <AuthScreenFrame>
      <RecoveryEmailSentPage />
    </AuthScreenFrame>
  )
}
