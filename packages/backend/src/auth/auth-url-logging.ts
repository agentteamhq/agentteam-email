export interface AuthUrlComparisonLogDetails {
  allMatch: boolean
  betterAuthUrl: AuthUrlLogDetails
  hostnameMatch: boolean
  manualUrl: AuthUrlLogDetails
  paramKeys1: readonly string[]
  paramKeys2: readonly string[]
  paramKeysMatch: boolean
  paramValuesMatch: boolean
  pathMatch: boolean
  strippedPath1: string
  strippedPath2: string
}

export interface AuthUrlLogDetails {
  hostname: string
  origin: string
  paramKeys: readonly string[]
  path: string
  strippedPath: string
}

export function createAuthUrlComparisonLogDetails({
  betterAuthBasePath,
  betterAuthUrl,
  manualBasePath,
  manualUrl
}: {
  betterAuthBasePath: string
  betterAuthUrl: string
  manualBasePath: string
  manualUrl: string
}): AuthUrlComparisonLogDetails {
  const parsed1 = new URL(betterAuthUrl)
  const parsed2 = new URL(manualUrl)

  const path1 = stripAuthBasePath(parsed1.pathname, betterAuthBasePath)
  const path2 = stripAuthBasePath(parsed2.pathname, manualBasePath)
  const params1 = Object.fromEntries(parsed1.searchParams.entries())
  const params2 = Object.fromEntries(parsed2.searchParams.entries())
  const paramKeys1 = Object.keys(params1).sort()
  const paramKeys2 = Object.keys(params2).sort()
  const hostnameMatch = parsed1.hostname === parsed2.hostname
  const pathMatch = path1 === path2
  const paramKeysMatch = paramKeys1.join(',') === paramKeys2.join(',')
  const paramValuesMatch = paramKeys1.every((key) => params1[key] === params2[key])

  return {
    allMatch: hostnameMatch && pathMatch && paramKeysMatch && paramValuesMatch,
    betterAuthUrl: createAuthUrlLogDetails(parsed1, path1, paramKeys1),
    hostnameMatch,
    manualUrl: createAuthUrlLogDetails(parsed2, path2, paramKeys2),
    paramKeys1,
    paramKeys2,
    paramKeysMatch,
    paramValuesMatch,
    pathMatch,
    strippedPath1: path1,
    strippedPath2: path2
  }
}

function createAuthUrlLogDetails(
  url: URL,
  strippedPath: string,
  paramKeys: readonly string[]
): AuthUrlLogDetails {
  return {
    hostname: url.hostname,
    origin: url.origin,
    paramKeys,
    path: url.pathname,
    strippedPath
  }
}

function stripAuthBasePath(pathname: string, basePath: string): string {
  return pathname.startsWith(basePath) ? pathname.slice(basePath.length) : pathname
}
