import { PUBLIC_VARS } from '../vars.public'

export const BETTER_AUTH_BASE_PATH = '/api'
export const BETTER_AUTH_MANUAL_BASE_PATH = '/rpc/auth/api'
export const AUTH_REDIRECT_ERROR_PATH = '/redirect/error'
export const BETTER_AUTH_ROUTE = new URL(BETTER_AUTH_MANUAL_BASE_PATH, PUBLIC_VARS.PUBLIC_HOSTNAME)
  .toString()
  .replace(/\/$/u, '')
export const AUTH_REDIRECT_ERROR_ROUTE = new URL(AUTH_REDIRECT_ERROR_PATH, PUBLIC_VARS.PUBLIC_HOSTNAME)
  .toString()
  .replace(/\/$/u, '')
