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

export class ShutdownManager {
  static readonly gracefulTimeoutSeconds = 30
  private tasks = new Set<ShutdownTask>()
  private shuttingDown = false
  private log = (...args: unknown[]) => {}
  // private sigintHandler: () => void
  // private sigtermHandler: () => void
  // private uncaughtExceptionHandler: (err: unknown) => void
  // private unhandledRejectionHandler: (reason: unknown) => void
  private shutdownTimer: ReturnType<typeof setTimeout> | null = null

  constructor(logger: (...args: unknown[]) => void) {
    this.log = logger ?? (() => {})
    this.logEnvironmentDetails()

    // Wire up process signals/events
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
    this.log('Uncaught exception:', err)
    this.initiate('uncaughtException')
  }
  unhandledRejectionHandler = (reason: unknown) => {
    this.log('Unhandled rejection:', reason)
    this.initiate('unhandledRejection')
  }

  /**
   * Register a task to be run on shutdown.
   */
  add = (name: string, fn: () => Promise<void>): void => {
    this.tasks.add({ name, fn })
  }

  gracefulShutdown = () => {
    this.log('Starting graceful shutdown request...')
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
      this.log('Shutdown watchdog timeout reached, forcing exit with code 0')
      // If Docker or another orchestrator hasn't killed us within the timeout,
      // force a clean exit so the process can be restarted instead of staying deadlocked.
      process.exit(0)
    }, ShutdownManager.gracefulTimeoutSeconds * 1000)
  }

  private shutdown = async () => {
    const promises = this.tasks.values().map((task) =>
      // we're already shutting down we don't have to
      // care about scope an iife is fine here
      //
      // eslint-disable-next-line no-restricted-syntax
      (async () => {
        this.log(`Running task: ${task.name}`)
        try {
          await task.fn()
          this.log(`Completed task: ${task.name}`)
          return { ok: true, task }
        } catch (error) {
          this.log(`Failed task: ${task.name}`, error)
          return { ok: false, task, err: error }
        }
      })()
    )

    const results = await Promise.allSettled(promises)
    if (results) {
      this.tasks.clear()
    }

    if (this.shutdownTimer) {
      clearTimeout(this.shutdownTimer)
      this.shutdownTimer = null
    }
  }

  /**
   * Trigger shutdown (runs tasks in series).
   */
  private initiate = (source: string) => {
    if (this.shuttingDown) {
      return
    }
    this.shuttingDown = true
    this.removeProcessListeners()
    this.startShutdownTimer()
    this.log(`Received ${source}, shutting down...`)

    this.shutdown()
      .then(() => {})
      .catch(() => {})
  }

  private logEnvironmentDetails = () => {
    this.log('ShutdownManager initialized')

    const reportHeader = this.getReportHeader()
    const libc = this.detectLibc(reportHeader)
    const osVersion = reportHeader?.osVersion ?? (typeof os.version === 'function' ? os.version() : null)

    this.log('Runtime details:', {
      node: process.version,
      platform: reportHeader?.platform ?? process.platform,
      arch: reportHeader?.arch ?? process.arch,
      machine: reportHeader?.osMachine,
      pid: process.pid,
      ppid: process.ppid,
      execPath: process.execPath
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
