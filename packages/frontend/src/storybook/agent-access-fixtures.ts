import { agentMailCapabilityCatalog } from '@main/db/agent-mail-permission-schema'

import type { AgentAccessSettingsState } from '../partials/authenticated/settings-dialog'
import type { AgentMailTrialClaim } from '../lib/agent-access-rpc'
import type { AgentAccessView } from '@main/backend'

const agentAccessCapabilityCatalog = {
  ...agentMailCapabilityCatalog
} satisfies AgentAccessView['capabilityCatalog']

const storyReviewerActor = {
  id: 'usr_story_owner',
  type: 'user'
} as const

const noAgentAccessAllowedActions = {
  denyApproval: false,
  reviewApproval: false,
  revokeAgent: false,
  revokeCapabilityGrant: false
} satisfies AgentAccessView['allowedActions']

const manageAgentAccessAllowedActions = {
  denyApproval: true,
  reviewApproval: true,
  revokeAgent: true,
  revokeCapabilityGrant: true
} satisfies AgentAccessView['allowedActions']

export const agentAccessLoadingState = {
  view: null
} satisfies AgentAccessSettingsState

export const agentAccessErrorState = {
  message: 'Agent Access request failed with HTTP 403.',
  readOnly: true,
  view: null
} satisfies AgentAccessSettingsState

export const agentAccessEmptyState = {
  readOnly: true,
  view: {
    agents: [],
    allowedActions: noAgentAccessAllowedActions,
    approvals: [],
    capabilityCatalog: agentAccessCapabilityCatalog,
    grants: [],
    hosts: [],
    organizationId: 'org-story',
    state: 'empty'
  }
} satisfies AgentAccessSettingsState

export const agentAccessEnrollmentCreatedState = {
  ...agentAccessEmptyState,
  createdAgentEnrollment: {
    enrollmentToken: 'enroll_AAAAAAAAAAAAAAAA',
    enrollmentTokenExpiresAt: '2026-06-22T12:30:00.000Z',
    grantExpiresAt: '2026-07-22T12:30:00.000Z',
    hostId: 'host_01JZMAILAGENT',
    mailboxGrantCount: 4,
    name: 'Research Agent',
    status: 'pending_enrollment',
    systemPermissionCount: 1
  },
  readOnly: true
} satisfies AgentAccessSettingsState

export const agentAccessActiveState = {
  readOnly: true,
  view: {
    agents: [
      {
        activatedAt: '2026-06-22T15:05:00.000Z',
        activeCapabilityCount: 3,
        canRevoke: false,
        createdAt: '2026-06-22T15:00:00.000Z',
        expiresAt: null,
        hostId: 'host-laptop',
        id: 'agent-research',
        lastUsedAt: '2026-06-22T16:05:00.000Z',
        mode: 'delegated',
        name: 'Research Agent',
        organizationId: 'org-story',
        pendingCapabilityCount: 0,
        status: 'active'
      }
    ],
    allowedActions: noAgentAccessAllowedActions,
    approvals: [],
    capabilityCatalog: agentAccessCapabilityCatalog,
    grants: [
      {
        agentId: 'agent-research',
        canRevoke: false,
        capability: 'email.message.read',
        constraints: {
          mailboxAddress: 'research@agentteam.example',
          organizationId: 'org-story'
        },
        createdAt: '2026-06-22T15:05:00.000Z',
        deniedBy: null,
        deniedByUser: false,
        expiresAt: '2026-06-29T15:05:00.000Z',
        grantedBy: storyReviewerActor,
        grantedByUser: true,
        id: 'grant-read',
        organizationId: 'org-story',
        reason: null,
        status: 'active'
      },
      {
        agentId: 'agent-research',
        canRevoke: false,
        capability: 'email.message.send',
        constraints: {
          mailboxAddress: 'research@agentteam.example',
          organizationId: 'org-story'
        },
        createdAt: '2026-06-22T15:06:00.000Z',
        deniedBy: null,
        deniedByUser: false,
        expiresAt: '2026-06-23T15:06:00.000Z',
        grantedBy: storyReviewerActor,
        grantedByUser: true,
        id: 'grant-send',
        organizationId: 'org-story',
        reason: null,
        status: 'active'
      }
    ],
    hosts: [
      {
        activatedAt: '2026-06-22T15:00:00.000Z',
        agentCount: 1,
        createdAt: '2026-06-22T14:55:00.000Z',
        defaultCapabilities: [],
        expiresAt: null,
        id: 'host-laptop',
        lastUsedAt: '2026-06-22T16:05:00.000Z',
        name: 'Laptop host',
        organizationId: 'org-story',
        status: 'active'
      }
    ],
    organizationId: 'org-story',
    state: 'ready'
  }
} satisfies AgentAccessSettingsState

export const agentAccessPendingApprovalState = {
  ...agentAccessActiveState,
  view: {
    ...agentAccessActiveState.view,
    agents: [
      {
        ...agentAccessActiveState.view.agents[0],
        pendingCapabilityCount: 1
      }
    ],
    approvals: [
      {
        agentId: 'agent-research',
        bindingMessage: 'Approve send access for Research Agent',
        canDeny: false,
        canReview: false,
        capabilityRequests: [
          {
            approvalStrength: 'webauthn',
            capability: 'email.message.send',
            constraints: {
              mailboxAddress: 'research@agentteam.example',
              organizationId: 'org-story'
            },
            reason: 'Requested from CLI'
          }
        ],
        capabilities: ['email.message.send'],
        createdAt: '2026-06-22T16:10:00.000Z',
        expiresAt: '2026-06-22T16:15:00.000Z',
        hostId: 'host-laptop',
        id: 'approval-send',
        method: 'device_authorization',
        status: 'pending'
      }
    ],
    grants: [
      ...agentAccessActiveState.view.grants,
      {
        agentId: 'agent-research',
        canRevoke: false,
        capability: 'email.message.manage',
        constraints: {
          mailboxAddress: 'research@agentteam.example',
          organizationId: 'org-story'
        },
        createdAt: '2026-06-22T16:10:00.000Z',
        deniedBy: null,
        deniedByUser: false,
        expiresAt: null,
        grantedBy: null,
        grantedByUser: false,
        id: 'grant-manage-pending',
        organizationId: 'org-story',
        reason: 'Requested from CLI',
        status: 'pending'
      }
    ]
  }
} satisfies AgentAccessSettingsState

export const agentAccessActionableState = {
  ...agentAccessPendingApprovalState,
  readOnly: false,
  view: {
    ...agentAccessPendingApprovalState.view,
    allowedActions: manageAgentAccessAllowedActions,
    agents: agentAccessPendingApprovalState.view.agents.map((agent) => ({
      ...agent,
      canRevoke: true
    })),
    approvals: agentAccessPendingApprovalState.view.approvals.map((approval) => ({
      ...approval,
      canDeny: approval.status === 'pending',
      canReview: approval.status === 'pending'
    })),
    grants: agentAccessPendingApprovalState.view.grants.map((grant) => ({
      ...grant,
      canRevoke: grant.status === 'active' || grant.status === 'pending'
    }))
  }
} satisfies AgentAccessSettingsState

export const agentAccessBusyApprovalState = {
  ...agentAccessActionableState,
  busy: true,
  message: 'Approval update is still pending.'
} satisfies AgentAccessSettingsState

export const agentTrialClaimView = {
  agent: {
    id: 'agt_storytrial',
    name: 'Research Trial Agent',
    status: 'active'
  },
  capabilities: [
    'email.status',
    'email.message.list',
    'email.message.read',
    'email.message.search',
    'email.message.create_draft',
    'email.message.send',
    'email.message.reply'
  ],
  claim: {
    expires_at: '2026-06-23T18:00:00.000Z',
    status: 'pending'
  },
  mailbox: {
    address: 'trial-research@agentteam.example'
  },
  organization_id: 'org_story',
  post_claim_capabilities: ['email.status', 'email.message.read', 'email.message.send'],
  target_organizations: [
    {
      id: 'org_story',
      name: 'Research Lab',
      slug: 'research-lab'
    }
  ],
  trial_id: 'trial_story'
} satisfies AgentMailTrialClaim

export const agentAccessDeniedExpiredApprovalState = {
  ...agentAccessActiveState,
  view: {
    ...agentAccessActiveState.view,
    approvals: [
      {
        agentId: 'agent-research',
        bindingMessage: 'Send access was denied',
        canDeny: false,
        canReview: false,
        capabilityRequests: [
          {
            approvalStrength: 'webauthn',
            capability: 'email.message.send',
            constraints: {
              mailboxAddress: 'research@agentteam.example',
              organizationId: 'org-story'
            },
            reason: 'Denied by workspace owner'
          }
        ],
        capabilities: ['email.message.send'],
        createdAt: '2026-06-22T16:10:00.000Z',
        expiresAt: '2026-06-22T16:15:00.000Z',
        hostId: 'host-laptop',
        id: 'approval-denied',
        method: 'device_authorization',
        status: 'denied'
      },
      {
        agentId: 'agent-research',
        bindingMessage: 'Manage messages request expired',
        canDeny: false,
        canReview: false,
        capabilityRequests: [
          {
            approvalStrength: 'webauthn',
            capability: 'email.message.manage',
            constraints: {
              mailboxAddress: 'research@agentteam.example',
              organizationId: 'org-story'
            },
            reason: 'Approval window elapsed'
          }
        ],
        capabilities: ['email.message.manage'],
        createdAt: '2026-06-21T16:10:00.000Z',
        expiresAt: '2026-06-21T16:15:00.000Z',
        hostId: 'host-laptop',
        id: 'approval-expired',
        method: 'device_authorization',
        status: 'expired'
      }
    ]
  }
} satisfies AgentAccessSettingsState

export const agentAccessRevokedExpiredState = {
  readOnly: true,
  view: {
    agents: [
      {
        activatedAt: '2026-06-12T15:05:00.000Z',
        activeCapabilityCount: 0,
        canRevoke: false,
        createdAt: '2026-06-12T15:00:00.000Z',
        expiresAt: '2026-06-20T15:05:00.000Z',
        hostId: 'host-retired',
        id: 'agent-retired',
        lastUsedAt: '2026-06-14T12:00:00.000Z',
        mode: 'autonomous',
        name: 'Retired Trial Agent',
        organizationId: 'org-story',
        pendingCapabilityCount: 0,
        status: 'expired'
      },
      {
        activatedAt: '2026-06-10T15:05:00.000Z',
        activeCapabilityCount: 0,
        canRevoke: false,
        createdAt: '2026-06-10T15:00:00.000Z',
        expiresAt: null,
        hostId: 'host-retired',
        id: 'agent-revoked',
        lastUsedAt: '2026-06-12T12:00:00.000Z',
        mode: 'delegated',
        name: 'Revoked Writer',
        organizationId: 'org-story',
        pendingCapabilityCount: 0,
        status: 'revoked'
      }
    ],
    allowedActions: noAgentAccessAllowedActions,
    approvals: [],
    capabilityCatalog: agentAccessCapabilityCatalog,
    grants: [
      {
        agentId: 'agent-revoked',
        canRevoke: false,
        capability: 'email.message.send',
        constraints: {
          mailboxAddress: 'ops@agentteam.example',
          organizationId: 'org-story'
        },
        createdAt: '2026-06-10T15:10:00.000Z',
        deniedBy: null,
        deniedByUser: false,
        expiresAt: null,
        grantedBy: storyReviewerActor,
        grantedByUser: true,
        id: 'grant-revoked',
        organizationId: 'org-story',
        reason: 'Owner revoked access',
        status: 'revoked'
      }
    ],
    hosts: [
      {
        activatedAt: '2026-06-10T15:00:00.000Z',
        agentCount: 2,
        createdAt: '2026-06-10T14:55:00.000Z',
        defaultCapabilities: [],
        expiresAt: null,
        id: 'host-retired',
        lastUsedAt: '2026-06-14T12:00:00.000Z',
        name: 'Retired host',
        organizationId: 'org-story',
        status: 'revoked'
      }
    ],
    organizationId: 'org-story',
    state: 'ready'
  }
} satisfies AgentAccessSettingsState

export const agentAccessClaimedState = {
  readOnly: true,
  view: {
    agents: [
      {
        activatedAt: '2026-06-22T10:00:00.000Z',
        activeCapabilityCount: 3,
        canRevoke: false,
        createdAt: '2026-06-22T09:55:00.000Z',
        expiresAt: null,
        hostId: 'host-trial-claimed',
        id: 'agent-claimed-trial',
        lastUsedAt: '2026-06-22T17:30:00.000Z',
        mode: 'autonomous',
        name: 'Claimed Trial Agent',
        organizationId: 'org-story',
        pendingCapabilityCount: 0,
        status: 'claimed'
      }
    ],
    allowedActions: noAgentAccessAllowedActions,
    approvals: [],
    capabilityCatalog: agentAccessCapabilityCatalog,
    grants: [
      {
        agentId: 'agent-claimed-trial',
        canRevoke: false,
        capability: 'email.status',
        constraints: {
          organizationId: 'org-story'
        },
        createdAt: '2026-06-22T10:00:00.000Z',
        deniedBy: null,
        deniedByUser: false,
        expiresAt: null,
        grantedBy: storyReviewerActor,
        grantedByUser: true,
        id: 'grant-claimed-status',
        organizationId: 'org-story',
        reason: 'Autonomous trial was claimed by the workspace owner.',
        status: 'active'
      },
      {
        agentId: 'agent-claimed-trial',
        canRevoke: false,
        capability: 'email.message.read',
        constraints: {
          mailboxAddress: 'trial-claimed@agentteam.example',
          organizationId: 'org-story'
        },
        createdAt: '2026-06-22T10:00:00.000Z',
        deniedBy: null,
        deniedByUser: false,
        expiresAt: null,
        grantedBy: storyReviewerActor,
        grantedByUser: true,
        id: 'grant-claimed-read',
        organizationId: 'org-story',
        reason: 'Autonomous trial was claimed by the workspace owner.',
        status: 'active'
      },
      {
        agentId: 'agent-claimed-trial',
        canRevoke: false,
        capability: 'email.message.send',
        constraints: {
          mailboxAddress: 'trial-claimed@agentteam.example',
          organizationId: 'org-story'
        },
        createdAt: '2026-06-22T10:00:00.000Z',
        deniedBy: null,
        deniedByUser: false,
        expiresAt: '2026-06-29T10:00:00.000Z',
        grantedBy: storyReviewerActor,
        grantedByUser: true,
        id: 'grant-claimed-send',
        organizationId: 'org-story',
        reason: 'Autonomous trial was claimed by the workspace owner.',
        status: 'active'
      }
    ],
    hosts: [
      {
        activatedAt: '2026-06-22T09:55:00.000Z',
        agentCount: 1,
        createdAt: '2026-06-22T09:50:00.000Z',
        defaultCapabilities: [],
        expiresAt: null,
        id: 'host-trial-claimed',
        lastUsedAt: '2026-06-22T17:30:00.000Z',
        name: 'Claimed trial host',
        organizationId: 'org-story',
        status: 'active'
      }
    ],
    organizationId: 'org-story',
    state: 'ready'
  }
} satisfies AgentAccessSettingsState

export const agentAccessConstraintDetailsState = {
  ...agentAccessActiveState,
  view: {
    ...agentAccessActiveState.view,
    approvals: [
      {
        agentId: 'agent-research',
        bindingMessage: 'Approve constrained draft access',
        canDeny: false,
        canReview: false,
        capabilityRequests: [
          {
            approvalStrength: 'session',
            capability: 'email.message.create_draft',
            constraints: {
              folder: 'Drafts',
              mailboxAddress: 'research@agentteam.example',
              maxDailyMessages: 25,
              organizationId: 'org-story'
            },
            reason: 'Draft-only workspace test'
          }
        ],
        capabilities: ['email.message.create_draft'],
        createdAt: '2026-06-22T16:20:00.000Z',
        expiresAt: '2026-06-22T16:25:00.000Z',
        hostId: 'host-laptop',
        id: 'approval-constrained-draft',
        method: 'device_authorization',
        status: 'pending'
      }
    ],
    grants: [
      ...agentAccessActiveState.view.grants,
      {
        agentId: 'agent-research',
        canRevoke: false,
        capability: 'email.message.create_draft',
        constraints: {
          folder: 'Drafts',
          mailboxAddress: 'research@agentteam.example',
          maxDailyMessages: 25,
          organizationId: 'org-story'
        },
        createdAt: '2026-06-22T16:20:00.000Z',
        deniedBy: null,
        deniedByUser: false,
        expiresAt: '2026-06-29T16:20:00.000Z',
        grantedBy: storyReviewerActor,
        grantedByUser: true,
        id: 'grant-draft-constrained',
        organizationId: 'org-story',
        reason: 'Draft-only workspace test',
        status: 'active'
      }
    ]
  }
} satisfies AgentAccessSettingsState

export const agentAccessDenseState = {
  readOnly: true,
  view: {
    ...agentAccessActiveState.view,
    agents: Array.from({ length: 8 }, (_, index) => ({
      ...agentAccessActiveState.view.agents[0],
      activeCapabilityCount: 2 + index,
      id: `agent-${index + 1}`,
      name: `Mailbox Agent ${index + 1}`
    })),
    hosts: [
      {
        ...agentAccessActiveState.view.hosts[0],
        agentCount: 8
      }
    ]
  }
} satisfies AgentAccessSettingsState
