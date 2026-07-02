import os from 'node:os'
import process from 'node:process'

type ShutdownTask = {
  name: string
  fn: () => Promise<void>
}

type ReportHeader = {
  arch?: string
  componentVersions?: Record<string, string>
  glibcVersionRuntime?: string
  libcType?: string
  osMachine?: string
  osName?: string
  osRelease?: string
  osVersion?: string
  platform?: NodeJS.Platform
}

const SAFE_ERROR_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_.:-]{0,79}$/

function errorType(error: unknown): string {
  if (error instanceof Error) {
    return SAFE_ERROR_NAME_PATTERN.test(error.name) ? error.name : 'Error'
  }

  if (error === null) {
    return 'null'
  }

  return typeof error
}

export class ShutdownManager {
  static readonly gracefulTimeoutSeconds = 30
  private tasks = new Set<ShutdownTask>()
  private shuttingDown = false
  private log = (...args: unknown[]) => {}
  private shutdownTimer: ReturnType<typeof setTimeout> | null = null

  constructor(logger: (...args: unknown[]) => void) {
    this.log = logger ?? (() => {})
    this.logEnvironmentDetails()

    process.once('SIGINT', this.sigintHandler)
    process.once('SIGTERM', this.sigtermHandler)
    process.once('uncaughtException', this.uncaughtExceptionHandler)
    process.once('unhandledRejection', this.unhandledRejectionHandler)
  }

  sigintHandler = () => {
    this.initiate('SIGINT')
  }

  sigtermHandler = () => {
    this.initiate('SIGTERM')
  }

  uncaughtExceptionHandler = (err: unknown) => {
    this.log('shutdown signal received', {
      source: 'uncaughtException',
      status: 'error',
      errorType: errorType(err)
    })
    this.initiate('uncaughtException')
  }

  unhandledRejectionHandler = (reason: unknown) => {
    this.log('shutdown signal received', {
      source: 'unhandledRejection',
      status: 'error',
      errorType: errorType(reason)
    })
    this.initiate('unhandledRejection')
  }

  add = (name: string, fn: () => Promise<void>): void => {
    this.tasks.add({ name, fn })
  }

  gracefulShutdown = () => {
    this.log('shutdown requested', { source: 'gracefulShutdown', status: 'starting' })
    this.initiate('gracefulShutdown')
  }

  private removeProcessListeners = () => {
    process.removeListener('SIGINT', this.sigintHandler)
    process.removeListener('SIGTERM', this.sigtermHandler)
    process.removeListener('uncaughtException', this.uncaughtExceptionHandler)
    process.removeListener('unhandledRejection', this.unhandledRejectionHandler)
  }

  private startShutdownTimer = () => {
    if (this.shutdownTimer) {
      return
    }

    this.shutdownTimer = setTimeout(() => {
      this.log('shutdown watchdog timeout reached', {
        source: 'watchdog',
        status: 'timeout',
        timeoutSeconds: ShutdownManager.gracefulTimeoutSeconds
      })
      process.exit(0)
    }, ShutdownManager.gracefulTimeoutSeconds * 1000)
  }

  private shutdown = async (source: string) => {
    const startedAt = Date.now()
    const promises = this.tasks.values().map((task) =>
      // eslint-disable-next-line no-restricted-syntax
      (async () => {
        const taskStartedAt = Date.now()
        this.log('shutdown task started', {
          source,
          task: task.name,
          status: 'running'
        })
        try {
          await task.fn()
          this.log('shutdown task completed', {
            source,
            task: task.name,
            status: 'completed',
            durationMs: Date.now() - taskStartedAt
          })
          return { ok: true, task }
        } catch (error) {
          this.log('shutdown task failed', {
            source,
            task: task.name,
            status: 'failed',
            durationMs: Date.now() - taskStartedAt,
            errorType: errorType(error)
          })
          return { ok: false, task, err: error }
        }
      })()
    )

    const results = await Promise.allSettled(promises)
    for (const result of results) {
      if (result.status === 'rejected') {
        this.log('shutdown task settled unexpectedly', {
          source,
          status: 'failed',
          errorType: errorType(result.reason)
        })
      }
    }
    if (results) {
      this.tasks.clear()
    }

    if (this.shutdownTimer) {
      clearTimeout(this.shutdownTimer)
      this.shutdownTimer = null
    }

    this.log('shutdown completed', {
      source,
      status: 'completed',
      taskCount: results.length,
      durationMs: Date.now() - startedAt
    })
  }

  private initiate = (source: string) => {
    if (this.shuttingDown) {
      return
    }
    this.shuttingDown = true
    this.removeProcessListeners()
    this.startShutdownTimer()
    this.log('shutdown initiated', { source, status: 'starting', taskCount: this.tasks.size })

    this.shutdown(source)
      .then(() => {})
      .catch((error: unknown) => {
        this.log('shutdown failed unexpectedly', {
          source,
          status: 'failed',
          errorType: errorType(error)
        })
      })
  }

  private logEnvironmentDetails = () => {
    this.log('shutdown manager initialized', { status: 'initialized' })

    const reportHeader = this.getReportHeader()
    const libc = this.detectLibc(reportHeader)
    const osVersion = reportHeader?.osVersion ?? (typeof os.version === 'function' ? os.version() : null)

    this.log('Runtime details:', {
      node: process.version,
      platform: reportHeader?.platform ?? process.platform,
      arch: reportHeader?.arch ?? process.arch,
      machine: reportHeader?.osMachine,
      pid: process.pid,
      ppid: process.ppid
    })

    this.log('OS details:', {
      name: reportHeader?.osName ?? os.type(),
      release: reportHeader?.osRelease ?? os.release(),
      version: osVersion
    })

    this.log('Binary/runtime components:', {
      libc: libc ?? 'unknown',
      uv: process.versions.uv,
      openssl: process.versions.openssl,
      zlib: process.versions.zlib
    })
  }

  private getReportHeader(): ReportHeader | null {
    const report = process.report
    if (!report || typeof report.getReport !== 'function') {
      return null
    }

    const maybeReport = report.getReport()
    if (!maybeReport || typeof maybeReport !== 'object') {
      return null
    }

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    const { header } = maybeReport as { header?: unknown }
    if (!header || typeof header !== 'object') {
      return null
    }

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    return header as ReportHeader
  }

  private detectLibc(reportHeader?: ReportHeader | null) {
    if (!reportHeader) {
      return null
    }

    if (reportHeader.glibcVersionRuntime) {
      return { implementation: 'glibc', version: reportHeader.glibcVersionRuntime }
    }

    if (reportHeader.componentVersions?.musl) {
      return { implementation: 'musl', version: reportHeader.componentVersions.musl }
    }

    if (reportHeader.libcType) {
      return { implementation: reportHeader.libcType }
    }

    return null
  }
}
