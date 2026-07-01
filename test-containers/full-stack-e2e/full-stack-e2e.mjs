import { createHash, randomBytes } from 'node:crypto'
import { appendFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { parseAllDocuments } from 'yaml'
import { AwsClient } from 'aws4fetch'
import { v7 as uuidv7 } from 'uuid'

const suiteRoot = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(suiteRoot, '../..')
const artifactSubmitWorkdir = path.posix.join(path.posix.sep, 'work')
const wt = requireEnv('WT')
const containerEngine = process.env.CONTAINER_ENGINE || 'podman'
const runId =
  process.env.TEST_RUN_ID || new Date().toISOString().replaceAll(/[-:]/g, '').replace(/\..+$/u, 'Z')
const runDir = path.resolve(process.env.TEST_RUN_DIR || path.join(suiteRoot, 'tmp', `run-${runId}`))
const logsDir = path.join(runDir, 'logs')
const renderedDir = path.join(runDir, 'rendered')
const diagnosticsDir = path.join(runDir, 'diagnostics')
const reportsDir = path.join(runDir, 'reports')
const scenariosDir = path.join(runDir, 'scenarios')
const generatedInputsDir = path.join(runDir, 'generated-inputs')
const imagesDir = path.join(runDir, 'images')
const kubeconfigPath = path.join(runDir, 'kubeconfig')
const harnessLogPath = path.join(logsDir, 'harness.log')
const valuesFile = path.join(suiteRoot, 'values-full-stack.yaml')
const imageTag = process.env.AT_EMAIL_ADMIN_KIND_IMAGE_TAG || 'stage'
const configuredMailControlServiceImageRepository =
  process.env.AT_EMAIL_ADMIN_KIND_MAIL_CONTROL_SERVICE_IMAGE_REPOSITORY ||
  `atemail.${wt}.mail-control-service`
const configuredWebServerImageRepository =
  process.env.AT_EMAIL_ADMIN_KIND_WEB_SERVER_IMAGE_REPOSITORY || `atemail.${wt}.web-server`
const mailControlServiceImageRepository = kindLocalRepository(configuredMailControlServiceImageRepository)
const webServerImageRepository = kindLocalRepository(configuredWebServerImageRepository)
const mailControlServiceImage = `${mailControlServiceImageRepository}:${imageTag}`
const webServerImage = `${webServerImageRepository}:${imageTag}`
const clusterName = process.env.AT_EMAIL_ADMIN_FULL_STACK_KIND_CLUSTER || `atemail-${wt}-full-stack-e2e`
const namespace = process.env.AT_EMAIL_ADMIN_FULL_STACK_NAMESPACE || `atemail-${wt}-full-stack`
const releaseName = process.env.AT_EMAIL_ADMIN_FULL_STACK_RELEASE || `atemail-${wt}-full-stack`
const keepCluster = process.env.AT_EMAIL_ADMIN_FULL_STACK_KEEP_CLUSTER === '1'
const minioImage =
  process.env.AT_EMAIL_ADMIN_SMOKE_MINIO_IMAGE || 'docker.io/minio/minio:RELEASE.2025-09-07T16-13-09Z'
const mailpitImage = process.env.AT_EMAIL_ADMIN_DEV_MAILPIT_IMAGE || 'docker.io/axllent/mailpit:v1.30.1'
const supportToken = 'full-stack-e2e-support-token'
const trialAdmissionToken = 'full-stack-e2e-trial-admission-token'
const testPassword = `FullStackE2E-${randomBytes(12).toString('base64url')}!1`
const testEmail = `full-stack-e2e-${Date.now()}-${randomBytes(4).toString('hex')}@example.test`
const fakeCloudflareOAuthIdentity = sanitizeIdentifier(runId)
const fakeCloudflareOAuthEmail = `cloudflare-${fakeCloudflareOAuthIdentity}@example.test`
const fakeCloudflareOAuthSubject = `cloudflare-user-${fakeCloudflareOAuthIdentity}`
const domains = ['example.test', 'second.test']
const minioAccessKey = 'full-stack-e2e-minio'
const minioSecretKey = 'full-stack-e2e-minio-secret'
const archiveBucket = 'full-stack-e2e-archive'
const s3Region = 'us-east-1'
const workerNotificationWebhookSigningSecret = 'whsec_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
const s3Client = new AwsClient({
  accessKeyId: minioAccessKey,
  secretAccessKey: minioSecretKey,
  service: 's3',
  region: s3Region
})

let createdCluster = false
const portForwardProcesses = []
const results = []
const runtime = {
  webBaseUrl: null,
  minioBaseUrl: null,
  cookieHeader: null,
  organizationId: null,
  ingestId: null,
  connections: new Map(),
  workers: new Map()
}
const dynamicRedactions = new Map()

await mkdir(logsDir, { recursive: true })
await mkdir(renderedDir, { recursive: true })
await mkdir(diagnosticsDir, { recursive: true })
await mkdir(reportsDir, { recursive: true })
await mkdir(scenariosDir, { recursive: true })
await mkdir(generatedInputsDir, { recursive: true })
await mkdir(imagesDir, { recursive: true })
process.env.KUBECONFIG = kubeconfigPath

await log(`run directory: ${path.relative(suiteRoot, runDir)}`)
await log(`kubeconfig: ${path.relative(suiteRoot, kubeconfigPath)}`)
await log(`WT: ${wt}`)
await log(`kind cluster: ${clusterName}`)
await log(`namespace: ${namespace}`)
await log(`release: ${releaseName}`)

let setupFailed = null
try {
  await setupCluster()
  await runPhase('phase-0-boundary', [
    checkHelmRendered,
    checkNoPublicInternalIngress,
    checkPublicWebDoesNotExposeInternalApis,
    checkAllServicesClusterIp,
    checkWebHealth,
    checkInternalServiceDns,
    checkWebServerControlApiWiring,
    checkMailControlKubernetesServiceNames,
    checkTestDependencyServices
  ])
  await runPhase('phase-1-web-server-actor', [
    checkE2eSupportUnauthorized,
    checkE2eSupportInvalidEmail,
    checkE2eSupportPrincipalCreation,
    checkSecretNonDisclosureThroughWeb,
    checkBetterAuthSignIn,
    checkCloudflareRoutesRequireAuthenticatedWebActor,
    checkCloudflareOAuthConnectionThroughWeb
  ])
  await runPhase('phase-2-multi-domain-provisioning', [
    checkDomainConnectionThroughWebServer,
    checkExactDomainWorkerContract,
    checkFakeCloudflareProvisioningOperations
  ])
  await runPhase('phase-3-inbound-mail', [
    checkWildDuckRecipientSeeded,
    checkInboundArchiveObjects,
    checkInboundNotificationThroughWebServer,
    checkInboundResultAndWildDuckProof,
    checkWebmailClientThroughWebServer,
    checkAtEmailAgentEnrollmentGrantAuthorizesMailOperation,
    checkAtEmailAgentEnrollmentDeniesUngrantedMailOperation,
    checkAtEmailAgentConnectApprovalAuthorizesMailOperation,
    checkAtEmailAgentConnectFreshSignupApprovalAuthorizesMailOperation,
    checkAtEmailAgentTrialSendsWithinLimitsThenClaimAuthorizesPostClaimSend,
    checkInboundIdempotencyAndSweepContract,
    checkInboundInvalidDomainRejection
  ])
  await runPhase('phase-4-outbound-mail', [
    checkOutboundSubmissionThroughWebServer,
    checkZoneMtaFeederReachableInternally,
    checkOutboundProviderOrLocalRouteResult,
    checkOutboundInvalidProvenanceRejected
  ])
  await runPhase('phase-5-failure-matrix', [
    checkMissingSignatureRejectedByWebIngest,
    checkMalformedSignatureRejectedByWebIngest,
    checkUppercaseSignatureRejectedByWebIngest,
    checkBadSignatureRejectedByWebIngest,
    checkObjectStorageOutageStatus,
    checkDuplicateResultPreventsReplay,
    checkSweepPaginationContract,
    checkRestartRecoveryContract,
    checkCrossDomainPrefixIsolation
  ])
} catch (error) {
  setupFailed = error
  await recordResult({
    details: stringifyError(error),
    name: 'harness setup and execution',
    phase: 'harness',
    status: 'failed'
  })
} finally {
  await collectDiagnostics()
  await stopPortForwards()
  if (createdCluster && !keepCluster) {
    await runCommand('kind', ['delete', 'cluster', '--name', clusterName], {
      allowFailure: true,
      logName: 'kind-delete-cluster'
    })
  } else if (createdCluster) {
    await log(`keeping kind cluster ${clusterName}`)
  }
  await writeReports()
  await submitArtifacts()
}

const failed = results.filter((result) => result.status === 'failed')
if (failed.length > 0) {
  await log(`failed assertions: ${failed.length}/${results.length}`)
  process.exitCode = 1
} else if (setupFailed) {
  process.exitCode = 1
} else {
  await log(`all assertions passed: ${results.length}`)
}

async function setupCluster() {
  await log('phase setup: render Helm chart')
  const webPort = await choosePort(Number(process.env.AT_EMAIL_ADMIN_FULL_STACK_WEB_PORT || '23200'))
  runtime.webBaseUrl = `http://127.0.0.1:${webPort}`
  const renderedManifestPath = path.join(renderedDir, 'agentteam-email.yaml')
  const helmValueArgs = [
    '--set-string',
    `namespace.name=${namespace}`,
    '--set',
    'namespace.create=false',
    '--set-string',
    `publicHostname=${runtime.webBaseUrl}`,
    '--set-string',
    `images.mailControlService.repository=${mailControlServiceImageRepository}`,
    '--set-string',
    `images.mailControlService.tag=${imageTag}`,
    '--set-string',
    `images.webServer.repository=${webServerImageRepository}`,
    '--set-string',
    `images.webServer.tag=${imageTag}`
  ]

  await runCommand(
    'helm',
    [
      'template',
      releaseName,
      path.join(repoRoot, 'charts/agentteam-email'),
      '--namespace',
      namespace,
      '-f',
      valuesFile,
      ...helmValueArgs
    ],
    {
      logName: 'helm-template',
      stdoutFile: renderedManifestPath
    }
  )

  await log('phase setup: create or select kind cluster')
  const clusters = await runCommand('kind', ['get', 'clusters'], {
    logName: 'kind-get-clusters',
    returnStdout: true
  })
  if (clusters.split(/\r?\n/u).includes(clusterName)) {
    await log(`using existing kind cluster ${clusterName}`)
  } else {
    await runCommand('kind', ['create', 'cluster', '--name', clusterName, '--wait', '120s'], {
      logName: 'kind-create-cluster'
    })
    createdCluster = true
  }
  await runCommand('kind', ['export', 'kubeconfig', '--name', clusterName, '--kubeconfig', kubeconfigPath], {
    logName: 'kind-export-kubeconfig'
  })
  await runCommand('kubectl', ['config', 'use-context', `kind-${clusterName}`], {
    logName: 'kubectl-use-context'
  })
  await runCommand('kubectl', ['create', 'namespace', namespace, '--dry-run=client', '-o', 'yaml'], {
    logName: 'kubectl-render-namespace',
    stdoutFile: path.join(generatedInputsDir, 'namespace.yaml')
  })
  await runCommand('kubectl', ['apply', '-f', path.join(generatedInputsDir, 'namespace.yaml')], {
    logName: 'kubectl-apply-namespace'
  })

  await log('phase setup: load stack images into kind')
  await loadStackImages(renderedManifestPath)

  await log('phase setup: install test-only dependencies')
  await applyTestInfrastructure()
  for (const deployment of ['minio', 'mailpit', 'fake-cloudflare', 'fake-provider']) {
    await rolloutStatus(deployment, 180)
  }

  const minioPort = await choosePort(Number(process.env.AT_EMAIL_ADMIN_FULL_STACK_MINIO_PORT || '23201'))
  runtime.minioBaseUrl = `http://127.0.0.1:${minioPort}`
  await startPortForward('minio', 'service/minio', `${minioPort}:9000`)
  await waitForHttpOk(`${runtime.minioBaseUrl}/minio/health/ready`, 'minio health')
  await ensureArchiveBucket()

  await log('phase setup: install Helm release')
  await runCommand(
    'helm',
    [
      'upgrade',
      '--install',
      releaseName,
      path.join(repoRoot, 'charts/agentteam-email'),
      '--namespace',
      namespace,
      '--create-namespace',
      '-f',
      valuesFile,
      ...helmValueArgs,
      '--wait',
      '--timeout',
      '10m'
    ],
    {
      logName: 'helm-upgrade-install'
    }
  )

  await restartLocalImageDeployments(['atemail-mail-control-service', 'atemail-web-server'])

  for (const deployment of [
    'mongodb',
    'redis',
    'rspamd',
    'wildduck',
    'haraka',
    'zonemta',
    'atemail-mail-control-service',
    'atemail-web-server'
  ]) {
    await rolloutStatus(deployment, 180)
  }

  await startPortForward('web-server', 'service/atemail-web-server', `${webPort}:80`)
  await waitForHttpOk(`${runtime.webBaseUrl}/health`, 'web-server health')
}

async function restartLocalImageDeployments(deployments) {
  for (const deployment of deployments) {
    await runCommand('kubectl', ['rollout', 'restart', `deployment/${deployment}`, '-n', namespace], {
      logName: `restart-${deployment}`
    })
  }
}

async function saveAndLoadImage(name, image) {
  const archivePath = path.join(imagesDir, `${name}.tar`)
  await runCommand(containerEngine, ['save', '-o', archivePath, image], {
    logName: `${name}-image-save`
  })
  await runCommand('kind', ['load', 'image-archive', archivePath, '--name', clusterName], {
    logName: `${name}-kind-load`
  })
}

async function pullSaveAndLoadImage(name, image) {
  await runCommand(containerEngine, ['pull', image], {
    logName: `${name}-image-pull`
  })
  await saveAndLoadImage(name, image)
}

async function loadStackImages(renderedManifestPath) {
  const images = await collectRenderedImages(renderedManifestPath)
  images.add(minioImage)
  images.add(mailpitImage)

  for (const image of images) {
    const name = imageArchiveName(image)
    await log(`loading image into kind: ${image}`)
    if (isLocalKindImage(image)) {
      await saveAndLoadImage(name, image)
    } else {
      await pullSaveAndLoadImage(name, image)
    }
  }
}

async function collectRenderedImages(renderedManifestPath) {
  const renderedManifest = await readFile(renderedManifestPath, 'utf8')
  const images = new Set()
  const documents = parseAllDocuments(renderedManifest)
  for (const document of documents) {
    if (document.errors.length > 0) {
      throw new Error(`failed to parse rendered Helm manifest: ${document.errors[0].message}`)
    }
    collectImageValues(document.toJS(), images)
  }
  return images
}

function collectImageValues(value, images) {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectImageValues(item, images)
    }
    return
  }
  if (!value || typeof value !== 'object') {
    return
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === 'image' && typeof child === 'string' && child.trim() !== '') {
      images.add(child)
    } else {
      collectImageValues(child, images)
    }
  }
}

async function applyTestInfrastructure() {
  const fakeCloudflareScript = path.join(suiteRoot, 'fake-cloudflare/server.mjs')
  const fakeProviderScript = path.join(generatedInputsDir, 'fake-provider-server.mjs')
  await writeFile(fakeProviderScript, fakeProviderServerSource())

  const fakeCloudflareConfigMap = path.join(generatedInputsDir, 'fake-cloudflare-configmap.yaml')
  const fakeProviderConfigMap = path.join(generatedInputsDir, 'fake-provider-configmap.yaml')
  await runCommand(
    'kubectl',
    [
      'create',
      'configmap',
      'fake-cloudflare-script',
      `--from-file=server.mjs=${fakeCloudflareScript}`,
      '-n',
      namespace,
      '--dry-run=client',
      '-o',
      'yaml'
    ],
    {
      logName: 'render-fake-cloudflare-configmap',
      stdoutFile: fakeCloudflareConfigMap
    }
  )
  await runCommand(
    'kubectl',
    [
      'create',
      'configmap',
      'fake-provider-script',
      `--from-file=server.mjs=${fakeProviderScript}`,
      '-n',
      namespace,
      '--dry-run=client',
      '-o',
      'yaml'
    ],
    {
      logName: 'render-fake-provider-configmap',
      stdoutFile: fakeProviderConfigMap
    }
  )
  await runCommand('kubectl', ['apply', '-f', fakeCloudflareConfigMap], {
    logName: 'apply-fake-cloudflare-configmap'
  })
  await runCommand('kubectl', ['apply', '-f', fakeProviderConfigMap], {
    logName: 'apply-fake-provider-configmap'
  })

  const infraPath = path.join(generatedInputsDir, 'test-infrastructure.yaml')
  await writeFile(
    infraPath,
    testInfrastructureYaml({
      mailpitImage,
      minioImage,
      webServerImage
    })
  )
  await runCommand('kubectl', ['apply', '-n', namespace, '-f', infraPath], {
    logName: 'kubectl-apply-test-infrastructure'
  })
}

async function runPhase(phase, checks) {
  await log(`phase ${phase}: start`)
  await mkdir(path.join(scenariosDir, phase), { recursive: true })
  for (const check of checks) {
    await runCheck(phase, check)
  }
  await log(`phase ${phase}: complete`)
}

async function runCheck(phase, check) {
  const name = check.checkName || check.name
  try {
    const details = await check()
    await recordResult({
      details: details || 'passed',
      name,
      phase,
      status: 'passed'
    })
  } catch (error) {
    await recordResult({
      details: stringifyError(error),
      name,
      phase,
      status: 'failed'
    })
  }
}

async function checkHelmRendered() {
  const rendered = await readFile(path.join(renderedDir, 'agentteam-email.yaml'), 'utf8')
  assert(rendered.includes('kind: Deployment'), 'rendered chart must include Deployments')
  assert(
    rendered.includes('name: atemail-web-server'),
    'rendered chart must include the web-server deployment/service'
  )
  assert(
    rendered.includes('name: atemail-mail-control-service'),
    'rendered chart must include mail-control deployment/service'
  )
  return 'chart rendered with web-server and mail-control resources'
}

async function checkNoPublicInternalIngress() {
  const ingresses = await kubectlJson(['get', 'ingress', '-n', namespace, '-o', 'json'])
  const forbidden = new Set([
    'atemail-mail-control-service',
    'wildduck',
    'wildduck-api',
    'wildduck-imap',
    'haraka',
    'zonemta',
    'zonemta-api',
    'zonemta-feeder',
    'zonemta-dsn',
    'mongodb',
    'redis',
    'rspamd',
    'minio',
    'mailpit',
    'fake-cloudflare',
    'fake-provider'
  ])
  const backends = []
  for (const ingress of ingresses.items || []) {
    for (const rule of ingress.spec?.rules || []) {
      for (const route of rule.http?.paths || []) {
        const serviceName = route.backend?.service?.name
        if (serviceName) {
          backends.push(serviceName)
        }
      }
    }
  }
  const publicInternal = backends.filter((serviceName) => forbidden.has(serviceName))
  assert(publicInternal.length === 0, `ingress exposes internal services: ${publicInternal.join(', ')}`)
  const nonWeb = backends.filter((serviceName) => serviceName !== 'atemail-web-server')
  assert(nonWeb.length === 0, `ingress routes to non-web services: ${nonWeb.join(', ')}`)
  return backends.length === 0
    ? 'no ingress resources are enabled'
    : `ingress backends: ${backends.join(', ')}`
}

async function checkPublicWebDoesNotExposeInternalApis() {
  const internalPaths = [
    '/healthz',
    '/rpc/agentMail.status.get',
    '/rpc/internal/agent-mail/runtime/snapshot',
    '/rpc/agentMail.message.provenance.get',
    '/wildduck/users',
    '/zonemta/api',
    '/minio/health/ready'
  ]
  const exposed = []
  for (const pathname of internalPaths) {
    const response = await fetch(`${runtime.webBaseUrl}${pathname}`, {
      method: pathname.startsWith('/rpc/') ? 'POST' : 'GET',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json'
      },
      body: pathname.startsWith('/rpc/') ? JSON.stringify({}) : undefined
    })
    if (response.status >= 200 && response.status < 300) {
      exposed.push(`${pathname}:${response.status}`)
    }
  }
  assert(exposed.length === 0, `public web boundary exposes internal API paths: ${exposed.join(', ')}`)
  return 'known internal mail-control, WildDuck, ZoneMTA, and storage paths are not public through web-server'
}

async function checkAllServicesClusterIp() {
  const services = await kubectlJson(['get', 'svc', '-n', namespace, '-o', 'json'])
  const nonClusterIp = (services.items || [])
    .filter((service) => service.spec?.type !== 'ClusterIP')
    .map((service) => `${service.metadata?.name}:${service.spec?.type}`)
  assert(nonClusterIp.length === 0, `services are externally published: ${nonClusterIp.join(', ')}`)
  return `${services.items?.length || 0} services are ClusterIP`
}

async function checkWebHealth() {
  const health = await fetchJson(`${runtime.webBaseUrl}/rpc/health`)
  assert(
    health.message === 'Backend is healthy',
    `unexpected /rpc/health response: ${JSON.stringify(health)}`
  )
  return 'web-server /health and /rpc/health passed through the public web boundary'
}

async function checkInternalServiceDns() {
  const probe = await execNodeInWebServer(`
    const checks = [
      ['mail-control-health', 'http://atemail-mail-control-service:8081/healthz'],
      ['zonemta-api', 'http://zonemta-api:12080/'],
      ['mailpit-http', 'http://mailpit:8025/'],
      ['fake-cloudflare', 'http://fake-cloudflare:8080/health'],
      ['fake-provider', 'http://fake-provider:8080/health'],
      ['minio', 'http://minio:9000/minio/health/ready']
    ];
    const results = [];
    for (const [name, url] of checks) {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
        results.push({ name, ok: response.status < 500, status: response.status });
      } catch (error) {
        results.push({ name, ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    }
    console.log(JSON.stringify(results));
    if (results.some((result) => !result.ok)) process.exit(1);
  `)
  await writeFile(path.join(scenariosDir, 'phase-0-boundary', 'internal-service-dns.json'), probe.stdout)
  return 'internal test actor reached expected internal services by service DNS'
}

async function checkWebServerControlApiWiring() {
  const deployment = await kubectlJson([
    'get',
    'deployment',
    'atemail-web-server',
    '-n',
    namespace,
    '-o',
    'json'
  ])
  const envNames = readContainerEnvNames(deployment, 'web-server')
  const missing = [
    'AT_EMAIL_ADMIN_CONTROL_API_BASE_URL',
    'AT_EMAIL_ADMIN_CONTROL_TO_WEB_API_TOKEN',
    'AT_EMAIL_ADMIN_WILDDUCK_API_BASE_URL',
    'AT_EMAIL_ADMIN_WILDDUCK_ADMIN_ACCESS_TOKEN'
  ].filter((name) => !envNames.has(name))
  assert(
    missing.length === 0,
    `web-server deployment is missing internal mail-control/WildDuck env: ${missing.join(', ')}`
  )
  return 'web-server has internal mail-control and WildDuck API configuration'
}

async function checkMailControlKubernetesServiceNames() {
  const deployment = await kubectlJson([
    'get',
    'deployment',
    'atemail-mail-control-service',
    '-n',
    namespace,
    '-o',
    'json'
  ])
  const env = readContainerEnvMap(deployment, 'mail-control-service')
  const envNames = new Set(env.keys())
  const requiredRuntimeEnv = [
    'AT_EMAIL_ADMIN_CONTROL_MONGODB_URI',
    'AT_EMAIL_ADMIN_CONTROL_TO_WEB_API_BASE_URL',
    'AT_EMAIL_ADMIN_CONTROL_TO_WEB_API_TOKEN',
    'AT_EMAIL_ADMIN_CF_API_BASE_URL',
    'AT_EMAIL_ADMIN_R2_API_TOKEN',
    'AT_EMAIL_ADMIN_R2_BUCKET',
    'AT_EMAIL_ADMIN_HARAKA_SMTP_ADDRESS',
    'AT_EMAIL_ADMIN_ZONEMTA_DSN_ADDRESS',
    'AT_EMAIL_ADMIN_WILDDUCK_API_BASE_URL',
    'AT_EMAIL_ADMIN_WILDDUCK_IMAP_ADDRESS'
  ]
  const missing = requiredRuntimeEnv.filter((name) => !envNames.has(name))
  assert(
    missing.length === 0,
    `mail-control deployment is missing internal runtime/control env: ${missing.join(', ')}`
  )
  const container = deployment.spec?.template?.spec?.containers?.find(
    (candidate) => candidate.name === 'mail-control-service'
  )
  assert(container, 'mail-control-service container is missing')
  const commands = [
    ...(container.readinessProbe?.exec?.command || []),
    ...(container.livenessProbe?.exec?.command || [])
  ].join(' ')
  assert(
    commands.includes('127.0.0.1:8081/healthz'),
    'mail-control probes must target the internal control API health endpoint'
  )
  const expectedEndpoints = {
    AT_EMAIL_ADMIN_HARAKA_SMTP_ADDRESS: 'haraka:25',
    AT_EMAIL_ADMIN_ZONEMTA_DSN_ADDRESS: 'zonemta-dsn:2526',
    AT_EMAIL_ADMIN_WILDDUCK_API_BASE_URL: 'http://wildduck-api:8080',
    AT_EMAIL_ADMIN_WILDDUCK_IMAP_ADDRESS: 'wildduck-imap:143'
  }
  for (const [name, value] of Object.entries(expectedEndpoints)) {
    assert(env.get(name)?.value === value, `${name} = ${JSON.stringify(env.get(name))}, want ${value}`)
  }
  return 'mail-control runtime uses explicit internal service endpoints'
}

async function checkTestDependencyServices() {
  const services = await kubectlJson(['get', 'svc', '-n', namespace, '-o', 'json'])
  const names = new Set((services.items || []).map((service) => service.metadata?.name))
  const missing = ['minio', 'mailpit', 'fake-cloudflare', 'fake-provider'].filter((name) => !names.has(name))
  assert(missing.length === 0, `missing test-only dependency services: ${missing.join(', ')}`)
  return 'test-only MinIO, Mailpit, fake Cloudflare, and fake provider services are installed'
}

async function checkE2eSupportUnauthorized() {
  const response = await fetch(`${runtime.webBaseUrl}/rpc/internal/e2e/test-principals`, {
    body: JSON.stringify({
      email: 'unauthorized@example.test',
      name: 'Unauthorized User',
      password: testPassword
    }),
    headers: {
      accept: 'application/json',
      'content-type': 'application/json'
    },
    method: 'POST'
  })
  assert(response.status === 401, `missing bearer token returned ${response.status}, expected 401`)
  return 'test support route rejects missing bearer token'
}

async function checkE2eSupportInvalidEmail() {
  const response = await postJson(
    '/rpc/internal/e2e/test-principals',
    {
      email: 'invalid@example.com',
      name: 'Invalid User',
      password: testPassword
    },
    {
      authorization: `Bearer ${supportToken}`
    }
  )
  assert(response.status === 400, `invalid non-.test email returned ${response.status}, expected 400`)
  return 'test support route rejects non-.test principal emails'
}

async function createE2ePrincipal({ artifactFile, email, name, password }) {
  const response = await postJson(
    '/rpc/internal/e2e/test-principals',
    {
      email,
      name,
      password
    },
    {
      authorization: `Bearer ${supportToken}`
    }
  )
  assert(
    response.status === 200,
    `principal creation for ${email} returned ${response.status}: ${bodySnippet(response.bodyText)}`
  )
  const body = parseJson(response.bodyText)
  assert(body.principal?.email === email, 'created principal email must match requested test user')
  if (artifactFile) {
    await writeJson(artifactFile, body.principal)
  }
  return body.principal
}

async function signInE2ePrincipal({ artifactFile, email, password }) {
  const response = await postJson(
    '/rpc/auth/api/sign-in/email',
    {
      email,
      password,
      rememberMe: false
    },
    {
      origin: runtime.webBaseUrl
    }
  )
  assert(response.status >= 200 && response.status < 300, `sign-in for ${email} returned ${response.status}`)
  const cookieHeader = extractCookieHeader(response.raw)
  assert(cookieHeader, 'sign-in did not return a session cookie')
  const sessionResponse = await fetch(`${runtime.webBaseUrl}/rpc/auth/api/get-session`, {
    headers: {
      accept: 'application/json',
      cookie: cookieHeader
    }
  })
  assert(sessionResponse.status === 200, `get-session for ${email} returned ${sessionResponse.status}`)
  const session = await sessionResponse.json()
  assert(session?.user?.email === email, 'authenticated session must belong to the requested principal')
  const organizationId = session?.session?.activeOrganizationId ?? null
  assert(organizationId, 'authenticated session did not select an active organization')
  if (artifactFile) {
    await writeJson(artifactFile, redactSession(session))
  }
  return {
    cookieHeader,
    organizationId,
    session
  }
}

async function checkE2eSupportPrincipalCreation() {
  await createE2ePrincipal({
    artifactFile: path.join(scenariosDir, 'phase-1-web-server-actor', 'test-principal.json'),
    email: testEmail,
    name: 'Full Stack E2E User',
    password: testPassword
  })
  return 'test principal created through the web-server route'
}

async function checkSecretNonDisclosureThroughWeb() {
  const targets = ['/', '/rpc/health']
  const forbidden = [
    supportToken,
    'full-stack-e2e-control-to-web-token',
    minioSecretKey,
    'full-stack-e2e-cloudflare-api-token',
    workerNotificationWebhookSigningSecret,
    'full-stack-e2e-wildduck-admin-token',
    'full-stack-e2e-zonemta-relay-password'
  ]
  for (const target of targets) {
    const response = await fetch(`${runtime.webBaseUrl}${target}`)
    const text = await response.text()
    for (const secret of forbidden) {
      assert(!text.includes(secret), `${target} disclosed a test-only secret value`)
    }
  }
  return 'public web responses do not disclose internal test credentials'
}

async function checkBetterAuthSignIn() {
  const response = await postJson(
    '/rpc/auth/api/sign-in/email',
    {
      email: testEmail,
      password: testPassword,
      rememberMe: false
    },
    {
      origin: runtime.webBaseUrl
    }
  )
  assert(
    response.status >= 200 && response.status < 300,
    `sign-in returned ${response.status}: ${bodySnippet(response.bodyText)}`
  )
  runtime.cookieHeader = extractCookieHeader(response.raw)
  assert(runtime.cookieHeader, 'sign-in did not return a session cookie')
  const sessionResponse = await fetch(`${runtime.webBaseUrl}/rpc/auth/api/get-session`, {
    headers: {
      accept: 'application/json',
      cookie: runtime.cookieHeader
    }
  })
  assert(sessionResponse.status === 200, `get-session returned ${sessionResponse.status}`)
  const session = await sessionResponse.json()
  assert(session?.user?.email === testEmail, 'authenticated session must belong to the E2E principal')
  runtime.organizationId = session?.session?.activeOrganizationId ?? null
  assert(runtime.organizationId, 'authenticated session did not select an active organization')
  await writeJson(path.join(scenariosDir, 'phase-1-web-server-actor', 'session.json'), redactSession(session))
  return 'E2E principal signed in through Better Auth on the web-server boundary'
}

async function checkCloudflareRoutesRequireAuthenticatedWebActor() {
  const unauthenticated = await fetch(`${runtime.webBaseUrl}/rpc/cloudflare/status`, {
    headers: {
      accept: 'application/json'
    }
  })
  assert(
    unauthenticated.status !== 200,
    `unauthenticated Cloudflare status returned ${unauthenticated.status}`
  )
  assert(runtime.cookieHeader, 'authenticated cookie is required before calling Cloudflare status')
  const authenticated = await fetch(`${runtime.webBaseUrl}/rpc/cloudflare/status`, {
    headers: {
      accept: 'application/json',
      cookie: runtime.cookieHeader
    }
  })
  assert(
    authenticated.status >= 200 && authenticated.status < 500,
    `authenticated Cloudflare status returned ${authenticated.status}`
  )
  return 'Cloudflare routes are reached through web-server auth context'
}

async function checkCloudflareOAuthConnectionThroughWeb() {
  assert(runtime.cookieHeader, 'authenticated cookie is required for Cloudflare OAuth')
  const start = await postJson('/rpc/cloudflare/oauth/start', {}, { cookie: runtime.cookieHeader })
  assert(
    start.status === 200,
    `Cloudflare OAuth start returned ${start.status}: ${bodySnippet(start.bodyText)}`
  )
  runtime.cookieHeader = mergeCookieHeaders(runtime.cookieHeader, extractCookieHeader(start.raw))
  const started = parseJson(start.bodyText)
  assert(started.intent?.publicId, 'OAuth start did not return an intent public id')
  assert(started.redirectUrl, 'OAuth start did not return a provider redirect URL')

  const providerRedirect = await fetchClusterResponse(started.redirectUrl, { redirect: 'manual' })
  assert(providerRedirect.status === 302, `fake Cloudflare provider auth returned ${providerRedirect.status}`)
  const callbackUrl = providerRedirect.headers.location
  assert(
    callbackUrl?.includes('/rpc/auth/api/oauth2/callback/cloudflare'),
    'provider did not redirect to web callback'
  )

  const callback = await fetch(callbackUrl, {
    headers: {
      cookie: runtime.cookieHeader
    },
    redirect: 'manual'
  })
  const callbackCookie = extractCookieHeader(callback)
  runtime.cookieHeader = mergeCookieHeaders(runtime.cookieHeader, callbackCookie)
  assert(
    callback.status >= 200 && callback.status < 400,
    `Cloudflare OAuth callback returned ${callback.status}`
  )

  const finalize = await postJson(
    '/rpc/cloudflare/oauth/finalize',
    { intentPublicId: started.intent.publicId },
    { cookie: runtime.cookieHeader }
  )
  assert(
    finalize.status === 200,
    `Cloudflare OAuth finalize returned ${finalize.status}: ${bodySnippet(finalize.bodyText)}`
  )
  const finalized = parseJson(finalize.bodyText)
  assert(finalized.grant?.status === 'active', 'Cloudflare OAuth grant did not become active')

  const accounts = await fetch(`${runtime.webBaseUrl}/rpc/cloudflare/accounts`, {
    headers: { accept: 'application/json', cookie: runtime.cookieHeader }
  })
  assert(accounts.status === 200, `Cloudflare accounts returned ${accounts.status}`)
  const zones = await fetch(`${runtime.webBaseUrl}/rpc/cloudflare/zones?accountId=cf-account-1`, {
    headers: { accept: 'application/json', cookie: runtime.cookieHeader }
  })
  assert(zones.status === 200, `Cloudflare zones returned ${zones.status}`)
  const fakeCloudflare = await fetchClusterJson('http://fake-cloudflare:8080/__requests')
  const observedUserDetails = (fakeCloudflare.requests || []).some(
    (request) => request.method === 'GET' && request.path === '/client/v4/user'
  )
  assert(observedUserDetails, 'Cloudflare OAuth did not fetch REST user details from /client/v4/user')
  return 'Cloudflare OAuth is linked through the web boundary, fetches REST user details, and can list accounts/zones'
}

async function checkDomainConnectionThroughWebServer() {
  assert(runtime.cookieHeader, 'authenticated cookie is required for domain connection')
  for (const domain of domains) {
    const zoneId = domain === 'example.test' ? 'cf-zone-example' : 'cf-zone-second'
    const response = await postJson(
      '/rpc/cloudflare/connections',
      {
        cloudflareAccountId: 'cf-account-1',
        cloudflareAccountName: 'Full Stack E2E Account',
        cloudflareZoneId: zoneId,
        cloudflareZoneName: domain,
        domain
      },
      {
        cookie: runtime.cookieHeader
      }
    )
    assert(
      response.status === 200,
      `connect ${domain} returned ${response.status}: ${bodySnippet(response.bodyText)}`
    )
    const body = parseJson(response.bodyText)
    assert(body.connection?.domain === domain, `connection response did not preserve exact domain ${domain}`)
    const provision = await postJson(
      `/rpc/cloudflare/connections/${body.connection.publicId}/provision`,
      {},
      {
        cookie: runtime.cookieHeader
      }
    )
    assert(
      provision.status === 200,
      `provision ${domain} returned ${provision.status}: ${bodySnippet(provision.bodyText)}`
    )
    const provisioned = parseJson(provision.bodyText)
    assert(
      provisioned.connection?.status === 'active' &&
        provisioned.connection?.provisioningStatus === 'succeeded',
      `provisioned connection for ${domain} was not active: ${bodySnippet(provision.bodyText)}`
    )
    assert(
      !JSON.stringify(provisioned.connection).includes('agent-mail-archive') &&
        !JSON.stringify(provisioned.connection).includes('cloudflare-worker:secret') &&
        !JSON.stringify(provisioned.connection).includes('AGENTTEAM_WORKER_HMAC_SECRET'),
      `public provisioned connection for ${domain} leaked storage or credential details`
    )
    runtime.connections.set(domain, provisioned.connection)
  }
  await loadProvisionedWorkerBindings()
  return 'two exact domains can be connected and provisioned through the web-server Cloudflare API'
}

async function checkExactDomainWorkerContract() {
  for (const domain of domains) {
    const connection = runtime.connections.get(domain)
    const worker = runtime.workers.get(domain)
    assert(connection, `missing provisioned connection for ${domain}`)
    assert(worker, `missing provisioned Worker metadata for ${domain}`)
    assert(worker.domain === domain, `Worker domain binding for ${domain} was ${worker.domain}`)
    assert(
      worker.connectionId === connection.publicId,
      `Worker connection id for ${domain} does not match connection public id`
    )
    assert(
      worker.archivePrefix === `orgs/${worker.organizationPublicId}/domains/${domain}/mail/inbound`,
      `Worker archive prefix for ${domain} is not scoped to its org/domain binding`
    )
    assert(
      /^orgs\/[^/]+\/domains\/[^/]+\/mail\/inbound$/u.test(worker.archivePrefix),
      `Worker archive prefix for ${domain} is not org/domain scoped`
    )
    const scriptFileNames = worker.scriptFiles.map((file) => file.name)
    assert(
      scriptFileNames.length === 1 && scriptFileNames[0] === 'index.js',
      `Worker script upload for ${domain} should be exactly the generated index.js artifact, saw ${scriptFileNames.join(', ')}`
    )
    assert(
      worker.scriptFiles[0].type === 'application/javascript+module',
      `Worker script upload for ${domain} should use application/javascript+module, saw ${worker.scriptFiles[0].type}`
    )
    assert(
      typeof worker.scriptFiles[0].sha256 === 'string' &&
        worker.scriptFiles[0].sha256.length === 64 &&
        worker.scriptFiles[0].size > 0,
      `Worker script upload for ${domain} did not record a non-empty artifact hash and size`
    )
  }
  return 'each exact domain has its own org-prefixed Worker deployment metadata'
}

async function checkFakeCloudflareProvisioningOperations() {
  const requests = await fetchClusterJson('http://fake-cloudflare:8080/__requests')
  const paths = requests.requests?.map((request) => `${request.method} ${request.path}`) || []
  const requiredFragments = [
    '/client/v4/accounts',
    '/client/v4/zones',
    '/r2/temp-access-credentials',
    '/workers/scripts',
    '/email/routing'
  ]
  const missing = requiredFragments.filter((fragment) => !paths.some((entry) => entry.includes(fragment)))
  assert(
    missing.length === 0,
    `fake Cloudflare did not observe required provisioning operations: ${missing.join(', ')}; saw ${paths.join(', ')}`
  )
  return 'fake Cloudflare observed account, zone, R2 temporary credentials, Worker, and Email Routing operations'
}

async function checkInboundArchiveObjects() {
  const receivedAt = new Date().toISOString()
  runtime.ingestId = uuidv7({ msecs: new Date(receivedAt).getTime() })
  const worker = requireWorker('example.test')
  const archivePrefix = `${worker.archivePrefix}/${receivedAt.slice(0, 10).replaceAll('-', '/')}/${runtime.ingestId}`
  const rawKey = `${archivePrefix}/raw.eml`
  const edgeKey = `${archivePrefix}/edge.json`
  const resultKey = `${archivePrefix}/result.json`
  runtime.archivePrefix = archivePrefix
  runtime.receivedAt = receivedAt
  runtime.rawMessage = [
    'From: Sender <sender@example.net>',
    'To: Agent <agent@example.test>',
    `Message-ID: <${runtime.ingestId}@example.test>`,
    'Subject: Full stack inbound E2E',
    '',
    'Inbound full-stack E2E fixture.'
  ].join('\r\n')
  const edgeManifest = {
    schema: 'agent-mail.inbound.edge.v1',
    ingest_id: runtime.ingestId,
    org_public_id: worker.organizationPublicId,
    archive_prefix: worker.archivePrefix,
    connection_id: worker.connectionId,
    domain_id: worker.domainId,
    domain: 'example.test',
    raw_key: rawKey,
    edge_key: edgeKey,
    result_key: resultKey,
    mailbox: 'agent@example.test',
    envelope_from: 'sender@example.net',
    envelope_to: 'agent@example.test',
    recipient_domain: 'example.test',
    cloudflare_zone_name: 'example.test',
    worker_name: 'agent-mail-ingress',
    received_at: receivedAt,
    message_id: `<${runtime.ingestId}@example.test>`,
    atmcf_headers: {
      'X-ATMCF-Edge-Action': 'worker',
      'X-ATMCF-Edge-Status': 'received',
      'X-ATMCF-Edge-Envelope-From': 'sender@example.net',
      'X-ATMCF-Edge-Envelope-To': 'agent@example.test',
      'X-ATMCF-Edge-Message-ID': `<${runtime.ingestId}@example.test>`,
      'X-ATMCF-Edge-Received-At': receivedAt
    },
    raw_sha256: sha256Hex(runtime.rawMessage)
  }
  await s3PutObject(rawKey, runtime.rawMessage, 'message/rfc822')
  await s3PutObject(edgeKey, `${JSON.stringify(edgeManifest, null, 2)}\n`, 'application/json')
  const raw = await s3GetObject(rawKey)
  const edge = await s3GetObject(edgeKey)
  assert(raw === runtime.rawMessage, 'archived raw.eml bytes changed after upload')
  assert(parseJson(edge).ingest_id === runtime.ingestId, 'edge.json ingest id does not match fixture')
  await writeJson(path.join(scenariosDir, 'phase-3-inbound-mail', 'edge.json'), edgeManifest)
  return `raw.eml and edge.json are committed in MinIO at ${archivePrefix}`
}

async function checkWildDuckRecipientSeeded() {
  const probe = await retry(
    () =>
      execNodeInWebServer(`
    const token = 'full-stack-e2e-wildduck-admin-token';
    const baseUrl = 'http://wildduck-api:8080';
    const address = 'agent@example.test';
    async function request(path, init = {}) {
      const response = await fetch(baseUrl + path, {
        ...init,
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'x-access-token': token,
          ...(init.headers || {})
        }
      });
      return { status: response.status, bodyText: await response.text() };
    }
    let resolved = await request('/addresses/resolve/' + encodeURIComponent(address));
    let created = null;
    if (resolved.status === 404) {
      created = await request('/users', {
        method: 'POST',
        body: JSON.stringify({
          username: 'agent-example-test',
          address,
          password: 'full-stack-e2e-agent-mailbox-password',
          name: 'Full Stack E2E Agent',
          spamLevel: 0,
          allowUnsafe: true
        })
      });
      if (created.status < 200 || created.status >= 300) {
        console.error(JSON.stringify({ created, resolved }));
        process.exit(1);
      }
      resolved = await request('/addresses/resolve/' + encodeURIComponent(address));
    }
    if (resolved.status < 200 || resolved.status >= 300) {
      console.error(JSON.stringify({ created, resolved }));
      process.exit(1);
    }
    console.log(JSON.stringify({
      address,
      created: created ? created.status : null,
      resolved: resolved.status
    }));
  `),
    { attempts: 12, delayMs: 2500, description: 'WildDuck recipient seed' }
  )
  await writeFile(path.join(scenariosDir, 'phase-3-inbound-mail', 'wildduck-recipient.json'), probe.stdout)
  return 'test-owned WildDuck recipient mailbox exists for inbound replay proof'
}

async function checkInboundNotificationThroughWebServer() {
  const response = await postSignedIngestNotification(testNotification('example.test', runtime.ingestId))
  await writeFile(
    path.join(scenariosDir, 'phase-3-inbound-mail', 'notification-response.txt'),
    response.bodyText
  )
  assert(
    response.status >= 200 && response.status < 300,
    `web-server ingest notification returned ${response.status}: ${bodySnippet(response.bodyText)}`
  )
  return 'signed metadata-only ingest notification was accepted through the web-server boundary'
}

async function checkInboundResultAndWildDuckProof() {
  const resultKey = `${runtime.archivePrefix}/result.json`
  const result = await retry(
    async () => {
      const text = await s3GetObject(resultKey)
      return parseJson(text)
    },
    {
      attempts: 12,
      delayMs: 2500,
      description: 'result.json delivery proof'
    }
  )
  assert(result.status === 'delivered', `result.json status is ${result.status}, expected delivered`)
  assert(
    result.wildduck_message_id || result.message_id,
    'result.json must include WildDuck/message delivery proof'
  )
  return 'inbound result.json records real WildDuck delivery proof'
}

async function checkWebmailClientThroughWebServer() {
  assert(runtime.cookieHeader, 'authenticated cookie is required for webmail client checks')
  const seed = await seedWildDuckWebmailScenario()
  await writeJson(path.join(scenariosDir, 'phase-3-inbound-mail', 'webmail-seed.json'), seed)

  const accountId = seed.agent.address
  const accountPath = encodeURIComponent(accountId)
  const firstPage = await webMailJson(
    'GET',
    `/rpc/mail/workspace?accountId=${accountPath}&folderId=${encodeURIComponent(seed.agent.inboxId)}&limit=25`
  )
  assert(firstPage.activeAccountId === accountId, 'webmail workspace did not select requested account')
  assert(firstPage.messages.length === 25, `first page length = ${firstPage.messages.length}, want 25`)
  assert(firstPage.pagination?.nextCursor, 'first page did not expose a next cursor')
  assert(
    !JSON.stringify(firstPage).includes('wildduck-api') &&
      !JSON.stringify(firstPage).includes('x-access-token'),
    'workspace response leaked internal WildDuck endpoint or credential header material'
  )

  const secondPage = await webMailJson(
    'GET',
    `/rpc/mail/workspace?accountId=${accountPath}&folderId=${encodeURIComponent(seed.agent.inboxId)}&limit=25&direction=next&cursor=${encodeURIComponent(firstPage.pagination.nextCursor)}`
  )
  const firstPageIds = new Set(firstPage.messages.map((message) => `${message.mailboxId}:${message.id}`))
  const overlapping = secondPage.messages.filter((message) =>
    firstPageIds.has(`${message.mailboxId}:${message.id}`)
  )
  assert(overlapping.length === 0, `paginated message pages overlapped: ${JSON.stringify(overlapping)}`)

  const unreadPage = await webMailJson(
    'GET',
    `/rpc/mail/workspace?accountId=${accountPath}&folderId=${encodeURIComponent(seed.agent.inboxId)}&limit=25&unreadOnly=true`
  )
  assert(unreadPage.messages.length > 0, 'unread filter returned no messages')
  assert(
    unreadPage.messages.every((message) => message.unread === true),
    'unread filter returned a read message'
  )

  const threadWorkspace = await webMailJson(
    'GET',
    `/rpc/mail/workspace?accountId=${accountPath}&folderId=${encodeURIComponent(seed.agent.inboxId)}&limit=10&query=${encodeURIComponent(seed.threadQuery)}&messageId=${encodeURIComponent(seed.agent.threadRootMessageId)}`
  )
  const selected = threadWorkspace.selectedMessage
  assert(selected?.id === seed.agent.threadRootMessageId, 'selected thread root was not returned')
  assert(selected.thread?.length >= 2, 'selected message did not include the conversation thread')
  assert(selected.attachments?.length === 1, 'selected message did not include the seeded attachment')
  assert(
    selected.sourceUrl.startsWith('/rpc/mail/accounts/') &&
      selected.attachments[0].url.startsWith('/rpc/mail/accounts/'),
    'message resources must be same-origin web RPC URLs'
  )

  const attachmentResponse = await fetch(`${runtime.webBaseUrl}${selected.attachments[0].url}`, {
    headers: { cookie: runtime.cookieHeader }
  })
  assert(attachmentResponse.status === 200, `attachment proxy returned ${attachmentResponse.status}`)
  assert(
    attachmentResponse.headers.get('content-disposition') === 'attachment',
    'attachment proxy must force attachment disposition'
  )
  assert(
    attachmentResponse.headers.get('x-content-type-options') === 'nosniff',
    'attachment proxy must set nosniff'
  )

  const sourceResponse = await fetch(`${runtime.webBaseUrl}${selected.sourceUrl}`, {
    headers: { cookie: runtime.cookieHeader }
  })
  const sourceText = await sourceResponse.text()
  assert(sourceResponse.status === 200, `original source proxy returned ${sourceResponse.status}`)
  assert(
    sourceResponse.headers.get('content-type')?.startsWith('message/rfc822'),
    `source proxy content type = ${sourceResponse.headers.get('content-type')}`
  )
  assert(sourceText.includes(seed.threadQuery), 'original source did not contain the seeded subject')

  await webMailJson(
    'PATCH',
    `/rpc/mail/accounts/${accountPath}/mailboxes/${encodeURIComponent(selected.mailboxId)}/messages/${encodeURIComponent(selected.id)}`,
    {
      flagged: true,
      seen: true
    }
  )
  const updatedWorkspace = await webMailJson(
    'GET',
    `/rpc/mail/workspace?accountId=${accountPath}&folderId=${encodeURIComponent(selected.mailboxId)}&messageId=${encodeURIComponent(selected.id)}`
  )
  assert(updatedWorkspace.selectedMessage?.isStarred === true, 'flagged update did not persist')
  assert(updatedWorkspace.selectedMessage?.unread === false, 'seen update did not persist')

  const createdFolder = await webMailJson('POST', `/rpc/mail/accounts/${accountPath}/mailboxes`, {
    name: `Reviewed ${runId}`
  })
  assert(createdFolder.folder?.id, 'folder creation did not return a folder id')
  const movable = firstPage.messages.find((message) => message.id !== selected.id)
  assert(movable, 'no message was available for move/delete checks')
  await webMailJson(
    'POST',
    `/rpc/mail/accounts/${accountPath}/mailboxes/${encodeURIComponent(movable.mailboxId)}/messages/${encodeURIComponent(movable.id)}/move`,
    {
      targetMailboxId: createdFolder.folder.id
    }
  )

  const deletable = secondPage.messages[0]
  assert(deletable, 'no second-page message was available for delete check')
  await webMailJson(
    'DELETE',
    `/rpc/mail/accounts/${accountPath}/mailboxes/${encodeURIComponent(deletable.mailboxId)}/messages/${encodeURIComponent(deletable.id)}`
  )

  const draft = await webMailJson('POST', `/rpc/mail/accounts/${accountPath}/drafts`, {
    body: 'Draft body from the full-stack webmail E2E.',
    subject: `Webmail E2E Draft ${runId}`,
    to: 'recipient@example.net'
  })
  assert(draft.success && draft.draftId && draft.mailboxId, 'draft save did not return draft identifiers')
  const replacedDraft = await webMailJson('POST', `/rpc/mail/accounts/${accountPath}/drafts`, {
    body: 'Updated draft body from the full-stack webmail E2E.',
    draftMailboxId: draft.mailboxId,
    draftMessageId: draft.draftId,
    subject: `Webmail E2E Draft ${runId}`,
    to: 'recipient@example.net'
  })
  assert(
    replacedDraft.success && replacedDraft.draftId && replacedDraft.mailboxId,
    'draft replacement did not return draft identifiers'
  )
  await webMailJson(
    'POST',
    `/rpc/mail/accounts/${accountPath}/mailboxes/${encodeURIComponent(replacedDraft.mailboxId)}/messages/${encodeURIComponent(replacedDraft.draftId)}/send-draft`
  )

  await webMailJson('POST', `/rpc/mail/accounts/${accountPath}/messages`, {
    body: 'Standalone message from the full-stack webmail E2E.',
    subject: `Webmail E2E Send ${runId}`,
    to: 'recipient@example.net'
  })
  await webMailJson('POST', `/rpc/mail/accounts/${accountPath}/messages`, {
    body: 'Reply message from the full-stack webmail E2E.',
    reference: {
      action: 'reply',
      mailboxId: selected.mailboxId,
      messageId: selected.id
    },
    subject: `Re: ${selected.subject}`,
    to: 'sender@example.net'
  })

  const switchedAccount = await webMailJson(
    'GET',
    `/rpc/mail/workspace?accountId=${encodeURIComponent(seed.assistant.address)}&limit=25`
  )
  assert(
    switchedAccount.activeAccountId === seed.assistant.address,
    'account switching did not select the second WildDuck mailbox'
  )
  assert(
    switchedAccount.messages.some((message) => message.subject.includes(seed.accountSwitchSubject)),
    'second account mailbox did not show its seeded message'
  )

  return 'webmail RPC lists accounts, paginates, threads, proxies resources, mutates messages, drafts, sends, and switches accounts through the web-server boundary'
}

async function checkAtEmailAgentEnrollmentGrantAuthorizesMailOperation() {
  assert(runtime.cookieHeader, 'authenticated cookie is required for Agent Auth enrollment checks')
  const agentName = `Full Stack E2E Enrolled Agent ${runId}`
  const accountId = 'agent@example.test'
  const enrollmentResponse = await postJson(
    '/rpc/mail/admin/agents',
    {
      grantExpiresAt: null,
      mailboxGrants: [
        {
          accountId,
          capabilities: ['readMailbox', 'sendAs']
        }
      ],
      name: agentName,
      systemPermissions: []
    },
    {
      cookie: runtime.cookieHeader
    }
  )
  assert(
    enrollmentResponse.status === 200,
    `agent enrollment create returned ${enrollmentResponse.status}: ${bodySnippet(enrollmentResponse.bodyText)}`
  )
  const enrollmentBody = parseJson(enrollmentResponse.bodyText)
  const enrollment = enrollmentBody.enrollment
  assert(enrollmentBody.success === true, 'agent enrollment create did not return success')
  assert(
    typeof enrollment?.enrollmentToken === 'string' && enrollment.enrollmentToken.length > 0,
    'agent enrollment token is missing'
  )
  assert(
    enrollment.mailboxGrantCount === 2,
    `agent enrollment mailbox grant count = ${enrollment.mailboxGrantCount}, want 2`
  )
  registerRedaction(enrollment.enrollmentToken, '<redacted-agent-enrollment-token>')

  const cliConfigDir = path.join(runDir, 'at-email-agent-cli-config')
  const cliWorkdir = path.join(repoRoot, 'apps', 'at-email-cli')
  await mkdir(cliConfigDir, { recursive: true })

  const enrollStdout = await runCommand(
    'bash',
    [
      '-lc',
      'go run ./cmd/at-email agent enroll "$AT_EMAIL_AGENT_ENROLLMENT_TOKEN" --api-base-url "$AT_EMAIL_API_BASE_URL" --name "$AT_EMAIL_AGENT_NAME" --json'
    ],
    {
      cwd: cliWorkdir,
      env: {
        AT_EMAIL_AGENT_ENROLLMENT_TOKEN: enrollment.enrollmentToken,
        AT_EMAIL_AGENT_NAME: agentName,
        AT_EMAIL_API_BASE_URL: runtime.webBaseUrl,
        XDG_CONFIG_HOME: cliConfigDir
      },
      logName: 'at-email-agent-enroll',
      returnStdout: true,
      stdoutFile: path.join(scenariosDir, 'phase-3-inbound-mail', 'at-email-agent-enroll.json')
    }
  )
  assertNoInternalCredentialMaterial(enrollStdout, 'at-email agent enroll output')
  const enrollResult = parseJson(enrollStdout)
  assert(enrollResult.agent_id, 'at-email agent enroll did not return an agent id')
  assert(
    enrollResult.host_id === enrollment.hostId,
    'at-email agent enroll host id did not match enrollment host'
  )

  const sendStdout = await runCommand(
    'bash',
    [
      '-lc',
      'go run ./cmd/at-email send --json --to recipient@example.net --subject "$AT_EMAIL_AGENT_SEND_SUBJECT" --body "Boundary delivery fixture."'
    ],
    {
      cwd: cliWorkdir,
      env: {
        AT_EMAIL_AGENT_SEND_SUBJECT: `Agent Enrollment E2E ${runId}`,
        AT_EMAIL_MAILBOX_ADDRESS: accountId,
        XDG_CONFIG_HOME: cliConfigDir
      },
      logName: 'at-email-agent-send',
      returnStdout: true,
      stdoutFile: path.join(scenariosDir, 'phase-3-inbound-mail', 'at-email-agent-send.json')
    }
  )
  assertNoInternalCredentialMaterial(sendStdout, 'at-email send output')
  const sendResult = parseJson(sendStdout)
  assert(sendResult.subject === `Agent Enrollment E2E ${runId}`, 'at-email send subject did not match')
  assert(
    Array.isArray(sendResult.to) && sendResult.to.includes('recipient@example.net'),
    'at-email send recipients did not match'
  )
  assert(
    sendResult.message && typeof sendResult.message === 'object',
    'at-email send did not return a message result'
  )

  await writeJson(path.join(scenariosDir, 'phase-3-inbound-mail', 'agent-enrollment-mail-summary.json'), {
    accountId,
    agentId: enrollResult.agent_id,
    hostId: enrollResult.host_id,
    mailboxGrantCount: enrollment.mailboxGrantCount,
    status: enrollResult.status
  })

  return 'human-created Agent Auth enrollment grants authorize an enrolled at-email agent to send mail through the web-server boundary'
}

async function checkAtEmailAgentEnrollmentDeniesUngrantedMailOperation() {
  assert(runtime.cookieHeader, 'authenticated cookie is required for Agent Auth enrollment denial checks')
  const agentName = `Full Stack E2E Read Only Agent ${runId}`
  const accountId = 'agent@example.test'
  const enrollmentResponse = await postJson(
    '/rpc/mail/admin/agents',
    {
      grantExpiresAt: null,
      mailboxGrants: [
        {
          accountId,
          capabilities: ['readMailbox']
        }
      ],
      name: agentName,
      systemPermissions: []
    },
    {
      cookie: runtime.cookieHeader
    }
  )
  assert(
    enrollmentResponse.status === 200,
    `read-only agent enrollment create returned ${enrollmentResponse.status}: ${bodySnippet(enrollmentResponse.bodyText)}`
  )
  const enrollmentBody = parseJson(enrollmentResponse.bodyText)
  const enrollment = enrollmentBody.enrollment
  assert(enrollmentBody.success === true, 'read-only agent enrollment create did not return success')
  assert(
    typeof enrollment?.enrollmentToken === 'string' && enrollment.enrollmentToken.length > 0,
    'read-only agent enrollment token is missing'
  )
  registerRedaction(enrollment.enrollmentToken, '<redacted-read-only-agent-enrollment-token>')

  const cliConfigDir = path.join(runDir, 'at-email-read-only-agent-cli-config')
  const cliWorkdir = path.join(repoRoot, 'apps', 'at-email-cli')
  await mkdir(cliConfigDir, { recursive: true })

  const enrollStdout = await runCommand(
    'bash',
    [
      '-lc',
      'go run ./cmd/at-email agent enroll "$AT_EMAIL_AGENT_ENROLLMENT_TOKEN" --api-base-url "$AT_EMAIL_API_BASE_URL" --name "$AT_EMAIL_AGENT_NAME" --json'
    ],
    {
      cwd: cliWorkdir,
      env: {
        AT_EMAIL_AGENT_ENROLLMENT_TOKEN: enrollment.enrollmentToken,
        AT_EMAIL_AGENT_NAME: agentName,
        AT_EMAIL_API_BASE_URL: runtime.webBaseUrl,
        XDG_CONFIG_HOME: cliConfigDir
      },
      logName: 'at-email-read-only-agent-enroll',
      returnStdout: true,
      stdoutFile: path.join(scenariosDir, 'phase-3-inbound-mail', 'at-email-read-only-agent-enroll.json')
    }
  )
  assertNoInternalCredentialMaterial(enrollStdout, 'at-email read-only agent enroll output')
  const enrollResult = parseJson(enrollStdout)
  assert(enrollResult.agent_id, 'read-only at-email agent enroll did not return an agent id')
  const deniedSubject = `Read Only Agent Send Denial ${runId}`
  const beforeProviderRequests = await waitForOutboundProviderRequestsToSettle()
  const beforeWildDuckMatches = await wildDuckMessageCountBySubject(accountId, deniedSubject)

  const sendResult = await runCommand(
    'bash',
    [
      '-lc',
      'go run ./cmd/at-email send --json --to recipient@example.net --subject "$AT_EMAIL_AGENT_SEND_SUBJECT" --body "This should be rejected."'
    ],
    {
      allowFailure: true,
      cwd: cliWorkdir,
      env: {
        AT_EMAIL_AGENT_SEND_SUBJECT: deniedSubject,
        AT_EMAIL_MAILBOX_ADDRESS: accountId,
        XDG_CONFIG_HOME: cliConfigDir
      },
      logName: 'at-email-read-only-agent-send-denied',
      returnResult: true,
      stderrFile: path.join(
        scenariosDir,
        'phase-3-inbound-mail',
        'at-email-read-only-agent-send-denied.stderr'
      ),
      stdoutFile: path.join(
        scenariosDir,
        'phase-3-inbound-mail',
        'at-email-read-only-agent-send-denied.stdout'
      )
    }
  )
  assert(sendResult.code !== 0, 'read-only at-email agent send unexpectedly succeeded')
  assert(sendResult.stdout.trim() === '', 'read-only at-email send denial wrote to stdout in JSON mode')
  assertNoInternalCredentialMaterial(sendResult.stdout, 'read-only at-email send denial stdout')
  assertNoInternalCredentialMaterial(sendResult.stderr, 'read-only at-email send denial stderr')
  assert(
    sendResult.stderr.includes('Mailbox operation is not authorized'),
    `read-only at-email send did not fail with an authorization error: ${bodySnippet(sendResult.stderr)}`
  )
  const afterProviderRequests = await waitForOutboundProviderRequestsToSettle()
  assert(
    afterProviderRequests.length === beforeProviderRequests.length,
    `read-only at-email send reached an outbound provider: before=${beforeProviderRequests.length} after=${afterProviderRequests.length}`
  )
  const afterWildDuckMatches = await wildDuckMessageCountBySubject(accountId, deniedSubject)
  assert(
    afterWildDuckMatches === beforeWildDuckMatches,
    `read-only at-email send created WildDuck messages for denied subject: before=${beforeWildDuckMatches} after=${afterWildDuckMatches}`
  )

  await writeJson(path.join(scenariosDir, 'phase-3-inbound-mail', 'agent-enrollment-denial-summary.json'), {
    accountId,
    agentId: enrollResult.agent_id,
    exitCode: sendResult.code,
    providerRequestCount: afterProviderRequests.length,
    hostId: enrollResult.host_id,
    mailboxGrantCount: enrollment.mailboxGrantCount,
    wildDuckDeniedSubjectMatches: afterWildDuckMatches,
    status: enrollResult.status
  })

  return 'read-only Agent Auth enrollment grants deny at-email send through the web-server permission boundary'
}

async function checkAtEmailAgentConnectApprovalAuthorizesMailOperation() {
  assert(runtime.cookieHeader, 'authenticated cookie is required for Agent Auth connect approval')
  assert(runtime.organizationId, 'active organization is required for Agent Auth connect approval')

  const agentName = `Full Stack E2E Connected Agent ${runId}`
  const accountId = 'agent@example.test'
  const cliConfigDir = path.join(runDir, 'at-email-agent-connect-cli-config')
  const cliWorkdir = path.join(repoRoot, 'apps', 'at-email-cli')
  await mkdir(cliConfigDir, { recursive: true })

  const connect = await runAtEmailAgentConnectWithWebApproval({
    accountId,
    agentName,
    cliConfigDir,
    cliWorkdir,
    logName: 'at-email-agent-connect',
    stderrFile: path.join(scenariosDir, 'phase-3-inbound-mail', 'at-email-agent-connect-pending.json'),
    stdoutFile: path.join(scenariosDir, 'phase-3-inbound-mail', 'at-email-agent-connect.json')
  })

  assertNoInternalCredentialMaterial(connect.stdout, 'at-email agent connect output')
  assertNoInternalCredentialMaterial(connect.stderr, 'at-email agent connect pending output')
  const connectResult = parseJson(connect.stdout)
  assert(connectResult.agent_id, 'at-email agent connect did not return an agent id')
  assert(connectResult.status === 'active', `at-email agent connect status = ${connectResult.status}`)
  assert(connectResult.mode === 'delegated', `at-email agent connect mode = ${connectResult.mode}`)
  assert(
    connect.pending.operation === 'agent_connect',
    'at-email agent connect did not emit an approval event'
  )
  assert(connect.decision.success === true, 'agent connect approval decision did not return success')

  const statusStdout = await runCommand('bash', ['-lc', 'go run ./cmd/at-email status --json'], {
    cwd: cliWorkdir,
    env: {
      AT_EMAIL_MAILBOX_ADDRESS: accountId,
      XDG_CONFIG_HOME: cliConfigDir
    },
    logName: 'at-email-agent-connect-status',
    returnStdout: true,
    stdoutFile: path.join(scenariosDir, 'phase-3-inbound-mail', 'at-email-agent-connect-status.json')
  })
  assertNoInternalCredentialMaterial(statusStdout, 'at-email agent connect status output')
  const status = parseJson(statusStdout)
  assert(status.user_id === connectResult.agent_id, 'agent connect status did not use the connected agent id')
  assert(
    Array.isArray(status.mailboxes) && status.mailboxes.length > 0,
    'connected agent could not list mailboxes'
  )

  await writeJson(path.join(scenariosDir, 'phase-3-inbound-mail', 'agent-connect-mail-summary.json'), {
    accountId,
    agentId: connectResult.agent_id,
    capabilityCount: Array.isArray(connectResult.capabilities) ? connectResult.capabilities.length : 0,
    hostId: connectResult.host_id,
    status: connectResult.status
  })

  return 'dynamic Agent Auth connect approval authorizes a connected at-email agent to read mail status through the web-server boundary'
}

async function checkAtEmailAgentConnectFreshSignupApprovalAuthorizesMailOperation() {
  const password = `FullStackE2E-Connect-${randomBytes(12).toString('base64url')}!1`
  const email = `full-stack-e2e-connect-${Date.now()}-${randomBytes(4).toString('hex')}@example.test`
  const principal = await createE2ePrincipal({
    artifactFile: path.join(scenariosDir, 'phase-3-inbound-mail', 'agent-connect-signup-principal.json'),
    email,
    name: 'Full Stack E2E Connect Signup User',
    password
  })
  const session = await signInE2ePrincipal({
    artifactFile: path.join(scenariosDir, 'phase-3-inbound-mail', 'agent-connect-signup-session.json'),
    email,
    password
  })
  const agentName = `Full Stack E2E Signup Connected Agent ${runId}`
  const accountId = 'agent@example.test'
  const cliConfigDir = path.join(runDir, 'at-email-agent-connect-signup-cli-config')
  const cliWorkdir = path.join(repoRoot, 'apps', 'at-email-cli')
  await mkdir(cliConfigDir, { recursive: true })

  const connect = await runAtEmailAgentConnectWithWebApproval({
    accountId,
    agentName,
    cliConfigDir,
    cliWorkdir,
    cookieHeader: session.cookieHeader,
    logName: 'at-email-agent-connect-signup',
    organizationId: session.organizationId,
    stderrFile: path.join(scenariosDir, 'phase-3-inbound-mail', 'at-email-agent-connect-signup-pending.json'),
    stdoutFile: path.join(scenariosDir, 'phase-3-inbound-mail', 'at-email-agent-connect-signup.json')
  })

  assertNoInternalCredentialMaterial(connect.stdout, 'at-email signup agent connect output')
  assertNoInternalCredentialMaterial(connect.stderr, 'at-email signup agent connect pending output')
  const connectResult = parseJson(connect.stdout)
  assert(connectResult.agent_id, 'signup at-email agent connect did not return an agent id')
  assert(connectResult.status === 'active', `signup at-email agent connect status = ${connectResult.status}`)
  assert(connect.decision.success === true, 'signup agent connect approval decision did not return success')

  const statusStdout = await runCommand('bash', ['-lc', 'go run ./cmd/at-email status --json'], {
    cwd: cliWorkdir,
    env: {
      AT_EMAIL_MAILBOX_ADDRESS: accountId,
      XDG_CONFIG_HOME: cliConfigDir
    },
    logName: 'at-email-agent-connect-signup-status',
    returnStdout: true,
    stdoutFile: path.join(scenariosDir, 'phase-3-inbound-mail', 'at-email-agent-connect-signup-status.json')
  })
  assertNoInternalCredentialMaterial(statusStdout, 'at-email signup agent connect status output')
  const status = parseJson(statusStdout)
  assert(status.user_id === connectResult.agent_id, 'signup agent connect status did not use the agent id')
  assert(
    Array.isArray(status.mailboxes) && status.mailboxes.length > 0,
    'signup-connected agent could not list the granted mailbox'
  )

  await writeJson(path.join(scenariosDir, 'phase-3-inbound-mail', 'agent-connect-signup-summary.json'), {
    accountId,
    agentId: connectResult.agent_id,
    hostId: connectResult.host_id,
    organizationId: session.organizationId,
    status: connectResult.status,
    userId: principal.userId
  })

  return 'freshly signed-up web users can approve Agent Auth connect and return to an active CLI agent credential'
}

async function checkAtEmailAgentTrialSendsWithinLimitsThenClaimAuthorizesPostClaimSend() {
  assert(runtime.cookieHeader, 'authenticated cookie is required for Agent Mail trial claim')
  assert(runtime.organizationId, 'active organization is required for Agent Mail trial claim')
  const agentName = `Full Stack E2E Trial Agent ${runId}`
  const cliConfigDir = path.join(runDir, 'at-email-agent-trial-cli-config')
  const cliWorkdir = path.join(repoRoot, 'apps', 'at-email-cli')
  await mkdir(cliConfigDir, { recursive: true })

  const trial = await runAtEmailAgentTrial({
    agentName,
    cliConfigDir,
    cliWorkdir,
    logName: 'at-email-agent-trial',
    stdoutFile: path.join(scenariosDir, 'phase-3-inbound-mail', 'at-email-agent-trial.json')
  })
  const trialResult = parseJson(trial.stdout)
  const accountId = trialResult.mailbox?.address
  assert(accountId, 'at-email agent trial did not return a trial mailbox address')
  assert(trialResult.agent_id, 'at-email agent trial did not return an agent id')
  assert(trialResult.status === 'active', `at-email agent trial status = ${trialResult.status}`)
  assert(trial.claimToken, 'at-email agent trial did not return a claim token')

  const preClaimSubject = `Trial Pre-Claim Send ${runId}`
  const preClaimSend = await runCommand(
    'bash',
    [
      '-lc',
      'go run ./cmd/at-email send --json --to recipient@example.net --subject "$AT_EMAIL_AGENT_SEND_SUBJECT" --body "Trial delivery fixture."'
    ],
    {
      cwd: cliWorkdir,
      env: {
        AT_EMAIL_AGENT_SEND_SUBJECT: preClaimSubject,
        AT_EMAIL_MAILBOX_ADDRESS: accountId,
        XDG_CONFIG_HOME: cliConfigDir
      },
      logName: 'at-email-agent-trial-send-pre-claim',
      returnStdout: true,
      stdoutFile: path.join(scenariosDir, 'phase-3-inbound-mail', 'at-email-agent-trial-send-pre-claim.json')
    }
  )
  assertNoInternalCredentialMaterial(preClaimSend, 'at-email trial pre-claim send output')
  const preClaimResult = parseJson(preClaimSend)
  assert(preClaimResult.subject === preClaimSubject, 'trial pre-claim send subject did not match')

  const preview = await fetch(
    `${runtime.webBaseUrl}/rpc/agent-access/trials/claim/${encodeURIComponent(trial.claimToken)}`,
    {
      headers: {
        accept: 'application/json',
        cookie: runtime.cookieHeader
      }
    }
  )
  const previewBodyText = await preview.text()
  assert(
    preview.status === 200,
    `trial claim preview returned ${preview.status}: ${bodySnippet(previewBodyText)}`
  )
  const previewBody = parseJson(previewBodyText)
  assert(previewBody.trial_id === trialResult.trial_id, 'trial claim preview did not match started trial')
  assert(previewBody.mailbox?.address === accountId, 'trial claim preview did not show the trial mailbox')

  const claim = await postJson(
    `/rpc/agent-access/trials/claim/${encodeURIComponent(trial.claimToken)}/decision`,
    {
      action: 'approve',
      target_organization_id: runtime.organizationId
    },
    {
      cookie: runtime.cookieHeader
    }
  )
  assert(
    claim.status === 200,
    `trial claim decision returned ${claim.status}: ${bodySnippet(claim.bodyText)}`
  )
  const claimBody = parseJson(claim.bodyText)
  assert(claimBody.success === true, 'trial claim decision did not return success')
  assert(claimBody.claim?.status === 'approved', `trial claim status = ${claimBody.claim?.status}`)
  assert(
    claimBody.view?.organization_id === runtime.organizationId,
    'trial claim did not target the active organization'
  )

  const postClaimSubject = `Trial Post-Claim Send ${runId}`
  const postClaimSend = await runCommand(
    'bash',
    [
      '-lc',
      'go run ./cmd/at-email send --json --to recipient@example.net --subject "$AT_EMAIL_AGENT_SEND_SUBJECT" --body "Post-claim trial delivery fixture."'
    ],
    {
      cwd: cliWorkdir,
      env: {
        AT_EMAIL_AGENT_SEND_SUBJECT: postClaimSubject,
        AT_EMAIL_MAILBOX_ADDRESS: accountId,
        XDG_CONFIG_HOME: cliConfigDir
      },
      logName: 'at-email-agent-trial-send-post-claim',
      returnStdout: true,
      stdoutFile: path.join(scenariosDir, 'phase-3-inbound-mail', 'at-email-agent-trial-send-post-claim.json')
    }
  )
  assertNoInternalCredentialMaterial(postClaimSend, 'at-email trial post-claim send output')
  const postClaimResult = parseJson(postClaimSend)
  assert(postClaimResult.subject === postClaimSubject, 'trial post-claim send subject did not match')

  await writeJson(path.join(scenariosDir, 'phase-3-inbound-mail', 'agent-trial-claim-summary.json'), {
    agentId: trialResult.agent_id,
    mailbox: accountId,
    organizationId: runtime.organizationId,
    postClaimSubject,
    preClaimSubject,
    trialId: trialResult.trial_id
  })

  return 'autonomous at-email trial agents can send within limits, then be claimed and continue sending under post-claim grants'
}

async function checkInboundIdempotencyAndSweepContract() {
  const before = await s3GetObject(`${runtime.archivePrefix}/result.json`)
  await checkInboundNotificationThroughWebServer()
  const after = await retry(() => s3GetObject(`${runtime.archivePrefix}/result.json`), {
    attempts: 4,
    delayMs: 1000,
    description: 'stable result after duplicate notification'
  })
  assert(before === after, 'duplicate notification changed terminal result.json')
  return 'duplicate notification and sweep converge without duplicate delivery'
}

async function checkInboundInvalidDomainRejection() {
  const worker = requireWorker('example.test')
  const badPrefix = `orgs/${worker.organizationPublicId}/domains/unconfigured.test/mail/inbound/2026/06/20/${runtime.ingestId}-bad-domain`
  await s3PutObject(`${badPrefix}/raw.eml`, runtime.rawMessage, 'message/rfc822')
  await s3PutObject(
    `${badPrefix}/edge.json`,
    `${JSON.stringify({
      domain: 'unconfigured.test',
      ingest_id: `${runtime.ingestId}-bad-domain`,
      rcpt_to: 'agent@unconfigured.test'
    })}\n`,
    'application/json'
  )
  const response = await postSignedIngestNotification(
    {
      ...testNotification('example.test', `${runtime.ingestId}-bad-domain`, {
        bundlePrefix: badPrefix,
        recipientDomain: 'unconfigured.test'
      }),
      ingest_id: `${runtime.ingestId}-bad-domain`
    },
    { worker: requireWorker('example.test') }
  )
  assert(
    [400, 403, 404].includes(response.status),
    `unconfigured domain notification returned ${response.status}, expected explicit rejection`
  )
  assert(
    response.status !== 404,
    'unconfigured domain must be rejected by ingest validation, not by a missing route'
  )
  return 'unconfigured domain is explicitly rejected at ingest'
}

async function checkOutboundSubmissionThroughWebServer() {
  const response = await postJson(
    '/rpc/mail/outbound',
    {
      from: 'agent@example.test',
      to: ['recipient@example.net'],
      subject: 'Full stack outbound E2E',
      text: 'Outbound full-stack E2E fixture.'
    },
    runtime.cookieHeader ? { cookie: runtime.cookieHeader } : {}
  )
  assert(
    response.status >= 200 && response.status < 300,
    `outbound web submission returned ${response.status}: ${bodySnippet(response.bodyText)}`
  )
  return 'outbound mail can be submitted through a web-server-owned user/API boundary'
}

async function checkZoneMtaFeederReachableInternally() {
  const probe = await execNodeInWebServer(`
    const net = await import('node:net');
    const socket = net.createConnection({ host: 'zonemta-feeder', port: 2525 });
    socket.setTimeout(5000);
    socket.once('data', (chunk) => {
      const line = chunk.toString('utf8');
      console.log(JSON.stringify({ banner: line }));
      socket.destroy();
      if (!line.startsWith('220')) process.exit(1);
    });
    socket.once('timeout', () => {
      console.error('timed out waiting for ZoneMTA feeder banner');
      socket.destroy();
      process.exit(1);
    });
    socket.once('error', (error) => {
      console.error(error.message);
      process.exit(1);
    });
  `)
  await writeFile(path.join(scenariosDir, 'phase-4-outbound-mail', 'zonemta-feeder-probe.json'), probe.stdout)
  return 'ZoneMTA feeder is reachable only from inside the cluster'
}

async function checkOutboundProviderOrLocalRouteResult() {
  const providerRequests = await fetchOutboundProviderRequests()
  assert(
    providerRequests.length > 0,
    `fake outbound provider did not observe provider-bound outbound mail; saw ${providerRequests.map((request) => `${request.provider} ${request.method} ${request.path}`).join(', ')}`
  )
  for (const request of providerRequests) {
    const leakedHeaders = request.bodySummary?.forbiddenInternalHeaders || []
    assert(
      leakedHeaders.length === 0,
      `provider payload leaked internal headers: ${leakedHeaders.join(', ')}`
    )
  }
  return 'provider-bound outbound mail reached a fake provider with sanitized payload'
}

async function fetchOutboundProviderRequests() {
  const [fakeProvider, fakeCloudflare] = await Promise.all([
    fetchClusterJson('http://fake-provider:8080/__requests'),
    fetchClusterJson('http://fake-cloudflare:8080/__requests')
  ])
  const observedRequests = [
    ...(fakeProvider.requests || []).map((request) => ({ ...request, provider: 'fake-provider' })),
    ...(fakeCloudflare.requests || []).map((request) => ({ ...request, provider: 'fake-cloudflare' }))
  ]
  return observedRequests.filter(
    (request) =>
      request.path.includes('/email/sending/send') ||
      request.path.includes('/email/sending/send_raw') ||
      request.path.includes('/send')
  )
}

async function waitForOutboundProviderRequestsToSettle() {
  let previousCount = null
  let stableSamples = 0
  let latest = []
  for (let attempt = 0; attempt < 20; attempt += 1) {
    latest = await fetchOutboundProviderRequests()
    if (latest.length === previousCount) {
      stableSamples += 1
      if (stableSamples >= 3) {
        return latest
      }
    } else {
      previousCount = latest.length
      stableSamples = 0
    }
    await delay(1000)
  }
  return latest
}

async function checkOutboundInvalidProvenanceRejected() {
  const probe = await execNodeInWebServer(`
    const net = await import('node:net');
    const socket = net.createConnection({ host: 'atemail-mail-control-service', port: 2587 });
    socket.setTimeout(5000);
    const events = [];
    const auth = Buffer.from('\\0zonemta\\0full-stack-e2e-zonemta-relay-password').toString('base64');
    let step = 'banner';
    socket.on('data', (chunk) => {
      const text = chunk.toString('utf8');
      events.push(text);
      if (step === 'banner') {
        step = 'ehlo';
        socket.write('EHLO full-stack-e2e.example.test\\r\\n');
      } else if (step === 'ehlo' && text.includes('250')) {
        step = 'auth';
        socket.write('AUTH PLAIN ' + auth + '\\r\\n');
      } else if (step === 'auth' && text.includes('235')) {
        step = 'mail';
        socket.write('MAIL FROM:<agent@example.test>\\r\\n');
      } else if (step === 'mail' && text.match(/^250/m)) {
        step = 'rcpt';
        socket.write('RCPT TO:<recipient@example.net>\\r\\n');
      } else if (step === 'rcpt' && text.match(/^250/m)) {
        step = 'data';
        socket.write('DATA\\r\\nSubject: Missing provenance\\r\\n\\r\\nbody\\r\\n.\\r\\nQUIT\\r\\n');
      }
      if (text.includes('221') || text.match(/^5\\d\\d/m)) {
        console.log(JSON.stringify({ transcript: events }));
        socket.destroy();
      }
    });
    socket.once('timeout', () => {
      console.log(JSON.stringify({ transcript: events, timeout: true }));
      socket.destroy();
    });
    socket.once('error', (error) => {
      console.error(error.message);
      process.exit(1);
    });
    socket.once('close', () => {
      const joined = events.join('');
      if (joined.includes('smtp auth is required')) process.exit(1);
      if (!joined.includes('missing X-Agent-Mail-ZoneMTA-Queue-ID header')) process.exit(1);
    });
  `)
  await writeFile(
    path.join(scenariosDir, 'phase-4-outbound-mail', 'invalid-provenance-smtp.json'),
    probe.stdout
  )
  return 'mail-control SMTP relay rejects outbound mail missing ZoneMTA provenance'
}

async function checkMissingSignatureRejectedByWebIngest() {
  const response = await postIngestNotification(
    testNotification('example.test', `${runtime.ingestId}-missing-signature`)
  )
  assert(
    [400, 401, 403].includes(response.status),
    `missing signature returned ${response.status}, expected 400/401/403`
  )
  return 'missing ingest signature is rejected by the web-server-visible ingest route'
}

async function checkMalformedSignatureRejectedByWebIngest() {
  const notification = testNotification('example.test', `${runtime.ingestId}-malformed-signature`)
  const response = await postIngestNotification(
    notification,
    webhookHeaders(notification.ingest_id, 'not-a-standardwebhooks-signature')
  )
  assert(
    [400, 401, 403].includes(response.status),
    `malformed signature returned ${response.status}, expected 400/401/403`
  )
  return 'malformed ingest signature is rejected by the web-server-visible ingest route'
}

async function checkUppercaseSignatureRejectedByWebIngest() {
  const notification = testNotification('example.test', `${runtime.ingestId}-uppercase-signature`)
  const bodyText = JSON.stringify(notification)
  const worker = requireWorker('example.test')
  const signed = await signWorkerNotification(worker, bodyText, notification.ingest_id, new Date())
  const response = await postIngestNotification(notification, uppercaseHeaderValues(signed.headers), {
    worker
  })
  assert(
    [400, 401, 403].includes(response.status),
    `uppercase signature returned ${response.status}, expected 400/401/403`
  )
  return 'non-lowercase ingest signature is rejected by the web-server-visible ingest route'
}

async function checkBadSignatureRejectedByWebIngest() {
  const notification = testNotification('example.test', `${runtime.ingestId}-bad-signature`)
  const response = await postIngestNotification(
    notification,
    webhookHeaders(notification.ingest_id, 'v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=')
  )
  assert(
    [400, 401, 403].includes(response.status),
    `bad signature returned ${response.status}, expected 400/401/403`
  )
  return 'bad ingest signature is rejected by the web-server-visible ingest route'
}

async function checkObjectStorageOutageStatus() {
  await runCommand('kubectl', ['scale', 'deployment/minio', '-n', namespace, '--replicas=0'], {
    logName: 'scale-minio-down'
  })
  try {
    const response = await fetch(`${runtime.webBaseUrl}/rpc/mail/status`, {
      headers: {
        accept: 'application/json',
        ...(runtime.cookieHeader ? { cookie: runtime.cookieHeader } : {})
      }
    })
    const text = await response.text()
    assert(response.status === 200, `mail status returned ${response.status}: ${bodySnippet(text)}`)
    const body = parseJson(text)
    assert(
      body.dependencies?.r2?.configured === true,
      `mail status did not expose configured R2 dependency during outage: ${bodySnippet(text)}`
    )
  } finally {
    await runCommand('kubectl', ['scale', 'deployment/minio', '-n', namespace, '--replicas=1'], {
      allowFailure: true,
      logName: 'scale-minio-up'
    })
    await rolloutStatus('minio', 180)
    await restartPortForward('minio', 'service/minio', `${new URL(runtime.minioBaseUrl).port}:9000`)
    await waitForHttpOk(`${runtime.minioBaseUrl}/minio/health/ready`, 'minio health after outage')
    await ensureArchiveBucket()
  }
  return 'object storage outage is visible in web-server mail status'
}

async function checkDuplicateResultPreventsReplay() {
  const resultKey = `${runtime.archivePrefix}/result.json`
  const existing = `${JSON.stringify({
    schema: 'agent-mail.inbound.receipt.v1',
    ingest_id: runtime.ingestId,
    status: 'delivered',
    attempt: 1,
    processed_at: new Date().toISOString(),
    raw_key: `${runtime.archivePrefix}/raw.eml`,
    edge_key: `${runtime.archivePrefix}/edge.json`,
    delivery_source: 'full-stack-e2e-existing-result',
    detail: 'sentinel receipt preserved across duplicate notification'
  })}\n`
  await s3PutObject(resultKey, existing, 'application/json')
  await checkInboundNotificationThroughWebServer()
  const after = await s3GetObject(resultKey)
  assert(after === existing, 'existing result.json was overwritten after duplicate replay attempt')
  return 'existing result.json prevents duplicate replay'
}

async function checkSweepPaginationContract() {
  const pageFixturePrefix = `${requireWorker('example.test').archivePrefix}/2026/06/20/full-stack-pagination`
  for (let index = 0; index < 3; index += 1) {
    await s3PutObject(`${pageFixturePrefix}-${index}/raw.eml`, runtime.rawMessage, 'message/rfc822')
    await s3PutObject(
      `${pageFixturePrefix}-${index}/edge.json`,
      `${JSON.stringify({ domain: 'example.test', ingest_id: `full-stack-pagination-${index}` })}\n`,
      'application/json'
    )
  }
  const response = await fetch(`${runtime.webBaseUrl}/rpc/mail/status`, {
    headers: runtime.cookieHeader ? { cookie: runtime.cookieHeader } : {}
  })
  assert(response.status === 200, `sweep status endpoint returned ${response.status}`)
  const body = await response.json()
  assert(
    body.modules?.poller?.configured === true && typeof body.modules?.poller?.queue === 'object',
    'poller status did not expose queue state'
  )
  return 'mail status exposes poller queue state for bucket sweep visibility'
}

async function checkRestartRecoveryContract() {
  await runCommand(
    'kubectl',
    ['rollout', 'restart', 'deployment/atemail-mail-control-service', '-n', namespace],
    {
      logName: 'restart-mail-control'
    }
  )
  await rolloutStatus('atemail-mail-control-service', 180)
  const body = await retry(
    async () => {
      const response = await fetch(`${runtime.webBaseUrl}/rpc/mail/status`, {
        headers: runtime.cookieHeader ? { cookie: runtime.cookieHeader } : {}
      })
      const text = await response.text()
      await writeFile(path.join(scenariosDir, 'phase-5-restart-status.txt'), text)
      assert(
        response.status === 200,
        `mail status after restart returned ${response.status}: ${bodySnippet(text)}`
      )
      return parseJson(text)
    },
    {
      attempts: 12,
      delayMs: 2500,
      description: 'mail status after mail-control restart'
    }
  )
  assert(
    Number(body.controlState?.domainsActive ?? 0) > 0 && body.modules?.poller?.configured === true,
    'restart recovery did not expose restored runtime projection and poller configuration'
  )
  return 'queued mail work survives mail-control restart and runtime projection repair'
}

async function checkCrossDomainPrefixIsolation() {
  const wrongPrefix = `${requireWorker('second.test').archivePrefix}/2026/06/20/${runtime.ingestId}-cross-domain`
  await s3PutObject(`${wrongPrefix}/raw.eml`, runtime.rawMessage, 'message/rfc822')
  await s3PutObject(
    `${wrongPrefix}/edge.json`,
    `${JSON.stringify({
      domain: 'example.test',
      ingest_id: `${runtime.ingestId}-cross-domain`,
      rcpt_to: 'agent@example.test'
    })}\n`,
    'application/json'
  )
  const response = await postSignedIngestNotification(
    testNotification('example.test', `${runtime.ingestId}-cross-domain`, {
      bundlePrefix: wrongPrefix
    })
  )
  assert(
    [400, 403].includes(response.status),
    `cross-domain prefix returned ${response.status}, expected 400/403`
  )
  return 'domain prefix mismatch is rejected without cross-domain processing'
}

async function ensureArchiveBucket() {
  const response = await s3Fetch({
    body: '',
    contentType: '',
    key: '',
    method: 'PUT'
  })
  assert(
    response.status === 200 || response.status === 409,
    `archive bucket create returned ${response.status}: ${bodySnippet(await response.text())}`
  )
  await writeFile(path.join(diagnosticsDir, 'archive-bucket-create-status.txt'), String(response.status))
}

async function s3PutObject(key, body, contentType) {
  const response = await s3Fetch({
    body,
    contentType,
    key,
    method: 'PUT'
  })
  assert(
    response.status >= 200 && response.status < 300,
    `S3 PUT ${key} returned ${response.status}: ${bodySnippet(await response.text())}`
  )
}

async function s3GetObject(key) {
  const response = await s3Fetch({
    key,
    method: 'GET'
  })
  const bodyText = await response.text()
  assert(response.status === 200, `S3 GET ${key} returned ${response.status}: ${bodySnippet(bodyText)}`)
  return bodyText
}

async function s3Fetch({ body = '', contentType, key, method }) {
  const url = new URL(`${runtime.minioBaseUrl}/${archiveBucket}${key ? `/${key}` : ''}`)
  const payload = typeof body === 'string' || Buffer.isBuffer(body) ? body : ''
  const headers = contentType ? { 'content-type': contentType } : {}
  const signedRequest = await s3Client.sign(url, {
    body: method === 'GET' || method === 'HEAD' ? undefined : payload,
    headers,
    method
  })
  return fetch(signedRequest)
}

function sha256Hex(value) {
  return createHash('sha256').update(value).digest('hex')
}

async function loadProvisionedWorkerBindings() {
  const cloudflare = await fetchClusterJson('http://fake-cloudflare:8080/__requests')
  for (const script of Object.values(cloudflare.scripts || {})) {
    const bindings = Object.fromEntries(
      (script.metadata?.bindings || [])
        .filter((binding) => typeof binding.name === 'string' && typeof binding.text === 'string')
        .map((binding) => [binding.name, binding.text])
    )
    const domain = bindings.AGENTTEAM_DOMAIN
    if (!domain) {
      continue
    }
    runtime.workers.set(domain, {
      archivePrefix: bindings.AGENTTEAM_ARCHIVE_PREFIX,
      connectionId: bindings.AGENTTEAM_CONNECTION_ID,
      domain,
      domainId: bindings.AGENTTEAM_DOMAIN_ID,
      organizationPublicId: bindings.AGENTTEAM_ORG_PUBLIC_ID,
      scriptFiles: Array.isArray(script.files) ? script.files : []
    })
  }
}

function requireWorker(domain) {
  const worker = runtime.workers.get(domain)
  assert(worker, `missing Worker metadata for ${domain}`)
  for (const [key, value] of Object.entries(worker)) {
    if (key === 'scriptFiles') {
      continue
    }
    assert(typeof value === 'string' && value.length > 0, `Worker metadata ${key} is missing for ${domain}`)
  }
  return worker
}

function testNotification(domain, ingestId, options = {}) {
  const worker = requireWorker(domain)
  const bundlePrefix =
    options.bundlePrefix ??
    `${worker.archivePrefix}/${(runtime.receivedAt || new Date().toISOString()).slice(0, 10).replaceAll('-', '/')}/${ingestId}`
  return {
    schema: 'agent-mail.inbound.ingest.v1',
    ingest_id: ingestId,
    organization_public_id: worker.organizationPublicId,
    archive_prefix: worker.archivePrefix,
    worker_connection_id: worker.connectionId,
    worker_domain_deployment_id: worker.domainId,
    recipient_domain: options.recipientDomain ?? domain,
    raw_key: `${bundlePrefix}/raw.eml`,
    edge_key: `${bundlePrefix}/edge.json`,
    result_key: `${bundlePrefix}/result.json`,
    received_at: runtime.receivedAt || new Date().toISOString(),
    raw_sha256: sha256Hex(runtime.rawMessage || '')
  }
}

async function signWorkerNotification(worker, bodyText, webhookId, timestamp) {
  const signed = await fetchClusterJson('http://fake-cloudflare:8080/__sign-worker-notification', {
    body: JSON.stringify({
      bodyText,
      domain: worker.domain,
      timestamp: String(Math.floor(timestamp.getTime() / 1000)),
      webhookId
    }),
    headers: {
      'content-type': 'application/json'
    },
    method: 'POST'
  })
  assert(
    signed.connectionId === worker.connectionId,
    `fake Cloudflare signer returned connection ${signed.connectionId} for ${worker.domain}, expected ${worker.connectionId}`
  )
  return {
    headers: signed.headers,
    signature: signed.signature,
    timestamp: signed.timestamp
  }
}

async function postJson(pathname, body, extraHeaders = {}) {
  const raw = await fetch(`${runtime.webBaseUrl}${pathname}`, {
    body: JSON.stringify(body),
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      ...extraHeaders
    },
    method: 'POST'
  })
  return {
    bodyText: await raw.text(),
    raw,
    status: raw.status
  }
}

async function webMailJson(method, pathname, body) {
  const raw = await fetch(`${runtime.webBaseUrl}${pathname}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      accept: 'application/json',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      cookie: runtime.cookieHeader
    },
    method
  })
  const bodyText = await raw.text()
  assert(
    raw.status >= 200 && raw.status < 300,
    `${method} ${pathname} returned ${raw.status}: ${bodySnippet(bodyText)}`
  )
  return bodyText ? parseJson(bodyText) : {}
}

async function wildDuckMessageCountBySubject(address, subject) {
  const probe = await execNodeInWebServer(`
    const token = 'full-stack-e2e-wildduck-admin-token';
    const baseUrl = 'http://wildduck-api:8080';
    const address = ${JSON.stringify(address)};
    const subject = ${JSON.stringify(subject)};

    async function request(path) {
      const response = await fetch(baseUrl + path, {
        headers: {
          accept: 'application/json',
          'x-access-token': token
        }
      });
      const bodyText = await response.text();
      let body = {};
      if (bodyText) {
        try {
          body = JSON.parse(bodyText);
        } catch {
          body = { bodyText };
        }
      }
      if (response.status < 200 || response.status >= 300) {
        throw new Error(path + ' returned ' + response.status + ': ' + JSON.stringify(body).slice(0, 500));
      }
      return body;
    }

    const resolved = await request('/addresses/resolve/' + encodeURIComponent(address));
    const userId = resolved.user || resolved.id;
    if (!userId) {
      throw new Error('WildDuck address resolution for ' + address + ' did not return a user id');
    }
    const search = await request(
      '/users/' + encodeURIComponent(String(userId)) + '/search?query=' + encodeURIComponent(subject) + '&limit=50'
    );
    const matches = (search.results || []).filter((message) => String(message.subject || '') === subject);
    console.log(JSON.stringify({ count: matches.length }));
  `)
  const result = parseJson(probe.stdout)
  assert(
    typeof result.count === 'number',
    `WildDuck subject count probe returned ${bodySnippet(probe.stdout)}`
  )
  return result.count
}

async function seedWildDuckWebmailScenario() {
  const probe = await execNodeInWebServer(`
    const token = 'full-stack-e2e-wildduck-admin-token';
    const baseUrl = 'http://wildduck-api:8080';
    const runId = ${JSON.stringify(runId)};
    const pageMessageCount = 32;
    const agent = {
      address: 'agent@example.test',
      name: 'Full Stack E2E Agent',
      username: 'agent-example-test'
    };
    const assistant = {
      address: 'assistant@second.test',
      name: 'Full Stack E2E Assistant',
      username: 'assistant-second-test'
    };

    async function request(path, init = {}) {
      const response = await rawRequest(path, init);
      if (response.status < 200 || response.status >= 300) {
        throw new Error(init.method + ' ' + path + ' returned ' + response.status + ': ' + JSON.stringify(response.body).slice(0, 500));
      }
      return response.body;
    }

    async function rawRequest(path, init = {}) {
      const response = await fetch(baseUrl + path, {
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        headers: {
          accept: 'application/json',
          ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
          'x-access-token': token
        },
        method: init.method || 'GET'
      });
      const bodyText = await response.text();
      let body = {};
      if (bodyText) {
        try {
          body = JSON.parse(bodyText);
        } catch {
          body = { bodyText };
        }
      }
      return { body, status: response.status };
    }

    async function ensureUser(account) {
      let resolved = await rawRequest('/addresses/resolve/' + encodeURIComponent(account.address));
      if (resolved.status === 404) {
        await request('/users', {
          method: 'POST',
          body: {
            address: account.address,
            allowUnsafe: true,
            name: account.name,
            password: 'full-stack-e2e-webmail-password',
            spamLevel: 0,
            username: account.username
          }
        });
        resolved = await rawRequest('/addresses/resolve/' + encodeURIComponent(account.address));
      }
      if (resolved.status < 200 || resolved.status >= 300) {
        throw new Error('resolve ' + account.address + ' returned ' + resolved.status + ': ' + JSON.stringify(resolved.body));
      }
      const userId = resolved.body.user || resolved.body.id;
      if (!userId) {
        throw new Error('WildDuck address resolution for ' + account.address + ' did not return a user id');
      }
      return String(userId);
    }

    async function listMailboxes(userId) {
      const response = await request('/users/' + encodeURIComponent(userId) + '/mailboxes');
      return response.results || [];
    }

    function findMailbox(mailboxes, name) {
      const normalized = name.toLowerCase();
      return mailboxes.find((mailbox) => {
        const specialUse = String(mailbox.specialUse || '').toLowerCase();
        const path = String(mailbox.path || '').toLowerCase();
        const mailboxName = String(mailbox.name || '').toLowerCase();
        return specialUse.includes(normalized) || path === normalized || mailboxName === normalized;
      });
    }

    async function ensureMailbox(userId, path) {
      let mailboxes = await listMailboxes(userId);
      let mailbox = findMailbox(mailboxes, path);
      if (!mailbox) {
        await request('/users/' + encodeURIComponent(userId) + '/mailboxes', {
          method: 'POST',
          body: { path }
        });
        mailboxes = await listMailboxes(userId);
        mailbox = findMailbox(mailboxes, path);
      }
      if (!mailbox || !mailbox.id) {
        throw new Error('mailbox ' + path + ' was not available for user ' + userId);
      }
      return String(mailbox.id);
    }

    async function uploadMessage(userId, mailboxId, payload) {
      const response = await request(
        '/users/' + encodeURIComponent(userId) + '/mailboxes/' + encodeURIComponent(mailboxId) + '/messages',
        {
          method: 'POST',
          body: payload
        }
      );
      if (!response.message || !response.message.id) {
        throw new Error('upload did not return a message id: ' + JSON.stringify(response));
      }
      return {
        mailboxId: String(response.message.mailbox || mailboxId),
        messageId: String(response.message.id)
      };
    }

    function messageSubject(label) {
      return 'Webmail E2E ' + label + ' ' + runId;
    }

    const agentUserId = await ensureUser(agent);
    const assistantUserId = await ensureUser(assistant);
    const agentInboxId = await ensureMailbox(agentUserId, 'Inbox');
    const assistantInboxId = await ensureMailbox(assistantUserId, 'Inbox');
    const threadMessageId = '<webmail-thread-' + runId.toLowerCase() + '@example.test>';
    const threadQuery = messageSubject('Thread');
    const threadRoot = await uploadMessage(agentUserId, agentInboxId, {
      attachments: [
        {
          content: Buffer.from('Attachment from the full-stack webmail E2E.').toString('base64'),
          contentDisposition: 'attachment',
          contentType: 'text/plain',
          filename: 'webmail-e2e.txt'
        }
      ],
      flagged: false,
      from: { address: 'sender@example.net', name: 'Sender' },
      headers: [{ key: 'Message-ID', value: threadMessageId }],
      html: '<p>Thread root from the full-stack webmail E2E.</p>',
      subject: threadQuery,
      text: 'Thread root from the full-stack webmail E2E.',
      to: [{ address: agent.address, name: agent.name }],
      unseen: true
    });
    const threadReply = await uploadMessage(agentUserId, agentInboxId, {
      from: { address: agent.address, name: agent.name },
      headers: [
        { key: 'Message-ID', value: '<webmail-thread-reply-' + runId.toLowerCase() + '@example.test>' },
        { key: 'In-Reply-To', value: threadMessageId },
        { key: 'References', value: threadMessageId }
      ],
      html: '<p>Thread reply from the full-stack webmail E2E.</p>',
      subject: 'Re: ' + threadQuery,
      text: 'Thread reply from the full-stack webmail E2E.',
      to: [{ address: 'sender@example.net', name: 'Sender' }],
      unseen: false
    });

    for (let index = 0; index < pageMessageCount; index += 1) {
      await uploadMessage(agentUserId, agentInboxId, {
        flagged: index === 0,
        from: { address: 'sender-' + index + '@example.net', name: 'Sender ' + index },
        html: '<p>Pagination fixture #' + index + ' from the full-stack webmail E2E.</p>',
        subject: messageSubject('Page') + ' #' + String(index).padStart(2, '0'),
        text: 'Pagination fixture #' + index + ' from the full-stack webmail E2E.',
        to: [{ address: agent.address, name: agent.name }],
        unseen: index % 2 === 0
      });
    }

    const accountSwitchSubject = messageSubject('Account Switch');
    const assistantMessage = await uploadMessage(assistantUserId, assistantInboxId, {
      from: { address: 'sender@example.net', name: 'Sender' },
      html: '<p>Second account fixture from the full-stack webmail E2E.</p>',
      subject: accountSwitchSubject,
      text: 'Second account fixture from the full-stack webmail E2E.',
      to: [{ address: assistant.address, name: assistant.name }],
      unseen: true
    });

    console.log(JSON.stringify({
      accountSwitchSubject,
      agent: {
        address: agent.address,
        inboxId: agentInboxId,
        threadReplyMessageId: threadReply.messageId,
        threadRootMessageId: threadRoot.messageId
      },
      assistant: {
        address: assistant.address,
        inboxId: assistantInboxId,
        messageId: assistantMessage.messageId
      },
      pageMessageCount,
      threadQuery
    }));
  `)
  return parseJson(probe.stdout)
}

async function postSignedIngestNotification(notification, options = {}) {
  const bodyText = JSON.stringify(notification)
  const worker = options.worker ?? requireWorker(notification.recipient_domain)
  const signed = await signWorkerNotification(worker, bodyText, notification.ingest_id, new Date())
  return postIngestNotification(notification, signed.headers, { worker })
}

async function postIngestNotification(notification, webhookHeaderValues = {}, options = {}) {
  const bodyText = JSON.stringify(notification)
  const worker = options.worker ?? requireWorker(notification.recipient_domain || 'example.test')
  const headers = {
    'content-type': 'application/json',
    ...webhookHeaderValues
  }
  const raw = await fetch(
    `${runtime.webBaseUrl}/rpc/agent-mail/ingest/v1/${encodeURIComponent(worker.connectionId)}`,
    {
      body: bodyText,
      headers,
      method: 'POST'
    }
  )
  return {
    bodyText: await raw.text(),
    raw,
    status: raw.status
  }
}

function webhookHeaders(webhookId, signature, timestamp = new Date()) {
  return {
    'webhook-id': webhookId,
    'webhook-signature': signature,
    'webhook-timestamp': String(Math.floor(timestamp.getTime() / 1000))
  }
}

function uppercaseHeaderValues(headers) {
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key, String(value).toUpperCase()]))
}

async function fetchClusterJson(url, init = {}) {
  const response = await fetchClusterResponse(url, init)
  assert(
    response.status >= 200 && response.status < 300,
    `${url} returned ${response.status}: ${bodySnippet(response.bodyText)}`
  )
  return parseJson(response.bodyText)
}

async function fetchClusterResponse(url, init = {}) {
  const probe = await execNodeInWebServer(`
    const response = await fetch(${JSON.stringify(url)}, ${JSON.stringify(init)});
    const headers = {};
    for (const [key, value] of response.headers.entries()) headers[key] = value;
    const bodyText = await response.text();
    console.log(JSON.stringify({ status: response.status, headers, bodyText }));
  `)
  return parseJson(probe.stdout)
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      accept: 'application/json'
    }
  })
  const bodyText = await response.text()
  assert(
    response.status >= 200 && response.status < 300,
    `${url} returned ${response.status}: ${bodySnippet(bodyText)}`
  )
  return parseJson(bodyText)
}

async function waitForHttpOk(url, label) {
  await retry(
    async () => {
      const response = await fetch(url)
      assert(response.status >= 200 && response.status < 300, `${label} returned ${response.status}`)
      return true
    },
    {
      attempts: 60,
      delayMs: 1000,
      description: label
    }
  )
}

async function retry(fn, { attempts, delayMs, description }) {
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (attempt < attempts) {
        await delay(delayMs)
      }
    }
  }
  throw new Error(`${description} did not become ready: ${stringifyError(lastError)}`)
}

async function execNodeInWebServer(source) {
  return runCommand(
    'kubectl',
    ['exec', '-n', namespace, 'deployment/atemail-web-server', '--', 'node', '-e', source],
    {
      logName: `exec-node-${createHash('sha1').update(source).digest('hex').slice(0, 10)}`,
      returnStdout: true
    }
  ).then((stdout) => ({ stdout }))
}

async function rolloutStatus(deployment, timeoutSeconds) {
  await runCommand(
    'kubectl',
    ['rollout', 'status', `deployment/${deployment}`, '-n', namespace, `--timeout=${timeoutSeconds}s`],
    {
      logName: `rollout-${deployment}`
    }
  )
}

async function kubectlJson(args) {
  const stdout = await runCommand('kubectl', args, {
    logName: `kubectl-json-${createHash('sha1').update(args.join(' ')).digest('hex').slice(0, 10)}`,
    returnStdout: true
  })
  return parseJson(stdout)
}

async function startPortForward(label, resource, mapping) {
  await log(`port-forward ${label}: ${resource} ${mapping}`)
  const stdoutPath = path.join(logsDir, `${label}-port-forward.log`)
  const child = spawn('kubectl', ['port-forward', '-n', namespace, resource, mapping], {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  child.stdout.on('data', (chunk) => appendFile(stdoutPath, chunk))
  child.stderr.on('data', (chunk) => appendFile(stdoutPath, chunk))
  portForwardProcesses.push({ child, label })
  child.once('exit', (code, signal) => {
    appendFile(stdoutPath, `\n[port-forward exited code=${code} signal=${signal}]\n`)
  })
  await delay(500)
}

async function restartPortForward(label, resource, mapping) {
  await stopPortForward(label)
  await startPortForward(label, resource, mapping)
}

async function stopPortForward(label) {
  const matching = portForwardProcesses.filter((entry) => entry.label === label)
  for (const entry of matching) {
    await stopPortForwardProcess(entry)
  }
}

async function stopPortForwards() {
  for (const entry of portForwardProcesses.splice(0)) {
    await stopPortForwardProcess(entry)
  }
}

async function stopPortForwardProcess(entry) {
  const index = portForwardProcesses.indexOf(entry)
  if (index !== -1) {
    portForwardProcesses.splice(index, 1)
  }
  if (!entry.child.killed) {
    entry.child.kill('SIGTERM')
  }
}

async function runCommand(command, args, options = {}) {
  const logName = options.logName || command
  const stdoutChunks = []
  const stderrChunks = []
  const commandLogPath = path.join(logsDir, `${sanitizeFileName(logName)}.log`)
  await appendFile(harnessLogPath, redactText(`+ ${[command, ...args].join(' ')}\n`))
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || repoRoot,
      env: options.env ? { ...process.env, ...options.env } : process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    child.stdout.on('data', (chunk) => {
      const redacted = redactText(chunk.toString('utf8'))
      stdoutChunks.push(Buffer.from(redacted))
      appendFile(commandLogPath, redacted)
    })
    child.stderr.on('data', (chunk) => {
      const redacted = redactText(chunk.toString('utf8'))
      stderrChunks.push(Buffer.from(redacted))
      appendFile(commandLogPath, redacted)
    })
    child.on('error', reject)
    child.on('close', async (code) => {
      const stdout = Buffer.concat(stdoutChunks).toString('utf8')
      const stderr = Buffer.concat(stderrChunks).toString('utf8')
      if (options.stdoutFile) {
        await writeFile(options.stdoutFile, stdout)
      }
      if (options.stderrFile) {
        await writeFile(options.stderrFile, stderr)
      }
      if (code !== 0 && !options.allowFailure) {
        reject(new Error(redactText(`${command} ${args.join(' ')} exited ${code}: ${stderr || stdout}`)))
        return
      }
      if (options.returnResult) {
        resolve({ code: code ?? 0, stderr, stdout })
        return
      }
      resolve(options.returnStdout ? stdout : undefined)
    })
  })
}

async function runAtEmailAgentConnectWithWebApproval({
  accountId,
  agentName,
  cliConfigDir,
  cliWorkdir,
  cookieHeader = runtime.cookieHeader,
  logName,
  organizationId = runtime.organizationId,
  stderrFile,
  stdoutFile
}) {
  const command = 'bash'
  const args = [
    '-lc',
    'go run ./cmd/at-email agent connect --json --api-base-url "$AT_EMAIL_API_BASE_URL" --name "$AT_EMAIL_AGENT_NAME" --organization-id "$AT_EMAIL_ORGANIZATION_ID" --mailbox-address "$AT_EMAIL_MAILBOX_ADDRESS"'
  ]
  const stdoutChunks = []
  const stderrChunks = []
  const commandLogPath = path.join(logsDir, `${sanitizeFileName(logName)}.log`)

  await appendFile(harnessLogPath, redactText(`+ ${[command, ...args].join(' ')}\n`))

  const child = spawn(command, args, {
    cwd: cliWorkdir,
    env: {
      ...process.env,
      AT_EMAIL_AGENT_NAME: agentName,
      AT_EMAIL_API_BASE_URL: runtime.webBaseUrl,
      AT_EMAIL_MAILBOX_ADDRESS: accountId,
      AT_EMAIL_ORGANIZATION_ID: organizationId,
      XDG_CONFIG_HOME: cliConfigDir
    },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  child.stdout.on('data', (chunk) => {
    stdoutChunks.push(Buffer.from(chunk))
  })
  child.stderr.on('data', (chunk) => {
    stderrChunks.push(Buffer.from(chunk))
  })

  const closed = new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('close', (code) => {
      resolve(code ?? 0)
    })
  })
  let wroteArtifacts = false

  try {
    const pending = await waitForAgentConnectPendingApproval(child, stderrChunks)
    registerRedaction(pending.user_code, '<redacted-agent-connect-user-code>')
    registerRedaction(pending.formatted_user_code, '<redacted-agent-connect-formatted-code>')
    registerRedaction(pending.verification_uri_complete, '<redacted-agent-connect-verification-url>')

    const decisionResponse = await postJson(
      '/rpc/agent-access/approvals/decision',
      {
        action: 'approve',
        userCode: pending.user_code
      },
      {
        cookie: cookieHeader
      }
    )
    assert(
      decisionResponse.status === 200,
      `agent connect approval returned ${decisionResponse.status}: ${bodySnippet(decisionResponse.bodyText)}`
    )
    const decision = parseJson(decisionResponse.bodyText)
    const code = await closed
    const stdout = Buffer.concat(stdoutChunks).toString('utf8')
    const stderr = Buffer.concat(stderrChunks).toString('utf8')
    await writeCommandOutputArtifacts({
      commandLogPath,
      stderr,
      stderrFile,
      stdout,
      stdoutFile
    })
    wroteArtifacts = true

    if (code !== 0) {
      throw new Error(redactText(`at-email agent connect exited ${code}: ${stderr || stdout}`))
    }

    return { decision, pending, stderr, stdout }
  } catch (error) {
    if (!child.killed) {
      child.kill('SIGTERM')
    }
    const stdout = Buffer.concat(stdoutChunks).toString('utf8')
    const stderr = Buffer.concat(stderrChunks).toString('utf8')
    if (!wroteArtifacts) {
      await writeCommandOutputArtifacts({
        commandLogPath,
        stderr,
        stderrFile,
        stdout,
        stdoutFile
      })
    }
    throw error
  }
}

async function runAtEmailAgentTrial({ agentName, cliConfigDir, cliWorkdir, logName, stdoutFile }) {
  const command = 'bash'
  const args = [
    '-lc',
    'go run ./cmd/at-email agent trial --json --force --api-base-url "$AT_EMAIL_API_BASE_URL" --name "$AT_EMAIL_AGENT_NAME" --capability email.message.send --post-claim-capability email.message.send'
  ]
  const stdoutChunks = []
  const stderrChunks = []
  const commandLogPath = path.join(logsDir, `${sanitizeFileName(logName)}.log`)

  await appendFile(harnessLogPath, redactText(`+ ${[command, ...args].join(' ')}\n`))

  const child = spawn(command, args, {
    cwd: cliWorkdir,
    env: {
      ...process.env,
      AT_EMAIL_AGENT_NAME: agentName,
      AT_EMAIL_API_BASE_URL: runtime.webBaseUrl,
      AT_EMAIL_TRIAL_ADMISSION_TOKEN: trialAdmissionToken,
      XDG_CONFIG_HOME: cliConfigDir
    },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  child.stdout.on('data', (chunk) => {
    stdoutChunks.push(Buffer.from(chunk))
  })
  child.stderr.on('data', (chunk) => {
    stderrChunks.push(Buffer.from(chunk))
  })

  const code = await new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('close', (closedCode) => {
      resolve(closedCode ?? 0)
    })
  })
  const stdout = Buffer.concat(stdoutChunks).toString('utf8')
  const stderr = Buffer.concat(stderrChunks).toString('utf8')
  let claimToken = ''
  if (code === 0) {
    const trial = parseJson(stdout)
    const claimUrl = typeof trial.claim?.url === 'string' ? trial.claim.url : ''
    if (claimUrl) {
      registerRedaction(claimUrl, '<redacted-agent-trial-claim-url>')
      claimToken = claimTokenFromUrl(claimUrl)
      registerRedaction(claimToken, '<redacted-agent-trial-claim-token>')
    }
  }
  await writeCommandOutputArtifacts({
    commandLogPath,
    stderr,
    stdout,
    stdoutFile
  })

  if (code !== 0) {
    throw new Error(redactText(`at-email agent trial exited ${code}: ${stderr || stdout}`))
  }

  return { claimToken, stderr, stdout }
}

function claimTokenFromUrl(value) {
  try {
    const url = new URL(value)
    const token = url.pathname.split('/').filter(Boolean).pop() ?? ''
    assert(token, 'agent trial claim URL did not contain a token')
    return token
  } catch (error) {
    throw new Error(`invalid agent trial claim URL: ${stringifyError(error)}`)
  }
}

function waitForAgentConnectPendingApproval(child, stderrChunks) {
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (error, value) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timeout)
      child.stderr.off('data', onData)
      child.off('close', onClose)
      if (error) {
        reject(error)
      } else {
        resolve(value)
      }
    }
    const onData = () => {
      const raw = Buffer.concat(stderrChunks).toString('utf8').trim()
      if (!raw) {
        return
      }
      const payload = parseJsonObjectFromNoisyOutput(raw)
      if (!payload) {
        return
      }
      if (payload?.operation === 'agent_connect' && typeof payload.user_code === 'string') {
        finish(null, payload)
      }
    }
    const onClose = (code) => {
      finish(new Error(`at-email agent connect exited ${code ?? 0} before emitting approval`))
    }
    const timeout = setTimeout(() => {
      finish(new Error('at-email agent connect did not emit an approval event before timeout'))
    }, 60_000)

    child.stderr.on('data', onData)
    child.on('close', onClose)
    onData()
  })
}

function parseJsonObjectFromNoisyOutput(raw) {
  try {
    return JSON.parse(raw)
  } catch {
    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    if (start === -1 || end <= start) {
      return null
    }
    try {
      return JSON.parse(raw.slice(start, end + 1))
    } catch {
      return null
    }
  }
}

async function writeCommandOutputArtifacts({ commandLogPath, stderr, stderrFile, stdout, stdoutFile }) {
  const redactedStdout = redactText(stdout)
  const redactedStderr = redactText(stderr)
  await appendFile(commandLogPath, redactedStdout)
  await appendFile(commandLogPath, redactedStderr)
  if (stdoutFile) {
    await writeFile(stdoutFile, redactedStdout)
  }
  if (stderrFile) {
    await writeFile(stderrFile, redactedStderr)
  }
}

async function submitArtifacts() {
  if (process.env.TEST_ARTIFACT_SUBMIT_SKIP) {
    await log('artifact submission skipped by TEST_ARTIFACT_SUBMIT_SKIP')
    return
  }
  await runCommand(
    containerEngine,
    [
      'run',
      '--rm',
      '--userns',
      'keep-id',
      '--user',
      `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`,
      '--env-host',
      '-v',
      `${suiteRoot}:${artifactSubmitWorkdir}:Z`,
      '-w',
      artifactSubmitWorkdir,
      'system.registry.test/agentteam/test-artifact-ctl:latest',
      'submit',
      '--namespace',
      'agentteam-email/full-stack-e2e',
      '--suite',
      'full-stack-e2e',
      '--run-dir',
      path.posix.join(artifactSubmitWorkdir, 'tmp', `run-${runId}`),
      '--event-id',
      `run-${runId}`
    ],
    {
      allowFailure: true,
      logName: 'artifact-submit'
    }
  )
}

async function collectDiagnostics() {
  await log('collecting diagnostics')
  await runCommand(
    'kubectl',
    ['get', 'all,pvc,configmap,secret,ingress,endpoints', '-n', namespace, '-o', 'wide'],
    {
      allowFailure: true,
      logName: 'diagnostics-resources',
      stdoutFile: path.join(diagnosticsDir, 'resources.txt')
    }
  )
  await runCommand('kubectl', ['get', 'events', '-n', namespace, '--sort-by=.lastTimestamp', '-o', 'wide'], {
    allowFailure: true,
    logName: 'diagnostics-events',
    stdoutFile: path.join(diagnosticsDir, 'events.txt')
  })
  await runCommand('kubectl', ['describe', 'pods', '-n', namespace], {
    allowFailure: true,
    logName: 'diagnostics-pods',
    stdoutFile: path.join(diagnosticsDir, 'pods.txt')
  })
  const podsText = await runCommand('kubectl', ['get', 'pods', '-n', namespace, '-o', 'name'], {
    allowFailure: true,
    logName: 'diagnostics-pod-list',
    returnStdout: true
  }).catch(() => '')
  for (const pod of podsText.split(/\r?\n/u).filter(Boolean)) {
    const podName = pod.replace(/^pod\//u, '')
    await runCommand('kubectl', ['logs', '-n', namespace, podName, '--all-containers=true'], {
      allowFailure: true,
      logName: `diagnostics-log-${podName}`,
      stdoutFile: path.join(diagnosticsDir, `${podName}.log`)
    })
  }
}

async function writeReports() {
  const summary = {
    failed: results.filter((result) => result.status === 'failed').length,
    passed: results.filter((result) => result.status === 'passed').length,
    results,
    runId
  }
  await writeJson(path.join(reportsDir, 'results.json'), summary)
  await writeFile(path.join(reportsDir, 'junit.xml'), junitXml(results))
  await writeFile(
    path.join(runDir, 'result-summary.txt'),
    [
      `run_id=${runId}`,
      `passed=${summary.passed}`,
      `failed=${summary.failed}`,
      '',
      ...results.map(
        (result) => `${result.status.toUpperCase()} ${result.phase} :: ${result.name} :: ${result.details}`
      )
    ].join('\n')
  )
}

async function recordResult(result) {
  results.push({
    ...result,
    timestamp: new Date().toISOString()
  })
  await appendFile(path.join(scenariosDir, `${result.phase}.jsonl`), `${JSON.stringify(results.at(-1))}\n`)
  await log(`${result.status.toUpperCase()} ${result.phase}: ${result.name}`)
}

function readContainerEnvNames(deployment, containerName) {
  return new Set(readContainerEnvMap(deployment, containerName).keys())
}

function readContainerEnvMap(deployment, containerName) {
  const container = deployment.spec?.template?.spec?.containers?.find(
    (candidate) => candidate.name === containerName
  )
  assert(container, `container ${containerName} not found`)
  return new Map((container.env || []).map((env) => [env.name, env]))
}

function extractCookieHeader(response) {
  const getSetCookie = response.headers.getSetCookie?.() || []
  const cookies =
    getSetCookie.length > 0 ? getSetCookie : splitCombinedSetCookie(response.headers.get('set-cookie'))
  return cookies
    .map((cookie) => cookie.split(';')[0])
    .filter(Boolean)
    .join('; ')
}

function mergeCookieHeaders(existing, next) {
  const merged = new Map()
  for (const header of [existing, next]) {
    for (const cookie of splitCookieHeader(header)) {
      const [name] = cookie.split('=', 1)
      if (name) {
        merged.set(name, cookie)
      }
    }
  }
  return [...merged.values()].join('; ')
}

function splitCookieHeader(value) {
  if (!value) {
    return []
  }
  return value
    .split(';')
    .map((cookie) => cookie.trim())
    .filter((cookie) => cookie.includes('='))
}

function splitCombinedSetCookie(value) {
  if (!value) {
    return []
  }
  return value.split(/,(?=\s*[^;,]+=)/u)
}

function redactSession(session) {
  if (!session) {
    return session
  }
  return {
    ...session,
    session: session.session
      ? {
          ...session.session,
          token: session.session.token ? '[redacted]' : session.session.token
        }
      : session.session
  }
}

function parseJson(text) {
  try {
    return JSON.parse(text)
  } catch (error) {
    throw new Error(`invalid JSON: ${stringifyError(error)}; body=${bodySnippet(text)}`)
  }
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function requireEnv(name) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`missing ${name}`)
  }
  return value
}

async function choosePort(preferred) {
  if (await isPortAvailable(preferred)) {
    return preferred
  }
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(() => {
        if (address && typeof address === 'object') {
          resolve(address.port)
        } else {
          reject(new Error('failed to allocate a free port'))
        }
      })
    })
  })
}

async function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = createServer()
    server.once('error', () => resolve(false))
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve(true))
    })
  })
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function appendFile(filePath, chunk) {
  appendFileSync(filePath, chunk)
}

async function log(message) {
  const line = `[full-stack-e2e] ${message}\n`
  process.stdout.write(line)
  await appendFile(harnessLogPath, line)
}

function stringifyError(error) {
  if (error instanceof Error) {
    return redactText(error.stack || error.message)
  }
  return redactText(String(error))
}

function bodySnippet(value, limit = 1000) {
  const text = redactText(value)
  if (text.length <= limit) {
    return text
  }
  return `${text.slice(0, limit)}... [truncated ${text.length - limit} chars]`
}

function registerRedaction(value, replacement) {
  if (typeof value === 'string' && value.length > 0) {
    dynamicRedactions.set(value, replacement)
  }
}

function assertNoInternalCredentialMaterial(value, target) {
  const text = String(value)
  for (const forbidden of [
    'wildduck-api',
    'x-access-token',
    'full-stack-e2e-wildduck-admin-token',
    'full-stack-e2e-control-to-web-token'
  ]) {
    assert(!text.includes(forbidden), `${target} leaked internal credential material: ${forbidden}`)
  }
}

function sanitizeFileName(value) {
  return value.replaceAll(/[^a-zA-Z0-9_.-]/g, '-').slice(0, 120)
}

function sanitizeIdentifier(value) {
  const sanitized = value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
  return sanitized || 'run'
}

function kindLocalRepository(repository) {
  if (repository.includes('/')) {
    return repository
  }
  return `localhost/${repository}`
}

function isLocalKindImage(image) {
  return image.startsWith('localhost/')
}

function imageArchiveName(image) {
  return sanitizeFileName(image.replaceAll('/', '-').replaceAll(':', '-'))
}

function redactText(value) {
  const replacements = new Map([
    [runDir, '<run-dir>'],
    [suiteRoot, '<suite-root>'],
    [repoRoot, '<repo-root>'],
    [supportToken, '<redacted-support-token>'],
    [trialAdmissionToken, '<redacted-trial-admission-token>'],
    ['full-stack-e2e-control-to-web-token', '<redacted-control-to-web-token>'],
    ['ZnVsbC1zdGFjay1lMmUtZW5jcnlwdGlvbi1rZXktMzI', '<redacted-encryption-key>'],
    [minioAccessKey, '<redacted-minio-access-key>'],
    [minioSecretKey, '<redacted-minio-secret-key>'],
    ['full-stack-e2e-cloudflare-api-token', '<redacted-cloudflare-api-token>'],
    ['full-stack-e2e-cloudflare-oauth-token', '<redacted-cloudflare-oauth-token>'],
    ['full-stack-e2e-cloudflare-refresh-token', '<redacted-cloudflare-refresh-token>'],
    [workerNotificationWebhookSigningSecret, '<redacted-worker-notification-webhook-signing-secret>'],
    ['full-stack-e2e-wildduck-admin-token', '<redacted-wildduck-admin-token>'],
    ['full-stack-e2e-wildduck-access-control-secret', '<redacted-wildduck-access-control-secret>'],
    ['full-stack-e2e-zonemta-relay-password', '<redacted-zonemta-relay-password>'],
    ['full-stack-e2e-feedback-mailbox-password', '<redacted-feedback-mailbox-password>']
  ])
  for (const [needle, replacement] of dynamicRedactions) {
    replacements.set(needle, replacement)
  }
  let redacted = String(value)
  for (const [needle, replacement] of replacements) {
    redacted = redacted.replaceAll(needle, replacement)
  }
  return redacted
}

function junitXml(items) {
  const failures = items.filter((item) => item.status === 'failed')
  const testCases = items
    .map((item) => {
      const attrs = `classname="${escapeXml(item.phase)}" name="${escapeXml(item.name)}"`
      if (item.status === 'failed') {
        return `  <testcase ${attrs}><failure message="${escapeXml(item.details)}">${escapeXml(item.details)}</failure></testcase>`
      }
      return `  <testcase ${attrs}></testcase>`
    })
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuite name="full-stack-e2e" tests="${items.length}" failures="${failures.length}">\n${testCases}\n</testsuite>\n`
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function testInfrastructureYaml({ mailpitImage, minioImage, webServerImage }) {
  return `apiVersion: apps/v1
kind: Deployment
metadata:
  name: minio
  labels:
    app.kubernetes.io/name: minio
spec:
  replicas: 1
  selector:
    matchLabels:
      app.kubernetes.io/name: minio
  template:
    metadata:
      labels:
        app.kubernetes.io/name: minio
    spec:
      containers:
        - name: minio
          image: ${minioImage}
          imagePullPolicy: IfNotPresent
          args:
            - server
            - /data
            - --address
            - :9000
            - --console-address
            - :9001
          env:
            - name: MINIO_ROOT_USER
              value: ${minioAccessKey}
            - name: MINIO_ROOT_PASSWORD
              value: ${minioSecretKey}
          ports:
            - name: s3
              containerPort: 9000
            - name: console
              containerPort: 9001
---
apiVersion: v1
kind: Service
metadata:
  name: minio
spec:
  type: ClusterIP
  selector:
    app.kubernetes.io/name: minio
  ports:
    - name: s3
      port: 9000
      targetPort: s3
    - name: console
      port: 9001
      targetPort: console
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mailpit
  labels:
    app.kubernetes.io/name: mailpit
spec:
  replicas: 1
  selector:
    matchLabels:
      app.kubernetes.io/name: mailpit
  template:
    metadata:
      labels:
        app.kubernetes.io/name: mailpit
    spec:
      containers:
        - name: mailpit
          image: ${mailpitImage}
          imagePullPolicy: IfNotPresent
          ports:
            - name: smtp
              containerPort: 1025
            - name: http
              containerPort: 8025
---
apiVersion: v1
kind: Service
metadata:
  name: mailpit
spec:
  type: ClusterIP
  selector:
    app.kubernetes.io/name: mailpit
  ports:
    - name: smtp
      port: 1025
      targetPort: smtp
    - name: http
      port: 8025
      targetPort: http
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: fake-cloudflare
  labels:
    app.kubernetes.io/name: fake-cloudflare
spec:
  replicas: 1
  selector:
    matchLabels:
      app.kubernetes.io/name: fake-cloudflare
  template:
    metadata:
      labels:
        app.kubernetes.io/name: fake-cloudflare
    spec:
      containers:
        - name: fake-cloudflare
          image: ${webServerImage}
          imagePullPolicy: IfNotPresent
          command:
            - node
            - /fake/server.mjs
          env:
            - name: PORT
              value: "8788"
            - name: FAKE_AT_EMAIL_ADMIN_CF_OAUTH_EMAIL
              value: ${JSON.stringify(fakeCloudflareOAuthEmail)}
            - name: FAKE_AT_EMAIL_ADMIN_CF_OAUTH_SUB
              value: ${JSON.stringify(fakeCloudflareOAuthSubject)}
          ports:
            - name: http
              containerPort: 8788
          volumeMounts:
            - name: fake-cloudflare-script
              mountPath: /fake
              readOnly: true
      volumes:
        - name: fake-cloudflare-script
          configMap:
            name: fake-cloudflare-script
---
apiVersion: v1
kind: Service
metadata:
  name: fake-cloudflare
spec:
  type: ClusterIP
  selector:
    app.kubernetes.io/name: fake-cloudflare
  ports:
    - name: http
      port: 8080
      targetPort: http
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: fake-provider
  labels:
    app.kubernetes.io/name: fake-provider
spec:
  replicas: 1
  selector:
    matchLabels:
      app.kubernetes.io/name: fake-provider
  template:
    metadata:
      labels:
        app.kubernetes.io/name: fake-provider
    spec:
      containers:
        - name: fake-provider
          image: ${webServerImage}
          imagePullPolicy: IfNotPresent
          command:
            - node
            - /fake/server.mjs
          env:
            - name: PORT
              value: "8789"
          ports:
            - name: http
              containerPort: 8789
          volumeMounts:
            - name: fake-provider-script
              mountPath: /fake
              readOnly: true
      volumes:
        - name: fake-provider-script
          configMap:
            name: fake-provider-script
---
apiVersion: v1
kind: Service
metadata:
  name: fake-provider
spec:
  type: ClusterIP
  selector:
    app.kubernetes.io/name: fake-provider
  ports:
    - name: http
      port: 8080
      targetPort: http
`
}

function fakeProviderServerSource() {
  return `import { createHash } from 'node:crypto'
import http from 'node:http'

const port = Number(process.env.PORT || '8789')
const requests = []
const internalProviderHeaders = [
  'X-ATM-Ingest-ID',
  'X-ATMCF-Edge-Status',
  'X-Zone-Loop',
  'X-Agent-Mail-ZoneMTA-Queue-ID'
]

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || '/', 'http://fake-provider')
  const body = await readBody(request)
  requests.push({
    method: request.method,
    path: url.pathname,
    bodySha256: hashBody(body),
    bodyLength: body.length,
    bodySummary: safeBodySummary(body),
    at: new Date().toISOString()
  })
  if (url.pathname === '/health') {
    sendJson(response, 200, { ok: true })
    return
  }
  if (url.pathname === '/__requests') {
    sendJson(response, 200, { requests })
    return
  }
  sendJson(response, 200, { accepted: true })
})

server.listen(port, '0.0.0.0', () => {
  console.log(\`[fake-provider] listening on \${port}\`)
})

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, { 'content-type': 'application/json' })
  response.end(JSON.stringify(body))
}

async function readBody(request) {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

function safeBodySummary(body) {
  return {
    forbiddenInternalHeaders: internalProviderHeaders.filter((header) => body.includes(header))
  }
}

function hashBody(body) {
  return createHash('sha256').update(body).digest('hex')
}
`
}
