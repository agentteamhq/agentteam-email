import type { CreateFirstAdminResult } from '../lib/admin-setup-rpc'
import type { AdminSetupRouteState } from '@main/backend/routes/webapp'

export type AdminSetupCreateFirstAdminRpc =
  | {
      result?: CreateFirstAdminResult
      status: 'success'
    }
  | {
      message: string
      status: 'error'
      statusCode?: number
    }
  | {
      status: 'pending'
    }

export const adminSetupReadyRouteState = {
  redirectTo: '/admin/',
  setupRequired: true,
  shouldNotFound: false,
  shouldRedirectToAdmin: false,
  user: null
} satisfies AdminSetupRouteState

export const adminSetupCreateFirstAdminSuccess = {
  result: {
    redirectTo: '/signin/'
  },
  status: 'success'
} satisfies AdminSetupCreateFirstAdminRpc
