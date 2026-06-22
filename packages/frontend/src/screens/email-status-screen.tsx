import { RecoveryEmailSentPage } from '../partials/webapp/recovery-email-sent-page'
import { VerifyEmailSentPage } from '../partials/webapp/verify-email-sent-page'
import { AuthScreenFrame } from './auth-view-screen'
import type { PublicEnv } from '../types'
import type { ReactNode } from 'react'

export interface EmailStatusScreenProps {
  publicEnv: PublicEnv
  type: 'recovery' | 'verification'
}

export function EmailStatusScreen({ type }: EmailStatusScreenProps) {
  const page: ReactNode = type === 'recovery' ? <RecoveryEmailSentPage /> : <VerifyEmailSentPage />

  return <AuthScreenFrame>{page}</AuthScreenFrame>
}
