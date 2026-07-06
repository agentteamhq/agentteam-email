import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const sourcePath = fileURLToPath(new URL('../src/index.ts', import.meta.url))
const source = await readFile(sourcePath, 'utf8')
const sourceFile = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)

const backendModule = '@main/backend'
const frontendModule = '@main/frontend'

if (!importsNamedBinding(backendModule, 'startScheduledJobs')) {
  throw new Error("web-server runtime entry must import startScheduledJobs from '@main/backend'")
}

if (hasStaticModuleImport(frontendModule)) {
  throw new Error('web-server must dynamically import @main/frontend after backend jobs start')
}

const scheduledJobsPhaseIndex = topLevelAwaitedStartupPhaseIndex('scheduled-jobs', isStartScheduledJobsTask)
const frontendImportPhaseIndex = topLevelAwaitedStartupPhaseIndex('frontend-import', isFrontendImportTask)

if (scheduledJobsPhaseIndex < 0) {
  throw new Error("web-server runtime entry must await runStartupPhase('scheduled-jobs', startScheduledJobs)")
}

if (frontendImportPhaseIndex < 0) {
  throw new Error(
    "web-server runtime entry must await runStartupPhase('frontend-import', () => import('@main/frontend'))"
  )
}

if (scheduledJobsPhaseIndex > frontendImportPhaseIndex) {
  throw new Error('web-server must start backend jobs before importing @main/frontend')
}

function importsNamedBinding(moduleName, bindingName) {
  return sourceFile.statements.some((statement) => {
    if (
      !ts.isImportDeclaration(statement) ||
      !isStringLiteralWithText(statement.moduleSpecifier, moduleName)
    ) {
      return false
    }

    const namedBindings = statement.importClause?.namedBindings

    if (!namedBindings || !ts.isNamedImports(namedBindings)) {
      return false
    }

    return namedBindings.elements.some(
      (element) =>
        element.name.text === bindingName &&
        (!element.propertyName || element.propertyName.text === bindingName)
    )
  })
}

function hasStaticModuleImport(moduleName) {
  return sourceFile.statements.some(
    (statement) =>
      ts.isImportDeclaration(statement) && isStringLiteralWithText(statement.moduleSpecifier, moduleName)
  )
}

function topLevelAwaitedStartupPhaseIndex(phase, taskPredicate) {
  return sourceFile.statements.findIndex((statement) => {
    const callExpression = awaitedCallExpression(statement)

    return (
      callExpression !== null &&
      isIdentifierNamed(callExpression.expression, 'runStartupPhase') &&
      isStringLiteralWithText(callExpression.arguments[0], phase) &&
      taskPredicate(callExpression.arguments[1])
    )
  })
}

function awaitedCallExpression(statement) {
  if (!ts.isExpressionStatement(statement) || !ts.isAwaitExpression(statement.expression)) {
    return null
  }

  const expression = statement.expression.expression
  return ts.isCallExpression(expression) ? expression : null
}

function isStartScheduledJobsTask(node) {
  return isIdentifierNamed(node, 'startScheduledJobs')
}

function isFrontendImportTask(node) {
  if (!node || (!ts.isArrowFunction(node) && !ts.isFunctionExpression(node))) {
    return false
  }

  if (ts.isBlock(node.body)) {
    return node.body.statements.some(
      (statement) =>
        ts.isReturnStatement(statement) &&
        statement.expression !== undefined &&
        isFrontendDynamicImport(unwrapAwait(statement.expression))
    )
  }

  return isFrontendDynamicImport(unwrapAwait(node.body))
}

function isFrontendDynamicImport(node) {
  return (
    ts.isCallExpression(node) &&
    node.expression.kind === ts.SyntaxKind.ImportKeyword &&
    isStringLiteralWithText(node.arguments[0], frontendModule)
  )
}

function unwrapAwait(node) {
  return ts.isAwaitExpression(node) ? node.expression : node
}

function isIdentifierNamed(node, name) {
  return node !== undefined && ts.isIdentifier(node) && node.text === name
}

function isStringLiteralWithText(node, text) {
  return (
    node !== undefined &&
    (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
    node.text === text
  )
}
