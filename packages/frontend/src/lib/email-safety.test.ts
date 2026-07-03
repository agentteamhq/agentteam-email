import { describe, expect, it } from 'vitest'

import {
  buildEmailContentSecurityPolicy,
  buildEmailIframeDocument,
  normalizeEmailAttachmentURL,
  normalizeEmailLink
} from './email-safety'

describe('email safety rendering', () => {
  it('rejects unsafe and route-relative links', () => {
    expect(normalizeEmailLink('javascript:alert(1)', 'https://mail.example.test/dashboard/')).toBeNull()
    expect(normalizeEmailLink('/dashboard/?message=1', 'https://mail.example.test/dashboard/')).toBeNull()
    expect(normalizeEmailLink('#local-fragment', 'https://mail.example.test/dashboard/')).toBeNull()
  })

  it('allows mediated external link destinations', () => {
    expect(normalizeEmailLink('https://docs.example.test/path?q=1')).toBe(
      'https://docs.example.test/path?q=1'
    )
    expect(normalizeEmailLink('mailto:support@example.test?subject=Help')).toBe(
      'mailto:support@example.test?subject=Help'
    )
  })

  it('allows attachment downloads only through same-origin web-server URLs', () => {
    expect(
      normalizeEmailAttachmentURL(
        '/rpc/mail/accounts/support/mailboxes/inbox/messages/1/attachments/manifest',
        'https://app.example.test/dashboard/'
      )
    ).toBe(
      'https://app.example.test/rpc/mail/accounts/support/mailboxes/inbox/messages/1/attachments/manifest'
    )
    expect(
      normalizeEmailAttachmentURL(
        'https://app.example.test/rpc/mail/accounts/support/mailboxes/inbox/messages/1/attachments/manifest',
        'https://app.example.test/dashboard/'
      )
    ).toBe(
      'https://app.example.test/rpc/mail/accounts/support/mailboxes/inbox/messages/1/attachments/manifest'
    )
    expect(
      normalizeEmailAttachmentURL(
        'https://wildduck.example.test/users/support/attachments/manifest',
        'https://app.example.test/dashboard/'
      )
    ).toBeNull()
    expect(
      normalizeEmailAttachmentURL('javascript:alert(1)', 'https://app.example.test/dashboard/')
    ).toBeNull()
  })

  it('builds a strict iframe CSP with image loading disabled by default', () => {
    const blocked = buildEmailContentSecurityPolicy({
      allowRemoteImages: false,
      sameOrigin: 'https://mail.example.test'
    })
    const allowed = buildEmailContentSecurityPolicy({
      allowRemoteImages: true,
      sameOrigin: 'https://mail.example.test'
    })

    expect(blocked).toContain("default-src 'none'")
    expect(blocked).toContain("script-src 'none'")
    expect(blocked).toContain("connect-src 'none'")
    expect(blocked).toContain("img-src 'none'")
    expect(blocked).not.toContain('frame-ancestors')
    expect(blocked).not.toContain('navigate-to')
    expect(blocked).not.toContain('cid:')
    expect(blocked).not.toContain('http:')
    expect(blocked).not.toContain('https://mail.example.test')
    expect(allowed).toContain('img-src data: https://mail.example.test http: https:')
  })

  it('wraps mail-control display HTML without replacing message body content', () => {
    const document = buildEmailIframeDocument({
      bodyHTML:
        '<p>Body</p><img src="https://assets.example.test/pixel.png" alt="Tracking pixel"><img src="cid:logo@example.test" alt="Logo">',
      csp: "default-src 'none'; img-src 'none'"
    })

    expect(document).toContain('Content-Security-Policy')
    expect(document).toContain("img-src 'none'")
    expect(document).toContain('<body><p>Body</p>')
    expect(document).toContain('src="https://assets.example.test/pixel.png"')
    expect(document).toContain('src="cid:logo@example.test"')
    expect(document).not.toContain('Remote image blocked')
    expect(document).not.toContain('Inline image unavailable')
  })

  it('escapes the CSP attribute when building the iframe document', () => {
    const document = buildEmailIframeDocument({
      bodyHTML: '<p>Body</p>',
      csp: 'default-src "none"; img-src https://mail.example.test'
    })

    expect(document).toContain('Content-Security-Policy')
    expect(document).toContain('default-src &quot;none&quot;')
    expect(document).toContain('<body><p>Body</p></body>')
  })

  it('builds an iframe document that can follow system or explicit color scheme', () => {
    const automaticDocument = buildEmailIframeDocument({
      bodyHTML: '<p>Body</p>',
      csp: "default-src 'none'"
    })
    const darkDocument = buildEmailIframeDocument({
      bodyHTML: '<p>Body</p>',
      csp: "default-src 'none'",
      themeMode: 'dark'
    })

    expect(automaticDocument).toContain('color-scheme: light dark')
    expect(automaticDocument).toContain('--email-background: light-dark(')
    expect(automaticDocument).toContain('background: var(--email-background) !important')
    expect(automaticDocument).toContain('color: var(--email-foreground) !important')
    expect(automaticDocument).toContain('<html>')
    expect(automaticDocument).not.toContain('<html data-theme=')
    expect(darkDocument).toContain('<html data-theme="dark">')
    expect(darkDocument).toContain(":root[data-theme='dark'] { color-scheme: dark; }")
  })
})
