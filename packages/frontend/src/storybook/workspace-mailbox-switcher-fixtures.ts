import type {
  WorkspaceMailboxSwitcherMailbox,
  WorkspaceMailboxSwitcherWorkspace
} from '../partials/authenticated/workspace-mailbox-switcher'

export const workspaceSwitcherWorkspaces = [
  {
    badgeLabel: 'Current',
    id: 'northstar-ops',
    name: 'Northstar Ops',
    slug: 'northstar-ops'
  }
] satisfies WorkspaceMailboxSwitcherWorkspace[]

export const multiWorkspaceSwitcherWorkspaces = [
  ...workspaceSwitcherWorkspaces,
  {
    id: 'partner-mail-ops',
    name: 'Partner Mail Ops',
    slug: 'partner-mail-ops'
  },
  {
    disabled: true,
    id: 'archive-lab',
    name: 'Archive Lab',
    slug: 'archive-lab'
  }
] satisfies WorkspaceMailboxSwitcherWorkspace[]

export const workspaceSwitcherMailboxes = [
  {
    address: 'support@agentteam.example',
    badgeLabel: 'Default',
    id: 'support',
    name: 'Support queue',
    unreadLabel: '12'
  },
  {
    address: 'routing@agentteam.example',
    id: 'routing',
    name: 'Routing checks',
    unreadLabel: '3'
  },
  {
    address: 'inbound-replay@agentteam.example',
    id: 'inbound-replay',
    name: 'Inbound replay',
    status: 'attention',
    statusLabel: 'Retry queue needs review'
  },
  {
    address: 'billing@agentteam.example',
    id: 'billing',
    name: 'Billing intake'
  }
] satisfies WorkspaceMailboxSwitcherMailbox[]

export const longWorkspaceSwitcherMailboxes = [
  ...workspaceSwitcherMailboxes,
  {
    address: 'cloudflare-workers@agentteam.example',
    id: 'cloudflare-workers',
    name: 'Cloudflare workers',
    unreadLabel: '8'
  },
  {
    address: 'smtp-relay@agentteam.example',
    id: 'smtp-relay',
    name: 'SMTP relay'
  },
  {
    address: 'abuse@agentteam.example',
    id: 'abuse',
    name: 'Abuse review',
    status: 'attention',
    statusLabel: 'Policy alerts open',
    unreadLabel: '5'
  },
  {
    address: 'postmaster@agentteam.example',
    id: 'postmaster',
    name: 'Postmaster'
  },
  {
    address: 'deliverability@agentteam.example',
    id: 'deliverability',
    name: 'Deliverability'
  },
  {
    address: 'customer-success@agentteam.example',
    id: 'customer-success',
    name: 'Customer success'
  },
  {
    address: 'agent-runs@agentteam.example',
    id: 'agent-runs',
    name: 'Agent runs'
  },
  {
    address: 'notifications@agentteam.example',
    disabled: true,
    disabledReason: 'Provisioning mail route',
    id: 'notifications',
    name: 'Notifications'
  }
] satisfies WorkspaceMailboxSwitcherMailbox[]
