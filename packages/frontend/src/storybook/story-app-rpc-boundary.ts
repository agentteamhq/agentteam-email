import { agentAccessActionableState } from './agent-access-fixtures'
import { integrationsEmptyView } from './integrations-fixtures'
import { mailWorkspaceReadyView } from './mail-workspace-fixtures'
import { storyAuthenticatedUser } from './screen-fixtures'
import type { AgentMailAdminNavigation, AgentMailAdminView, AgentMailWebWorkspace } from '@main/backend'

/**
 * Story-side session identity for the mocked auth boundary. The authenticated route
 * loader parses the session user id as a UUIDv7, so the fixture must be a real one.
 */
const STORY_SESSION_USER_ID = '01920000-0000-7000-8000-000000000001'

const STORY_MAILBOX_ADMIN_NAVIGATION = {
  allowedSections: ['accounts', 'groups', 'agents']
} satisfies AgentMailAdminNavigation

const STORY_CLOUDFLARE_STATUS = {
  connections: [],
  grants: []
}

/**
 * Story-side answer for the mailbox administration RPC. `view` answers with the backend
 * view payload; `failure` answers with the backend's HTTP error contract so a story can
 * stage the surface's error state through the same client code the app runs. A pending
 * surface is staged by returning a promise that never resolves.
 */
export type StoryAppRpcMailboxAdminResult =
  | {
      failure: {
        message: string
        status: number
      }
    }
  | {
      view: AgentMailAdminView
    }

export interface StoryAppRpcBoundaryFixtures {
  /** Resolves the mailbox administration view per request so section, search, page, and status keys can return different data. */
  mailboxAdminForRequest?: (
    url: URL
  ) => StoryAppRpcMailboxAdminResult | Promise<StoryAppRpcMailboxAdminResult>
  /** Overrides the sections the mailbox administration navigation RPC reports as allowed. */
  mailboxAdminNavigation?: AgentMailAdminNavigation
  /** Resolves the workspace per request so folder transitions can return different data. */
  workspaceForRequest?: (url: URL) => AgentMailWebWorkspace | Promise<AgentMailWebWorkspace>
}

/** A mocked `/rpc/*` answer: the JSON body plus the status the boundary responds with. */
interface StoryAppRpcAnswer {
  body: unknown
  status: number
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
    const answer = await storyAppRpcAnswer(url)

    if (!answer) {
      return forwardFetch(input, init)
    }

    return new Response(JSON.stringify(answer.body), {
      headers: { 'content-type': 'application/json' },
      status: answer.status
    })
  }
}

async function storyAppRpcAnswer(url: URL): Promise<StoryAppRpcAnswer | undefined> {
  if (!activeToken) {
    return undefined
  }

  const { pathname } = url

  if (pathname === '/rpc/auth/api/get-session') {
    return storyAppRpcOk({
      session: {
        id: 'story-session-id',
        userId: STORY_SESSION_USER_ID
      },
      user: {
        ...storyAuthenticatedUser,
        id: STORY_SESSION_USER_ID
      }
    })
  }

  if (pathname === '/rpc/mail/workspace') {
    const workspace = (await activeFixtures.workspaceForRequest?.(url)) ?? mailWorkspaceReadyView

    return storyAppRpcOk(storyWorkspaceForRequest(workspace, url))
  }

  if (pathname === '/rpc/mail/admin') {
    return storyMailboxAdminAnswer(await activeFixtures.mailboxAdminForRequest?.(url))
  }

  if (pathname === '/rpc/mail/admin/navigation') {
    return storyAppRpcOk(activeFixtures.mailboxAdminNavigation ?? STORY_MAILBOX_ADMIN_NAVIGATION)
  }

  if (pathname === '/rpc/agent-access') {
    return storyAppRpcOk(agentAccessActionableState.view)
  }

  if (pathname === '/rpc/integrations') {
    return storyAppRpcOk(integrationsEmptyView)
  }

  if (pathname === '/rpc/cloudflare/status') {
    return storyAppRpcOk(STORY_CLOUDFLARE_STATUS)
  }

  if (pathname.startsWith('/rpc/auth/api/')) {
    return storyAppRpcOk(null)
  }

  return undefined
}

function storyAppRpcOk(body: unknown): StoryAppRpcAnswer {
  return { body, status: 200 }
}

/**
 * Answers the mailbox administration RPC. A story that does not stage the surface leaves
 * the request unanswered so it falls through, which keeps the existing shell stories
 * unchanged; the mailbox administration query only runs once a story selects a section.
 */
function storyMailboxAdminAnswer(
  result: StoryAppRpcMailboxAdminResult | undefined
): StoryAppRpcAnswer | undefined {
  if (!result) {
    return undefined
  }

  return 'failure' in result
    ? { body: { message: result.failure.message }, status: result.failure.status }
    : storyAppRpcOk(result.view)
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
