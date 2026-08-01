import { agentAccessActionableState } from './agent-access-fixtures'
import { integrationsEmptyView } from './integrations-fixtures'
import { mailWorkspaceReadyView } from './mail-workspace-fixtures'
import { storyAuthenticatedUser } from './screen-fixtures'
import type { AgentMailWebWorkspace } from '@main/backend'

/**
 * Story-side session identity for the mocked auth boundary. The authenticated route
 * loader parses the session user id as a UUIDv7, so the fixture must be a real one.
 */
const STORY_SESSION_USER_ID = '01920000-0000-7000-8000-000000000001'

const STORY_MAILBOX_ADMIN_NAVIGATION = {
  allowedSections: ['accounts', 'groups', 'agents']
}

const STORY_CLOUDFLARE_STATUS = {
  connections: [],
  grants: []
}

export interface StoryAppRpcBoundaryFixtures {
  /** Resolves the workspace per request so folder transitions can return different data. */
  workspaceForRequest?: (url: URL) => AgentMailWebWorkspace | Promise<AgentMailWebWorkspace>
}

/** Identifies the frame that armed the boundary, so a stale frame cannot disarm a live one. */
export type StoryAppRpcBoundaryToken = { readonly id: symbol }

let activeFixtures: StoryAppRpcBoundaryFixtures = {}
let activeToken: StoryAppRpcBoundaryToken | null = null
let originalFetch: typeof globalThis.fetch | null = null

/**
 * Mocks the app's HTTP boundary for route-level stories.
 *
 * Stories that mount the real router cannot inject loader props, so the browser session
 * and `/rpc/*` reads are mocked at `fetch` — the same boundary the production RPC client
 * and Better Auth client already use. Everything above that boundary stays production
 * code: route matching, loaders, the shell, and the controller.
 *
 * The `fetch` stub is installed once per preview document and forwards every unmatched
 * request to the real `fetch`. It stays installed because the Better Auth client captures
 * `globalThis.fetch` when it is created, but it only answers requests while a shell story
 * frame has it armed. Once that frame unmounts the boundary is disarmed and every request
 * falls through again, so a story never inherits the previous story's fixtures.
 */
export function createStoryAppRpcBoundaryToken(): StoryAppRpcBoundaryToken {
  return { id: Symbol('story-app-rpc-boundary') }
}

export function armStoryAppRpcBoundary(
  token: StoryAppRpcBoundaryToken,
  fixtures: StoryAppRpcBoundaryFixtures
) {
  activeFixtures = fixtures
  activeToken = token
}

export function disarmStoryAppRpcBoundary(token: StoryAppRpcBoundaryToken) {
  if (activeToken !== token) {
    return
  }

  activeFixtures = {}
  activeToken = null
}

/**
 * Installs the boundary. This runs at module scope, before the Better Auth client module
 * is evaluated, because that client captures `globalThis.fetch` as its `customFetchImpl`
 * when it is created. `.storybook/preview.tsx` imports this module first for that reason.
 */
function installStoryAppRpcBoundary() {
  if (originalFetch) {
    return
  }

  originalFetch = globalThis.fetch.bind(globalThis)
  const forwardFetch = originalFetch

  // eslint-disable-next-line no-restricted-syntax -- Storybook harness: the Better Auth client captures `globalThis.fetch` when it is created, so the story boundary must replace it before that module is evaluated.
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      globalThis.location.origin
    )
    const body = await storyAppRpcBody(url)

    if (body === undefined) {
      return forwardFetch(input, init)
    }

    return new Response(JSON.stringify(body), {
      headers: { 'content-type': 'application/json' },
      status: 200
    })
  }
}

async function storyAppRpcBody(url: URL): Promise<unknown> {
  if (!activeToken) {
    return undefined
  }

  const { pathname } = url

  if (pathname === '/rpc/auth/api/get-session') {
    return {
      session: {
        id: 'story-session-id',
        userId: STORY_SESSION_USER_ID
      },
      user: {
        ...storyAuthenticatedUser,
        id: STORY_SESSION_USER_ID
      }
    }
  }

  if (pathname === '/rpc/mail/workspace') {
    const workspace = (await activeFixtures.workspaceForRequest?.(url)) ?? mailWorkspaceReadyView

    return storyWorkspaceForRequest(workspace, url)
  }

  if (pathname === '/rpc/mail/admin/navigation') {
    return STORY_MAILBOX_ADMIN_NAVIGATION
  }

  if (pathname === '/rpc/agent-access') {
    return agentAccessActionableState.view
  }

  if (pathname === '/rpc/integrations') {
    return integrationsEmptyView
  }

  if (pathname === '/rpc/cloudflare/status') {
    return STORY_CLOUDFLARE_STATUS
  }

  if (pathname.startsWith('/rpc/auth/api/')) {
    return null
  }

  return undefined
}

/**
 * Echoes the requested account and folder back in the workspace, the way the RPC route
 * does, so the active mailbox and folder vary with the route search instead of being
 * pinned to whatever the fixture happens to declare.
 */
function storyWorkspaceForRequest(workspace: AgentMailWebWorkspace, url: URL): AgentMailWebWorkspace {
  const requestedAccountId = url.searchParams.get('accountId')
  const requestedFolderId = url.searchParams.get('folderId')
  const requestedMessageId = url.searchParams.get('messageId')

  return {
    ...workspace,
    activeAccountId: requestedAccountId ?? workspace.activeAccountId,
    activeFolderId: requestedFolderId ?? workspace.activeFolderId,
    selectedMessage:
      requestedMessageId && workspace.selectedMessage?.id !== requestedMessageId
        ? null
        : workspace.selectedMessage
  }
}

// eslint-disable-next-line no-restricted-syntax -- Storybook harness entrypoint: `.storybook/preview.tsx` imports this module first so the boundary is installed before the Better Auth client module captures `globalThis.fetch`.
installStoryAppRpcBoundary()
