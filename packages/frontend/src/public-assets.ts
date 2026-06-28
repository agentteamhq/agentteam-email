import { SITE_STRINGS } from './strings'

export type WebAppManifestIconSize = 192 | 512

export function getPublicAssetUrl(publicHostname: string, pathname: string) {
  return new URL(pathname, publicHostname).toString()
}

export function getVersionedPublicAssetPath(pathname: string) {
  const assetUrl = new URL(pathname, SITE_STRINGS.APP_ORIGIN)
  assetUrl.searchParams.set('v', SITE_STRINGS.ASSET_VERSION)
  return `${assetUrl.pathname}${assetUrl.search}`
}

export function getVersionedPublicAssetUrl(publicHostname: string, pathname: string) {
  return getPublicAssetUrl(publicHostname, getVersionedPublicAssetPath(pathname))
}

export function getOpenGraphImageUrl(publicHostname: string) {
  return getVersionedPublicAssetUrl(publicHostname, SITE_STRINGS.OPEN_GRAPH_IMAGE.PATHNAME)
}

export function getWebAppManifestIconUrl(publicHostname: string, size: WebAppManifestIconSize) {
  return getPublicAssetUrl(
    publicHostname,
    getVersionedPublicAssetPath(`/web-app-manifest-${size}x${size}.png`)
  )
}
