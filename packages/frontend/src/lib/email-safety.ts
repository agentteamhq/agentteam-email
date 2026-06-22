const DEFAULT_BASE_URL = 'https://agent-mail.invalid/'

export interface RewrittenEmailLink {
  host: string
  id: string
  url: string
}

export interface RewrittenEmailHtml {
  blockedRemoteImageCount: number
  externalLinks: ReadonlyArray<RewrittenEmailLink>
  html: string
}

export interface EmailInlineAttachment {
  contentId: string
  url: string
}

interface TagParts {
  attrText: string
  name: string
  selfClosing: boolean
}

interface ParsedAttribute {
  name: string
  value: string | null
}

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

export function rewriteEmailHTMLForIframe(
  html: string,
  options: {
    allowRemoteImages?: boolean
    baseURL?: string
    inlineAttachments?: ReadonlyArray<EmailInlineAttachment>
    reservedExternalLinkIds?: Iterable<string>
  }
) {
  const allowRemoteImages = Boolean(options.allowRemoteImages)
  const baseURL = options.baseURL ?? DEFAULT_BASE_URL
  const reservedExternalLinkIds = new Set(options.reservedExternalLinkIds ?? [])
  const inlineAttachmentURLsByContentId = getInlineAttachmentURLsByContentId(
    options.inlineAttachments ?? [],
    baseURL
  )
  const externalLinks: RewrittenEmailLink[] = []
  let blockedRemoteImageCount = 0
  let output = ''
  let index = 0

  while (index < html.length) {
    const tagStart = html.indexOf('<', index)
    if (tagStart === -1) {
      output += html.slice(index)
      break
    }

    output += html.slice(index, tagStart)
    const tagEnd = findTagEnd(html, tagStart)
    if (tagEnd === -1) {
      output += html.slice(tagStart)
      break
    }

    const rawTag = html.slice(tagStart, tagEnd + 1)
    const inner = html.slice(tagStart + 1, tagEnd)
    const trimmed = inner.trimStart()

    if (trimmed.startsWith('/') || trimmed.startsWith('!') || trimmed.startsWith('?')) {
      output += rawTag
      index = tagEnd + 1
      continue
    }

    const tag = parseTag(trimmed)
    if (!tag) {
      output += rawTag
      index = tagEnd + 1
      continue
    }

    if (isDroppedEmailDocumentTag(tag.name)) {
      const closingTagEnd = shouldDropEmailDocumentTagContent(tag.name)
        ? findClosingTagEnd(html, tagEnd + 1, tag.name)
        : -1
      index = closingTagEnd === -1 ? tagEnd + 1 : closingTagEnd + 1
      continue
    }

    const remotePresentationAttrs = rewriteRemotePresentationAttributes(
      parseAttributes(tag.attrText),
      allowRemoteImages
    )
    const attrs = remotePresentationAttrs.attrs
    blockedRemoteImageCount += remotePresentationAttrs.blocked

    if (tag.name === 'a') {
      output += rewriteAnchor(attrs, baseURL, externalLinks, reservedExternalLinkIds)
    } else if (tag.name === 'form') {
      output += rewriteForm(attrs)
    } else if (isFormControlTag(tag.name)) {
      output += rewriteFormControl(tag.name, attrs, tag.selfClosing)
    } else if (tag.name === 'img') {
      const result = rewriteImage(attrs, {
        allowRemoteImages,
        inlineAttachmentURLsByContentId
      })
      output += result.html
      blockedRemoteImageCount += result.blocked
    } else if (tag.name === 'source') {
      const result = rewriteSource(attrs, allowRemoteImages, tag.selfClosing)
      output += result.html
      blockedRemoteImageCount += result.blocked
    } else {
      output += remotePresentationAttrs.blocked > 0 ? serializeTag(tag.name, attrs, tag.selfClosing) : rawTag
    }

    index = tagEnd + 1
  }

  return {
    blockedRemoteImageCount,
    externalLinks,
    html: output
  } satisfies RewrittenEmailHtml
}

export function buildEmailContentSecurityPolicy(options: {
  allowRemoteImages?: boolean
  sameOrigin?: string
}) {
  const imageSources = ['data:']
  const sameOrigin = stripControlCharacters(options.sameOrigin)
  if (sameOrigin) {
    imageSources.push(sameOrigin)
  }
  if (options.allowRemoteImages) {
    imageSources.push('http:', 'https:')
  }

  return [
    "default-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "frame-src 'none'",
    "child-src 'none'",
    "connect-src 'none'",
    "style-src 'unsafe-inline'",
    `img-src ${imageSources.join(' ')}`,
    "script-src 'none'",
    "navigate-to 'none'"
  ].join('; ')
}

export function buildEmailIframeDocument({ bodyHTML, csp }: { bodyHTML: string; csp: string }) {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${escapeAttribute(csp)}">
<style>
* { box-sizing: border-box; }
html {
  background: #ffffff;
  color-scheme: light;
}
body {
  background: #ffffff;
  color: #18181b;
  font: 14px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  margin: 0;
  overflow-wrap: break-word;
  padding: 24px;
  word-wrap: break-word;
}
[style*="position: fixed"], [style*="position:fixed"], [style*="position: absolute"], [style*="position:absolute"] {
  position: relative !important;
}
a { color: #2563eb; }
a[data-agent-mail-external-link-id] {
  cursor: pointer;
  text-decoration: underline;
}
img {
  height: auto;
  max-width: 100%;
}
[data-agent-mail-inert-form] {
  background: #f8fafc;
  border: 1px dashed #cbd5e1;
  border-radius: 6px;
  margin: 8px 0;
  padding: 12px;
}
[data-agent-mail-inert-form]::before {
  color: #64748b;
  content: "Email form disabled";
  display: block;
  font-size: 12px;
  margin-bottom: 8px;
}
.email-remote-image-placeholder {
  align-items: center;
  background: #f8fafc;
  border: 1px dashed #cbd5e1;
  border-radius: 4px;
  color: #64748b;
  display: inline-flex;
  font-size: 12px;
  justify-content: center;
  max-width: 100%;
  min-height: 40px;
  padding: 8px 10px;
  vertical-align: middle;
}
blockquote {
  border-left: 3px solid #d1d5db;
  color: #6b7280;
  margin-left: 0;
  padding-left: 1em;
}
pre {
  background: #f3f4f6;
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

function decodeAttribute(value: string | null) {
  if (value === null) {
    return null
  }

  return value.replace(/&(?:#(\d+)|#x([0-9a-f]+)|amp|quot|apos|lt|gt);/giu, (entity, decimal, hex) => {
    if (decimal) {
      return String.fromCodePoint(Number.parseInt(String(decimal), 10))
    }
    if (hex) {
      return String.fromCodePoint(Number.parseInt(String(hex), 16))
    }

    switch (entity.toLowerCase()) {
      case '&amp;':
        return '&'
      case '&quot;':
        return '"'
      case '&apos;':
        return "'"
      case '&lt;':
        return '<'
      case '&gt;':
        return '>'
      default:
        return entity
    }
  })
}

function findTagEnd(html: string, tagStart: number) {
  let quote = ''
  for (let index = tagStart + 1; index < html.length; index += 1) {
    const char = html[index]
    if (quote) {
      if (char === quote) {
        quote = ''
      }
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    if (char === '>') {
      return index
    }
  }

  return -1
}

function parseTag(content: string): TagParts | null {
  const match = /^([^\s/>]+)([\s\S]*)$/u.exec(content)
  if (!match?.[1]) {
    return null
  }

  return {
    attrText: match[2] ?? '',
    name: match[1].toLowerCase(),
    selfClosing: /\/\s*$/u.test(match[2] ?? '')
  }
}

function parseAttributes(attrText: string) {
  const attrs: ParsedAttribute[] = []
  let index = 0

  while (index < attrText.length) {
    while (/\s/u.test(attrText[index] ?? '')) {
      index += 1
    }
    if (index >= attrText.length || attrText[index] === '/') {
      break
    }

    const nameStart = index
    while (index < attrText.length && !/[\s=/>]/u.test(attrText[index] ?? '')) {
      index += 1
    }

    const name = attrText.slice(nameStart, index)
    if (!name) {
      break
    }

    while (/\s/u.test(attrText[index] ?? '')) {
      index += 1
    }

    let value: string | null = null
    if (attrText[index] === '=') {
      index += 1
      while (/\s/u.test(attrText[index] ?? '')) {
        index += 1
      }

      const quote = attrText[index]
      if (quote === '"' || quote === "'") {
        index += 1
        const valueStart = index
        while (index < attrText.length && attrText[index] !== quote) {
          index += 1
        }
        value = attrText.slice(valueStart, index)
        if (attrText[index] === quote) {
          index += 1
        }
      } else {
        const valueStart = index
        while (index < attrText.length && !/[\s>]/u.test(attrText[index] ?? '')) {
          index += 1
        }
        value = attrText.slice(valueStart, index)
      }
    }

    attrs.push({ name, value })
  }

  return attrs
}

function getAttribute(attrs: ReadonlyArray<ParsedAttribute>, attrName: string) {
  return getAttributes(attrs, attrName)[0] ?? null
}

function getAttributes(attrs: ReadonlyArray<ParsedAttribute>, attrName: string) {
  const lowerName = attrName.toLowerCase()
  return attrs
    .filter((attr) => attr.name.toLowerCase() === lowerName)
    .map((attr) => decodeAttribute(attr.value))
}

function withoutAttributes(attrs: ReadonlyArray<ParsedAttribute>, names: ReadonlyArray<string>) {
  const blocked = new Set(names.map((name) => name.toLowerCase()))
  return attrs.filter((attr) => !blocked.has(attr.name.toLowerCase()))
}

function rewriteRemotePresentationAttributes(
  attrs: ReadonlyArray<ParsedAttribute>,
  allowRemoteImages: boolean
) {
  if (allowRemoteImages) {
    return { attrs, blocked: 0 }
  }

  let blocked = 0
  const nextAttrs: ParsedAttribute[] = []

  for (const attr of attrs) {
    const attrName = attr.name.toLowerCase()
    if (attrName === 'background' && isRemoteImageSource(decodeAttribute(attr.value))) {
      blocked += 1
      continue
    }
    if (attrName === 'style' && styleContainsRemoteImageURL(attr.value)) {
      blocked += 1
      continue
    }

    nextAttrs.push(attr)
  }

  return { attrs: nextAttrs, blocked }
}

function serializeAttributes(attrs: ReadonlyArray<ParsedAttribute>) {
  return attrs
    .map((attr) => {
      if (attr.value === null) {
        return ` ${attr.name}`
      }
      return ` ${attr.name}="${escapeAttribute(attr.value)}"`
    })
    .join('')
}

function serializeTag(name: string, attrs: ReadonlyArray<ParsedAttribute>, selfClosing = false) {
  return `<${name}${serializeAttributes(attrs)}${selfClosing ? ' /' : ''}>`
}

function rewriteAnchor(
  attrs: ReadonlyArray<ParsedAttribute>,
  baseURL: string,
  externalLinks: RewrittenEmailLink[],
  reservedExternalLinkIds: ReadonlySet<string>
) {
  const existingLinkId = stripControlCharacters(getAttribute(attrs, 'data-agent-mail-external-link-id'))
  const rawHref = getAttribute(attrs, 'href')
  const nextAttrs = withoutAttributes(attrs, [
    'download',
    'href',
    'ping',
    'rel',
    'role',
    'tabindex',
    'target'
  ])

  if (existingLinkId) {
    nextAttrs.push({ name: 'data-agent-mail-external-link-id', value: existingLinkId })
    nextAttrs.push({ name: 'role', value: 'link' })
    nextAttrs.push({ name: 'tabindex', value: '0' })
    nextAttrs.push({ name: 'rel', value: 'noopener noreferrer' })
    return serializeTag('a', nextAttrs)
  }

  const normalizedURL = normalizeEmailLink(rawHref, baseURL)
  if (!normalizedURL) {
    if (stripControlCharacters(rawHref).startsWith('#')) {
      nextAttrs.push({ name: 'href', value: stripControlCharacters(rawHref) })
    }
    return serializeTag('a', nextAttrs)
  }

  const parsed = new URL(normalizedURL)
  const id = getNextGeneratedExternalLinkId(externalLinks, reservedExternalLinkIds)
  externalLinks.push({ host: getExternalLinkHostLabel(parsed), id, url: normalizedURL })
  nextAttrs.push({ name: 'data-agent-mail-external-link-id', value: id })
  nextAttrs.push({ name: 'role', value: 'link' })
  nextAttrs.push({ name: 'tabindex', value: '0' })
  nextAttrs.push({ name: 'rel', value: 'noopener noreferrer' })
  return serializeTag('a', nextAttrs)
}

function getNextGeneratedExternalLinkId(
  externalLinks: ReadonlyArray<RewrittenEmailLink>,
  reservedExternalLinkIds: ReadonlySet<string>
) {
  const usedIds = new Set(externalLinks.map((link) => link.id))
  let index = externalLinks.length + 1

  while (true) {
    const id = `generated-link-${index}`
    if (!usedIds.has(id) && !reservedExternalLinkIds.has(id)) {
      return id
    }
    index += 1
  }
}

function rewriteForm(attrs: ReadonlyArray<ParsedAttribute>) {
  const nextAttrs = withoutAttributes(attrs, [
    'accept-charset',
    'action',
    'autocomplete',
    'enctype',
    'method',
    'name',
    'novalidate',
    'target'
  ])

  nextAttrs.push({ name: 'data-agent-mail-inert-form', value: 'true' })
  nextAttrs.push({ name: 'aria-label', value: 'Email form disabled' })
  return serializeTag('form', nextAttrs)
}

function rewriteFormControl(tagName: string, attrs: ReadonlyArray<ParsedAttribute>, selfClosing: boolean) {
  const nextAttrs = withoutAttributes(attrs, [
    'autofocus',
    'form',
    'formaction',
    'formenctype',
    'formmethod',
    'formnovalidate',
    'formtarget',
    'name',
    'required'
  ])

  if (!hasAttribute(nextAttrs, 'disabled')) {
    nextAttrs.push({ name: 'disabled', value: null })
  }
  nextAttrs.push({ name: 'aria-disabled', value: 'true' })
  return serializeTag(tagName, nextAttrs, selfClosing)
}

function rewriteImage(
  attrs: ReadonlyArray<ParsedAttribute>,
  {
    allowRemoteImages,
    inlineAttachmentURLsByContentId
  }: {
    allowRemoteImages: boolean
    inlineAttachmentURLsByContentId: ReadonlyMap<string, string>
  }
) {
  const srcValues = getAttributes(attrs, 'src')
  const srcsetValues = getAttributes(attrs, 'srcset')
  const blockedRemoteSrc = getAttributes(attrs, 'data-agent-mail-remote-image-src').find((value) =>
    isRemoteImageSource(value)
  )
  const inlineContentId = getFirstInlineContentIdFromSources(srcValues)
  const hasKnownBlockedRemote = Boolean(getAttribute(attrs, 'data-agent-mail-remote-image-id'))
  const hasRemoteSrc = srcValues.some((src) => isRemoteImageSource(src))
  const hasRemoteSrcset = srcsetValues.some((srcset) => srcsetContainsRemoteImage(srcset))

  if (!allowRemoteImages && (hasRemoteSrc || hasRemoteSrcset || hasKnownBlockedRemote)) {
    return { blocked: 1, html: imagePlaceholder(attrs, 'Remote image blocked') }
  }

  if (inlineContentId) {
    const inlineAttachmentURL = inlineAttachmentURLsByContentId.get(inlineContentId)
    if (!inlineAttachmentURL) {
      return { blocked: 0, html: imagePlaceholder(attrs, 'Inline image unavailable') }
    }

    const nextAttrs = withoutAttributes(attrs, ['src', 'srcset'])
    nextAttrs.push({ name: 'src', value: inlineAttachmentURL })
    return { blocked: 0, html: serializeTag('img', nextAttrs) }
  }

  if (
    allowRemoteImages &&
    srcValues.length === 0 &&
    blockedRemoteSrc &&
    isRemoteImageSource(blockedRemoteSrc)
  ) {
    const nextAttrs = withoutAttributes(attrs, [
      'data-agent-mail-remote-image-id',
      'data-agent-mail-remote-image-src'
    ])
    nextAttrs.push({ name: 'src', value: blockedRemoteSrc })
    return { blocked: 0, html: serializeTag('img', nextAttrs) }
  }

  return { blocked: 0, html: serializeTag('img', attrs) }
}

function hasAttribute(attrs: ReadonlyArray<ParsedAttribute>, attrName: string) {
  const lowerName = attrName.toLowerCase()
  return attrs.some((attr) => attr.name.toLowerCase() === lowerName)
}

function isFormControlTag(tagName: string) {
  return (
    tagName === 'button' ||
    tagName === 'input' ||
    tagName === 'option' ||
    tagName === 'select' ||
    tagName === 'textarea'
  )
}

function rewriteSource(
  attrs: ReadonlyArray<ParsedAttribute>,
  allowRemoteImages: boolean,
  selfClosing: boolean
) {
  const hasRemoteSource =
    getAttributes(attrs, 'src').some((src) => isRemoteImageSource(src)) ||
    getAttributes(attrs, 'srcset').some((srcset) => srcsetContainsRemoteImage(srcset))

  if (!allowRemoteImages && hasRemoteSource) {
    return { blocked: 1, html: '' }
  }

  return { blocked: 0, html: serializeTag('source', attrs, selfClosing) }
}

function imagePlaceholder(attrs: ReadonlyArray<ParsedAttribute>, fallbackLabel: string) {
  const alt = getAttribute(attrs, 'alt') || fallbackLabel
  const width = getAttribute(attrs, 'width')
  const height = getAttribute(attrs, 'height')
  const styleParts: string[] = []
  if (width && /^\d{1,5}$/u.test(width)) {
    styleParts.push(`width: ${width}px`)
  }
  if (height && /^\d{1,5}$/u.test(height)) {
    styleParts.push(`min-height: ${height}px`)
  }

  const style = styleParts.length > 0 ? ` style="${escapeAttribute(styleParts.join('; '))}"` : ''
  return `<span class="email-remote-image-placeholder" role="img" aria-label="${escapeAttribute(alt)}"${style}>${escapeAttribute(fallbackLabel)}</span>`
}

function isRemoteImageSource(rawSrc: string | null | undefined) {
  return /^(?:https?:)?\/\//iu.test(stripControlCharacters(rawSrc))
}

function srcsetContainsRemoteImage(srcset: string | null | undefined) {
  const value = stripControlCharacters(srcset)
  if (!value) {
    return false
  }

  return /(?:^|,)\s*(?:https?:)?\/\//iu.test(value)
}

function styleContainsRemoteImageURL(style: string | null | undefined) {
  return /url\(\s*(?:"|')?(?:https?:)?\/\//iu.test(stripControlCharacters(decodeAttribute(style ?? null)))
}

function getExternalLinkHostLabel(url: URL) {
  if (url.protocol === 'mailto:') {
    return decodeURIComponent(url.pathname)
  }

  return url.host || url.href
}

function getInlineAttachmentURLsByContentId(
  inlineAttachments: ReadonlyArray<EmailInlineAttachment>,
  baseURL: string
) {
  const map = new Map<string, string>()

  for (const attachment of inlineAttachments) {
    const contentId = normalizeContentId(attachment.contentId)
    const url = normalizeEmailAttachmentURL(attachment.url, baseURL)
    if (contentId && url) {
      map.set(contentId, url)
    }
  }

  return map
}

function getInlineContentIdFromSource(rawSrc: string | null | undefined) {
  const src = stripControlCharacters(rawSrc)
  if (!/^cid:/iu.test(src)) {
    return null
  }

  return normalizeContentId(src.slice(4))
}

function getFirstInlineContentIdFromSources(sources: ReadonlyArray<string | null>) {
  for (const source of sources) {
    const contentId = getInlineContentIdFromSource(source)
    if (contentId) {
      return contentId
    }
  }

  return null
}

function normalizeContentId(value: string | null | undefined) {
  let contentId = stripControlCharacters(value)
  if (!contentId) {
    return null
  }

  try {
    contentId = decodeURIComponent(contentId)
  } catch {
    // Keep the undecoded value; malformed percent escapes should not break message rendering.
  }

  contentId = contentId.replace(/^<|>$/gu, '').trim()
  return contentId ? contentId.toLowerCase() : null
}

function isDroppedEmailDocumentTag(tagName: string) {
  return (
    tagName === 'base' ||
    tagName === 'embed' ||
    tagName === 'iframe' ||
    tagName === 'link' ||
    tagName === 'meta' ||
    tagName === 'object' ||
    tagName === 'script'
  )
}

function shouldDropEmailDocumentTagContent(tagName: string) {
  return tagName === 'iframe' || tagName === 'object' || tagName === 'script'
}

function findClosingTagEnd(html: string, start: number, tagName: string) {
  const closingTagPattern = new RegExp(`</\\s*${escapeRegExp(tagName)}\\s*>`, 'iu')
  const match = closingTagPattern.exec(html.slice(start))
  if (!match) {
    return -1
  }

  return start + match.index + match[0].length - 1
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}
