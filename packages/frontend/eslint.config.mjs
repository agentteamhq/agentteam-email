//  @ts-check

import eslintParserTypeScript from '@typescript-eslint/parser';
import { defineConfig } from 'eslint/config';
import eslintPluginBetterTailwindcss from 'eslint-plugin-better-tailwindcss';
import globals from 'globals';

import rootConfig, { betterTailwindCssRules } from '../../eslint.config.mjs';

export default defineConfig([
  ...rootConfig,
  {
    name: 'frontend-ignore-generated',
    ignores: ['src/routeTree.gen.ts', 'src/components/ui/**']
  },
  {
    name: 'frontend-tsx-tailwind-rules',
    files: ['**/*.{jsx,tsx}'],
    plugins: {
      'better-tailwindcss': eslintPluginBetterTailwindcss
    },
    languageOptions: {
      globals: globals.browser,
      parser: eslintParserTypeScript,
      parserOptions: {
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true
        }
      }
    },
    settings: {
      'better-tailwindcss': {
        entryPoint: './src/global.css',
        callees: ['cn', 'tw']
      }
    },
    rules: {
      ...betterTailwindCssRules
    }
  }
]);
