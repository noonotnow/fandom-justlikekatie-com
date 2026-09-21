import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import fastGlob from 'fast-glob';
import ts from 'typescript';

const BROWSER_FACTORIES = /^(?:launch|launchBrowser(?:ForServer|WithServer)?|launchPageForServer)$/;
const SERVER_FACTORIES = /^(?:createServer|start[A-Z].*(?:Server|App)|startViteTestServer)$/;

function calledName(node) {
  if (!ts.isCallExpression(node)) return null;
  const expression = node.expression;
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return null;
}

function unwrappedInitializer(node) {
  let current = node;
  while (current && (
    ts.isAwaitExpression(current)
    || ts.isParenthesizedExpression(current)
    || ts.isAsExpression(current)
  )) {
    current = current.expression;
  }
  return current;
}

function bindingIdentifier(binding) {
  return binding && ts.isIdentifier(binding.name) ? binding.name.text : null;
}

function assignmentIdentifier(node) {
  return ts.isIdentifier(node) ? node.text : null;
}

function markFactoryResult(target, factory, markBinding) {
  if (ts.isIdentifier(target)) {
    if (BROWSER_FACTORIES.test(factory)) markBinding(target.text, 'browser');
    if (SERVER_FACTORIES.test(factory)) markBinding(target.text, 'server');
    return;
  }

  if (ts.isObjectBindingPattern(target) || ts.isObjectLiteralExpression(target)) {
    for (const element of target.elements ?? target.properties) {
      const property = element.propertyName?.getText() ?? element.name?.getText();
      const name = ts.isBindingElement(element)
        ? bindingIdentifier(element)
        : assignmentIdentifier(element.initializer ?? element.name);
      if (property === 'browser') markBinding(name, 'browser');
      if (property === 'server') markBinding(name, 'server');
    }
    return;
  }

  if (
    factory === 'launchBrowserWithServer'
    && (ts.isArrayBindingPattern(target) || ts.isArrayLiteralExpression(target))
  ) {
    const [serverResult, browserResult] = target.elements;
    const serverTarget = ts.isBindingElement(serverResult) ? serverResult.name : serverResult;
    const browserTarget = ts.isBindingElement(browserResult) ? browserResult.name : browserResult;
    if (
      serverTarget
      && (ts.isObjectBindingPattern(serverTarget) || ts.isObjectLiteralExpression(serverTarget))
    ) {
      markFactoryResult(serverTarget, factory, markBinding);
    } else {
      markBinding(assignmentIdentifier(serverTarget), 'server');
    }
    markBinding(assignmentIdentifier(browserTarget), 'browser');
  }
}

function closedResource(node) {
  if (
    !ts.isAwaitExpression(node)
    || !ts.isCallExpression(node.expression)
    || !ts.isPropertyAccessExpression(node.expression.expression)
    || node.expression.expression.name.text !== 'close'
  ) {
    return null;
  }

  const receiver = node.expression.expression.expression;
  return ts.isIdentifier(receiver)
    ? { name: receiver.text, node }
    : null;
}

export function findUnsafeBrowserCleanup(source, fileName = 'browser.test.ts') {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const violations = [];

  function inspectScope(scope) {
    const owned = new Map();
    const closes = [];
    function markBinding(name, kind) {
      if (name) owned.set(name, kind);
    }

    function recordAssignment(target, value) {
      const initializer = unwrappedInitializer(value);
      const factory = calledName(initializer);
      const recognizedFactory = factory && (
        BROWSER_FACTORIES.test(factory)
        || SERVER_FACTORIES.test(factory)
      );
      if (recognizedFactory) {
        markFactoryResult(target, factory, markBinding);
      } else if (ts.isIdentifier(target) && ts.isIdentifier(initializer)) {
        const kind = owned.get(initializer.text);
        if (kind) {
          markBinding(target.text, kind);
        } else {
          owned.delete(target.text);
        }
      } else if (ts.isIdentifier(target)) {
        owned.delete(target.text);
      }
    }

    function collect(node) {
      if (node !== scope && ts.isFunctionLike(node)) return;
      if (ts.isVariableDeclaration(node) && node.initializer) {
        recordAssignment(node.name, node.initializer);
      } else if (
        ts.isBinaryExpression(node)
        && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
      ) {
        recordAssignment(node.left, node.right);
      }

      const resource = closedResource(node);
      if (resource && owned.has(resource.name)) {
        closes.push({ ...resource, kind: owned.get(resource.name) });
      }
      ts.forEachChild(node, collect);
    }
    collect(scope);

    for (let index = 0; index < closes.length; index += 1) {
      const first = closes[index];
      const second = closes
        .slice(index + 1)
        .find(close => close.kind !== first.kind);
      if (!second) continue;

      const browserClose = first.kind === 'browser' ? first : second;
      const serverClose = first.kind === 'server' ? first : second;
      const position = sourceFile.getLineAndCharacterOfPosition(first.node.getStart());
      violations.push({
        line: position.line + 1,
        browser: browserClose.name,
        server: serverClose.name,
      });
      break;
    }
  }

  function visit(node) {
    if (ts.isSourceFile(node) || ts.isFunctionLike(node)) inspectScope(node);
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);

  return violations;
}

export function checkBrowserCleanupFiles(
  files = fastGlob.sync('tests/browser/*.test.ts'),
) {
  return files.flatMap(file => (
    findUnsafeBrowserCleanup(readFileSync(file, 'utf8'), file)
      .map(violation => ({ file, ...violation }))
  ));
}

function main() {
  const violations = checkBrowserCleanupFiles();
  if (violations.length === 0) return;

  for (const violation of violations) {
    console.error(
      `${violation.file}:${violation.line}: unsafe sequential cleanup of `
      + `${violation.browser} and ${violation.server}; use closeBrowserAndServer().`,
    );
  }
  process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();