// @ts-check

/**
 * @typedef {import('@pnpm/pnpmfile').HookContext} HookContext
 * @typedef {import('@pnpm/pnpmfile').Hooks} Hooks
 * @typedef {import('@pnpm/lockfile.types').LockfileFile} LockfileFile
 * @typedef {import('@pnpm/lockfile.types').LockfilePackageInfo} LockfilePackageInfo
 * @typedef {import('@pnpm/lockfile.types').LockfilePackageSnapshot} LockfilePackageSnapshot
 * @typedef {import('@pnpm/lockfile.types').LockfileObject} LockfileObject
 * @typedef {LockfilePackageInfo | LockfilePackageSnapshot} LockfilePackageEntry
 * @typedef {Record<string, string>} LockfileResolvedDependencies
 * @typedef {LockfilePackageEntry & {
 *   dependencies?: LockfileResolvedDependencies,
 *   optionalDependencies?: LockfileResolvedDependencies,
 *   peerDependencies?: LockfileResolvedDependencies
 * }} LockfileDependencyEntry
 */

/**
 * .pnpmfile.cjs - workspace peer dependency audit and frozen version enforcement.
 *
 * Set DEBUG=1 for verbose logging:
 *   DEBUG=1 pnpm install
 */

const DEBUG = process.env.DEBUG === '1' || process.env.DEBUG === 'true'

// Toggle peer split detection (detects @types/node, typescript version conflicts)
const ENABLE_PEER_SPLIT_DETECTION = true

/**
 * @param {string} name
 * @returns {boolean}
 */
function isWorkspacePackage(name) {
  return name.startsWith('@main/')
}

/** @type {Set<string>} */
const workspacePackages = new Set()
/** @type {Map<string, Record<string, string>>} */
const peerDepsMap = new Map()
/** @type {Map<string, Set<string>>} */
const providedDepsMap = new Map()
/** @type {Map<string, Set<string>>} */
const peerDepsSetMap = new Map()

/** @type {number} */
let readPackageCount = 0

/**
 * Implements Hooks['readPackage'] from @pnpm/pnpmfile.
 * Collects workspace peer dep and provider data for auditMissingPeers.
 * @param {any} pkg
 * @param {HookContext} context
 * @returns {any}
 */
function readPackage(pkg, context) {
  readPackageCount++

  if (!pkg.name || !isWorkspacePackage(pkg.name)) {
    if (DEBUG) {
      if (readPackageCount <= 20) {
        context.log(`[readPackage] #${readPackageCount} registry pkg: ${pkg.name}@${pkg.version}`)
      } else if (readPackageCount === 21) {
        context.log(`[readPackage] ... (suppressing further registry package logs)`)
      }
    }
    return pkg
  }

  workspacePackages.add(pkg.name)

  if (pkg.peerDependencies && Object.keys(pkg.peerDependencies).length > 0) {
    peerDepsMap.set(pkg.name, { ...pkg.peerDependencies })
    if (DEBUG) {
      context.log(
        `[readPackage] ${pkg.name} has ${Object.keys(pkg.peerDependencies).length} peer deps: ${Object.keys(pkg.peerDependencies).join(', ')}`
      )
    }
  }

  providedDepsMap.set(
    pkg.name,
    new Set([...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.devDependencies || {})])
  )

  // Track peer deps separately for transitive peer chain checking
  if (pkg.peerDependencies) {
    peerDepsSetMap.set(pkg.name, new Set(Object.keys(pkg.peerDependencies)))
  }

  if (DEBUG) {
    context.log(
      `[readPackage] #${readPackageCount} workspace pkg: ${pkg.name}@${pkg.version} | deps=${Object.keys(pkg.dependencies || {}).length} devDeps=${Object.keys(pkg.devDependencies || {}).length} peerDeps=${Object.keys(pkg.peerDependencies || {}).length}`
    )
  }

  return pkg
}

/**
 * Checks that every consumer of a workspace package provides its peer dependencies.
 * Also checks transitive peer propagation: if consumer has pkg as a PEER, then
 * consumer must also declare pkg's peers as its own peers (not just devDeps).
 * Uses data collected by readPackage.
 * @param {HookContext} context
 * @returns {{missing: string[], transitive: string[]}}
 */
function auditMissingPeers(context) {
  if (DEBUG) {
    context.log(`[audit] tracked ${workspacePackages.size} workspace packages`)
    context.log(`[audit] tracked ${peerDepsMap.size} packages with peer deps`)
  }

  /** @type {Set<string>} */
  const missingSet = new Set()
  /** @type {Set<string>} */
  const transitiveSet = new Set()

  for (const [pkgName, peerDeps] of peerDepsMap.entries()) {
    for (const [consumerName, providedSet] of providedDepsMap.entries()) {
      if (consumerName === pkgName) continue
      if (!providedSet.has(pkgName)) continue

      const consumerPeers = peerDepsSetMap.get(consumerName) || new Set()
      const consumerHasPkgAsPeer = consumerPeers.has(pkgName)

      for (const peerName of Object.keys(peerDeps)) {
        if (!providedSet.has(peerName)) {
          missingSet.add(`${consumerName} → ${pkgName} requires: ${peerName}`)
        } else if (consumerHasPkgAsPeer && !consumerPeers.has(peerName)) {
          transitiveSet.add(`${consumerName} peerDependencies += "${peerName}": "*"`)
        }
      }
    }
  }

  return { missing: [...missingSet], transitive: [...transitiveSet] }
}

/**
 * Reads each workspace package.json from disk and checks that no version
 * specifier uses ^ or ~ (all versions must be exact/frozen).
 * @param {string[]} importerPaths - lockfile importer keys (e.g. ".", "packages/*")
 * @param {HookContext} context
 * @returns {string[]} list of violations
 */
function auditFrozenVersions(importerPaths, context) {
  const fs = require('node:fs')
  const path = require('node:path')
  /** @type {string[]} */
  const violations = []

  for (const importerPath of importerPaths) {
    // Skip root package - it may use latest for bleeding edge tools
    if (importerPath === '.') continue
    const pkgJsonPath = path.join(process.cwd(), importerPath, 'package.json')
    /** @type {any} */
    let pkg
    try {
      pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'))
    } catch {
      continue
    }

    for (const field of ['dependencies', 'devDependencies']) {
      const deps = pkg[field]
      if (!deps) continue
      for (const [depName, version] of Object.entries(deps)) {
        if (typeof version !== 'string') continue
        if (version.startsWith('workspace:') || version === 'catalog:') continue
        if (version === '*') continue
        if (version.startsWith('^') || version.startsWith('~')) {
          violations.push(`${importerPath}: ${depName} "${version}" → use exact version`)
        }
        // Catch tags like latest, next, beta, etc.
        if (/^[a-z]+$/i.test(version)) {
          violations.push(`${importerPath}: ${depName} "${version}" → use exact version or catalog:`)
        }
      }
    }
  }

  return violations
}

/**
 * @param {LockfileObject} lockfile
 * @returns {string[]}
 */
function auditWorkspacePeerSplits(lockfile) {
  const packages = lockfile.packages || {}
  /** @type {Map<string, string[]>} */
  const workspaceResolutions = new Map()

  for (const pkgKey of Object.keys(packages)) {
    const match = pkgKey.match(/^(.+@file:[^(]+)(\([^)]+\))?$/)
    if (!match) continue

    const baseKey = match[1]
    const peerSuffix = match[2] || ''
    if (!peerSuffix) continue

    if (!workspaceResolutions.has(baseKey)) {
      workspaceResolutions.set(baseKey, [])
    }
    workspaceResolutions.get(baseKey)?.push(pkgKey)
  }

  /** @type {string[]} */
  const splits = []

  for (const [baseKey, resolutions] of workspaceResolutions.entries()) {
    if (resolutions.length <= 1) continue
    const pkgName = baseKey.split('@file:')[0]
    splits.push(`${pkgName} has ${resolutions.length} resolutions`)
  }

  return splits
}

/**
 * Traces the root cause of workspace peer splits.
 * @param {LockfileObject} lockfile
 * @returns {{versions: Map<string, string[]>, fixes: string[]}}
 */
function auditRootCauses(lockfile) {
  const packages = lockfile.packages || {}
  const criticalPackages = ['@types/node', 'typescript']

  /** @type {Map<string, Set<string>>} */
  const versionsByPackage = new Map()

  for (const pkgKey of Object.keys(packages)) {
    for (const criticalPkg of criticalPackages) {
      const escapedName = criticalPkg.replace('/', '[/+]')
      const pattern = new RegExp(`^'?${escapedName}@([^(']+)`)
      const match = pkgKey.match(pattern)

      if (match) {
        const version = match[1]
        if (!versionsByPackage.has(criticalPkg)) {
          versionsByPackage.set(criticalPkg, new Set())
        }
        versionsByPackage.get(criticalPkg)?.add(version)
      }
    }
  }

  /** @type {Map<string, string[]>} */
  const versions = new Map()
  /** @type {string[]} */
  const fixes = []

  for (const [pkgName, versionSet] of versionsByPackage.entries()) {
    if (versionSet.size <= 1) continue
    const versionList = [...versionSet].sort()
    versions.set(pkgName, versionList)
    const latest = versionList[versionList.length - 1]
    fixes.push(`  ${pkgName}: ${latest}`)
  }

  return { versions, fixes }
}

/**
 * Gets snapshot data (dependencies, optionalDependencies) for a lockfile package key.
 * Handles both merged (LockfileObject) and split (packages/snapshots) lockfile formats.
 * @param {LockfileObject | LockfileFile} lockfile
 * @param {string} pkgKey
 * @returns {LockfileDependencyEntry | null}
 */
function getPackageSnapshot(lockfile, pkgKey) {
  const packages =
    /** @type {Record<string, LockfileDependencyEntry>} */ (/** @type {unknown} */ (lockfile.packages || {}))
  const entry = packages[pkgKey]
  if (entry && (entry.dependencies || entry.optionalDependencies)) {
    return entry
  }

  const snapshots =
    /** @type {Record<string, LockfileDependencyEntry> | undefined} */ (
      'snapshots' in lockfile ? lockfile.snapshots : undefined
    )
  return snapshots?.[pkgKey] ?? entry ?? null
}

/**
 * Classifies which dependency field a package name appears in for a snapshot entry.
 * @param {LockfileDependencyEntry} snapshot
 * @param {string} depName
 * @returns {'optional' | 'peer' | 'dep'}
 */
function classifyDepType(snapshot, depName) {
  if (snapshot.optionalDependencies && depName in snapshot.optionalDependencies) {
    return 'optional'
  }
  if (snapshot.peerDependencies && depName in snapshot.peerDependencies) {
    return 'peer'
  }
  return 'dep'
}

/**
 * @typedef {{name: string, type: 'optional' | 'peer' | 'dep', v1: string | undefined, v2: string | undefined}} TraceHop
 */

/**
 * Recursively diffs two lockfile snapshot entries to find the leaf version divergence
 * that actually causes the peer split. Tracks dependency type at each hop.
 * @param {LockfileObject} lockfile
 * @param {string} key1
 * @param {string} key2
 * @param {TraceHop[]} hops
 * @param {Set<string>} visited
 * @returns {{hops: TraceHop[], leaf: {pkg: string, versions: string[], type: 'optional' | 'peer' | 'dep'}} | null}
 */
function traceSnapshotDivergence(lockfile, key1, key2, hops, visited) {
  const visitKey = `${key1}|${key2}`
  if (visited.has(visitKey) || hops.length > 10) return null
  visited.add(visitKey)

  const snap1 = getPackageSnapshot(lockfile, key1)
  const snap2 = getPackageSnapshot(lockfile, key2)
  if (!snap1 || !snap2) return null
  if (!snap1.dependencies && !snap1.optionalDependencies) return null

  const deps1 = { ...(snap1.dependencies || {}), ...(snap1.optionalDependencies || {}) }
  const deps2 = { ...(snap2.dependencies || {}), ...(snap2.optionalDependencies || {}) }

  for (const depName of new Set([...Object.keys(deps1), ...Object.keys(deps2)])) {
    const v1 = deps1[depName]
    const v2 = deps2[depName]
    if (v1 === v2) continue

    const depType = classifyDepType(snap1, depName)
    const baseV1 = v1 ? v1.split('(')[0] : undefined
    const baseV2 = v2 ? v2.split('(')[0] : undefined

    /** @type {TraceHop} */
    const hop = { name: depName, type: depType, v1, v2 }

    if (baseV1 !== baseV2) {
      // Leaf divergence: actual version difference
      return {
        hops: [...hops, hop],
        leaf: { pkg: depName, versions: [baseV1 || '(missing)', baseV2 || '(missing)'].sort(), type: depType }
      }
    }

    // Same base version, different peer context - recurse deeper
    if (v1 && v2) {
      const result = traceSnapshotDivergence(
        lockfile, `${depName}@${v1}`, `${depName}@${v2}`, [...hops, hop], visited
      )
      if (result) return result
    }
  }

  return null
}

/**
 * @typedef {{workspace: string, hops: TraceHop[], leaf: {pkg: string, versions: string[], type: 'optional' | 'peer' | 'dep'}, keys: [string, string]}} SplitChainResult
 */

/**
 * For each workspace package with multiple peer resolutions, traces the
 * dependency chain to find which leaf version divergence is actually causing
 * the split. Returns traced chains with the root cause package, versions,
 * and dependency type at each hop.
 * @param {LockfileObject} lockfile
 * @returns {SplitChainResult[]}
 */
function tracePeerSplitChains(lockfile) {
  const packages = lockfile.packages || {}
  /** @type {Map<string, string[]>} */
  const workspaceResolutions = new Map()

  for (const pkgKey of Object.keys(packages)) {
    const match = pkgKey.match(/^(.+@file:[^(]+)(\([^)]+\))?$/)
    if (!match || !match[2]) continue
    const baseKey = match[1]
    if (!workspaceResolutions.has(baseKey)) workspaceResolutions.set(baseKey, [])
    workspaceResolutions.get(baseKey)?.push(pkgKey)
  }

  /** @type {SplitChainResult[]} */
  const results = []

  for (const [baseKey, resolutions] of workspaceResolutions.entries()) {
    if (resolutions.length <= 1) continue
    const pkgName = baseKey.split('@file:')[0]
    const result = traceSnapshotDivergence(lockfile, resolutions[0], resolutions[1], [], new Set())
    if (result) {
      results.push({ workspace: pkgName, hops: result.hops, leaf: result.leaf, keys: [resolutions[0], resolutions[1]] })
    }
  }

  return results
}

/**
 * Formats the dependency type as a compact label.
 * @param {'optional' | 'peer' | 'dep'} type
 * @returns {string}
 */
function depTypeLabel(type) {
  if (type === 'optional') return '(optional)'
  if (type === 'peer') return '(peer)'
  return ''
}

/**
 * Formats precise root cause analysis and fix suggestions for peer splits.
 * Shows the dependency chain with dep types, affected workspaces, and
 * prefers suggesting catalog version updates over overrides.
 * @param {LockfileObject} lockfile
 * @param {SplitChainResult[]} chains
 * @param {HookContext} context
 */
function formatSplitAnalysis(lockfile, chains, context) {
  if (chains.length === 0) return

  // Dedupe by leaf package
  /** @type {Map<string, {versions: string[], leafType: 'optional' | 'peer' | 'dep', hops: TraceHop[], workspaces: string[]}>} */
  const byLeaf = new Map()
  for (const { workspace, hops, leaf } of chains) {
    if (!byLeaf.has(leaf.pkg)) {
      byLeaf.set(leaf.pkg, { versions: leaf.versions, leafType: leaf.type, hops, workspaces: [] })
    }
    const entry = byLeaf.get(leaf.pkg)
    if (entry) {
      entry.workspaces.push(workspace)
    }
  }

  context.log(``)
  context.log(`ROOT CAUSE:`)

  for (const [pkg, { versions, leafType, hops, workspaces }] of byLeaf.entries()) {
    // Show the chain with dep types at each hop
    if (hops.length > 1) {
      const chainParts = hops.slice(0, -1).map(h => {
        const label = depTypeLabel(h.type)
        return label ? `${h.name} ${label}` : h.name
      })
      const leafLabel = depTypeLabel(leafType)
      context.log(`  ${chainParts.join(' → ')} → ${pkg} ${leafLabel} (${versions.join(' vs ')})`.trimEnd())
    } else {
      const leafLabel = depTypeLabel(leafType)
      context.log(`  ${pkg} ${leafLabel} (${versions.join(' vs ')})`.trimEnd())
    }

    // Show affected workspace packages
    const uniqueWorkspaces = [...new Set(workspaces)]
    context.log(`  affects: ${uniqueWorkspaces.join(', ')}`)

    // Check if this package exists in the catalog
    const catalogVersion = lockfile.catalogs?.default?.[pkg]?.version
    if (catalogVersion && versions.includes(catalogVersion)) {
      const targetVersion = versions.find(v => v !== catalogVersion)
      if (targetVersion) {
        context.log(`  FIX: Update catalog '${pkg}' from ${catalogVersion} to ${targetVersion}`)
      }
    } else {
      const latest = versions[versions.length - 1]
      context.log(`  FIX: Add override '${pkg}': '${latest}' to pnpm-workspace.yaml`)
    }
  }
}

/**
 * Logs detailed step-by-step trace of how each peer split root cause was identified.
 * Only runs when DEBUG is enabled.
 * @param {SplitChainResult[]} chains
 * @param {HookContext} context
 */
function formatSplitDebugTrace(chains, context) {
  if (chains.length === 0) return

  context.log(``)
  context.log(`[split-trace] Detailed peer split trace:`)

  for (const { workspace, hops, leaf, keys } of chains) {
    context.log(`[split-trace] ${workspace}:`)
    context.log(`[split-trace]   resolution A: ${keys[0]}`)
    context.log(`[split-trace]   resolution B: ${keys[1]}`)

    for (let i = 0; i < hops.length; i++) {
      const hop = hops[i]
      const indent = '  '.repeat(i + 1)
      const isLeaf = i === hops.length - 1
      const baseV1 = hop.v1 ? hop.v1.split('(')[0] : '(missing)'
      const baseV2 = hop.v2 ? hop.v2.split('(')[0] : '(missing)'
      const suffix1 = hop.v1 && hop.v1.includes('(') ? ` peer-ctx:${hop.v1.split('(')[1].slice(0, 8)}…` : ''
      const suffix2 = hop.v2 && hop.v2.includes('(') ? ` peer-ctx:${hop.v2.split('(')[1].slice(0, 8)}…` : ''

      if (isLeaf) {
        context.log(`[split-trace] ${indent}└─ ${hop.name} [${hop.type}] DIVERGES: ${baseV1} vs ${baseV2}`)
      } else {
        context.log(`[split-trace] ${indent}├─ ${hop.name} [${hop.type}] ${baseV1}${suffix1} vs ${baseV2}${suffix2}`)
      }
    }
  }
}

/**
 * @type {Required<Hooks>['afterAllResolved'][number]}
 */
function afterAllResolved(lockfile, context) {
  const importerPaths = Object.keys(lockfile.importers || {})
  let hasErrors = false

  if (DEBUG) {
    context.log(`${importerPaths.length} importers, ${Object.keys(lockfile.packages || {}).length} packages`)
  }

  // Check missing peers
  const { missing, transitive } = auditMissingPeers(context)

  if (missing.length > 0) {
    hasErrors = true
    context.log(``)
    context.log(`ERROR: Missing peer dependencies`)
    for (const m of missing) {
      context.log(`  ${m}`)
    }
  }

  if (transitive.length > 0) {
    hasErrors = true
    context.log(``)
    context.log(`ERROR: Missing transitive peers (add to peerDependencies)`)
    for (const t of transitive) {
      context.log(`  ${t}`)
    }
  }

  // Check frozen versions
  const versionViolations = auditFrozenVersions(importerPaths, context)
  if (versionViolations.length > 0) {
    hasErrors = true
    context.log(``)
    context.log(`ERROR: Non-frozen versions (remove ^ or ~)`)
    for (const v of versionViolations) {
      context.log(`  ${v}`)
    }
  }

  // Check peer splits
  if (ENABLE_PEER_SPLIT_DETECTION) {
    const splits = auditWorkspacePeerSplits(lockfile)
    const { fixes } = auditRootCauses(lockfile)

    if (splits.length > 0) {
      hasErrors = true
      context.log(``)
      context.log(`ERROR: Workspace packages have multiple resolutions`)
      for (const s of splits) {
        context.log(`  ${s}`)
      }

      // Only show root cause fix if there are actual workspace splits
      if (fixes.length > 0) {
        context.log(``)
        context.log(`FIX: Add overrides to pnpm-workspace.yaml:`)
        context.log(`overrides:`)
        for (const f of fixes) {
          context.log(f)
        }
      }

      // Enhanced: trace actual root cause and suggest catalog update when possible
      const splitChains = tracePeerSplitChains(lockfile)
      formatSplitAnalysis(lockfile, splitChains, context)
      if (DEBUG) {
        formatSplitDebugTrace(splitChains, context)
      }
    }
  }

  if (!hasErrors) {
    context.log(`[pnpmfile] ok`)
  }

  return lockfile
}

module.exports = {
  hooks: {
    readPackage,
    afterAllResolved
  }
}
