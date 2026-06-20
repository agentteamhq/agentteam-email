import debug from 'debug'

import { globals } from '../globals'

const log = debug('app:user:send-verification-email')

const RATE_LIMIT_MS = 2 * 60 * 1000 // 2 minutes

/**
 * Sends a verification email if one hasn't been sent recently.
 * Returns an error message string to display to the user, or undefined on success.
 */
export async function sendUserVerificationEmail(email: string): Promise<string | undefined> {
  const { db, auth } = await globals()

  const foundUser = await db.models.user
    .findOne({ email })
    .select({ _id: 1, emailVerified: 1, lastVerificationEmailSent: 1 })
    .exec()

  if (!foundUser) {
    // don't reveal whether the email exists
    return 'Please check your inbox to verify your email.'
  }

  if (foundUser.emailVerified) {
    // already verified, no action needed
    return undefined
  }

  // rate limit: if we sent one less than 2 minutes ago, just tell them to check inbox
  if (foundUser.lastVerificationEmailSent) {
    const elapsed = Date.now() - new Date(foundUser.lastVerificationEmailSent).getTime()
    if (elapsed < RATE_LIMIT_MS) {
      return 'A verification email was recently sent. Please check your inbox (and spam folder).'
    }
  }

  // send the verification email
  try {
    await auth.api.sendVerificationEmail({
      body: {
        email,
        callbackURL: '/redirect/email-verified/'
      }
    })

    // update the timestamp
    await db.models.user
      .updateOne({ _id: foundUser._id }, { $set: { lastVerificationEmailSent: new Date() } })
      .exec()

    log('sent verification email to %s', email)
    return 'Email not verified. A verification email has been sent, please check your inbox.'
  } catch (e) {
    // better auth may throw rate limit / too many requests errors
    if (e && typeof e === 'object' && 'statusCode' in e) {
      const apiError = e as { statusCode: number; message?: string }
      if (apiError.statusCode === 429) {
        log('too many verification email attempts for %s', email)
        return 'Too many attempts. Please wait a few minutes and try again.'
      }
    }
    log('error sending verification email to %s: %O', email, e)
    return 'Email not verified. Please check your inbox to verify your email.'
  }
}
