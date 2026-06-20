import type { ReactNode } from 'react'

import { RecoveryEmailSentPage } from '../partials/webapp/recovery-email-sent-page'
import { VerifyEmailSentPage } from '../partials/webapp/verify-email-sent-page'
import type { PublicEnv } from '../types'
import { AuthScreenFrame } from './auth-view-screen'

export interface EmailStatusScreenProps {
  publicEnv: PublicEnv
  type: 'recovery' | 'verification'
}

export function EmailStatusScreen({ type }: EmailStatusScreenProps) {
  const page: ReactNode = type === 'recovery' ? <RecoveryEmailSentPage /> : <VerifyEmailSentPage />

  return <AuthScreenFrame>{page}</AuthScreenFrame>
}
