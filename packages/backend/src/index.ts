export { copyHeaders, HttpStatusCode } from '@main/common'
export type { Database } from './db/db'
export { createStripeCheckoutSession } from './payments/create-checkout-session'
export { createStripePortalLink } from './payments/create-portal-link'
export { updateAfterStripeRedirect } from './payments/update-after-stripe-redirect'
export { getCustomerStripeStatus } from './payments/get-customer-status'
export {
  startScheduledJobs,
  syncStripeCustomers,
  type ScheduledJobs,
  type SyncStripeCustomersOptions,
  type SyncStripeCustomersResult
} from './jobs'
export { isAuthed } from './auth/is-authed'
export { getUser } from './auth/get-user'
export * from './auth/auth'
export { handleAtEmailMetadataRequest, isAtEmailMetadataRequestPath } from './auth/at-email-metadata'
export {
  handleCloudflareOAuthCallbackRequest,
  isCloudflareOAuthCallbackRequestPath
} from './auth/cloudflare-oauth-callback'
export { handleAgentMailIngestRequest, isAgentMailIngestRequestPath } from './agent-mail/ingest'
export { handleOAuthMetadataRequest, isOAuthMetadataRequestPath } from './auth/oauth-metadata'
export { backendRpcApp, type BackendRpcAppType } from './rpc/'
export * from './cloudflare/service'
export * from './payments/is-delayed-data'
// HMR - invalidate importers when this module changes
if (import.meta.hot) {
  import.meta.hot.accept(() => {
    import.meta.hot?.invalidate('[SSR] @main/backend changed, propagating to importers...')
  })
}
