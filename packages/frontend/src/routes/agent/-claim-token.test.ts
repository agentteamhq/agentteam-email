import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'

import { agentTrialClaimQueryKey, loadAgentClaimRouteState, loadAgentTrialClaim } from './claim.$token'
import type { AgentClaimLoaderInput } from './claim.$token'

const claimRouteTestState = vi.hoisted(() => ({
  fetchAgentMailTrialClaim: vi.fn(),
  loadAuthenticatedRouteState: vi.fn()
}))

vi.mock('../../lib/agent-access-rpc', () => ({
  fetchAgentMailTrialClaim: claimRouteTestState.fetchAgentMailTrialClaim
}))

vi.mock('../../lib/authenticated-app-route', () => ({
  loadAuthenticatedRouteState: claimRouteTestState.loadAuthenticatedRouteState
}))

describe('agent claim route helpers', () => {
  beforeEach(() => {
    claimRouteTestState.fetchAgentMailTrialClaim.mockReset()
    claimRouteTestState.loadAuthenticatedRouteState.mockReset()
  })

  it('passes the exact claim URL as the authenticated return target', async () => {
    expect.hasAssertions()
    const loaderInput = createAgentClaimLoaderInput(
      'https://mail.example.test/agent/claim/claim-token-1?from=cli'
    )
    claimRouteTestState.loadAuthenticatedRouteState.mockResolvedValue({
      user: {
        email: 'operator@example.test',
        name: 'Operator'
      }
    })

    await expect(loadAgentClaimRouteState(loaderInput)).resolves.toStrictEqual({
      redirectTo: 'https://mail.example.test/agent/claim/claim-token-1?from=cli',
      user: {
        email: 'operator@example.test',
        name: 'Operator'
      }
    })
    expect(claimRouteTestState.loadAuthenticatedRouteState).toHaveBeenCalledWith(
      loaderInput,
      'https://mail.example.test/agent/claim/claim-token-1?from=cli'
    )
  })

  it('preserves sign-in redirects raised by the authenticated route helper', async () => {
    expect.hasAssertions()
    const redirect = new Error('redirect to sign in')
    const loaderInput = createAgentClaimLoaderInput(
      'https://mail.example.test/agent/claim/claim-token-1'
    )
    claimRouteTestState.loadAuthenticatedRouteState.mockRejectedValue(redirect)

    await expect(loadAgentClaimRouteState(loaderInput)).rejects.toBe(redirect)
    expect(claimRouteTestState.loadAuthenticatedRouteState).toHaveBeenCalledWith(
      loaderInput,
      'https://mail.example.test/agent/claim/claim-token-1'
    )
  })

  it('loads trial claims with a token-scoped query identity', async () => {
    expect.hasAssertions()
    const claim = {
      state: 'pending',
      trial_id: 'trial-1'
    }
    claimRouteTestState.fetchAgentMailTrialClaim.mockResolvedValue(claim)

    expect(agentTrialClaimQueryKey('claim-token-1')).toStrictEqual([
      'agent-mail-trial-claim',
      'claim-token-1'
    ])
    await expect(loadAgentTrialClaim('claim-token-1')).resolves.toBe(claim)
    expect(claimRouteTestState.fetchAgentMailTrialClaim).toHaveBeenCalledWith('claim-token-1')
  })
})

function createAgentClaimLoaderInput(href: string): AgentClaimLoaderInput {
  return {
    context: {
      publicEnv: {} as AgentClaimLoaderInput['context']['publicEnv'],
      queryClient: new QueryClient()
    },
    location: {
      href
    }
  }
}
