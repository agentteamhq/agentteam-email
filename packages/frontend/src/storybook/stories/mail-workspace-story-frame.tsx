import { agentAccessActionableState } from '../agent-access-fixtures'
import { DashboardMailControllerStoryFrame } from './story-frames'
import type { DashboardMailControllerStoryFrameProps } from './story-frames'

export function MailWorkspaceControllerStoryFrame(props: DashboardMailControllerStoryFrameProps) {
  return (
    <DashboardMailControllerStoryFrame
      {...props}
      agentAccessView={agentAccessActionableState.view}
    />
  )
}
