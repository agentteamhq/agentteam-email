import DOMPurify from 'dompurify'
import { parseSrcset, stringifySrcset } from 'srcset'
import type { Config, ElementHook } from 'dompurify'
import type { SrcSetDefinition } from 'srcset'

const DEFAULT_BASE_URL = 'https://agent-mail.invalid/'
const AGENT_MAIL_EXTERNAL_LINK_PREFIX = '#agent-mail-external-'
const AGENT_MAIL_ATTRIBUTE_PREFIX = 'data-agent-mail-'

const EMAIL_SANITIZER_CONFIG = {
  ALLOW_DATA_ATTR: false,
  FORBID_ATTR: [
    'action',
    'background',
    'download',
    'formaction',
    'ping',
    'poster',
    'srcdoc',
    'style',
    'target'
  ],
  FORBID_TAGS: [
    'base',
    'button',
    'datalist',
    'embed',
    'fieldset',
    'form',
    'frame',
    'frameset',
    'iframe',
    'input',
    'link',
    'meta',
    'object',
    'optgroup',
    'option',
    'script',
    'select',
    'style',
    'textarea'
  ],
  KEEP_CONTENT: false,
  RETURN_TRUSTED_TYPE: false,
  USE_PROFILES: { html: true }
} satisfies Config

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

export interface KnownEmailExternalLink {
  host?: string | null
  id: string
  url: string
}

export interface KnownEmailRemoteImage {
  id: string
  url: string
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
    knownExternalLinks?: ReadonlyArray<KnownEmailExternalLink>
    knownRemoteImages?: ReadonlyArray<KnownEmailRemoteImage>
    reservedExternalLinkIds?: Iterable<string>
  }
) {
  const sanitizer = getSupportedEmailSanitizer()
  if (!sanitizer) {
    return {
      blockedRemoteImageCount: 0,
      externalLinks: [],
      html: ''
    } satisfies RewrittenEmailHtml
  }

  const allowRemoteImages = Boolean(options.allowRemoteImages)
  const baseURL = options.baseURL ?? DEFAULT_BASE_URL
  const reservedExternalLinkIds = new Set(options.reservedExternalLinkIds ?? [])
  const knownExternalLinksById = getKnownExternalLinksById(options.knownExternalLinks ?? [])
  const knownRemoteImagesById = getKnownRemoteImagesById(options.knownRemoteImages ?? [])
  const inlineAttachmentURLsByContentId = getInlineAttachmentURLsByContentId(
    options.inlineAttachments ?? [],
    baseURL
  )
  const externalLinks: RewrittenEmailLink[] = []
  const incomingRemoteImageIds = new WeakMap<Element, string>()
  let blockedRemoteImageCount = 0

  const beforeSanitizeAttributes: ElementHook = (node) => {
    if (getElementTagName(node) === 'img') {
      incomingRemoteImageIds.set(
        node,
        stripControlCharacters(node.getAttribute('data-agent-mail-remote-image-id'))
      )
    }
    removeIncomingAgentMailAttributes(node)
  }

  const afterSanitizeAttributes: ElementHook = (node) => {
    removeForbiddenAttributes(node)

    switch (getElementTagName(node)) {
      case 'a':
        rewriteAnchorElement(node, {
          baseURL,
          externalLinks,
          knownExternalLinksById,
          reservedExternalLinkIds
        })
        break
      case 'img':
        blockedRemoteImageCount += rewriteImageElement(node, {
          allowRemoteImages,
          baseURL,
          inlineAttachmentURLsByContentId,
          knownRemoteImageId: incomingRemoteImageIds.get(node) ?? '',
          knownRemoteImagesById
        })
        break
      case 'source':
        blockedRemoteImageCount += rewriteSourceElement(node, {
          allowRemoteImages,
          baseURL,
          inlineAttachmentURLsByContentId
        })
        break
      default:
        break
    }
  }

  sanitizer.addHook('beforeSanitizeAttributes', beforeSanitizeAttributes)
  sanitizer.addHook('afterSanitizeAttributes', afterSanitizeAttributes)
  try {
    const sanitizedHTML = sanitizer.sanitize(html, EMAIL_SANITIZER_CONFIG)
    return {
      blockedRemoteImageCount,
      externalLinks,
      html: sanitizedHTML
    } satisfies RewrittenEmailHtml
  } finally {
    sanitizer.removeHook('beforeSanitizeAttributes', beforeSanitizeAttributes)
    sanitizer.removeHook('afterSanitizeAttributes', afterSanitizeAttributes)
  }
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
  --email-surface: light-dark(#f8fafc, oklch(0.16 0 0));
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
.email-remote-image-placeholder {
  align-items: center;
  background: var(--email-surface);
  border: 1px dashed var(--email-border);
  border-radius: 4px;
  color: var(--email-muted);
  display: inline-flex;
  font-size: 12px;
  justify-content: center;
  max-width: 100%;
  min-height: 40px;
  padding: 8px 10px;
  vertical-align: middle;
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

function getSupportedEmailSanitizer() {
  return DOMPurify.isSupported &&
    typeof DOMPurify.sanitize === 'function' &&
    typeof DOMPurify.addHook === 'function'
    ? DOMPurify
    : null
}

function getElementTagName(element: Element) {
  return typeof element.tagName === 'string' ? element.tagName.toLowerCase() : ''
}

function rewriteAnchorElement(
  element: Element,
  {
    baseURL,
    externalLinks,
    knownExternalLinksById,
    reservedExternalLinkIds
  }: {
    baseURL: string
    externalLinks: RewrittenEmailLink[]
    knownExternalLinksById: ReadonlyMap<string, RewrittenEmailLink>
    reservedExternalLinkIds: ReadonlySet<string>
  }
) {
  const rawHref = element.getAttribute('href')
  removeAttributes(element, ['download', 'ping', 'rel', 'role', 'tabindex', 'target'])

  const knownLinkId = getKnownExternalLinkIdFromFragment(rawHref)
  if (knownLinkId && knownExternalLinksById.has(knownLinkId)) {
    element.setAttribute('href', `${AGENT_MAIL_EXTERNAL_LINK_PREFIX}${knownLinkId}`)
    element.setAttribute('data-agent-mail-external-link-id', knownLinkId)
    element.setAttribute('role', 'link')
    element.setAttribute('tabindex', '0')
    element.setAttribute('rel', 'noopener noreferrer')
    return
  }

  const normalizedURL = normalizeEmailLink(rawHref, baseURL)
  if (!normalizedURL) {
    if (stripControlCharacters(rawHref).startsWith('#')) {
      element.setAttribute('href', stripControlCharacters(rawHref))
    } else {
      element.removeAttribute('href')
    }
    return
  }

  const parsed = new URL(normalizedURL)
  const id = getNextGeneratedExternalLinkId(externalLinks, reservedExternalLinkIds)
  externalLinks.push({ host: getExternalLinkHostLabel(parsed), id, url: normalizedURL })
  element.removeAttribute('href')
  element.setAttribute('data-agent-mail-external-link-id', id)
  element.setAttribute('role', 'link')
  element.setAttribute('tabindex', '0')
  element.setAttribute('rel', 'noopener noreferrer')
}

function rewriteImageElement(
  element: Element,
  {
    allowRemoteImages,
    baseURL,
    inlineAttachmentURLsByContentId,
    knownRemoteImageId,
    knownRemoteImagesById
  }: {
    allowRemoteImages: boolean
    baseURL: string
    inlineAttachmentURLsByContentId: ReadonlyMap<string, string>
    knownRemoteImageId: string
    knownRemoteImagesById: ReadonlyMap<string, KnownEmailRemoteImage>
  }
) {
  const srcsetResult = rewriteSrcsetAttribute(element, {
    allowRemoteImages,
    baseURL,
    inlineAttachmentURLsByContentId
  })
  const rawSrc = element.getAttribute('src')
  const knownRemoteImage = knownRemoteImageId ? knownRemoteImagesById.get(knownRemoteImageId) : undefined

  if (!rawSrc && knownRemoteImage) {
    if (allowRemoteImages) {
      element.setAttribute('src', knownRemoteImage.url)
      return 0
    }
    replaceWithImagePlaceholder(element, 'Remote image blocked')
    return 1
  }

  const inlineContentId = getInlineContentIdFromSource(rawSrc)
  if (inlineContentId) {
    const inlineAttachmentURL = inlineAttachmentURLsByContentId.get(inlineContentId)
    element.removeAttribute('srcset')
    element.removeAttribute('sizes')
    if (!inlineAttachmentURL) {
      replaceWithImagePlaceholder(element, 'Inline image unavailable')
      return srcsetResult.blockedRemoteImage ? 1 : 0
    }
    element.setAttribute('src', inlineAttachmentURL)
    return srcsetResult.blockedRemoteImage ? 1 : 0
  }

  const remoteURL = normalizeRemoteImageURL(rawSrc, baseURL)
  if (remoteURL) {
    if (!allowRemoteImages) {
      replaceWithImagePlaceholder(element, 'Remote image blocked')
      return 1
    }
    element.setAttribute('src', remoteURL)
    return srcsetResult.blockedRemoteImage ? 1 : 0
  }

  if (rawSrc && !isDataImageSource(rawSrc)) {
    element.removeAttribute('src')
  }

  if (srcsetResult.blockedRemoteImage && !rawSrc && !srcsetResult.keptCandidate) {
    replaceWithImagePlaceholder(element, 'Remote image blocked')
  }

  return srcsetResult.blockedRemoteImage ? 1 : 0
}

function rewriteSourceElement(
  element: Element,
  {
    allowRemoteImages,
    baseURL,
    inlineAttachmentURLsByContentId
  }: {
    allowRemoteImages: boolean
    baseURL: string
    inlineAttachmentURLsByContentId: ReadonlyMap<string, string>
  }
) {
  const srcsetResult = rewriteSrcsetAttribute(element, {
    allowRemoteImages,
    baseURL,
    inlineAttachmentURLsByContentId
  })
  const rawSrc = element.getAttribute('src')
  const remoteURL = normalizeRemoteImageURL(rawSrc, baseURL)
  if (remoteURL) {
    if (!allowRemoteImages) {
      element.remove()
      return srcsetResult.blockedRemoteImage ? 1 : 0
    }
    element.setAttribute('src', remoteURL)
    return srcsetResult.blockedRemoteImage ? 1 : 0
  }
  if (rawSrc && !isDataImageSource(rawSrc)) {
    element.removeAttribute('src')
  }
  if (srcsetResult.blockedRemoteImage && !srcsetResult.keptCandidate) {
    element.remove()
  }
  return srcsetResult.blockedRemoteImage ? 1 : 0
}

function rewriteSrcsetAttribute(
  element: Element,
  {
    allowRemoteImages,
    baseURL,
    inlineAttachmentURLsByContentId
  }: {
    allowRemoteImages: boolean
    baseURL: string
    inlineAttachmentURLsByContentId: ReadonlyMap<string, string>
  }
) {
  const rawSrcset = element.getAttribute('srcset')
  if (!rawSrcset) {
    return { blockedRemoteImage: false, keptCandidate: false }
  }

  let parsed: SrcSetDefinition[]
  try {
    parsed = parseSrcset(rawSrcset, { strict: true })
  } catch {
    element.removeAttribute('srcset')
    element.removeAttribute('sizes')
    return { blockedRemoteImage: false, keptCandidate: false }
  }

  let blockedRemoteImage = false
  const kept: SrcSetDefinition[] = []
  for (const candidate of parsed) {
    const inlineContentId = getInlineContentIdFromSource(candidate.url)
    if (inlineContentId) {
      const inlineAttachmentURL = inlineAttachmentURLsByContentId.get(inlineContentId)
      if (inlineAttachmentURL) {
        kept.push({ ...candidate, url: inlineAttachmentURL })
      }
      continue
    }

    const remoteURL = normalizeRemoteImageURL(candidate.url, baseURL)
    if (remoteURL) {
      if (allowRemoteImages) {
        kept.push({ ...candidate, url: remoteURL })
      } else {
        blockedRemoteImage = true
      }
      continue
    }

    if (isDataImageSource(candidate.url)) {
      kept.push(candidate)
    }
  }

  if (kept.length > 0) {
    element.setAttribute('srcset', stringifySrcset(kept, { strict: true }))
  } else {
    element.removeAttribute('srcset')
    element.removeAttribute('sizes')
  }

  return { blockedRemoteImage, keptCandidate: kept.length > 0 }
}

function replaceWithImagePlaceholder(element: Element, fallbackLabel: string) {
  const placeholder = element.ownerDocument.createElement('span')
  const alt = stripControlCharacters(element.getAttribute('alt')) || fallbackLabel
  placeholder.className = 'email-remote-image-placeholder'
  placeholder.setAttribute('role', 'img')
  placeholder.setAttribute('aria-label', alt)
  placeholder.textContent = fallbackLabel
  element.replaceWith(placeholder)
}

function getKnownExternalLinkIdFromFragment(rawHref: string | null) {
  const href = stripControlCharacters(rawHref)
  if (!href.startsWith(AGENT_MAIL_EXTERNAL_LINK_PREFIX)) {
    return null
  }
  const id = href.slice(AGENT_MAIL_EXTERNAL_LINK_PREFIX.length)
  return id ? id : null
}

function getKnownExternalLinksById(links: ReadonlyArray<KnownEmailExternalLink>) {
  const map = new Map<string, RewrittenEmailLink>()
  for (const link of links) {
    const id = stripControlCharacters(link.id)
    const url = normalizeEmailLink(link.url)
    if (id && url) {
      map.set(id, { host: link.host || getExternalLinkHostLabel(new URL(url)), id, url })
    }
  }
  return map
}

function getKnownRemoteImagesById(images: ReadonlyArray<KnownEmailRemoteImage>) {
  const map = new Map<string, KnownEmailRemoteImage>()
  for (const image of images) {
    const id = stripControlCharacters(image.id)
    const url = normalizeRemoteImageURL(image.url)
    if (id && url) {
      map.set(id, { id, url })
    }
  }
  return map
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

function removeIncomingAgentMailAttributes(element: Element) {
  if (!element.attributes) {
    return
  }
  for (const attr of [...element.attributes]) {
    if (attr.name.toLowerCase().startsWith(AGENT_MAIL_ATTRIBUTE_PREFIX)) {
      element.removeAttribute(attr.name)
    }
  }
}

function removeForbiddenAttributes(element: Element) {
  if (!element.attributes) {
    return
  }
  for (const attr of [...element.attributes]) {
    const name = attr.name.toLowerCase()
    if (
      name.startsWith('on') ||
      name === 'background' ||
      name === 'poster' ||
      name === 'srcdoc' ||
      name === 'style'
    ) {
      element.removeAttribute(attr.name)
    }
  }
}

function removeAttributes(element: Element, names: ReadonlyArray<string>) {
  for (const name of names) {
    element.removeAttribute(name)
  }
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

function normalizeRemoteImageURL(rawSrc: string | null | undefined, baseURL = DEFAULT_BASE_URL) {
  const src = stripControlCharacters(rawSrc)
  if (!src || !/^(?:https?:)?\/\//iu.test(src)) {
    return null
  }

  try {
    const url = new URL(src, baseURL)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null
    }
    return url.href
  } catch {
    return null
  }
}

function isDataImageSource(rawSrc: string | null | undefined) {
  return /^data:image\/(?:gif|jpeg|jpg|png|webp);/iu.test(stripControlCharacters(rawSrc))
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
