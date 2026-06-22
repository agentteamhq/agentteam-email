import { useEffect, useMemo, useState } from 'react'
import { usePluginAction, usePluginData } from '@paperclipai/plugin-sdk/ui'
import { ArrowSquareOutIcon, CaretDownIcon } from '@phosphor-icons/react'
import { DEFAULT_SERVICE_BASE_URL, normalizeAgentTeamEmailConfig } from '../config'
import agentTeamLogoUrl from './agentteam-logo.svg'
import type { CSSProperties, SyntheticEvent } from 'react'
import type { PluginSettingsPageProps, PluginWidgetProps } from '@paperclipai/plugin-sdk/ui'
import type { AgentTeamEmailPluginConfig } from '../config'
import type { EmailConnectionStatus } from '../worker'

const PLUGIN_ID = 'agentteam.paperclip-email-plugin'

const resourceLinks = [
  { label: 'Docs', href: 'https://agentteamemail.mintlify.com' },
  { label: 'Support', href: 'https://www.agentteam.email/support/' },
  { label: 'Discord', href: 'https://discord.gg/X8znnm5Vbc' },
  { label: 'GitHub', href: 'https://github.com/agentteamhq/agentteam-email' }
] as const

const defaultConfig: AgentTeamEmailPluginConfig = {
  serviceBaseUrl: DEFAULT_SERVICE_BASE_URL
}

interface ConfigResponse {
  configJson?: Record<string, unknown> | null
}

interface OAuthConnectResult {
  ok: boolean
  message?: string
}

interface SettingsConfigState {
  config: AgentTeamEmailPluginConfig
  setConfig: (nextConfig: AgentTeamEmailPluginConfig) => void
  loading: boolean
  saving: boolean
  error: string | null
  save: (nextConfig: AgentTeamEmailPluginConfig) => Promise<void>
}

async function hostFetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  headers.set('content-type', 'application/json')

  const response = await fetch(path, {
    ...init,
    credentials: 'include',
    headers
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || `Request failed: ${response.status}`)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

function isHttpsUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function compactConfig(input: AgentTeamEmailPluginConfig): AgentTeamEmailPluginConfig {
  return {
    serviceBaseUrl: input.serviceBaseUrl.trim() || DEFAULT_SERVICE_BASE_URL,
    apiKeySecretRef: input.apiKeySecretRef?.trim() || undefined
  }
}

function useSettingsConfig(): SettingsConfigState {
  const [config, setConfig] = useState<AgentTeamEmailPluginConfig>(defaultConfig)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    hostFetchJson<ConfigResponse | null>(`/api/plugins/${PLUGIN_ID}/config`)
      .then((result) => {
        if (cancelled) {
          return
        }
        setConfig(normalizeAgentTeamEmailConfig(result?.configJson ?? {}))
        setError(null)
      })
      .catch((nextError: unknown) => {
        if (cancelled) {
          return
        }
        setConfig(defaultConfig)
        setError(nextError instanceof Error ? nextError.message : String(nextError))
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  async function save(nextConfig: AgentTeamEmailPluginConfig) {
    const normalized = compactConfig(nextConfig)
    setSaving(true)
    try {
      await hostFetchJson(`/api/plugins/${PLUGIN_ID}/config`, {
        method: 'POST',
        body: JSON.stringify({ configJson: normalized })
      })
      setConfig(normalized)
      setError(null)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
      throw nextError
    } finally {
      setSaving(false)
    }
  }

  return { config, setConfig, loading, saving, error, save }
}

function connectionCopy(status: EmailConnectionStatus | null | undefined): {
  label: string
  tone: 'ready' | 'pending'
} {
  if (status?.apiKeyConfigured) {
    return {
      label: 'Connected by API key',
      tone: 'ready'
    }
  }

  return {
    label: 'Not connected',
    tone: 'pending'
  }
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return 'Never'
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value))
}

const uiColors = {
  background: 'var(--background, #ffffff)',
  border: 'var(--border, #e4e4e7)',
  destructive: 'var(--destructive, #dc2626)',
  destructiveBackground: 'color-mix(in srgb, var(--destructive, #dc2626) 8%, transparent)',
  foreground: 'var(--foreground, #18181b)',
  input: 'var(--input, #d4d4d8)',
  muted: 'var(--muted, #f4f4f5)',
  mutedForeground: 'var(--muted-foreground, #71717a)',
  primary: 'var(--primary, #18181b)',
  primaryForeground: 'var(--primary-foreground, #ffffff)'
} as const

function LogoMark({ size = 44 }: { size?: number }) {
  return (
    <span
      aria-hidden='true'
      style={{
        width: size,
        height: size,
        display: 'inline-flex',
        flex: `0 0 ${size}px`,
        overflow: 'hidden',
        borderRadius: Math.max(8, Math.floor(size * 0.2)),
        background: uiColors.foreground,
        boxShadow: 'inset 0 0 0 1px color-mix(in srgb, currentColor 18%, transparent)'
      }}
    >
      <img
        src={agentTeamLogoUrl}
        alt=''
        style={{
          width: '100%',
          height: '100%',
          display: 'block'
        }}
      />
    </span>
  )
}

function PluginInteractionStyles() {
  return (
    <style>{`
      .at-email-plugin a,
      .at-email-plugin button {
        transition:
          background-color 140ms ease,
          border-color 140ms ease,
          color 140ms ease,
          opacity 140ms ease,
          transform 140ms ease;
      }

      .at-email-primary-button:hover:not(:disabled) {
        opacity: 0.92 !important;
        transform: translateY(-1px) !important;
      }

      .at-email-secondary-button:hover:not(:disabled) {
        border-color: var(--foreground, #18181b) !important;
        transform: translateY(-1px) !important;
      }

      .at-email-primary-button:active:not(:disabled),
      .at-email-secondary-button:active:not(:disabled) {
        transform: translateY(1px) !important;
      }

      .at-email-resource-link:hover {
        color: #1d4ed8 !important;
        text-decoration-color: currentColor !important;
      }

      .at-email-resource-link svg {
        transition: transform 140ms ease;
      }

      .at-email-resource-link:hover svg {
        transform: translate(1px, -1px) !important;
      }

      .at-email-disclosure-button:hover {
        background: var(--muted, #f4f4f5) !important;
      }

      .at-email-widget-button:hover {
        border-color: var(--foreground, #18181b) !important;
      }

      .at-email-primary-button:focus-visible,
      .at-email-secondary-button:focus-visible,
      .at-email-resource-link:focus-visible,
      .at-email-disclosure-button:focus-visible,
      .at-email-widget-button:focus-visible {
        outline: 2px solid #2563eb;
        outline-offset: 2px;
      }
    `}</style>
  )
}

function StatusPill({ tone, children }: { tone: 'ready' | 'pending'; children: string }) {
  const color = tone === 'ready' ? uiColors.foreground : uiColors.mutedForeground
  const dotColor = tone === 'ready' ? '#16a34a' : uiColors.mutedForeground

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        width: 'fit-content',
        border: `1px solid ${uiColors.border}`,
        borderRadius: 999,
        padding: '4px 8px',
        background: uiColors.background,
        color,
        fontSize: 12,
        fontWeight: 500,
        letterSpacing: 0
      }}
    >
      <span
        aria-hidden='true'
        style={{
          width: 7,
          height: 7,
          borderRadius: 999,
          backgroundColor: dotColor
        }}
      />
      {children}
    </span>
  )
}

function SkeletonSettings() {
  return (
    <div style={styles.settingsShell}>
      <div style={styles.skeletonHeader}>
        <div style={styles.skeletonLogo} />
        <div style={styles.skeletonLines}>
          <div style={{ ...styles.skeletonLine, width: '52%' }} />
          <div style={{ ...styles.skeletonLine, width: '34%' }} />
        </div>
      </div>
      <div style={styles.skeletonPanel} />
      <div style={{ ...styles.skeletonPanel, height: 92 }} />
    </div>
  )
}

export function SettingsPage(_props: PluginSettingsPageProps) {
  const { config, setConfig, loading, saving, error, save } = useSettingsConfig()
  const connection = usePluginData<EmailConnectionStatus>('email-connection-status')
  const startOAuthConnect = usePluginAction('start-oauth-connect')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [message, setMessage] = useState<{ tone: 'success' | 'error' | 'info'; text: string } | null>(null)
  const [connecting, setConnecting] = useState(false)

  const serviceUrlValid = useMemo(() => isHttpsUrl(config.serviceBaseUrl), [config.serviceBaseUrl])
  const statusCopy = connectionCopy(connection.data)

  async function handleConnect() {
    setConnecting(true)
    setMessage(null)
    try {
      const result = (await startOAuthConnect({
        serviceBaseUrl: compactConfig(config).serviceBaseUrl
      })) as OAuthConnectResult
      setMessage({
        tone: result.ok ? 'success' : 'info',
        text: result.message ?? 'Account linking is not available yet.'
      })
      connection.refresh()
    } catch (nextError) {
      setMessage({
        tone: 'error',
        text: nextError instanceof Error ? nextError.message : String(nextError)
      })
    } finally {
      setConnecting(false)
    }
  }

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!serviceUrlValid) {
      setAdvancedOpen(true)
      setMessage({ tone: 'error', text: 'Service URL must be a valid HTTPS URL.' })
      return
    }

    try {
      await save(config)
      setMessage({ tone: 'success', text: 'Advanced settings saved.' })
      connection.refresh()
    } catch (nextError) {
      setMessage({
        tone: 'error',
        text: nextError instanceof Error ? nextError.message : String(nextError)
      })
    }
  }

  if (loading) {
    return <SkeletonSettings />
  }

  return (
    <form
      className='at-email-plugin'
      onSubmit={(event) => {
        handleSubmit(event).catch((nextError: unknown) => {
          setMessage({
            tone: 'error',
            text: nextError instanceof Error ? nextError.message : String(nextError)
          })
        })
      }}
      style={styles.settingsShell}
    >
      <PluginInteractionStyles />
      <section style={styles.settingsContainer}>
        <section style={styles.connectionSection}>
          <div style={styles.connectionHeader}>
            <div style={styles.connectionCopy}>
              <div style={styles.sectionTitleRow}>
                <h2 style={styles.sectionTitle}>Link Account</h2>
                <div style={styles.statusInline}>
                  <span style={styles.statusLabel}>Current status</span>
                  <StatusPill tone={statusCopy.tone}>{statusCopy.label}</StatusPill>
                </div>
              </div>
              <p style={styles.bodyText}>
                Connect this Paperclip instance to AgentTeam Email at{' '}
                <a
                  href='https://www.agentteam.email'
                  target='_blank'
                  rel='noreferrer'
                  style={styles.textLink}
                >
                  agentteam.email
                </a>
                . The hosted service handles agent email provisioning, mailbox policy, and provider setup
                outside Paperclip.
              </p>
            </div>
          </div>

          <div style={styles.oauthActionRow}>
            <button
              type='button'
              onClick={() => {
                handleConnect().catch((nextError: unknown) => {
                  setMessage({
                    tone: 'error',
                    text: nextError instanceof Error ? nextError.message : String(nextError)
                  })
                })
              }}
              disabled={connecting}
              className='at-email-primary-button'
              style={
                connecting
                  ? {
                      ...styles.primaryButton,
                      cursor: 'not-allowed',
                      opacity: 0.72
                    }
                  : styles.primaryButton
              }
            >
              <LogoMark size={22} />
              <span>{connecting ? 'Connecting...' : 'Connect with AgentTeam Email'}</span>
            </button>
          </div>

          <div style={styles.resourceRow}>
            <span style={styles.resourceTitle}>Additional resources</span>
            <nav
              aria-label='AgentTeam Email resources'
              style={styles.resourceLinks}
            >
              {resourceLinks.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  target='_blank'
                  rel='noreferrer'
                  className='at-email-resource-link'
                  style={styles.resourceLink}
                >
                  <span>{link.label}</span>
                  <ArrowSquareOutIcon
                    aria-hidden='true'
                    size={13}
                    weight='bold'
                  />
                </a>
              ))}
            </nav>
          </div>
        </section>

        {connection.error ? (
          <div style={styles.messageStack}>
            <div style={styles.errorBox}>Connection status error: {connection.error.message}</div>
          </div>
        ) : null}
        {error ? (
          <div style={styles.messageStack}>
            <div style={styles.errorBox}>Settings error: {error}</div>
          </div>
        ) : null}
        {message ? (
          <div style={styles.messageStack}>
            <div style={message.tone === 'error' ? styles.errorBox : styles.infoBox}>{message.text}</div>
          </div>
        ) : null}

        <section style={styles.detailsPanel}>
          <button
            type='button'
            aria-expanded={advancedOpen}
            onClick={() => {
              setAdvancedOpen((open) => !open)
            }}
            className='at-email-disclosure-button'
            style={styles.disclosureButton}
          >
            <span>
              <strong style={styles.disclosureTitle}>Advanced self-hosting</strong>
              <span style={styles.disclosureSubtitle}>Service origin and API key secret reference</span>
            </span>
            <span
              aria-hidden='true'
              style={{
                ...styles.chevron,
                transform: advancedOpen ? 'rotate(180deg)' : 'rotate(0deg)'
              }}
            >
              <CaretDownIcon
                aria-hidden='true'
                size={16}
                weight='bold'
              />
            </span>
          </button>

          {advancedOpen ? (
            <div style={styles.advancedFields}>
              <label style={styles.fieldBlock}>
                <span style={styles.fieldLabel}>Service URL</span>
                <input
                  type='url'
                  value={config.serviceBaseUrl}
                  onChange={(event) => {
                    setConfig({ ...config, serviceBaseUrl: event.target.value })
                  }}
                  style={{
                    ...styles.input,
                    borderColor: serviceUrlValid ? uiColors.input : uiColors.destructive
                  }}
                />
                <span style={serviceUrlValid ? styles.helperText : styles.errorText}>
                  {serviceUrlValid
                    ? 'Defaults to the hosted AgentTeam Email app.'
                    : 'Enter a valid HTTPS URL.'}
                </span>
              </label>

              <label style={styles.fieldBlock}>
                <span style={styles.fieldLabel}>API key secret reference</span>
                <input
                  type='text'
                  value={config.apiKeySecretRef ?? ''}
                  onChange={(event) => {
                    setConfig({
                      ...config,
                      apiKeySecretRef: event.target.value
                    })
                  }}
                  placeholder='paperclip-secret://agentteam-email'
                  style={styles.input}
                />
                <span style={styles.helperText}>
                  Optional. Use only for self-hosted or preview setups that cannot use OAuth yet.
                </span>
              </label>

              <div style={styles.actionsRow}>
                <button
                  type='submit'
                  disabled={saving || !serviceUrlValid}
                  className='at-email-secondary-button'
                  style={
                    saving || !serviceUrlValid
                      ? {
                          ...styles.secondaryButton,
                          cursor: 'not-allowed',
                          opacity: 0.6
                        }
                      : styles.secondaryButton
                  }
                >
                  {saving ? 'Saving...' : 'Save advanced settings'}
                </button>
              </div>
            </div>
          ) : null}
        </section>
      </section>
    </form>
  )
}

export function DashboardWidget(_props: PluginWidgetProps) {
  const status = usePluginData<EmailConnectionStatus>('email-connection-status')
  const recordSyntheticCheck = usePluginAction('record-synthetic-connection-check')
  const statusCopy = connectionCopy(status.data)

  function handleCheck() {
    recordSyntheticCheck()
      .then(() => {
        status.refresh()
      })
      .catch(() => {
        status.refresh()
      })
  }

  if (status.loading) {
    return (
      <section style={styles.widgetShell}>
        <div style={{ ...styles.skeletonLine, width: '58%' }} />
        <div style={{ ...styles.skeletonLine, width: '42%' }} />
      </section>
    )
  }

  if (status.error) {
    return <section style={styles.widgetShell}>AgentTeam Email error: {status.error.message}</section>
  }

  return (
    <section style={styles.widgetShell}>
      <div style={styles.widgetHeader}>
        <LogoMark size={34} />
        <div>
          <strong style={styles.widgetTitle}>AgentTeam Email</strong>
          <p style={styles.widgetSubtitle}>{statusCopy.label}</p>
        </div>
      </div>
      <dl style={styles.widgetRows}>
        <div style={styles.widgetRow}>
          <dt style={styles.widgetTerm}>Service</dt>
          <dd style={styles.widgetValue}>{status.data?.serviceBaseUrl ?? DEFAULT_SERVICE_BASE_URL}</dd>
        </div>
        <div style={styles.widgetRow}>
          <dt style={styles.widgetTerm}>Last check</dt>
          <dd style={styles.widgetValue}>{formatDateTime(status.data?.lastConnectionCheckAt)}</dd>
        </div>
      </dl>
      <button
        type='button'
        onClick={handleCheck}
        className='at-email-widget-button'
        style={styles.widgetButton}
      >
        Check status
      </button>
    </section>
  )
}

const baseFont =
  'Geist, Satoshi, "SF Pro Display", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'

const styles = {
  settingsShell: {
    display: 'grid',
    gap: 14,
    maxWidth: 880,
    color: uiColors.foreground,
    fontFamily: baseFont
  },
  settingsContainer: {
    display: 'grid',
    border: `1px solid ${uiColors.border}`,
    borderRadius: 0,
    background: uiColors.background
  },
  connectionSection: {
    display: 'grid',
    gap: 16,
    padding: 18
  },
  connectionHeader: {
    display: 'grid',
    gap: 6,
    alignItems: 'start'
  },
  connectionCopy: {
    display: 'grid',
    gap: 6,
    minWidth: 0
  },
  sectionTitleRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10
  },
  sectionTitle: {
    margin: 0,
    maxWidth: 520,
    color: uiColors.foreground,
    fontSize: 15,
    lineHeight: 1.3,
    letterSpacing: 0,
    fontWeight: 600
  },
  bodyText: {
    margin: 0,
    maxWidth: 600,
    color: uiColors.mutedForeground,
    fontSize: 13,
    lineHeight: 1.5
  },
  textLink: {
    color: uiColors.foreground,
    fontSize: 'inherit',
    fontWeight: 500,
    textDecoration: 'underline',
    textDecorationThickness: 1,
    textUnderlineOffset: 3
  },
  statusInline: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8
  },
  statusLabel: {
    color: uiColors.mutedForeground,
    fontSize: 12,
    lineHeight: 1.4
  },
  oauthActionRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '10px 12px',
    paddingTop: 1
  },
  resourceRow: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    gap: 14,
    alignItems: 'center',
    borderTop: `1px solid ${uiColors.border}`,
    paddingTop: 14
  },
  resourceTitle: {
    color: uiColors.mutedForeground,
    fontSize: 12,
    fontWeight: 500,
    lineHeight: 1.4
  },
  resourceLinks: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '8px 14px',
    color: '#2563eb',
    fontSize: 13,
    lineHeight: 1.4
  },
  resourceLink: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    fontSize: 13,
    fontWeight: 500,
    lineHeight: 1.4,
    textDecoration: 'underline',
    textDecorationColor: 'color-mix(in srgb, currentColor 35%, transparent)',
    textDecorationThickness: 1,
    textUnderlineOffset: 3
  },
  primaryButton: {
    appearance: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    border: `1px solid ${uiColors.primary}`,
    borderRadius: 6,
    background: uiColors.primary,
    color: uiColors.primaryForeground,
    minHeight: 44,
    padding: '0 17px 0 12px',
    fontSize: 13,
    fontWeight: 650,
    cursor: 'pointer',
    transition: 'opacity 140ms ease'
  },
  messageStack: {
    display: 'grid',
    gap: 8,
    padding: '0 18px 16px'
  },
  detailsPanel: {
    borderTop: `1px solid ${uiColors.border}`
  },
  disclosureButton: {
    appearance: 'none',
    width: '100%',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
    border: 0,
    background: 'transparent',
    color: uiColors.foreground,
    padding: '14px 18px',
    textAlign: 'left',
    cursor: 'pointer'
  },
  disclosureTitle: {
    display: 'block',
    fontSize: 14,
    fontWeight: 500
  },
  disclosureSubtitle: {
    display: 'block',
    marginTop: 3,
    color: uiColors.mutedForeground,
    fontSize: 12
  },
  chevron: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 20,
    height: 20,
    color: uiColors.mutedForeground,
    transition: 'transform 180ms ease'
  },
  advancedFields: {
    display: 'grid',
    gap: 14,
    padding: '16px 18px 18px',
    borderTop: `1px solid ${uiColors.border}`
  },
  fieldBlock: {
    display: 'grid',
    gap: 7
  },
  fieldLabel: {
    color: uiColors.foreground,
    fontSize: 13,
    fontWeight: 500
  },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    minHeight: 40,
    border: `1px solid ${uiColors.input}`,
    borderRadius: 6,
    background: uiColors.background,
    color: uiColors.foreground,
    padding: '0 11px',
    fontSize: 13,
    outline: 'none'
  },
  helperText: {
    color: uiColors.mutedForeground,
    fontSize: 12,
    lineHeight: 1.4
  },
  errorText: {
    color: uiColors.destructive,
    fontSize: 12,
    lineHeight: 1.4
  },
  actionsRow: {
    display: 'flex',
    justifyContent: 'flex-end',
    paddingTop: 2
  },
  secondaryButton: {
    appearance: 'none',
    border: `1px solid ${uiColors.primary}`,
    borderRadius: 6,
    background: uiColors.primary,
    color: uiColors.primaryForeground,
    minHeight: 36,
    padding: '0 12px',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer'
  },
  infoBox: {
    border: `1px solid ${uiColors.border}`,
    borderRadius: 6,
    background: uiColors.muted,
    color: uiColors.foreground,
    padding: '10px 12px',
    fontSize: 13,
    lineHeight: 1.45
  },
  errorBox: {
    border: `1px solid ${uiColors.destructive}`,
    borderRadius: 6,
    background: uiColors.destructiveBackground,
    color: uiColors.destructive,
    padding: '10px 12px',
    fontSize: 13,
    lineHeight: 1.45
  },
  widgetShell: {
    display: 'grid',
    gap: 13,
    color: uiColors.foreground,
    fontFamily: baseFont
  },
  widgetHeader: {
    display: 'grid',
    gridTemplateColumns: '34px minmax(0, 1fr)',
    gap: 10,
    alignItems: 'center'
  },
  widgetTitle: {
    display: 'block',
    fontSize: 14,
    fontWeight: 600,
    lineHeight: 1.2
  },
  widgetSubtitle: {
    margin: '2px 0 0',
    color: uiColors.mutedForeground,
    fontSize: 12
  },
  widgetRows: {
    display: 'grid',
    gap: 8,
    margin: 0
  },
  widgetRow: {
    display: 'grid',
    gridTemplateColumns: '72px minmax(0, 1fr)',
    gap: 10
  },
  widgetTerm: {
    color: uiColors.mutedForeground,
    fontSize: 12
  },
  widgetValue: {
    margin: 0,
    color: uiColors.foreground,
    fontSize: 12,
    overflowWrap: 'anywhere'
  },
  widgetButton: {
    appearance: 'none',
    width: 'fit-content',
    border: `1px solid ${uiColors.border}`,
    borderRadius: 6,
    background: uiColors.background,
    color: uiColors.foreground,
    minHeight: 32,
    padding: '0 10px',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer'
  },
  skeletonHeader: {
    display: 'grid',
    gridTemplateColumns: '44px minmax(0, 1fr)',
    gap: 14,
    alignItems: 'center'
  },
  skeletonLogo: {
    width: 44,
    height: 44,
    borderRadius: 9,
    background: uiColors.muted
  },
  skeletonLines: {
    display: 'grid',
    gap: 9
  },
  skeletonLine: {
    height: 12,
    borderRadius: 999,
    background: uiColors.muted
  },
  skeletonPanel: {
    height: 140,
    background: uiColors.muted
  }
} satisfies Record<string, CSSProperties>
