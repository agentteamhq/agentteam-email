/* eslint-disable no-restricted-syntax */
import { EmailVerificationEmail, MagicLinkEmail, ResetPasswordEmail } from '@better-auth-ui/react/email'
import { render } from '@react-email/render'
import debug from 'debug'
import { createElement, type ReactNode } from 'react'
import { createTransport } from 'nodemailer'

import { STRINGS } from '../strings'
import { PRIVATE_VARS } from '../vars.private'

const log = debug('app:email')

export type EmailTemplatesType =
  | 'new-email-instructions'
  | 'reset-password-instructions'
  | 'password-changed'
  | 'email-magic-link'
  | 'confirmation-instructions'
  | 'delete-account-confirmation'
  | 'test-message-email'

export type EmailContextType = Record<string, string | undefined>

type RenderedEmail = {
  html: string
  text: string
}

function templateUrl(template: EmailTemplatesType, context: EmailContextType) {
  switch (template) {
    case 'email-magic-link':
      return context.magic_link_url
    case 'confirmation-instructions':
    case 'new-email-instructions':
      return context.confirmation_url
    case 'reset-password-instructions':
      return context.reset_password_url
    case 'delete-account-confirmation':
      return context.delete_account_url
    case 'password-changed':
    case 'test-message-email':
      return undefined
  }
}

function renderNode(template: EmailTemplatesType, to: string, context: EmailContextType): ReactNode {
  const appName = context.public_brand_name ?? STRINGS.BRAND_NAME
  const url = templateUrl(template, context)

  switch (template) {
    case 'email-magic-link':
      if (!url) {
        throw new Error('email-magic-link requires magic_link_url')
      }

      return createElement(MagicLinkEmail, {
        appName,
        email: to,
        poweredBy: false,
        url
      })

    case 'reset-password-instructions':
      if (!url) {
        throw new Error('reset-password-instructions requires reset_password_url')
      }

      return createElement(ResetPasswordEmail, {
        appName,
        email: to,
        poweredBy: false,
        url
      })

    case 'confirmation-instructions':
    case 'new-email-instructions':
      if (!url) {
        throw new Error(`${template} requires confirmation_url`)
      }

      return createElement(EmailVerificationEmail, {
        appName,
        email: to,
        poweredBy: false,
        url
      })

    case 'delete-account-confirmation':
      if (!url) {
        throw new Error('delete-account-confirmation requires delete_account_url')
      }

      return createElement(EmailVerificationEmail, {
        appName,
        email: to,
        localization: {
          CLICK_BUTTON_TO_VERIFY_EMAIL: 'Click the button below to confirm account deletion.',
          VERIFY_EMAIL_ADDRESS: 'Confirm account deletion',
          VERIFY_YOUR_EMAIL_ADDRESS: 'Confirm account deletion'
        },
        poweredBy: false,
        url
      })

    case 'password-changed':
    case 'test-message-email':
      return createElement(EmailVerificationEmail, {
        appName,
        email: to,
        localization: {
          CLICK_BUTTON_TO_VERIFY_EMAIL: 'This is a test message from your account.',
          VERIFY_EMAIL_ADDRESS: 'Open account',
          VERIFY_YOUR_EMAIL_ADDRESS: subjectForTemplate(template)
        },
        poweredBy: false,
        url: PRIVATE_VARS.SMTP_REPLY_TO_EMAIL
          ? `mailto:${PRIVATE_VARS.SMTP_REPLY_TO_EMAIL}`
          : 'https://example.com'
      })
  }
}

function subjectForTemplate(template: EmailTemplatesType) {
  switch (template) {
    case 'email-magic-link':
      return 'Your Magic Sign-In Link'
    case 'reset-password-instructions':
      return 'Reset Password'
    case 'confirmation-instructions':
      return 'Verify Email'
    case 'delete-account-confirmation':
      return 'Confirm account deletion'
    case 'new-email-instructions':
      return 'Change Email Requested'
    case 'password-changed':
      return 'Password changed'
    case 'test-message-email':
      return 'Test message'
  }
}

async function renderTemplate(
  to: string,
  template: EmailTemplatesType,
  context: EmailContextType
): Promise<RenderedEmail> {
  const node = renderNode(template, to, {
    ...context,
    public_brand_name: context.public_brand_name ?? STRINGS.BRAND_NAME
  })

  const [html, text] = await Promise.all([
    render(node),
    render(node, {
      plainText: true
    })
  ])

  return { html, text }
}

log(`SMTP - ${PRIVATE_VARS.SMTP_ADDRESS}:${PRIVATE_VARS.SMTP_PORT}`)
log(`SMTP Secure TLS Required - ${PRIVATE_VARS.SMTP_SECURE_TLS}`)

export async function sendEmail(
  to: string,
  subject: string,
  template: EmailTemplatesType,
  context: EmailContextType
) {
  const { html, text } = await renderTemplate(to, template, context)

  const transporter = createTransport({
    host: PRIVATE_VARS.SMTP_ADDRESS,
    port: PRIVATE_VARS.SMTP_PORT,
    secure: PRIVATE_VARS.SMTP_SECURE_TLS,
    requireTLS: PRIVATE_VARS.SMTP_SECURE_TLS,
    ...(PRIVATE_VARS.SMTP_SECURE_TLS
      ? {
          auth: {
            user: PRIVATE_VARS.SMTP_USERNAME,
            pass: PRIVATE_VARS.SMTP_PASSWORD
          }
        }
      : {}),
    tls: PRIVATE_VARS.SMTP_SECURE_TLS
      ? {}
      : {
          rejectUnauthorized: false
        }
  })

  log(`FROM EMAIL ESCAPE: (${PRIVATE_VARS.SMTP_FROM_EMAIL})`)

  const sentMail = await transporter.sendMail({
    from: PRIVATE_VARS.SMTP_FROM_EMAIL,
    replyTo: PRIVATE_VARS.SMTP_REPLY_TO_EMAIL,
    to,
    subject,
    html,
    text,
    ...(PRIVATE_VARS.SMTP_SEND_AS_EMAIL
      ? {
          envelope: {
            from: PRIVATE_VARS.SMTP_SEND_AS_EMAIL,
            to: [to]
          }
        }
      : {})
  })

  log('sentMail: ', {
    accepted: sentMail.accepted,
    envelope: sentMail.envelope,
    pending: sentMail.pending,
    rejected: sentMail.rejected,
    response: sentMail.response
  })
}
