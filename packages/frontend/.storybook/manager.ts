import { addons } from 'storybook/manager-api'

addons.setConfig({
  showPanel: false
})

addons.register('agentteam-email/manager-defaults', (api) => {
  queueMicrotask(() => {
    api.togglePanel(false)
  })
})
