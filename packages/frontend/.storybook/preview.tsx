import '../src/styles.css'

import { RouterContextProvider } from '@tanstack/react-router'
import type { Preview } from '@storybook/react'
import { withThemeByDataAttribute } from '@storybook/addon-themes'
import type { ReactNode } from 'react'

import { createFrontendRouter } from '../src/router'
import { storyPublicEnv } from '../src/storybook/screen-fixtures'

function RouterStoryProvider({ children }: { children: ReactNode }) {
  return (
    <RouterContextProvider
      router={createFrontendRouter({
        publicEnv: storyPublicEnv
      })}
    >
      {children}
    </RouterContextProvider>
  )
}

const preview: Preview = {
  decorators: [
    (Story) => (
      <RouterStoryProvider>
        <Story />
      </RouterStoryProvider>
    ),
    withThemeByDataAttribute({
      themes: {
        light: 'light',
        dark: 'dark'
      },
      defaultTheme: 'light',
      attributeName: 'data-theme'
    })
  ],
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i
      }
    },
    layout: 'fullscreen'
  }
}

export default preview
