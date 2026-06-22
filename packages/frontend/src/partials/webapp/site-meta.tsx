import { useRouterState } from '@tanstack/react-router'

import { getWebAppManifestIconUrl } from '../../public-assets'
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
  const canonicalUrl = absoluteUrl(publicEnv.PUBLIC_HOSTNAME, pathname)
  const appUrl = absoluteUrl(publicEnv.PUBLIC_HOSTNAME, '/')
  const webApplicationId = absoluteUrl(publicEnv.PUBLIC_HOSTNAME, SITE_STRINGS.WEB_APPLICATION.ID_PATH)
  const openGraphImageUrl = getWebAppManifestIconUrl(publicEnv.PUBLIC_HOSTNAME, 512)
  const jsonLd = serializeJsonLd({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': SITE_STRINGS.ORGANIZATION.ID,
        name: SITE_STRINGS.ORGANIZATION.NAME,
        url: `${SITE_STRINGS.MARKETING_ORIGIN}/`,
        sameAs: SITE_STRINGS.ORGANIZATION.SAME_AS
      },
      {
        '@type': 'WebApplication',
        '@id': webApplicationId,
        name: SITE_STRINGS.APP_DISPLAY_NAME,
        alternateName: SITE_STRINGS.BRAND_NAME,
        applicationCategory: SITE_STRINGS.WEB_APPLICATION.APPLICATION_CATEGORY,
        operatingSystem: SITE_STRINGS.WEB_APPLICATION.RUNTIME_PLATFORM,
        url: appUrl,
        publisher: {
          '@id': SITE_STRINGS.ORGANIZATION.ID
        }
      },
      {
        '@type': 'SoftwareSourceCode',
        '@id': SITE_STRINGS.REPOSITORY.ID,
        name: SITE_STRINGS.REPOSITORY.NAME,
        url: SITE_STRINGS.REPOSITORY.URL,
        codeRepository: SITE_STRINGS.REPOSITORY.URL,
        programmingLanguage: SITE_STRINGS.REPOSITORY.PROGRAMMING_LANGUAGES,
        runtimePlatform: SITE_STRINGS.WEB_APPLICATION.RUNTIME_PLATFORM,
        license: SITE_STRINGS.REPOSITORY.LICENSE_URL,
        publisher: {
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
        name='format-detection'
        content='telephone=no'
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
        content='index, follow'
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
        content={SITE_STRINGS.WEB_APPLICATION.OG_IMAGE_ALT}
      />
      <meta
        property='og:image:height'
        content='512'
      />
      <meta
        property='og:image:type'
        content='image/png'
      />
      <meta
        property='og:image:width'
        content='512'
      />
      <meta
        property='og:locale'
        content='en_US'
      />
      <meta
        property='og:site_name'
        content={SITE_STRINGS.BRAND_NAME}
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
        content='summary'
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
        content={SITE_STRINGS.WEB_APPLICATION.OG_IMAGE_ALT}
      />
      <meta
        name='twitter:title'
        content={pageTitle}
      />
      <link
        rel='icon'
        type='image/png'
        href={`/favicon-96x96.png?v=${SITE_STRINGS.ASSET_VERSION}`}
        sizes='96x96'
      />
      <link
        rel='icon'
        type='image/svg+xml'
        href={`/favicon.svg?v=${SITE_STRINGS.ASSET_VERSION}`}
      />
      <link
        rel='shortcut icon'
        href={`/favicon.ico?v=${SITE_STRINGS.ASSET_VERSION}`}
      />
      <link
        rel='apple-touch-icon'
        sizes='180x180'
        href={`/apple-touch-icon.png?v=${SITE_STRINGS.ASSET_VERSION}`}
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
        href={`/site.webmanifest?v=${SITE_STRINGS.ASSET_VERSION}`}
      />
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
  for (let i = routeMeta.length - 1; i >= 0; i -= 1) {
    const metaEntries = routeMeta[i]
    if (!metaEntries) {
      continue
    }

    for (let j = metaEntries.length - 1; j >= 0; j -= 1) {
      const metaEntry = metaEntries[j]
      if (
        metaEntry?.name === 'description' &&
        typeof metaEntry.content === 'string' &&
        metaEntry.content.length > 0
      ) {
        return metaEntry.content
      }
    }
  }

  return null
}

function absoluteUrl(origin: string, pathname: string): string {
  return new URL(pathname, origin).toString()
}

function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replaceAll('<', '\\u003c')
}
