const DEFAULT_BASE_URL = 'https://agent-mail.invalid/'

export function normalizeEmailLink(rawHref: string | null | undefined, baseURL = DEFAULT_BASE_URL) {
  const href = stripControlCharacters(rawHref)
  if (!href || href.startsWith('#')) {
    return null
  }

  if (!/^(?:[a-z][a-z0-9+.-]*:|\/\/)/iu.test(href)) {
    return null
  }

  try {
    const url = new URL(href, baseURL)
    if (url.protocol !== 'http:' && url.protocol !== 'https:' && url.protocol !== 'mailto:') {
      return null
    }
    return url.href
  } catch {
    return null
  }
}

export function normalizeEmailAttachmentURL(rawHref: string | null | undefined, baseURL = DEFAULT_BASE_URL) {
  const href = stripControlCharacters(rawHref)
  if (!href || href.startsWith('#')) {
    return null
  }

  try {
    const base = new URL(baseURL)
    const url = new URL(href, base)
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.origin !== base.origin) {
      return null
    }
    return url.href
  } catch {
    return null
  }
}

export function buildEmailContentSecurityPolicy(options: {
  allowRemoteImages?: boolean
  sameOrigin?: string
}) {
  const imageSources = options.allowRemoteImages ? emailImageSources(options.sameOrigin) : ["'none'"]

  return [
    "default-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "object-src 'none'",
    "frame-src 'none'",
    "child-src 'none'",
    "connect-src 'none'",
    "style-src 'unsafe-inline'",
    `img-src ${imageSources.join(' ')}`,
    "script-src 'none'"
  ].join('; ')
}

export type EmailIframeThemeMode = 'dark' | 'light'

export function buildEmailIframeDocument({
  bodyHTML,
  csp,
  themeMode
}: {
  bodyHTML: string
  csp: string
  themeMode?: EmailIframeThemeMode
}) {
  const themeAttribute = themeMode ? ` data-theme="${themeMode}"` : ''

  return `<!doctype html>
<html${themeAttribute}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${escapeAttribute(csp)}">
<style>
* { box-sizing: border-box; }
:root {
  color-scheme: light dark;
  --email-background: light-dark(#ffffff, oklch(0.1 0 0));
  --email-foreground: light-dark(#18181b, oklch(0.99 0 0));
  --email-muted: light-dark(#64748b, oklch(0.708 0 0));
  --email-border: light-dark(#d1d5db, oklch(0.3092 0 0));
  --email-link: light-dark(#2563eb, #93c5fd);
  --email-code: light-dark(#f3f4f6, oklch(0.2 0 0));
}
:root[data-theme='light'] { color-scheme: light; }
:root[data-theme='dark'] { color-scheme: dark; }
html { background: var(--email-background); }
body {
  background: var(--email-background) !important;
  color: var(--email-foreground) !important;
  font: 14px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  margin: 0;
  min-height: 100%;
  overflow-wrap: break-word;
  padding: 24px;
  word-wrap: break-word;
}
a { color: var(--email-link); }
a[data-agent-mail-external-link-id] {
  cursor: pointer;
  text-decoration: underline;
}
img {
  height: auto;
  max-width: 100%;
}
blockquote {
  border-left: 3px solid var(--email-border);
  color: var(--email-muted);
  margin-left: 0;
  padding-left: 1em;
}
pre {
  background: var(--email-code);
  border-radius: 6px;
  font-size: 13px;
  overflow-x: auto;
  padding: 12px;
}
table {
  border-collapse: collapse;
  max-width: 100%;
}
td, th { padding: 4px 8px; }
p { margin: 4px 0; }
h1, h2, h3 { margin: 8px 0 4px; }
ul, ol {
  margin: 4px 0;
  padding-left: 20px;
}
</style>
</head>
<body>${bodyHTML}</body>
</html>`
}

function emailImageSources(sameOriginValue: string | null | undefined) {
  const imageSources = ['data:']
  const sameOrigin = stripControlCharacters(sameOriginValue)
  if (sameOrigin) {
    imageSources.push(sameOrigin)
  }
  imageSources.push('http:', 'https:')
  return imageSources
}

function stripControlCharacters(value: string | null | undefined) {
  const text = value ?? ''
  let output = ''
  for (const char of text) {
    const codePoint = char.codePointAt(0)
    if (codePoint === undefined || codePoint < 32 || codePoint === 127) {
      continue
    }
    output += char
  }
  return output.trim()
}

function escapeAttribute(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}
