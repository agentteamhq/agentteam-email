//  @ts-check

import eslintParserTypeScript from '@typescript-eslint/parser'
import { defineConfig } from 'eslint/config'
import eslintPluginBetterTailwindcss from 'eslint-plugin-better-tailwindcss'
import globals from 'globals'

import rootConfig, { betterTailwindCssRules } from '../../eslint.config.mjs'

function getPropertyName(node) {
  if (node.type === 'Identifier') {
    return node.name
  }

  if (node.type === 'Literal' && typeof node.value === 'string') {
    return node.value
  }

  return null
}

function isMemberExpression(node) {
  return node?.type === 'MemberExpression'
}

function isIdentifierNamed(node, name) {
  return node?.type === 'Identifier' && node.name === name
}

function hasLocalBinding(context, node) {
  if (node?.type !== 'Identifier') {
    return false
  }

  let scope = context.sourceCode.getScope(node)

  while (scope) {
    const variable = scope.variables.find((scopeVariable) => scopeVariable.name === node.name)

    if (variable) {
      return scope.type !== 'global'
    }

    scope = scope.upper
  }

  return false
}

function isGlobalIdentifierNamed(context, node, name) {
  return isIdentifierNamed(node, name) && !hasLocalBinding(context, node)
}

function isGlobalThisWindow(context, node) {
  return (
    isMemberExpression(node) &&
    isGlobalIdentifierNamed(context, node.object, 'globalThis') &&
    getPropertyName(node.property) === 'window'
  )
}

function isBrowserWindow(context, node) {
  return isGlobalIdentifierNamed(context, node, 'window') || isGlobalThisWindow(context, node)
}

function isBrowserLocationObject(context, node) {
  return (
    isGlobalIdentifierNamed(context, node, 'location') ||
    (isMemberExpression(node) &&
      isBrowserWindow(context, node.object) &&
      getPropertyName(node.property) === 'location')
  )
}

function isBrowserHistoryObject(context, node) {
  return (
    isGlobalIdentifierNamed(context, node, 'history') ||
    (isMemberExpression(node) &&
      isBrowserWindow(context, node.object) &&
      getPropertyName(node.property) === 'history')
  )
}

function isBrowserLocationProperty(context, node, propertyNames) {
  return (
    isMemberExpression(node) &&
    isBrowserLocationObject(context, node.object) &&
    propertyNames.has(getPropertyName(node.property))
  )
}

function isBrowserHistoryMethodCall(context, node, methodNames) {
  return (
    isMemberExpression(node.callee) &&
    isBrowserHistoryObject(context, node.callee.object) &&
    methodNames.has(getPropertyName(node.callee.property))
  )
}

function isBrowserLocationMethodCall(context, node, methodNames) {
  return (
    isMemberExpression(node.callee) &&
    isBrowserLocationObject(context, node.callee.object) &&
    methodNames.has(getPropertyName(node.callee.property))
  )
}

const frontendRouterRules = {
  rules: {
    'no-browser-router-state': {
      meta: {
        type: 'problem',
        docs: {
          description:
            'Require TanStack Router APIs instead of browser location/history for route state and app navigation'
        },
        messages: {
          locationNavigation:
            'Do not navigate app UI with browser location APIs. Use TanStack Router Link/useNavigate/navigate for app routes; external full-page redirects need an explicit local exception.',
          locationRead:
            'Do not read route/search state from browser location, including globalThis.window. Define route search with validateSearch and read it with Route.useSearch(), getRouteApi().useSearch(), or TanStack useLocation().',
          historyMutation:
            'Do not mutate browser history directly, including globalThis.window.history. Use TanStack Router navigate with replace/search for route or search-param cleanup.'
        },
        schema: []
      },
      create(context) {
        const routeStateLocationProperties = new Set(['hash', 'href', 'pathname', 'search'])
        const historyMutationMethods = new Set(['pushState', 'replaceState'])
        const locationNavigationMethods = new Set(['assign', 'replace'])

        return {
          AssignmentExpression(node) {
            if (isBrowserLocationProperty(context, node.left, new Set(['href']))) {
              context.report({
                node: node.left,
                messageId: 'locationNavigation'
              })
            }
          },
          CallExpression(node) {
            if (isBrowserHistoryMethodCall(context, node, historyMutationMethods)) {
              context.report({
                node: node.callee,
                messageId: 'historyMutation'
              })
              return
            }

            if (isBrowserLocationMethodCall(context, node, locationNavigationMethods)) {
              context.report({
                node: node.callee,
                messageId: 'locationNavigation'
              })
            }
          },
          MemberExpression(node) {
            if (!isBrowserLocationProperty(context, node, routeStateLocationProperties)) {
              return
            }

            if (node.parent?.type === 'AssignmentExpression' && node.parent.left === node) {
              return
            }

            if (node.parent?.type === 'CallExpression' && node.parent.callee === node) {
              return
            }

            context.report({
              node,
              messageId: 'locationRead'
            })
          }
        }
      }
    }
  }
}

export default defineConfig([
  ...rootConfig,
  {
    name: 'frontend-ignore-generated',
    ignores: ['src/routeTree.gen.ts', 'src/components/ui/**']
  },
  {
    name: 'frontend-tanstack-router-boundaries',
    files: ['src/**/*.{ts,tsx}'],
    plugins: {
      'frontend-router': frontendRouterRules
    },
    rules: {
      'frontend-router/no-browser-router-state': 'error'
    }
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
])
