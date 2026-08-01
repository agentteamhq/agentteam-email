import type { createFrontendRouter } from '../router'

type StoryShellRouter = ReturnType<typeof createFrontendRouter>

let mountedStoryShellRouter: StoryShellRouter | null = null

export function setMountedStoryShellRouter(router: StoryShellRouter) {
  mountedStoryShellRouter = router
}

/**
 * Exposes the mounted story router so interaction tests can drive client-side navigation
 * the product performs but a story cannot click, such as navigating while a modal compose
 * sheet holds focus. This drives the same router the app drives; it does not replace any
 * product behaviour.
 */
export function getMountedStoryShellRouter(): StoryShellRouter {
  if (!mountedStoryShellRouter) {
    throw new Error('No authenticated shell story router is mounted.')
  }

  return mountedStoryShellRouter
}
