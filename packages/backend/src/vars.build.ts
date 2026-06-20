// Build-time configuration variables
// These are read at build time and baked into client bundles
import { z } from 'zod'

import { resolveEnvironment } from './resolve-environment'

const envSchema = z.object({})

export const BUILD_VARS = resolveEnvironment(envSchema)
