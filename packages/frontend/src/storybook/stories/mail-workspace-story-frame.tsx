import { agentAccessActionableState } from '../agent-access-fixtures'
import { DashboardMailController } from '../../screens/dashboard-mail-client-controller'
import { DashboardMailControllerStoryFrame } from './story-frames'
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
