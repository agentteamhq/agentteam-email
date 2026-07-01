import { agentAccessActionableState } from '../agent-access-fixtures'
import { DashboardMailControllerStoryFrame } from './story-frames'
import type { DashboardMailController } from '../../screens/dashboard-mail-client-controller'
import type { ComponentProps } from 'react'

type DashboardMailControllerArgs = ComponentProps<typeof DashboardMailController>

export function MailWorkspaceControllerStoryFrame(props: DashboardMailControllerArgs) {
  return (
    <DashboardMailControllerStoryFrame
      {...props}
      agentAccessView={agentAccessActionableState.view}
    />
  )
}
