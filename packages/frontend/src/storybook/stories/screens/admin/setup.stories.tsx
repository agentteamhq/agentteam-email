import { expect, userEvent, within } from 'storybook/test'

import { AdminSetupRouteStoryFrame } from 'src/storybook/admin-setup-story-frame'
import type { Meta, StoryObj } from '@storybook/react-vite'

const meta = {
  title: 'Screens/Admin/Setup/Integration',
  component: AdminSetupRouteStoryFrame,
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta<typeof AdminSetupRouteStoryFrame>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {
  name: 'Loader ready',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(await canvas.findByText('Create admin account')).toBeInTheDocument()
    await expect(await canvas.findByRole('button', { name: 'Set up instance' })).toBeEnabled()
  }
}

export const Error: Story = {
  name: 'RPC error after submit',
  args: {
    createFirstAdminRpc: {
      message: 'Admin account could not be created.',
      status: 'error'
    }
  },
  play: async ({ canvasElement }) => {
    const canvas = await submitAdminSetupForm(canvasElement)

    await expect(await canvas.findByText('Admin account could not be created.')).toBeInTheDocument()
    await expect(await canvas.findByRole('button', { name: 'Set up instance' })).toBeEnabled()
  }
}

export const Submitting: Story = {
  name: 'RPC pending after submit',
  args: {
    createFirstAdminRpc: {
      status: 'pending'
    }
  },
  play: async ({ canvasElement }) => {
    const canvas = await submitAdminSetupForm(canvasElement)

    await expect(await canvas.findByRole('button', { name: 'Setting up instance' })).toBeDisabled()
  }
}

async function submitAdminSetupForm(canvasElement: HTMLElement) {
  const canvas = within(canvasElement)

  await waitForStoryFrameEffects()
  await userEvent.type(await canvas.findByLabelText('Admin email'), 'admin@example.test')
  await userEvent.type(await canvas.findByLabelText('Admin password'), 'not-a-real-admin-password')
  await userEvent.type(await canvas.findByLabelText('Confirm admin password'), 'not-a-real-admin-password')
  await userEvent.click(await canvas.findByRole('button', { name: 'Set up instance' }))

  return canvas
}

async function waitForStoryFrameEffects() {
  await new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, 0)
  })
}
