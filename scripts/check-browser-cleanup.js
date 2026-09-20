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

function collectOwnedResources(scope) {
  const owned = new Map();

  function markBinding(name, kind) {
    if (name) owned.set(name, kind);
  }

  function collect(node) {
    if (node !== scope && ts.isFunctionLike(node)) return;
    if (ts.isVariableDeclaration(node) && node.initializer) {
      const initializer = unwrappedInitializer(node.initializer);
      const factory = calledName(initializer);

      if (ts.isIdentifier(node.name)) {
        if (factory && BROWSER_FACTORIES.test(factory)) markBinding(node.name.text, 'browser');
        if (factory && SERVER_FACTORIES.test(factory)) markBinding(node.name.text, 'server');
      } else if (factory && ts.isObjectBindingPattern(node.name)) {
        for (const element of node.name.elements) {
          const property = element.propertyName?.getText() ?? element.name.getText();
          if (property === 'browser') markBinding(bindingIdentifier(element), 'browser');
          if (property === 'server') markBinding(bindingIdentifier(element), 'server');
        }
      } else if (
        factory === 'launchBrowserWithServer'
        && ts.isArrayBindingPattern(node.name)
      ) {
        const serverResult = node.name.elements[0];
        const browserResult = node.name.elements[1];
        if (serverResult && ts.isBindingElement(serverResult)) {
          if (ts.isObjectBindingPattern(serverResult.name)) {
            for (const element of serverResult.name.elements) {
              const property = element.propertyName?.getText() ?? element.name.getText();
              if (property === 'server') markBinding(bindingIdentifier(element), 'server');
            }
          } else {
            markBinding(bindingIdentifier(serverResult), 'server');
          }
        }
        if (browserResult && ts.isBindingElement(browserResult)) {
          markBinding(bindingIdentifier(browserResult), 'browser');
        }
      }
    }
    ts.forEachChild(node, collect);
  }
  collect(scope);
  return owned;
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
    const owned = collectOwnedResources(scope);
    if (![...owned.values()].includes('browser') || ![...owned.values()].includes('server')) {
      return;
    }

    const closes = [];
    function collect(node) {
      if (node !== scope && ts.isFunctionLike(node)) return;
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