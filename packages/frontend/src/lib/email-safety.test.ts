import { describe, expect, it } from 'vitest'

import {
  buildEmailContentSecurityPolicy,
  buildEmailIframeDocument,
  normalizeEmailAttachmentURL,
  normalizeEmailLink,
  rewriteEmailHTMLForIframe
} from './email-safety'

const itWithDOM = typeof globalThis.document === 'undefined' ? it.skip : it

describe('email safety rendering', () => {
  itWithDOM('blocks remote image sources by replacing them with inert placeholders', () => {
    const rewritten = rewriteEmailHTMLForIframe(
      '<p onclick="alert(1)">Hello</p><img src="https://assets.example.test/pixel.png" onerror="alert(1)" alt="Tracking pixel" width="24" height="24">',
      { allowRemoteImages: false, baseURL: 'https://mail.example.test/dashboard/' }
    )

    expect(rewritten.blockedRemoteImageCount).toBe(1)
    expect(rewritten.html).toContain('email-remote-image-placeholder')
    expect(rewritten.html).toContain('Remote image blocked')
    expect(rewritten.html).not.toContain('src="https://assets.example.test/pixel.png"')
    expect(rewritten.html).not.toContain('onclick')
    expect(rewritten.html).not.toContain('onerror')
  })

  itWithDOM('strips background attributes and inline styles before iframe rendering', () => {
    const rewritten = rewriteEmailHTMLForIframe(
      [
        '<table background="https://assets.example.test/table.png">',
        '<tr><td style="background-image: url(https://assets.example.test/cell.png); color: red">',
        'Content',
        '</td></tr>',
        '</table>'
      ].join(''),
      { allowRemoteImages: false, baseURL: 'https://mail.example.test/dashboard/' }
    )

    expect(rewritten.blockedRemoteImageCount).toBe(0)
    expect(rewritten.html).not.toContain('background="https://assets.example.test/table.png"')
    expect(rewritten.html).not.toContain('background-image')
    expect(rewritten.html).not.toContain('assets.example.test')
  })

  itWithDOM('strips encoded inline styles through DOM attribute handling', () => {
    const rewritten = rewriteEmailHTMLForIframe(
      '<div style="background-image: url(&quot;https://assets.example.test/encoded.png&quot;); color: red">Content</div>',
      { allowRemoteImages: false, baseURL: 'https://mail.example.test/dashboard/' }
    )

    expect(rewritten.blockedRemoteImageCount).toBe(0)
    expect(rewritten.html).not.toContain('background-image')
    expect(rewritten.html).not.toContain('assets.example.test')
  })

  itWithDOM('drops document resource and navigation tags before iframe rendering', () => {
    const rewritten = rewriteEmailHTMLForIframe(
      [
        '<base href="https://wildduck.example.test/">',
        '<meta http-equiv="refresh" content="0; url=https://wildduck.example.test/session">',
        '<link rel="stylesheet" href="https://wildduck.example.test/email.css">',
        '<p>Document content is still visible.</p>',
        '<script><img src="https://wildduck.example.test/script-pixel.png"></script>',
        '<iframe src="https://wildduck.example.test/frame">iframe fallback</iframe>',
        '<object data="https://wildduck.example.test/object">object fallback</object>',
        '<embed src="https://wildduck.example.test/embed">'
      ].join(''),
      { allowRemoteImages: false, baseURL: 'https://mail.example.test/dashboard/' }
    )

    expect(rewritten.html).toContain('Document content is still visible.')
    expect(rewritten.html).not.toContain('wildduck.example.test')
    expect(rewritten.html).not.toContain('<base')
    expect(rewritten.html).not.toContain('<meta')
    expect(rewritten.html).not.toContain('<link')
    expect(rewritten.html).not.toContain('<script')
    expect(rewritten.html).not.toContain('<iframe')
    expect(rewritten.html).not.toContain('iframe fallback')
    expect(rewritten.html).not.toContain('<object')
    expect(rewritten.html).not.toContain('object fallback')
    expect(rewritten.html).not.toContain('<embed')
  })

  itWithDOM('sanitizes every srcset candidate before preserving the attribute', () => {
    const rewritten = rewriteEmailHTMLForIframe(
      [
        '<picture>',
        '<source srcset="https://assets.example.test/hero.avif 1x, javascript:alert(1) 2x">',
        '<img srcset="data:image/gif;base64,R0lGODlhAQABAAAAACw= 1x, https://assets.example.test/hero.png 2x, /same-origin.png 3x" alt="Fallback">',
        '</picture>'
      ].join(''),
      { allowRemoteImages: true, baseURL: 'https://mail.example.test/dashboard/' }
    )

    expect(rewritten.blockedRemoteImageCount).toBe(0)
    expect(rewritten.html).toContain('srcset="https://assets.example.test/hero.avif 1x"')
    expect(rewritten.html).toContain(
      'srcset="data:image/gif;base64,R0lGODlhAQABAAAAACw= 1x, https://assets.example.test/hero.png 2x"'
    )
    expect(rewritten.html).not.toContain('javascript:')
    expect(rewritten.html).not.toContain('/same-origin.png')
  })

  itWithDOM('restores known blocked remote image sources only after opt-in metadata matches', () => {
    const blocked = rewriteEmailHTMLForIframe(
      '<img data-agent-mail-remote-image-id="image-1" data-agent-mail-remote-image-src="https://assets.example.test/hero.png" alt="Hero">',
      {
        allowRemoteImages: false,
        knownRemoteImages: [{ id: 'image-1', url: 'https://assets.example.test/hero.png' }]
      }
    )
    const allowed = rewriteEmailHTMLForIframe(
      '<img data-agent-mail-remote-image-id="image-1" data-agent-mail-remote-image-src="https://assets.example.test/hero.png" alt="Hero">',
      {
        allowRemoteImages: true,
        knownRemoteImages: [{ id: 'image-1', url: 'https://assets.example.test/hero.png' }]
      }
    )
    const untrusted = rewriteEmailHTMLForIframe(
      '<img data-agent-mail-remote-image-id="image-1" data-agent-mail-remote-image-src="https://assets.example.test/hero.png" alt="Hero">',
      { allowRemoteImages: true }
    )

    expect(blocked.blockedRemoteImageCount).toBe(1)
    expect(blocked.html).not.toContain('src="https://assets.example.test/hero.png"')
    expect(allowed.blockedRemoteImageCount).toBe(0)
    expect(allowed.html).toContain('src="https://assets.example.test/hero.png"')
    expect(allowed.html).not.toContain('data-agent-mail-remote-image-src')
    expect(untrusted.html).not.toContain('data-agent-mail-remote-image-id')
    expect(untrusted.html).not.toContain('data-agent-mail-remote-image-src')
    expect(untrusted.html).not.toContain('src="https://assets.example.test/hero.png"')
  })

  itWithDOM('rewrites external anchors to mediated link markers without navigable hrefs', () => {
    const rewritten = rewriteEmailHTMLForIframe(
      '<a href="https://docs.example.test/path?q=1" target="_blank" ping="https://tracker.example.test">Docs</a>',
      { allowRemoteImages: false, baseURL: 'https://mail.example.test/dashboard/' }
    )

    expect(rewritten.externalLinks).toStrictEqual([
      {
        host: 'docs.example.test',
        id: 'generated-link-1',
        url: 'https://docs.example.test/path?q=1'
      }
    ])
    expect(rewritten.html).toContain('data-agent-mail-external-link-id="generated-link-1"')
    expect(rewritten.html).toContain('role="link"')
    expect(rewritten.html).not.toContain('href="https://docs.example.test/path?q=1"')
    expect(rewritten.html).not.toContain('target="_blank"')
    expect(rewritten.html).not.toContain('ping=')
  })

  itWithDOM('regenerates known backend link markers without preserving incoming data attributes', () => {
    const rewritten = rewriteEmailHTMLForIframe(
      '<a href="#agent-mail-external-link-1" data-agent-mail-external-link-id="attacker-id">Docs</a>',
      {
        allowRemoteImages: false,
        baseURL: 'https://mail.example.test/dashboard/',
        knownExternalLinks: [
          {
            host: 'docs.example.test',
            id: 'link-1',
            url: 'https://docs.example.test/path'
          }
        ],
        reservedExternalLinkIds: ['link-1']
      }
    )

    expect(rewritten.externalLinks).toStrictEqual([])
    expect(rewritten.html).toContain('href="#agent-mail-external-link-1"')
    expect(rewritten.html).toContain('data-agent-mail-external-link-id="link-1"')
    expect(rewritten.html).not.toContain('attacker-id')
  })

  itWithDOM('keeps discovered external link IDs separate from controller-provided link IDs', () => {
    const rewritten = rewriteEmailHTMLForIframe(
      '<a href="https://docs.example.test/path">Docs</a><a href="https://status.example.test/">Status</a>',
      {
        allowRemoteImages: false,
        baseURL: 'https://mail.example.test/dashboard/',
        reservedExternalLinkIds: ['generated-link-1', 'link-1']
      }
    )

    expect(rewritten.externalLinks).toStrictEqual([
      {
        host: 'docs.example.test',
        id: 'generated-link-2',
        url: 'https://docs.example.test/path'
      },
      {
        host: 'status.example.test',
        id: 'generated-link-3',
        url: 'https://status.example.test/'
      }
    ])
    expect(rewritten.html).toContain('data-agent-mail-external-link-id="generated-link-2"')
    expect(rewritten.html).toContain('data-agent-mail-external-link-id="generated-link-3"')
    expect(rewritten.html).not.toContain('data-agent-mail-external-link-id="link-1"')
  })

  itWithDOM('labels mediated mailto links by recipient address', () => {
    const rewritten = rewriteEmailHTMLForIframe(
      '<a href="mailto:support@example.test?subject=Help">Email support</a>',
      { allowRemoteImages: false, baseURL: 'https://mail.example.test/dashboard/' }
    )

    expect(rewritten.externalLinks).toStrictEqual([
      {
        host: 'support@example.test',
        id: 'generated-link-1',
        url: 'mailto:support@example.test?subject=Help'
      }
    ])
    expect(rewritten.html).toContain('data-agent-mail-external-link-id="generated-link-1"')
    expect(rewritten.html).not.toContain('href="mailto:support@example.test')
  })

  itWithDOM('removes forms and controls inside email bodies', () => {
    const rewritten = rewriteEmailHTMLForIframe(
      [
        '<form action="https://phish.example.test/login" method="post" target="_blank">',
        '<input name="email" required autofocus>',
        '<textarea name="message"></textarea>',
        '<button formaction="https://phish.example.test/pay">Submit</button>',
        '</form>'
      ].join(''),
      { allowRemoteImages: false, baseURL: 'https://mail.example.test/dashboard/' }
    )

    expect(rewritten.html).not.toContain('<form')
    expect(rewritten.html).not.toContain('<input')
    expect(rewritten.html).not.toContain('<textarea')
    expect(rewritten.html).not.toContain('<button')
    expect(rewritten.html).not.toContain('data-agent-mail-inert-form')
    expect(rewritten.html).not.toContain('https://phish.example.test')
    expect(rewritten.html).not.toContain('method="post"')
    expect(rewritten.html).not.toContain('name="email"')
    expect(rewritten.html).not.toContain('formaction=')
  })

  it('rejects unsafe and route-relative links', () => {
    expect(normalizeEmailLink('javascript:alert(1)', 'https://mail.example.test/dashboard/')).toBeNull()
    expect(normalizeEmailLink('/dashboard/?message=1', 'https://mail.example.test/dashboard/')).toBeNull()
    expect(normalizeEmailLink('#local-fragment', 'https://mail.example.test/dashboard/')).toBeNull()
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

  itWithDOM('rewrites cid images to matching same-origin attachment URLs', () => {
    const rewritten = rewriteEmailHTMLForIframe('<p>Logo</p><img src="cid:logo%40example.test" alt="Logo">', {
      allowRemoteImages: false,
      baseURL: 'https://mail.example.test/dashboard/',
      inlineAttachments: [
        {
          contentId: '<logo@example.test>',
          url: '/rpc/mail/accounts/support/mailboxes/inbox/messages/1/attachments/logo'
        }
      ]
    })

    expect(rewritten.blockedRemoteImageCount).toBe(0)
    expect(rewritten.html).toContain(
      'src="https://mail.example.test/rpc/mail/accounts/support/mailboxes/inbox/messages/1/attachments/logo"'
    )
    expect(rewritten.html).not.toContain('cid:logo')
  })

  itWithDOM('replaces cid images without same-origin attachment URLs with inert placeholders', () => {
    const missingAttachment = rewriteEmailHTMLForIframe('<img src="cid:missing@example.test" alt="Logo">', {
      allowRemoteImages: false,
      baseURL: 'https://mail.example.test/dashboard/',
      inlineAttachments: []
    })
    const crossOriginAttachment = rewriteEmailHTMLForIframe('<img src="cid:logo@example.test" alt="Logo">', {
      allowRemoteImages: false,
      baseURL: 'https://mail.example.test/dashboard/',
      inlineAttachments: [
        {
          contentId: 'logo@example.test',
          url: 'https://wildduck.example.test/users/support/attachments/logo'
        }
      ]
    })

    expect(missingAttachment.html).toContain('Inline image unavailable')
    expect(missingAttachment.html).not.toContain('src="cid:missing@example.test"')
    expect(crossOriginAttachment.html).toContain('Inline image unavailable')
    expect(crossOriginAttachment.html).not.toContain('wildduck.example.test')
  })

  it('builds a strict iframe CSP with remote images disabled by default', () => {
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
    expect(blocked).toContain('img-src data: https://mail.example.test')
    expect(blocked).not.toContain('cid:')
    expect(blocked).not.toContain('img-src data: https://mail.example.test http: https:')
    expect(allowed).toContain('img-src data: https://mail.example.test http: https:')
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
