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

function collectCloseEvents(node, owned) {
  const events = [];

  function collect(current) {
    if (current !== node && ts.isFunctionLike(current)) return;
    const resource = closedResource(current);
    if (resource && owned.has(resource.name)) {
      events.push({ ...resource, kind: owned.get(resource.name) });
      return;
    }
    ts.forEachChild(current, collect);
  }

  collect(node);
  return events;
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

      ts.forEachChild(node, collect);
    }
    collect(scope);

    if (![...owned.values()].includes('browser') || ![...owned.values()].includes('server')) {
      return;
    }

    for (const path of cleanupPaths(scope, owned)) {
      for (let index = 0; index < path.closes.length; index += 1) {
        const first = path.closes[index];
        const second = path.closes
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
        return;
      }
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

function cleanupPaths(scope, owned) {
  const initial = [{ closes: [], abrupt: false }];

  function appendEvents(states, node) {
    const events = collectCloseEvents(node, owned);
    if (events.length === 0) return states;
    return states.map(state => ({
      ...state,
      closes: [...state.closes, ...events],
    }));
  }

  function runStatements(statements, states) {
    return statements.reduce((current, statement) => {
      const active = current.filter(state => !state.abrupt);
      const abrupt = current.filter(state => state.abrupt);
      return [...abrupt, ...runStatement(statement, active)];
    }, states);
  }

  function runStatement(statement, states) {
    if (states.length === 0) return states;
    if (ts.isBlock(statement)) return runStatements(statement.statements, states);

    if (ts.isIfStatement(statement)) {
      const afterCondition = appendEvents(states, statement.expression);
      const whenTrue = runStatement(statement.thenStatement, afterCondition);
      const whenFalse = statement.elseStatement
        ? runStatement(statement.elseStatement, afterCondition)
        : afterCondition;
      return [...whenTrue, ...whenFalse];
    }

    if (ts.isReturnStatement(statement) || ts.isThrowStatement(statement)) {
      return appendEvents(states, statement.expression ?? statement)
        .map(state => ({ ...state, abrupt: true }));
    }

    if (ts.isTryStatement(statement)) {
      const attempted = runStatement(statement.tryBlock, states);
      const recovered = statement.catchClause
        ? runStatement(
          statement.catchClause.block,
          attempted.map(state => ({ ...state, abrupt: false })),
        )
        : [];
      const paths = [...attempted, ...recovered];
      if (!statement.finallyBlock) return paths;
      return paths.flatMap(state => {
        const results = runStatement(
          statement.finallyBlock,
          [{ ...state, abrupt: false }],
        );
        return results.map(result => ({
          ...result,
          abrupt: state.abrupt || result.abrupt,
        }));
      });
    }

    return appendEvents(states, statement);
  }

  if (ts.isSourceFile(scope) || ts.isBlock(scope)) {
    return runStatements(scope.statements, initial);
  }
  return scope.body && ts.isBlock(scope.body)
    ? runStatements(scope.body.statements, initial)
    : appendEvents(initial, scope.body ?? scope);
}
