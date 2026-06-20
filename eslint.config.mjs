//  @ts-check

import eslint from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import eslintParserTypeScript from '@typescript-eslint/parser';
import vitest from '@vitest/eslint-plugin';
import { defineConfig } from 'eslint/config';
import eslintPluginBetterTailwindcss from 'eslint-plugin-better-tailwindcss';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
// @ts-expect-error - no types for eslint-plugin-react-perf
import reactPerf from 'eslint-plugin-react-perf';
import reactRefresh from 'eslint-plugin-react-refresh';
import eslintPluginUnicorn from 'eslint-plugin-unicorn';
// import simpleImportSort from 'eslint-plugin-simple-import-sort';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** @type import('eslint').Linter.Config['rules']*/
export const betterTailwindCssRules = {
  // enable all recommended rules to report a warning
  ...eslintPluginBetterTailwindcss.configs['recommended-warn'].rules,
  // enable all recommended rules to report an error
  // ...eslintPluginBetterTailwindcss.configs['recommended-error'].rules,

  'better-tailwindcss/enforce-consistent-line-wrapping': 'off',
  'better-tailwindcss/enforce-consistent-class-order': 'off',
  'better-tailwindcss/no-restricted-classes': [
    'warn',
    {
      restrict: [
        {
          pattern:
            '^(?:[a-zA-Z0-9:/_\\-]*:)*!?((text|bg|border|ring|fill|stroke|from|via|to))-(\\[[^\\]]+\\]|[a-zA-Z]+(?:-[0-9]{2,3})?)(?:\\/[0-9]{1,3})?$',
          message:
            "Inline color '$1-*' is not allowed. Use theme tokens (bg-background, text-foreground, border-border, ring-ring, etc.) so dark mode works correctly."
        }
      ]
    }
  ]
};

/** @type import('eslint').Rule.RuleModule */
const plugin = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require class methods that use `this` to either declare a `this:` parameter or be arrow properties'
    },
    messages: {
      requireThisParam:
        'Class method uses `this` but does not declare a `this:` parameter and is not an arrow property.'
    },
    schema: []
  },

  create(context) {
    /**
     * Returns true if node contains a ThisExpression, ignoring nested function scopes.
     * @param {import('estree').Node} node
     * @returns {boolean}
     */
    function containsThisExpression(node) {
      let found = false;

      /**
       * @param {import('estree').Node | null | undefined} n
       */
      const visit = (n) => {
        if (!n || found) {
          return;
        }

        // If we enter a nested function scope, stop scanning that subtree.
        // `this` inside nested functions is unrelated to the outer method binding issue.
        switch (n.type) {
          case 'FunctionExpression':
          case 'FunctionDeclaration':
          case 'ArrowFunctionExpression':
            return;
        }

        if (n.type === 'ThisExpression') {
          found = true;
          return;
        }

        // Generic child traversal
        for (const child of context.sourceCode.visitorKeys[n.type] ?? []) {
          /** @type {import('estree').Node | import('estree').Node[] | null | undefined} */

          // @ts-expect-error - any type is fine
          const value = n[child];

          if (Array.isArray(value)) {
            for (const c of value) {
              visit(c);
            }
          } else {
            visit(value);
          }

          if (found) {
            return;
          }
        }
      };

      visit(node);
      return found;
    }

    return {
      /**
       * @param {import('estree').MethodDefinition} node
       */
      MethodDefinition(node) {
        // Ignore static methods
        if (node.static) {
          return;
        }

        // Ignore constructors
        if (node.kind === 'constructor') {
          return;
        }

        const fn = node.value;
        if (!fn.body) {
          return;
        }

        // If method does not reference `this`, don't care.
        if (!containsThisExpression(fn.body)) {
          return;
        }

        // Allow explicit `this:` parameter
        const firstParam = fn.params[0];
        const hasExplicitThisParam = firstParam?.type === 'Identifier' && firstParam.name === 'this';

        if (hasExplicitThisParam) {
          return;
        }

        // ❌ Prototype method uses `this` but has no `this:` parameter
        context.report({
          node,
          messageId: 'requireThisParam'
        });
      }
    };
  }
};

/** @type import('eslint').Linter.Config */
const eslintRequireThisArrow = {
  name: 'eslint-require-this-arrow',
  rules: {
    'eslint-require/this-arrow': 'error'
  },
  plugins: {
    'eslint-require': {
      rules: {
        'this-arrow': plugin
      }
    }
  }
};

export default defineConfig([
  {
    name: 'proj-ignores',
    ignores: [
      // Configs & root files
      // Build artifacts
      'dist*/**/*',
      'packages/**/dist/**/*',
      'tmp/**/*',
      '**/*tmp*',

      // Auto-generated
      '**/_*',

      '**/*.stories.ts',
      // Non-TS files
      '**/*.cjs',
      '**/*.js',
      '**/*.json',
      '**/*.sql'
    ]
  },
  ...defineConfig(
    eslint.configs.recommended,
    // eslintPluginUnicorn.configs.recommended,
    tseslint.configs.strictTypeChecked,
    tseslint.configs.stylisticTypeChecked,
    {
      name: 'proj-typescript-rules',
      files: ['**/*.ts', '**/*.tsx'],
      linterOptions: {
        reportUnusedDisableDirectives: 'off'
      },
      languageOptions: {
        parserOptions: {
          projectService: true,
          tsconfigRootDir: import.meta.dirname
        }
      },
      plugins: {
        // 'simple-import-sort': simpleImportSort,
        '@stylistic': stylistic,
        // Register unicorn plugin (no rules enabled) so eslint-disable comments work
        unicorn: eslintPluginUnicorn
      },
      rules: {
        // ...eslintNoNativeDate.rules,
        // '@typescript-eslint/no-deprecated': 'off',

        'template-curly-spacing': ['error', 'never'],
        'no-template-curly-in-string': 'error',

        // 'unused-imports/no-unused-imports': 'error',
        // '@typescript-eslint/no-unused-vars': ['error', {vars: 'all', args: 'none', ignoreRestSiblings: true}],

        '@typescript-eslint/no-unused-vars': 'off',
        '@typescript-eslint/consistent-type-definitions': 'off',
        '@typescript-eslint/no-import-type-side-effects': 'error',
        '@typescript-eslint/no-confusing-void-expression': 'error',
        '@typescript-eslint/dot-notation': 'off',
        '@typescript-eslint/prefer-for-of': 'off',
        '@typescript-eslint/consistent-indexed-object-style': 'off',
        '@typescript-eslint/array-type': 'off',
        '@typescript-eslint/no-inferrable-types': 'warn',

        // 'simple-import-sort/imports': [
        //   'error',
        //   {
        //     groups: [
        //       // 1. Side effect imports at the start. For me this is important because I want to import reset.css and global styles at the top of my main file.
        //       ['^\\u0000'],
        //       // 2. `react` and packages: Things that start with a letter (or digit or underscore), or `@` followed by a letter.
        //       ['^react$', '^@?\\w'],
        //       // 3. Absolute imports and other imports such as Vue-style `@/foo`.
        //       // Anything not matched in another group. (also relative imports starting with "../")
        //       ['^@', '^'],
        //       // 4. relative imports from same folder "./" (I like to have them grouped together)
        //       ['^\\./'],
        //       // 5. style module imports always come last, this helps to avoid CSS order issues
        //       ['^.+\\.(module.css|module.scss)$'],
        //       // 6. media imports
        //       ['^.+\\.(gif|png|svg|jpg)$']
        //     ]
        //   }
        // ],

        // 'unicorn/numeric-separators-style': 'off',
        // 'unicorn/no-null': 'off',
        // 'unicorn/prevent-abbreviations': 'off',
        // 'unicorn/no-empty': 'off',
        // 'unicorn/no-abusive-eslint-disable': 'off',
        // 'unicorn/no-lonely-if': 'off',
        // 'unicorn/prefer-native-coercion-functions': 'off',
        // 'unicorn/no-nested-ternary': 'off',
        // 'unicorn/prefer-spread': 'off',
        // 'unicorn/no-array-reduce': 'off',
        // 'unicorn/catch-error-name': 'off',
        // 'unicorn/prefer-single-call': 'off',
        // 'unicorn/no-negated-condition': 'off',
        // 'unicorn/prefer-optional-catch-binding': 'off',
        // 'unicorn/switch-case-braces': 'warn',
        // 'unicorn/no-for-loop': 'off',
        // 'unicorn/prefer-switch': 'off',
        // 'unicorn/prefer-logical-operator-over-ternary': 'off',
        // 'unicorn/template-indent': 'off',
        // 'unicorn/prefer-ternary': 'warn',
        // 'unicorn/prefer-math-min-max': 'warn',
        // 'unicorn/no-array-for-each': 'off',

        // Unicorn rules disabled to allow build (rules used in eslint-disable comments)
        'unicorn/consistent-function-scoping': 'off',
        'unicorn/no-immediate-mutation': 'off',
        'unicorn/prefer-string-replace-all': 'off',
        'unicorn/prefer-ternary': 'off',
        'unicorn/prefer-number-properties': 'off',
        'unicorn/no-process-exit': 'off',
        'unicorn/no-empty-file': 'off',
        'unicorn/import-style': 'off',
        'unicorn/no-useless-undefined': 'off',
        'unicorn/switch-case-braces': 'off',
        'unicorn/new-for-builtins': 'off',

        '@stylistic/comma-spacing': 'error',
        '@stylistic/object-curly-spacing': ['error', 'always'],

        // warn about undefined usage
        'no-undefined': 'off',
        eqeqeq: ['warn', 'always'],
        // Restrict comparisons with undefined
        '@typescript-eslint/no-unnecessary-condition': 'off',
        // Prevent variables from being initialized to undefined
        '@typescript-eslint/no-explicit-any': 'warn',
        // Prefer optional chaining over explicit undefined checks
        '@typescript-eslint/prefer-optional-chain': 'warn',
        '@typescript-eslint/strict-boolean-expressions': 'off',
        // Prevent nullish coalescing when the left side can be undefined
        '@typescript-eslint/prefer-nullish-coalescing': [
          'warn',
          {
            allowRuleToRunWithoutStrictNullChecksIKnowWhatIAmDoing: false,
            ignoreBooleanCoercion: false,
            ignoreConditionalTests: false,
            ignoreIfStatements: false,
            ignoreMixedLogicalExpressions: false,
            ignorePrimitives: {
              bigint: false,
              boolean: false,
              number: false,
              string: false
            },
            ignoreTernaryTests: false
          }
        ],
        // Prevent functions from returning undefined explicitly
        'no-useless-return': 'warn',
        curly: ['error', 'all'],
        'no-void': 'error',
        '@typescript-eslint/no-meaningless-void-operator': 'error',
        'no-unused-expressions': 'off',
        '@typescript-eslint/no-unused-expressions': 'error',
        '@typescript-eslint/no-misused-promises': 'error',
        'no-undef-init': 'error',
        '@typescript-eslint/no-floating-promises': 'error',
        '@typescript-eslint/require-await': 'off',
        '@typescript-eslint/unbound-method': [
          'error',
          {
            ignoreStatic: false
          }
        ],
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/restrict-template-expressions': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',

        // Disallow dynamic imports
        // eslint config fragment
        'no-restricted-syntax': [
          'error',

          // Already in your config
          {
            selector: 'ImportExpression',
            message: 'Dynamic imports are not allowed. Use static imports instead.'
          },
          {
            selector: 'WithStatement',
            message:
              '`with` is disallowed - it is confusing, non-standard in strict mode, and breaks optimization.'
          },

          // === Additional suggestions ===

          {
            selector: 'LabeledStatement',
            message: 'Labels make code harder to read. Use clearer control flow instead.'
          },
          // Example:
          // labelName: for (const x of arr) { ... }

          {
            selector: 'SequenceExpression',
            message: 'Comma operator is rarely needed - split into separate statements.'
          },
          // Example:
          // a = 1, b = 2;

          {
            selector:
              'UnaryExpression[operator="delete"][argument.type="MemberExpression"][argument.object.type="Identifier"]',
            message:
              'Avoid deleting object properties on regular objects - use maps or `undefined` assignment instead.'
          },
          // Example:
          // delete obj.prop;

          {
            selector: 'BinaryExpression[operator="in"][right.type="ArrayExpression"]',
            message: '`in` with arrays checks for index existence, not values. This is likely a mistake.'
          },
          // Example:
          // if (2 in [10, 20]) { ... } // checks index, not value

          {
            selector: 'CallExpression[callee.type="Identifier"][callee.name="eval"]',
            message: '`eval` is dangerous and should never be used.'
          },
          // Example:
          // eval("console.log('bad')");

          {
            selector: 'CallExpression[callee.type="Identifier"][callee.name="Function"]',
            message: 'Avoid the Function constructor - it behaves like eval.'
          },
          // Example:
          // const fn = new Function('a', 'b', 'return a + b');

          // Side effects false linting:
          {
            selector: 'CallExpression > ArrowFunctionExpression.callee',
            message: 'Inline IIFE arrow functions are not allowed - use a named function instead.'
          },
          {
            selector: 'CallExpression > FunctionExpression.callee',
            message: 'Inline IIFE function expressions are not allowed - extract this into a function.'
          },
          {
            selector: "AssignmentExpression[left.type='MemberExpression'][left.object.name='globalThis']",
            message: 'Do not write to globalThis in side-effect-free modules.'
          },
          {
            selector: "AssignmentExpression[left.type='MemberExpression'][left.object.name='window']",
            message: 'Do not write to window in side-effect-free modules.'
          },
          {
            selector: 'Program > ExpressionStatement CallExpression',
            message: 'Top-level function calls are not allowed; modules must be side-effect free.'
          },
          {
            selector: 'Program > ExpressionStatement NewExpression',
            message: 'Top-level object construction is not allowed; modules must be side-effect free.'
          },
          {
            selector: "Program > ExpressionStatement AssignmentExpression[left.type!='MemberExpression']",
            message: 'Top-level assignments are not allowed; modules must be side-effect free.'
          }
        ],

        'no-restricted-imports': [
          'error',
          {
            paths: [
              { name: 'assert', message: "Use 'node:assert' instead of 'assert'" },
              { name: 'buffer', message: "Use 'node:buffer' instead of 'buffer'" },
              { name: 'child_process', message: "Use 'node:child_process' instead of 'child_process'" },
              { name: 'console', message: "Use 'node:console' instead of 'console'" },
              { name: 'crypto', message: "Use 'node:crypto' instead of 'crypto'" },
              {
                name: 'diagnostics_channel',
                message: "Use 'node:diagnostics_channel' instead of 'diagnostics_channel'"
              },
              { name: 'events', message: "Use 'node:events' instead of 'events'" },
              { name: 'fs', message: "Use 'node:fs' instead of 'fs'" },
              { name: 'fs/promises', message: "Use 'node:fs/promises' instead of 'fs/promises'" },
              { name: 'module', message: "Use 'node:module' instead of 'module'" },
              { name: 'os', message: "Use 'node:os' instead of 'os'" },
              { name: 'path', message: "Use 'node:path' instead of 'path'" },
              { name: 'punycode', message: "Use 'node:punycode' instead of 'punycode'" },
              { name: 'querystring', message: "Use 'node:querystring' instead of 'querystring'" },
              { name: 'readline', message: "Use 'node:readline' instead of 'readline'" },
              { name: 'sqlite', message: "Use 'node:sqlite' instead of 'sqlite'" },
              { name: 'stream', message: "Use 'node:stream' instead of 'stream'" },
              { name: 'string_decoder', message: "Use 'node:string_decoder' instead of 'string_decoder'" },
              { name: 'timers', message: "Use 'node:timers' instead of 'timers'" },
              { name: 'tty', message: "Use 'node:tty' instead of 'tty'" },
              { name: 'url', message: "Use 'node:url' instead of 'url'" },

              { name: 'async_hooks', message: "Use 'node:async_hooks' instead of 'async_hooks'" },
              { name: 'dgram', message: "Use 'node:dgram' instead of 'dgram'" },
              { name: 'dns', message: "Use 'node:dns' instead of 'dns'" },
              { name: 'http', message: "Use 'node:http' instead of 'http'" },
              { name: 'http2', message: "Use 'node:http2' instead of 'http2'" },
              { name: 'https', message: "Use 'node:https' instead of 'https'" },
              { name: 'inspector', message: "Use 'node:inspector' instead of 'inspector'" },
              { name: 'net', message: "Use 'node:net' instead of 'net'" },
              { name: 'perf_hooks', message: "Use 'node:perf_hooks' instead of 'perf_hooks'" },
              { name: 'process', message: "Use 'node:process' instead of 'process'" },
              { name: 'test', message: "Use 'node:test' instead of 'test'" },
              { name: 'tls', message: "Use 'node:tls' instead of 'tls'" },
              { name: 'util', message: "Use 'node:util' instead of 'util'" },
              { name: 'v8', message: "Use 'node:v8' instead of 'v8'" },
              { name: 'vm', message: "Use 'node:vm' instead of 'vm'" },
              { name: 'worker_threads', message: "Use 'node:worker_threads' instead of 'worker_threads'" },
              { name: 'zlib', message: "Use 'node:zlib' instead of 'zlib'" },

              { name: 'cluster', message: "Use 'node:cluster' instead of 'cluster'" },
              { name: 'domain', message: "Use 'node:domain' instead of 'domain'" },
              { name: 'repl', message: "Use 'node:repl' instead of 'repl'" },
              { name: 'sea', message: "Use 'node:sea' instead of 'sea'" },
              { name: 'trace_events', message: "Use 'node:trace_events' instead of 'trace_events'" },
              { name: 'wasi', message: "Use 'node:wasi' instead of 'wasi'" }
            ]
          }
        ],

        'no-restricted-globals': [
          'error',
          {
            name: '__dirname',
            message: 'Do not use __dirname. Use import.meta.url instead.'
          },
          {
            name: '__filename',
            message: 'Do not use __filename. Use import.meta.url instead.'
          },
          {
            name: 'exports',
            message: 'Do not use CommonJS exports. Use ESM exports instead.'
          },
          {
            name: 'module',
            message: 'Do not use CommonJS module. Use ESM syntax instead.'
          },
          {
            name: 'require',
            message: 'Do not use require(). Use import instead.'
          },
          {
            name: 'process',
            message: "Do not use process global. Use import process from 'node:process' instead."
          },
          {
            name: 'Buffer',
            message: "Do not use global Buffer. Import { Buffer } from 'node:buffer' instead."
          },
          {
            name: 'window',
            message: 'Do not use global window. Use `globalThis.window`.'
          },
          {
            name: 'customElements',
            message: 'Do not use global customElements. Use `globalThis.customElements`.'
          },
          {
            name: 'document',
            message: 'Do not use global document. Use `globalThis.document`.'
          },
          {
            name: 'navigator',
            message: 'Do not use navigator. Use `globalThis.navigator`.'
          },
          {
            name: 'localStorage',
            message: 'Do not use localStorage. Use `globalThis.localStorage`.'
          },
          {
            name: 'sessionStorage',
            message: 'Do not use sessionStorage. Use `globalThis.sessionStorage`.'
          },
          {
            name: 'alert',
            message: 'Do not use alert(). Use a custom modal or UI notification instead.'
          },
          {
            name: 'confirm',
            message: 'Do not use confirm(). Use a UI-based confirmation modal.'
          },
          {
            name: 'prompt',
            message: 'Do not use prompt(). Use a UI-based input dialog.'
          },
          {
            name: 'event',
            message: 'Do not use global event. Use function parameters instead.'
          },
          {
            name: 'name',
            message: 'Do not use global name. Use a scoped variable instead.'
          },
          {
            name: 'parent',
            message: 'Do not use window.parent. Avoid cross-origin issues.'
          },
          {
            name: 'fdescribe',
            message: 'Do not commit fdescribe. Use describe instead.'
          },
          {
            name: 'fit',
            message: 'Do not commit fit. Use it/test instead.'
          }
        ],

        'no-async-promise-executor': 'off',
        '@typescript-eslint/ban-ts-comment': 'off',
        '@typescript-eslint/camelcase': 'off',
        '@typescript-eslint/explicit-module-boundary-types': 'off',
        '@typescript-eslint/no-empty-function': 'off',
        '@typescript-eslint/no-non-null-assertion': 'off',
        '@typescript-eslint/no-use-before-define': 'off',
        '@typescript-eslint/no-var-requires': 'off',
        '@typescript-eslint/no-this-alias': 'off',
        '@typescript-eslint/triple-slash-reference': 'off',

        '@typescript-eslint/no-empty-object-type': [
          'error',
          {
            allowWithName: 'Props$'
          }
        ],

        'no-console': ['warn'],
        'no-global-assign': 'error',
        'prefer-const': 'warn',
        'no-shadow': 'error',
        'no-shadow-restricted-names': 'error',
        '@typescript-eslint/no-shadow': ['error']
      }
    }
  ),
  {
    name: 'proj-disable-type-check-on-js',
    files: ['packages/*/src/**/*.{js,cjs,mjs,jsx}'],
    extends: [tseslint.configs.disableTypeChecked],
    rules: {
      'no-undef': 'off'
    }
  },
  // {
  //   name: 'proj-require-this-arrow',
  //   files: ['packages/*/src/**/*.{ts,tsx}'],
  //   ...eslintRequireThisArrow
  // },
  ...defineConfig(reactHooks.configs.flat.recommended, {
    name: 'proj-react-rules',
    files: ['**/*.{tsx,jsx}'],
    ignores: ['**/*kita.tsx'],
    plugins: {
      react: react,
      '@stylistic': stylistic,
      'react-refresh': reactRefresh,
      'react-perf': reactPerf
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
      react: {
        version: 'detect'
      }
    },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.flat['recommended-latest'].rules,
      'react-refresh/only-export-components': 'error',
      // this is enforced in react files because sometimes llms add
      // comments inline in react which can cause hard to find parsing errors
      '@stylistic/line-comment-position': ['error', { position: 'above' }],

      'react/jsx-no-bind': ['error', { allowArrowFunctions: true, allowFunctions: true }],
      'react/jsx-no-undef': ['error', { allowGlobals: false }],
      'react/react-in-jsx-scope': 'off',
      'react/jsx-uses-react': 'error',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',

      // React performance: flags inline objects, arrays, functions, and JSX passed as props.
      // These cause PureComponent/React.memo shallow-comparison failures on every render.
      // With React Compiler these are mostly handled for function components, but they
      // still matter for class component libraries and some Radix internals.
      'react-perf/jsx-no-new-object-as-prop': 'warn',
      'react-perf/jsx-no-new-array-as-prop': 'warn',
      'react-perf/jsx-no-new-function-as-prop': 'warn',
      'react-perf/jsx-no-jsx-as-prop': 'warn'
    }
  }),
  {
    name: 'proj-vitest-rules',
    files: ['**/*test.ts', '**/*.spec.ts', '**/*test.tsx', '**/*.spec.tsx'],
    plugins: {
      vitest
    },
    rules: {
      ...vitest.configs.all.rules,
      'vitest/no-hooks': 'off',
      'vitest/max-expects': 'off',
      'vitest/prefer-strict-equal': 'error',
      'no-undefined': 'off',
      'vitest/no-conditional-in-test': 'off',
      'vitest/no-conditional-expect': 'off',
      'vitest/prefer-expect-assertions': [
        'error',
        {
          onlyFunctionsWithExpectInLoop: true,
          onlyFunctionsWithExpectInCallback: true,
          onlyFunctionsWithAsyncKeyword: true
        }
      ],
      '@typescript-eslint/no-unnecessary-condition': 'off',
      'no-restricted-syntax': 'off',
      // Test files may use component-form UTCDate/TZDate constructors and bare parse/set
      // to build precise fixture dates — this is intentional and correct in test context.
      'no-unsafe-date-fns/no-unsafe-date-fns': 'off'
    }
  }
]);
