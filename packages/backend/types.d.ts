declare module '*?nodeWorker' {
  import type { Worker, WorkerOptions } from 'node:worker_threads'
  const createWorker: (options?: WorkerOptions) => Worker
  export default createWorker
}

declare module '*?csNodeWorker' {
  import type { Worker, WorkerOptions } from 'node:worker_threads'
  const createWorker: (options?: WorkerOptions) => Worker
  export default createWorker
}

declare module '*?modulePath' {
  const modulePath: string
  export default modulePath
}

declare module '*?csModulePath' {
  const modulePath: string | URL
  export default modulePath
}
