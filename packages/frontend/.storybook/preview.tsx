import '../src/styles.css'

import { RouterContextProvider } from '@tanstack/react-router'
import type { Decorator, Preview } from '@storybook/react'
import { withThemeByDataAttribute } from '@storybook/addon-themes'
import { ThemeProvider } from 'next-themes'
import type { ReactNode } from 'react'

import { createFrontendRouter } from '../src/router'
import { getStoryPublicEnv } from '../src/storybook/screen-fixtures'

function RouterStoryProvider({ children }: { children: ReactNode }) {
  return (
    <RouterContextProvider
      router={createFrontendRouter({
        publicEnv: getStoryPublicEnv()
      })}
    >
      {children}
    </RouterContextProvider>
  )
}

type StorybookTheme = 'light' | 'dark'

function resolveStorybookTheme(value: unknown): StorybookTheme {
  return value === 'dark' ? 'dark' : 'light'
}

const withStorybookProviders: Decorator = (Story, context) => {
  const forcedTheme = resolveStorybookTheme(context.globals.theme)

  return (
    <ThemeProvider
      attribute='data-theme'
      defaultTheme={forcedTheme}
      disableTransitionOnChange
      enableSystem={false}
      forcedTheme={forcedTheme}
      themes={['light', 'dark']}
    >
      <RouterStoryProvider>
        <Story />
      </RouterStoryProvider>
    </ThemeProvider>
  )
}

const preview: Preview = {
  decorators: [
    withStorybookProviders,
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
    layout: 'fullscreen',
    options: {
      storySort: {
        order: ['Screens', 'Components', 'Mocks', 'Showcase']
      }
    }
  }
}

export default preview
