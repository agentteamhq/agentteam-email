import { safeParamKey, sanitizePathnameForLogging } from './log-redaction'

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
  pathPatternMatch: boolean
  strippedPath1: string
  strippedPath2: string
}

export interface AuthUrlLogDetails {
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

  const strippedPath1 = stripAuthBasePath(parsed1.pathname, betterAuthBasePath)
  const strippedPath2 = stripAuthBasePath(parsed2.pathname, manualBasePath)
  const path1 = sanitizePathnameForLogging(strippedPath1)
  const path2 = sanitizePathnameForLogging(strippedPath2)
  const params1 = Object.fromEntries(parsed1.searchParams.entries())
  const params2 = Object.fromEntries(parsed2.searchParams.entries())
  const paramKeys1 = Object.keys(params1).sort()
  const paramKeys2 = Object.keys(params2).sort()
  const safeParamKeys1 = paramKeys1.map(safeParamKey)
  const safeParamKeys2 = paramKeys2.map(safeParamKey)
  const hostnameMatch = parsed1.hostname === parsed2.hostname
  const pathMatch = strippedPath1 === strippedPath2
  const pathPatternMatch = path1 === path2
  const paramKeysMatch = paramKeys1.join(',') === paramKeys2.join(',')
  const paramValuesMatch = paramKeys1.every((key) => params1[key] === params2[key])

  return {
    allMatch: hostnameMatch && pathMatch && paramKeysMatch && paramValuesMatch,
    betterAuthUrl: createAuthUrlLogDetails(parsed1, path1, paramKeys1),
    hostnameMatch,
    manualUrl: createAuthUrlLogDetails(parsed2, path2, paramKeys2),
    paramKeys1: safeParamKeys1,
    paramKeys2: safeParamKeys2,
    paramKeysMatch,
    paramValuesMatch,
    pathMatch,
    pathPatternMatch,
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
    paramKeys: paramKeys.map(safeParamKey),
    path: sanitizePathnameForLogging(url.pathname),
    strippedPath
  }
}

function stripAuthBasePath(pathname: string, basePath: string): string {
  return pathname.startsWith(basePath) ? pathname.slice(basePath.length) : pathname
}
