import { treaty } from '@elysiajs/eden'
import type { Treaty } from '@elysiajs/eden'
import type { BackendRpcAppType } from '@main/backend'

const client = treaty<BackendRpcAppType>(
  `${globalThis.window ? globalThis.window.location.protocol : ''}//${globalThis.window ? globalThis.window.location.host : ''}`,
  {
    fetch: {
      credentials: 'include'
    }
  }
)

const rpc: Treaty.Create<BackendRpcAppType>['rpc'] = client.rpc
export { rpc }
