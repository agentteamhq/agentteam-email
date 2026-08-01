import { storyAuthClient } from 'src/storybook/auth-client-fixtures'
import { storyAuthenticatedUser, storyPublicEnv } from 'src/storybook/screen-fixtures'
import { AdminAuditLogsScreen } from 'src/screens/admin/admin-audit-logs-screen'
import { AdminAuditLogsStoryFrame } from 'src/storybook/admin-audit-logs-story-frame'
import {
  adminAuditLogsDefaultList,
  adminAuditLogsSecondPageList
} from 'src/storybook/admin-audit-logs-fixtures'
import { expect, userEvent, within } from 'storybook/test'
import type { AdminAuditLogList } from '@main/backend'
import type { Meta, StoryObj } from '@storybook/react-vite'

const meta = {
  title: 'Screens/Admin/Audit Logs/Integration',
  component: AdminAuditLogsScreen,
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta<typeof AdminAuditLogsScreen>

export default meta

type Story = StoryObj<typeof meta>

const routeState = {
  redirectTo: '/admin/setup/',
  setupRequired: false,
  shouldNotFound: false,
  user: storyAuthenticatedUser
} as const

const baseArgs = {
  authClient: storyAuthClient,
  onSearchChange: () => {},
  publicEnv: storyPublicEnv,
  routeSearch: {
    page: 1,
    pageSize: 25,
    severity: 'all',
    status: 'all'
  },
  routeState,
  sessionCleanupEnabled: false
} as const

/**
 * Gates the second audit log page so the story can observe the transition window. Storybook
 * runs loaders once per story run, so the gate is fresh on every re-run; a module-scope
 * promise would stay resolved and make the transition assertions vacuous.
 */
function createStoryAuditLogPageTransition() {
  let releaseSecondPage = () => {}
  const secondPageResolved = new Promise<void>((resolve) => {
    releaseSecondPage = resolve
  })

  return {
    listForSearch: async (search: { page: number }): Promise<AdminAuditLogList> => {
      if (search.page === 1) {
        return adminAuditLogsDefaultList
      }

      await secondPageResolved
      return adminAuditLogsSecondPageList
    },
    resolveSecondPage: () => {
      releaseSecondPage()
    }
  }
}

type StoryAuditLogPageTransition = ReturnType<typeof createStoryAuditLogPageTransition>

function loadStoryAuditLogPageTransition() {
  return { pageTransition: createStoryAuditLogPageTransition() }
}

function readLoadedPageTransition(loaded: unknown): StoryAuditLogPageTransition {
  return (loaded as { pageTransition: StoryAuditLogPageTransition }).pageTransition
}

/**
 * Regression coverage for admin audit log navigation continuity. Every filter and page
 * change is a route navigation, so the rendered table must keep its last page visible
 * until the next page resolves instead of flashing the cold-load skeleton.
 */
export const PageTransitionKeepsRenderedTable: Story = {
  args: baseArgs,
  name: 'Route search page transition keeps rendered table',
  loaders: [loadStoryAuditLogPageTransition],
  render: (args, { loaded }) => {
    const { onSearchChange, routeSearch, ...frameArgs } = args

    return (
      <AdminAuditLogsStoryFrame
        {...frameArgs}
        auditLogListForSearch={readLoadedPageTransition(loaded).listForSearch}
        routeSearch={routeSearch}
      />
    )
  },
  play: async ({ canvasElement, loaded }) => {
    const canvas = within(canvasElement)

    await expect(await canvas.findByText('sign-in/email')).toBeInTheDocument()

    await userEvent.click(await canvas.findByRole('button', { name: 'Next' }))
    await flushPendingWork()

    // While page two resolves, page one stays rendered and nothing falls back to a skeleton.
    await expect(await canvas.findByText('sign-in/email')).toBeInTheDocument()
    await expect(canvas.queryByText('agent_mail.domain.provisioned')).not.toBeInTheDocument()
    await expect(canvasElement.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(0)

    readLoadedPageTransition(loaded).resolveSecondPage()

    // The replacement page still arrives and replaces the placeholder.
    await expect(await canvas.findByText('agent_mail.domain.provisioned')).toBeInTheDocument()
    await expect(canvas.queryByText('sign-in/email')).not.toBeInTheDocument()
  }
}

/**
 * Lets any already-settled request propagate into the rendered table, so the
 * transition-window assertions below fail loudly instead of passing on a race.
 */
async function flushPendingWork() {
  await new Promise((resolve) => {
    setTimeout(resolve, 50)
  })
}
