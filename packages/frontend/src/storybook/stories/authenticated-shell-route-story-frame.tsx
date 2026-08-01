import * as React from 'react'
import { RouterProvider, createMemoryHistory } from '@tanstack/react-router'

import { createFrontendRouter } from '../../router'
import { getStoryPublicEnv } from '../screen-fixtures'
import { setMountedStoryShellRouter } from '../story-shell-router'
import {
  armStoryAppRpcBoundary,
  createStoryAppRpcBoundaryToken,
  disarmStoryAppRpcBoundary
} from '../story-app-rpc-boundary'
import type { StoryAppRpcBoundaryFixtures } from '../story-app-rpc-boundary'

export interface AuthenticatedShellRouteStoryFrameProps extends StoryAppRpcBoundaryFixtures {
  initialPath?: string
}

/**
 * Renders the real authenticated route tree so `Screens/*` stories exercise the shipped
 * `_authenticated/_shell` layout route: its loader, its settings-open/section derivation,
 * and the single `DashboardMailController` it mounts across `/dashboard/`, `/settings/`,
 * `/settings/$section/`, and `/organization/$section/`.
 *
 * Only the app's HTTP boundary is mocked. Route matching, loaders, shell derivation, and
 * controller state stay under their production owners.
 */
export function AuthenticatedShellRouteStoryFrame({
  initialPath = '/dashboard/',
  ...fixtures
}: AuthenticatedShellRouteStoryFrameProps) {
  const [frameState] = React.useState(() => {
    // The RPC boundary and the document-shell suppression must both be in place before the
    // router runs its first load, which happens before effects.
    const boundaryToken = createStoryAppRpcBoundaryToken()
    armStoryAppRpcBoundary(boundaryToken, fixtures)

    const router = createFrontendRouter({
      history: createMemoryHistory({ initialEntries: [initialPath] }),
      publicEnv: getStoryPublicEnv()
    })

    setMountedStoryShellRouter(router)

    return {
      boundaryToken,
      fixtures,
      releaseDocumentShell: suppressRouterDocumentShell(router),
      router
    }
  })

  React.useEffect(() => {
    // Re-arm so this frame owns the boundary again if another frame armed it in between.
    armStoryAppRpcBoundary(frameState.boundaryToken, frameState.fixtures)

    return () => {
      disarmStoryAppRpcBoundary(frameState.boundaryToken)
      frameState.releaseDocumentShell()
    }
  }, [frameState])

  return <RouterProvider router={frameState.router} />
}

let documentShellSuppressionCount = 0
let capturedDocumentShellComponent: unknown

/**
 * The root route is a module singleton shared by every router, and its shell component
 * renders the `<html>` document for full-page rendering. A story mounts the app tree inside
 * the Storybook canvas element, so the document shell is suppressed while at least one
 * shell frame is mounted and restored once the last one releases it.
 *
 * Suppression is reference counted and each returned release is idempotent, so overlapping
 * mounts — docs mode renders several stories at once — cannot corrupt the captured original.
 */
function suppressRouterDocumentShell(router: ReturnType<typeof createFrontendRouter>) {
  // `shellComponent` is a root-route-only option that the typed route options do not
  // surface on an already-built route instance.
  const rootRouteOptions = router.routesById.__root__.options as {
    shellComponent?: unknown
  }

  if (documentShellSuppressionCount === 0) {
    capturedDocumentShellComponent = rootRouteOptions.shellComponent
  }

  documentShellSuppressionCount += 1
  rootRouteOptions.shellComponent = undefined

  let released = false

  return () => {
    if (released) {
      return
    }

    released = true
    documentShellSuppressionCount -= 1

    if (documentShellSuppressionCount === 0) {
      rootRouteOptions.shellComponent = capturedDocumentShellComponent
    }
  }
}
