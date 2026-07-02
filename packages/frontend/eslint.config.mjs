//  @ts-check

import eslintParserTypeScript from '@typescript-eslint/parser'
import { defineConfig } from 'eslint/config'
import eslintPluginBetterTailwindcss from 'eslint-plugin-better-tailwindcss'
import eslintPluginReactDoctor from 'eslint-plugin-react-doctor'
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

function isForbiddenMailClientImport(value) {
  return (
    value === 'wildduck' ||
    value.startsWith('wildduck/') ||
    value.includes('agent-mail/control-client') ||
    value.includes('mail-control')
  )
}

function getStaticStringValue(node) {
  if (node?.type === 'Literal' && typeof node.value === 'string') {
    return node.value
  }

  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis.map((quasi) => quasi.value.cooked ?? quasi.value.raw).join('')
  }

  return null
}

function getJSXAttributeName(node) {
  if (node.name.type === 'JSXIdentifier') {
    return node.name.name
  }

  if (node.name.type === 'JSXNamespacedName') {
    return `${node.name.namespace.name}:${node.name.name.name}`
  }

  return null
}

function getStaticJSXAttributeValue(node) {
  if (!node.value) {
    return ''
  }

  if (node.value.type === 'Literal' && typeof node.value.value === 'string') {
    return node.value.value
  }

  if (node.value.type === 'JSXExpressionContainer') {
    return getStaticStringValue(node.value.expression)
  }

  return null
}

function isForbiddenMailClientEndpoint(value) {
  return /(?:wildduck|mail-control)/iu.test(value)
}

function isNewExpressionForGlobal(context, node, name) {
  return (
    isGlobalIdentifierNamed(context, node.callee, name) ||
    (isMemberExpression(node.callee) &&
      isGlobalIdentifierNamed(context, node.callee.object, 'globalThis') &&
      getPropertyName(node.callee.property) === name)
  )
}

function isBrowserNavigatorObject(context, node) {
  return (
    isGlobalIdentifierNamed(context, node, 'navigator') ||
    (isMemberExpression(node) &&
      isGlobalIdentifierNamed(context, node.object, 'globalThis') &&
      getPropertyName(node.property) === 'navigator')
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

const frontendMailBoundaryRules = {
  rules: {
    'no-direct-wildduck-access': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Require browser mail UI to access mail only through same-origin web server RPC'
        },
        messages: {
          directEndpoint:
            'Do not call WildDuck or mail-control endpoints from frontend code. Browser mail access must go through same-origin web server RPC.',
          directImport:
            'Do not import WildDuck or agent-mail control clients into frontend code. Browser mail access must go through same-origin web server RPC.'
        },
        schema: []
      },
      create(context) {
        const xmlHttpRequestVariables = new Set()

        function checkImportSource(node) {
          const value = getStaticStringValue(node.source)
          if (value && isForbiddenMailClientImport(value)) {
            context.report({
              node: node.source,
              messageId: 'directImport'
            })
          }
        }

        function checkDynamicImportSource(node) {
          const value = getStaticStringValue(node.source)
          if (value && isForbiddenMailClientImport(value)) {
            context.report({
              node: node.source,
              messageId: 'directImport'
            })
          }
        }

        function checkFetchEndpoint(node) {
          const callee = node.callee
          const isFetch =
            isGlobalIdentifierNamed(context, callee, 'fetch') ||
            (isMemberExpression(callee) &&
              isGlobalIdentifierNamed(context, callee.object, 'globalThis') &&
              getPropertyName(callee.property) === 'fetch')

          if (!isFetch) {
            return
          }

          const value = getStaticStringValue(node.arguments[0])
          if (value && isForbiddenMailClientEndpoint(value)) {
            context.report({
              node: node.arguments[0],
              messageId: 'directEndpoint'
            })
          }
        }

        function isXmlHttpRequestConstructor(node) {
          return node?.type === 'NewExpression' && isNewExpressionForGlobal(context, node, 'XMLHttpRequest')
        }

        function isXmlHttpRequestReceiver(node) {
          return (
            isXmlHttpRequestConstructor(node) ||
            (node?.type === 'Identifier' && xmlHttpRequestVariables.has(node.name))
          )
        }

        function checkXmlHttpRequestVariable(node) {
          if (node.id.type === 'Identifier' && isXmlHttpRequestConstructor(node.init)) {
            xmlHttpRequestVariables.add(node.id.name)
          }
        }

        function checkXmlHttpRequestEndpoint(node) {
          const callee = node.callee
          if (
            !isMemberExpression(callee) ||
            getPropertyName(callee.property) !== 'open' ||
            !isXmlHttpRequestReceiver(callee.object)
          ) {
            return
          }

          const value = getStaticStringValue(node.arguments[1])
          if (value && isForbiddenMailClientEndpoint(value)) {
            context.report({
              node: node.arguments[1],
              messageId: 'directEndpoint'
            })
          }
        }

        function checkBeaconEndpoint(node) {
          const callee = node.callee
          if (
            !isMemberExpression(callee) ||
            getPropertyName(callee.property) !== 'sendBeacon' ||
            !isBrowserNavigatorObject(context, callee.object)
          ) {
            return
          }

          const value = getStaticStringValue(node.arguments[0])
          if (value && isForbiddenMailClientEndpoint(value)) {
            context.report({
              node: node.arguments[0],
              messageId: 'directEndpoint'
            })
          }
        }

        function checkNewEndpoint(node) {
          const guardedConstructors = ['EventSource', 'Request', 'URL', 'WebSocket']
          if (!guardedConstructors.some((name) => isNewExpressionForGlobal(context, node, name))) {
            return
          }

          const value = getStaticStringValue(node.arguments[0])
          if (value && isForbiddenMailClientEndpoint(value)) {
            context.report({
              node: node.arguments[0],
              messageId: 'directEndpoint'
            })
          }
        }

        function checkJSXBrowserEndpoint(node) {
          const guardedAttributes = new Set(['action', 'href', 'poster', 'src', 'srcSet'])
          const name = getJSXAttributeName(node)
          if (!name || !guardedAttributes.has(name)) {
            return
          }

          const value = getStaticJSXAttributeValue(node)
          if (value && isForbiddenMailClientEndpoint(value)) {
            context.report({
              node: node.value ?? node,
              messageId: 'directEndpoint'
            })
          }
        }

        return {
          ExportAllDeclaration: checkImportSource,
          ExportNamedDeclaration: checkImportSource,
          ImportExpression: checkDynamicImportSource,
          ImportDeclaration: checkImportSource,
          JSXAttribute: checkJSXBrowserEndpoint,
          VariableDeclarator: checkXmlHttpRequestVariable,
          CallExpression(node) {
            checkBeaconEndpoint(node)
            checkFetchEndpoint(node)
            checkXmlHttpRequestEndpoint(node)
          },
          NewExpression: checkNewEndpoint
        }
      }
    }
  }
}

const frontendLocalDateTimeRules = {
  rules: {
    'no-direct-local-date-time-formatting': {
      meta: {
        type: 'problem',
        docs: {
          description:
            'Require hydrated client-side date/time rendering for user-local date and time display'
        },
        messages: {
          dateTimeFormat:
            'Render user-local dates/times with LocalDateTime so SSR emits a skeleton and browser locale formatting happens after hydration.',
          dateToLocale:
            'Do not format Date values directly in render code. Render user-local dates/times with LocalDateTime.'
        },
        schema: []
      },
      create(context) {
        const normalizedFilename = context.filename.replaceAll('\\', '/')
        if (normalizedFilename.endsWith('/src/components/local-date-time.tsx')) {
          return {}
        }

        const dateIdentifiers = new Set()

        function isIntlDateTimeFormat(node) {
          return (
            isMemberExpression(node) &&
            isGlobalIdentifierNamed(context, node.object, 'Intl') &&
            getPropertyName(node.property) === 'DateTimeFormat'
          )
        }

        function isDateConstructor(node) {
          return node?.type === 'NewExpression' && isNewExpressionForGlobal(context, node, 'Date')
        }

        function isTrackedDateObject(node) {
          return isDateConstructor(node) || (node?.type === 'Identifier' && dateIdentifiers.has(node.name))
        }

        function checkDateLocaleCall(node) {
          if (!isMemberExpression(node.callee)) {
            return
          }

          const propertyName = getPropertyName(node.callee.property)
          if (
            propertyName === 'toLocaleDateString' ||
            propertyName === 'toLocaleTimeString' ||
            (propertyName === 'toLocaleString' && isTrackedDateObject(node.callee.object))
          ) {
            context.report({
              node: node.callee,
              messageId: 'dateToLocale'
            })
          }
        }

        return {
          CallExpression(node) {
            if (isIntlDateTimeFormat(node.callee)) {
              context.report({
                node: node.callee,
                messageId: 'dateTimeFormat'
              })
              return
            }

            checkDateLocaleCall(node)
          },
          NewExpression(node) {
            if (isIntlDateTimeFormat(node.callee)) {
              context.report({
                node: node.callee,
                messageId: 'dateTimeFormat'
              })
            }
          },
          VariableDeclarator(node) {
            if (node.id.type === 'Identifier' && isDateConstructor(node.init)) {
              dateIdentifiers.add(node.id.name)
            }
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
    ignores: [
      'src/routeTree.gen.ts',
      'src/components/ui/**',
      'src/hooks/use-mobile.ts',
      'src/lib/utils.ts',
      'src/components/auth/**',
      'src/lib/auth/**'
    ]
  },
  eslintPluginReactDoctor.configs.recommended,
  eslintPluginReactDoctor.configs['tanstack-start'],
  eslintPluginReactDoctor.configs['tanstack-query'],
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
    name: 'frontend-mail-boundaries',
    files: ['src/**/*.{ts,tsx}'],
    plugins: {
      'frontend-mail': frontendMailBoundaryRules
    },
    rules: {
      'frontend-mail/no-direct-wildduck-access': 'error'
    }
  },
  {
    name: 'frontend-local-date-time-boundaries',
    files: ['src/**/*.{ts,tsx}'],
    plugins: {
      'frontend-local-date-time': frontendLocalDateTimeRules
    },
    rules: {
      'frontend-local-date-time/no-direct-local-date-time-formatting': 'error'
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
