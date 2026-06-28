import { useRouterState } from '@tanstack/react-router'

import {
  getOpenGraphImageUrl,
  getVersionedPublicAssetPath,
  getWebAppManifestIconUrl
} from '../../public-assets'
import { SITE_STRINGS } from '../../strings'
import type { PublicEnv } from '../../types'

type SiteMetaEntry = {
  content?: unknown
  name?: unknown
  property?: unknown
  title?: unknown
}

interface SiteMetaProps {
  publicEnv: PublicEnv
}

export function SiteMeta({ publicEnv }: SiteMetaProps) {
  const { pathname, routeMeta } = useRouterState({
    select: (state) => ({
      pathname: state.location.pathname,
      routeMeta: state.matches.map((match) => match.meta)
    })
  })

  const pageTitle = resolveRouteTitle(routeMeta) ?? SITE_STRINGS.DEFAULT_TITLE
  const pageDescription = resolveRouteDescription(routeMeta) ?? SITE_STRINGS.DEFAULT_DESCRIPTION
  const pageKeywords = resolveRouteNamedMeta(routeMeta, 'keywords') ?? SITE_STRINGS.DEFAULT_KEYWORDS
  const robots = resolveRouteNamedMeta(routeMeta, 'robots') ?? 'index, follow'
  const googlebot =
    robots === 'index, follow'
      ? 'index, follow, max-video-preview:-1, max-image-preview:large, max-snippet:-1'
      : robots
  const canonicalUrl = absoluteUrl(publicEnv.PUBLIC_HOSTNAME, pathname)
  const appUrl = absoluteUrl(publicEnv.PUBLIC_HOSTNAME, '/')
  const webApplicationId = absoluteUrl(publicEnv.PUBLIC_HOSTNAME, SITE_STRINGS.WEB_APPLICATION.ID_PATH)
  const openGraphImageUrl = getOpenGraphImageUrl(publicEnv.PUBLIC_HOSTNAME)
  const socialUrls = Object.values(SITE_STRINGS.SOCIAL_URLS)
  const jsonLd = serializeJsonLd({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': SITE_STRINGS.ORGANIZATION.ID,
        name: SITE_STRINGS.ORGANIZATION.NAME,
        alternateName: SITE_STRINGS.APP_DISPLAY_NAME,
        url: `${SITE_STRINGS.MARKETING_ORIGIN}/`,
        email: `mailto:${SITE_STRINGS.SUPPORT_EMAIL}`,
        sameAs: socialUrls,
        contactPoint: [
          {
            '@type': 'ContactPoint',
            email: SITE_STRINGS.SUPPORT_EMAIL,
            contactType: 'customer support',
            availableLanguage: ['en']
          }
        ]
      },
      {
        '@type': 'WebSite',
        '@id': SITE_STRINGS.WEBSITE.ID,
        name: SITE_STRINGS.WEBSITE.NAME,
        alternateName: SITE_STRINGS.APP_DISPLAY_NAME,
        url: SITE_STRINGS.WEBSITE.URL,
        inLanguage: SITE_STRINGS.WEBSITE.IN_LANGUAGE,
        publisher: {
          '@id': SITE_STRINGS.ORGANIZATION.ID
        },
        about: {
          '@id': webApplicationId
        },
        hasPart: {
          '@id': webApplicationId
        },
        subjectOf: {
          '@id': SITE_STRINGS.REPOSITORY.ID
        }
      },
      {
        '@type': 'WebApplication',
        '@id': webApplicationId,
        name: SITE_STRINGS.COMPANY_NAME,
        alternateName: SITE_STRINGS.APP_DISPLAY_NAME,
        applicationCategory: SITE_STRINGS.WEB_APPLICATION.APPLICATION_CATEGORY,
        operatingSystem: SITE_STRINGS.WEB_APPLICATION.RUNTIME_PLATFORM,
        browserRequirements: 'Requires JavaScript and a modern web browser.',
        description: SITE_STRINGS.WEB_APPLICATION.DESCRIPTION,
        url: appUrl,
        publisher: {
          '@id': SITE_STRINGS.ORGANIZATION.ID
        },
        provider: {
          '@id': SITE_STRINGS.ORGANIZATION.ID
        },
        mainEntityOfPage: {
          '@id': SITE_STRINGS.WEBSITE.ID
        },
        isBasedOn: {
          '@id': SITE_STRINGS.REPOSITORY.ID
        },
        sameAs: [SITE_STRINGS.MARKETING_ORIGIN]
      },
      {
        '@type': 'SoftwareSourceCode',
        '@id': SITE_STRINGS.REPOSITORY.ID,
        name: SITE_STRINGS.REPOSITORY.NAME,
        description: SITE_STRINGS.REPOSITORY.DESCRIPTION,
        url: SITE_STRINGS.REPOSITORY.URL,
        codeRepository: SITE_STRINGS.REPOSITORY.URL,
        programmingLanguage: SITE_STRINGS.REPOSITORY.PROGRAMMING_LANGUAGES,
        runtimePlatform: SITE_STRINGS.WEB_APPLICATION.RUNTIME_PLATFORM,
        license: SITE_STRINGS.REPOSITORY.LICENSE_URL,
        publisher: {
          '@id': SITE_STRINGS.ORGANIZATION.ID
        },
        author: {
          '@id': SITE_STRINGS.ORGANIZATION.ID
        },
        targetProduct: {
          '@id': webApplicationId
        }
      }
    ]
  })

  return (
    <>
      <meta
        name='application-name'
        content={SITE_STRINGS.APP_DISPLAY_NAME}
      />
      <meta
        name='author'
        content={SITE_STRINGS.APP_DISPLAY_NAME}
      />
      <meta
        name='apple-mobile-web-app-capable'
        content='yes'
      />
      <meta
        name='apple-mobile-web-app-status-bar-style'
        content='default'
      />
      <meta
        name='apple-mobile-web-app-title'
        content={SITE_STRINGS.APP_DISPLAY_NAME}
      />
      <meta
        name='color-scheme'
        content='light dark'
      />
      <meta
        name='creator'
        content={SITE_STRINGS.APP_DISPLAY_NAME}
      />
      <meta
        name='category'
        content='Technology'
      />
      <meta
        name='format-detection'
        content='telephone=no'
      />
      <meta
        name='googlebot'
        content={googlebot}
      />
      <meta
        name='keywords'
        content={pageKeywords}
      />
      <meta
        name='mobile-web-app-capable'
        content='yes'
      />
      <meta
        name='msapplication-TileColor'
        content={SITE_STRINGS.THEME_COLOR}
      />
      <meta
        name='referrer'
        content='strict-origin-when-cross-origin'
      />
      <meta
        name='robots'
        content={robots}
      />
      <meta
        name='theme-color'
        content={SITE_STRINGS.THEME_COLOR}
      />
      <meta
        property='og:description'
        content={pageDescription}
      />
      <meta
        property='og:image'
        content={openGraphImageUrl}
      />
      {openGraphImageUrl.startsWith('https://') && (
        <meta
          property='og:image:secure_url'
          content={openGraphImageUrl}
        />
      )}
      <meta
        property='og:image:alt'
        content={SITE_STRINGS.OPEN_GRAPH_IMAGE.ALT}
      />
      <meta
        property='og:image:height'
        content={String(SITE_STRINGS.OPEN_GRAPH_IMAGE.HEIGHT)}
      />
      <meta
        property='og:image:type'
        content={SITE_STRINGS.OPEN_GRAPH_IMAGE.TYPE}
      />
      <meta
        property='og:image:width'
        content={String(SITE_STRINGS.OPEN_GRAPH_IMAGE.WIDTH)}
      />
      <meta
        property='og:locale'
        content='en_US'
      />
      <meta
        property='og:site_name'
        content={SITE_STRINGS.APP_DISPLAY_NAME}
      />
      <meta
        property='og:title'
        content={pageTitle}
      />
      <meta
        property='og:type'
        content='website'
      />
      <meta
        property='og:url'
        content={canonicalUrl}
      />
      <meta
        name='twitter:card'
        content='summary_large_image'
      />
      <meta
        name='twitter:description'
        content={pageDescription}
      />
      <meta
        name='twitter:image'
        content={openGraphImageUrl}
      />
      <meta
        name='twitter:image:alt'
        content={SITE_STRINGS.OPEN_GRAPH_IMAGE.ALT}
      />
      <meta
        name='twitter:title'
        content={pageTitle}
      />
      <link
        rel='icon'
        type='image/png'
        href={getVersionedPublicAssetPath('/favicon-96x96.png')}
        sizes='96x96'
      />
      <link
        rel='icon'
        type='image/svg+xml'
        href={getVersionedPublicAssetPath('/favicon.svg')}
      />
      <link
        rel='shortcut icon'
        href={getVersionedPublicAssetPath('/favicon.ico')}
      />
      <link
        rel='apple-touch-icon'
        sizes='180x180'
        href={getVersionedPublicAssetPath('/apple-touch-icon.png')}
      />
      <link
        rel='canonical'
        href={canonicalUrl}
      />
      <link
        rel='home'
        href={`${SITE_STRINGS.MARKETING_ORIGIN}/`}
      />
      <link
        rel='author'
        href={`${SITE_STRINGS.MARKETING_ORIGIN}/`}
      />
      <link
        rel='manifest'
        href={getVersionedPublicAssetPath('/site.webmanifest')}
      />
      <link
        rel='service'
        href={appUrl}
        title={`${SITE_STRINGS.COMPANY_NAME} app`}
      />
      {socialUrls.map((href) => (
        <link
          key={href}
          rel='me'
          href={href}
        />
      ))}
      <script
        type='application/ld+json'
        dangerouslySetInnerHTML={{ __html: jsonLd }}
      />
    </>
  )
}

function resolveRouteTitle(routeMeta: Array<Array<SiteMetaEntry | undefined> | undefined>): string | null {
  for (let i = routeMeta.length - 1; i >= 0; i -= 1) {
    const metaEntries = routeMeta[i]
    if (!metaEntries) {
      continue
    }

    for (let j = metaEntries.length - 1; j >= 0; j -= 1) {
      const title = metaEntries[j]?.title
      if (typeof title === 'string' && title.length > 0) {
        return title
      }
    }
  }

  return null
}

function resolveRouteDescription(
  routeMeta: Array<Array<SiteMetaEntry | undefined> | undefined>
): string | null {
  return resolveRouteNamedMeta(routeMeta, 'description')
}

function resolveRouteNamedMeta(
  routeMeta: Array<Array<SiteMetaEntry | undefined> | undefined>,
  name: string
): string | null {
  for (let i = routeMeta.length - 1; i >= 0; i -= 1) {
    const metaEntries = routeMeta[i]
    if (!metaEntries) {
      continue
    }

    for (let j = metaEntries.length - 1; j >= 0; j -= 1) {
      const metaEntry = metaEntries[j]
      if (metaEntry?.name === name && typeof metaEntry.content === 'string' && metaEntry.content.length > 0) {
        return metaEntry.content
      }
    }
  }

  return null
}

function absoluteUrl(origin: string, pathname: string): string {
  const url = new URL(pathname, origin)

  if (url.pathname !== '/' && !url.pathname.endsWith('/')) {
    url.pathname = `${url.pathname}/`
  }

  return url.toString()
}

function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replaceAll('<', '\\u003c')
}
