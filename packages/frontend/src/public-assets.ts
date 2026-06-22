import { SITE_STRINGS } from './strings'

export type WebAppManifestIconSize = 192 | 512

export function getPublicAssetUrl(publicHostname: string, pathname: string) {
  return new URL(pathname, publicHostname).toString()
}

export function getWebAppManifestIconUrl(publicHostname: string, size: WebAppManifestIconSize) {
  return getPublicAssetUrl(
    publicHostname,
    `/web-app-manifest-${size}x${size}.png?v=${SITE_STRINGS.ASSET_VERSION}`
  )
}
