import {
  loadAdminRoute,
  loadAdminSetupRoute,
  loadAppRouteGate,
  loadBillingRoute,
  loadDashboardRoute,
  loadDeviceRoute,
  loadHomeRoute,
  loadPublicAuthRoute,
  loadSettingsRoute,
  loadSignInRoute,
  loadSignOutRoute,
  loadSignUpRoute
} from '@main/backend/routes/webapp'

import type { FrontendServerRouteHandlers } from './types'

export function createFrontendServerRouteHandlers(): FrontendServerRouteHandlers {
  return {
    loadAdminRoute,
    loadAdminSetupRoute,
    loadAppRouteGate,
    loadBillingRoute,
    loadDashboardRoute,
    loadDeviceRoute,
    loadHomeRoute,
    loadPublicAuthRoute,
    loadSettingsRoute,
    loadSignInRoute,
    loadSignOutRoute,
    loadSignUpRoute
  }
}
