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

function resourcePath(node) {
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isPropertyAccessExpression(node)) {
    const parent = resourcePath(node.expression);
    return parent ? `${parent}.${node.name.text}` : null;
  }
  if (ts.isElementAccessExpression(node)) {
    const parent = resourcePath(node.expression);
    const index = unwrappedInitializer(node.argumentExpression);
    if (!parent || !ts.isNumericLiteral(index)) return null;
    return `${parent}[${index.text}]`;
  }
  return null;
}
function assignmentIdentifier(node) {
  return ts.isIdentifier(node) ? node.text : null;
}

function markFactoryResult(target, factory, markBinding) {
  const targetPath = resourcePath(target);
  if (targetPath) {
    if (BROWSER_FACTORIES.test(factory)) markBinding(targetPath, 'browser');
    if (SERVER_FACTORIES.test(factory)) markBinding(targetPath, 'server');
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
  const name = resourcePath(receiver);
  return name
    ? { name, node }
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
      if (!name) return;
      clearBinding(name);
      owned.set(name, kind);
    }

    function clearBinding(name) {
      for (const ownedName of owned.keys()) {
        if (
          ownedName === name
          || ownedName.startsWith(`${name}.`)
          || ownedName.startsWith(`${name}[`)
        ) {
          owned.delete(ownedName);
        }
      }
    }

    function resourceKinds(value) {
      const expression = unwrappedInitializer(value);
      const factory = calledName(expression);
      if (factory && BROWSER_FACTORIES.test(factory)) return new Set(['browser']);
      if (factory && SERVER_FACTORIES.test(factory)) return new Set(['server']);
      const path = resourcePath(expression);
      if (path) {
        const kind = owned.get(path);
        return kind ? new Set([kind]) : new Set();
      }
      if (ts.isConditionalExpression(expression)) {
        return new Set([
          ...resourceKinds(expression.whenTrue),
          ...resourceKinds(expression.whenFalse),
        ]);
      }
      if (
        ts.isBinaryExpression(expression)
        && (
          expression.operatorToken.kind === ts.SyntaxKind.BarBarToken
          || expression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
          || expression.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
        )
      ) {
        return new Set([
          ...resourceKinds(expression.left),
          ...resourceKinds(expression.right),
        ]);
      }
      return new Set();
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
      } else {
        const targetPath = resourcePath(target);
        if (!targetPath) return;
        if (ts.isObjectLiteralExpression(initializer)) {
          clearBinding(targetPath);
          for (const property of initializer.properties) {
            if (
              !ts.isPropertyAssignment(property)
              && !ts.isShorthandPropertyAssignment(property)
            ) {
              continue;
            }
            const propertyName = property.name;
            if (
              !ts.isIdentifier(propertyName)
              && !ts.isStringLiteral(propertyName)
              && !ts.isNumericLiteral(propertyName)
            ) {
              continue;
            }
            const propertyValue = ts.isShorthandPropertyAssignment(property)
              ? property.name
              : property.initializer;
            recordAssignment(
              ts.factory.createPropertyAccessExpression(target, propertyName.text),
              propertyValue,
            );
          }
          return;
        }
        if (ts.isArrayLiteralExpression(initializer)) {
          clearBinding(targetPath);
          initializer.elements.forEach((element, index) => {
            if (ts.isOmittedExpression(element) || ts.isSpreadElement(element)) return;
            recordAssignment(
              ts.factory.createElementAccessExpression(
                target,
                ts.factory.createNumericLiteral(index),
              ),
              element,
            );
          });
          return;
        }
        const kinds = resourceKinds(initializer);
        if (kinds.size === 1) {
          markBinding(targetPath, kinds.values().next().value);
        } else {
          clearBinding(targetPath);
        }
      }
    }

    function recordLogicalAssignment(target, value, operator) {
      const targetPath = resourcePath(target);
      if (!targetPath) return;
      const targetKinds = resourceKinds(target);
      if (
        targetKinds.size === 1
        && (
          operator === ts.SyntaxKind.BarBarEqualsToken
          || operator === ts.SyntaxKind.QuestionQuestionEqualsToken
        )
      ) {
        markBinding(targetPath, targetKinds.values().next().value);
        return;
      }
      const kinds = new Set([
        ...(operator === ts.SyntaxKind.AmpersandAmpersandEqualsToken
          && targetKinds.size === 1
          ? []
          : targetKinds),
        ...resourceKinds(value),
      ]);
      if (kinds.size === 1) {
        markBinding(targetPath, kinds.values().next().value);
      } else {
        clearBinding(targetPath);
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
      } else if (
        ts.isBinaryExpression(node)
        && (
          node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandEqualsToken
          || node.operatorToken.kind === ts.SyntaxKind.BarBarEqualsToken
          || node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionEqualsToken
        )
      ) {
        recordLogicalAssignment(node.left, node.right, node.operatorToken.kind);
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
  const initial = [{ closes: [], control: 'normal' }];

  function appendEvents(states, node) {
    const events = collectCloseEvents(node, owned);
    if (events.length === 0) return states;
    return states.map(state => ({
      ...state,
      closes: [...state.closes, ...events],
    }));
  }

  function runExpression(expression, states) {
    if (!expression || states.length === 0) return states;

    const resource = closedResource(expression);
    if (resource && owned.has(resource.name)) {
      return appendEvents(states, expression);
    }

    if (
      ts.isParenthesizedExpression(expression)
      || ts.isAsExpression(expression)
      || ts.isAwaitExpression(expression)
    ) {
      return runExpression(expression.expression, states);
    }

    if (ts.isConditionalExpression(expression)) {
      const afterCondition = runExpression(expression.condition, states);
      return [
        ...runExpression(expression.whenTrue, afterCondition),
        ...runExpression(expression.whenFalse, afterCondition),
      ];
    }

    if (ts.isBinaryExpression(expression)) {
      const afterLeft = runExpression(expression.left, states);
      if (
        expression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
        || expression.operatorToken.kind === ts.SyntaxKind.BarBarToken
        || expression.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
      ) {
        return [
          ...afterLeft,
          ...runExpression(expression.right, afterLeft),
        ];
      }
      return runExpression(expression.right, afterLeft);
    }

    const children = [];
    ts.forEachChild(expression, child => {
      if (!ts.isFunctionLike(child)) children.push(child);
    });
    return children.reduce(
      (current, child) => runExpression(child, current),
      states,
    );
  }

  function runStatements(statements, states) {
    return statements.reduce((current, statement) => {
      const active = current.filter(state => state.control === 'normal');
      const stopped = current.filter(state => state.control !== 'normal');
      return [...stopped, ...runStatement(statement, active)];
    }, states);
  }

  function withNormalControl(states, controls) {
    return states.map(state => (
      controls.includes(state.control)
        ? { ...state, control: 'normal' }
        : state
    ));
  }

  function runSwitch(statement, states) {
    const afterExpression = runExpression(statement.expression, states);
    const clauses = statement.caseBlock.clauses;
    const starts = clauses.map((_, index) => index);
    if (!clauses.some(ts.isDefaultClause)) starts.push(clauses.length);

    return starts.flatMap(start => {
      let paths = afterExpression;
      for (const clause of clauses.slice(start)) {
        const active = paths.filter(state => state.control === 'normal');
        const stopped = paths.filter(state => state.control !== 'normal');
        paths = [...stopped, ...runStatements(clause.statements, active)];
      }
      return withNormalControl(paths, ['break']);
    });
  }

  function runLoop(statement, states) {
    const isDo = ts.isDoStatement(statement);
    const condition = ts.isForStatement(statement)
      ? statement.condition
      : ts.isWhileStatement(statement) || isDo
        ? statement.expression
        : null;
    const incrementor = ts.isForStatement(statement) ? statement.incrementor : null;
    let entries = states;
    const exits = isDo ? [] : states;
    const stopped = [];

    for (let iteration = 0; iteration < 2; iteration += 1) {
      if (entries.length === 0) break;
      const checked = (!isDo || iteration > 0) && condition
        ? runExpression(condition, entries)
        : entries;
      const bodyResults = runStatement(statement.statement, checked);
      exits.push(...withNormalControl(
        bodyResults.filter(state => state.control === 'break'),
        ['break'],
      ));
      stopped.push(...bodyResults.filter(state => (
        state.control !== 'normal'
        && state.control !== 'continue'
        && state.control !== 'break'
      )));
      entries = withNormalControl(
        bodyResults.filter(state => (
          state.control === 'normal' || state.control === 'continue'
        )),
        ['continue'],
      );
      if (incrementor) entries = runExpression(incrementor, entries);
      if (condition) exits.push(...runExpression(condition, entries));
    }

    return [...exits, ...entries, ...stopped];
  }

  function runStatement(statement, states) {
    if (states.length === 0) return states;
    if (ts.isBlock(statement)) return runStatements(statement.statements, states);

    if (ts.isVariableStatement(statement)) {
      return statement.declarationList.declarations.reduce(
        (current, declaration) => runExpression(declaration.initializer, current),
        states,
      );
    }

    if (ts.isIfStatement(statement)) {
      const afterCondition = runExpression(statement.expression, states);
      const whenTrue = runStatement(statement.thenStatement, afterCondition);
      const whenFalse = statement.elseStatement
        ? runStatement(statement.elseStatement, afterCondition)
        : afterCondition;
      return [...whenTrue, ...whenFalse];
    }

    if (ts.isSwitchStatement(statement)) return runSwitch(statement, states);

    if (
      ts.isForStatement(statement)
      || ts.isForInStatement(statement)
      || ts.isForOfStatement(statement)
      || ts.isWhileStatement(statement)
      || ts.isDoStatement(statement)
    ) {
      return runLoop(statement, states);
    }

    if (ts.isBreakStatement(statement)) {
      return states.map(state => ({ ...state, control: 'break' }));
    }

    if (ts.isContinueStatement(statement)) {
      return states.map(state => ({ ...state, control: 'continue' }));
    }

    if (ts.isReturnStatement(statement) || ts.isThrowStatement(statement)) {
      return runExpression(statement.expression, states)
        .map(state => ({
          ...state,
          control: ts.isReturnStatement(statement) ? 'return' : 'throw',
        }));
    }

    if (ts.isTryStatement(statement)) {
      const attempted = runStatement(statement.tryBlock, states);
      const recovered = statement.catchClause
        ? runStatement(
          statement.catchClause.block,
          attempted.map(state => ({ ...state, control: 'normal' })),
        )
        : [];
      const paths = [...attempted, ...recovered];
      if (!statement.finallyBlock) return paths;
      return paths.flatMap(state => {
        const results = runStatement(
          statement.finallyBlock,
          [{ ...state, control: 'normal' }],
        );
        return results.map(result => ({
          ...result,
          control: result.control === 'normal' ? state.control : result.control,
        }));
      });
    }

    if (ts.isExpressionStatement(statement)) {
      return runExpression(statement.expression, states);
    }

    return appendEvents(states, statement);
  }

  if (ts.isSourceFile(scope) || ts.isBlock(scope)) {
    return runStatements(scope.statements, initial);
  }
  return scope.body && ts.isBlock(scope.body)
    ? runStatements(scope.body.statements, initial)
    : runExpression(scope.body ?? scope, initial);
}
