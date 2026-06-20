//  @ts-check

/** @type {import('prettier').Config} */
const config = {
  // Base configuration - no plugins here to avoid conflicts
  bracketSameLine: false,
  singleAttributePerLine: true,
  htmlWhitespaceSensitivity: 'css',
  semi: false,
  printWidth: 110,
  trailingComma: 'none',
  bracketSpacing: true,
  jsxSingleQuote: true,
  singleQuote: true,
  plugins: [],
  overrides: [
    {
      files: ['*.tsx', '*.jsx'],
      // @ts-expect-error - ignore tailwindFunctions
      tailwindFunctions: ['clsx', 'tw', 'cn'],
      options: {
        plugins: [
          require.resolve('prettier-plugin-tailwindcss'),
          require.resolve('prettier-plugin-classnames'),
          require.resolve('prettier-plugin-merge')
        ]
      }
    },
    // Match all json except package.json
    {
      files: ['*.json', '**/*.json'],
      // @ts-expect-error - ignore ignores for plugin
      ignores: ['package.json', '**/package.json'],
      options: {
        plugins: [require.resolve('prettier-plugin-sort-json')],
        jsonRecursiveSort: true
      }
    },
    // Match only package.json
    {
      files: ['package.json', '**/package.json'],
      options: {
        plugins: [require.resolve('prettier-plugin-packagejson')],
        packageSortOrder: [
          // Identity & metadata
          'name',
          'version',
          'private',
          'description',
          'keywords',
          'homepage',
          'bugs',
          'repository',
          'license',
          'author',
          'contributors',
          'funding',

          // Package behavior
          'type',
          'main',
          'module',
          'types',
          'typings',
          'exports',
          'sideEffects',
          'bin',
          'files',
          'man',
          'directories',
          'workspaces',

          // Environment & constraints
          'engines',
          'os',
          'cpu',
          'browserslist',

          // Scripts
          'scripts',

          // Dependencies
          'dependencies',
          'devDependencies',
          'peerDependencies',
          'peerDependenciesMeta',
          'optionalDependencies',
          'bundleDependencies',
          'overrides',
          'resolutions'
        ]
      }
    },
    {
      files: 'pnpm-workspace.yaml'
    }
    // {
    //   files: 'eslint.config.mjs',
    //   options: {
    //     semi: true
    //   }
    // }
  ]
}

module.exports = config
