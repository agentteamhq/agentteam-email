import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { ConnectedAccountsPanel, SettingsDomainsPanel } from './settings-dialog'
import type { DomainSettingsState, DomainSettingsStatus } from './settings-dialog'

describe('settings Cloudflare account and domain separation', () => {
  it('does not expose connected-account disconnect actions on the domains surface', () => {
    const markup = renderToStaticMarkup(<SettingsDomainsPanel state={domainSettingsState()} />)

    expect(markup).toContain('agentteam.example')
    expect(markup).not.toContain('Disconnect Cloudflare')
    expect(markup).not.toContain('Disconnect account')
  })

  it('keeps Cloudflare grant disconnect on the connected accounts surface', () => {
    const onDisconnectCloudflare = vi.fn()
    const markup = renderToStaticMarkup(
      <ConnectedAccountsPanel
        state={{
          ...domainSettingsState(),
          onDisconnectCloudflare
        }}
      />
    )

    expect(markup).toContain('Connected accounts')
    expect(markup).toContain('Disconnect account')
    expect(markup).not.toContain('Disconnect Cloudflare')
  })
})

function domainSettingsState(): DomainSettingsState {
  return {
    mode: 'domain',
    selectedDomainPublicId: cloudflareConnection().publicId,
    status: {
      connections: [cloudflareConnection()],
      grants: [cloudflareGrant()]
    }
  }
}

function cloudflareGrant(): DomainSettingsStatus['grants'][number] {
  return {
    cloudflareEmail: 'admin@example.com',
    cloudflareUserId: 'cloudflare-user-id',
    grantedScopes: ['account:read', 'zone:read'],
    lastErrorMessage: null,
    lastTokenCheckAt: new Date('2026-06-21T16:12:00.000Z'),
    publicId: 'grant-public-id' as DomainSettingsStatus['grants'][number]['publicId'],
    requiredScopes: ['account:read', 'zone:read'],
    status: 'active'
  }
}

function cloudflareConnection(): DomainSettingsStatus['connections'][number] {
  return {
    cloudflareAccountId: 'cloudflare-account-id',
    cloudflareAccountName: 'AgentTeam Production',
    cloudflareZoneId: 'cloudflare-zone-id',
    cloudflareZoneName: 'agentteam.example',
    domain: 'agentteam.example',
    lastErrorMessage: null,
    lastProvisionedAt: new Date('2026-06-21T16:24:00.000Z'),
    provisioningStatus: 'succeeded',
    publicId: 'connection-public-id' as DomainSettingsStatus['connections'][number]['publicId'],
    status: 'active',
    updatedAt: new Date('2026-06-21T16:26:00.000Z'),
    workerScriptName: 'agent-mail-ingest-agentteam-example'
  }
}
