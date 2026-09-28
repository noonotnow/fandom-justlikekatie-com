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

function bindingIdentifiers(name, identifiers = []) {
  if (ts.isIdentifier(name)) {
    identifiers.push(name);
  } else {
    for (const element of name.elements) {
      if (ts.isBindingElement(element)) bindingIdentifiers(element.name, identifiers);
    }
  }
  return identifiers;
}

function staticLiteralAliasResolver(scope, includeStrings = false) {
  const bindings = [];
  const reassignments = [];

  function nearestLexicalContainer(node) {
    let current = node.parent;
    while (current && current !== scope) {
      if (
        ts.isBlock(current)
        || ts.isSourceFile(current)
        || ts.isCaseBlock(current)
        || ts.isCatchClause(current)
      ) {
        return current;
      }
      current = current.parent;
    }
    return scope;
  }

  function variableContainer(declaration) {
    if (ts.isCatchClause(declaration.parent)) return declaration.parent;
    const declarationList = declaration.parent;
    if (!(ts.getCombinedNodeFlags(declarationList) & ts.NodeFlags.BlockScoped)) {
      return scope;
    }
    const parent = declarationList.parent;
    if (
      (ts.isForStatement(parent) && parent.initializer === declarationList)
      || (
        (ts.isForInStatement(parent) || ts.isForOfStatement(parent))
        && parent.initializer === declarationList
      )
    ) {
      return parent;
    }
    return nearestLexicalContainer(declarationList);
  }

  function addBinding(name, node, container, value) {
    bindings.push({ name: name.text, value, node, container });
  }

  function collect(node) {
    if (node !== scope && ts.isFunctionLike(node)) {
      if (ts.isFunctionDeclaration(node) && node.name) {
        addBinding(node.name, node, nearestLexicalContainer(node), undefined);
      }
      return;
    }
    if (ts.isVariableDeclaration(node)) {
      const initializer = node.initializer
        ? unwrappedInitializer(node.initializer)
        : null;
      const isStaticConst = (
        ts.isIdentifier(node.name)
        && initializer
        && (
          staticNumericKey(initializer) !== null
          || (includeStrings && ts.isStringLiteral(initializer))
        )
        && (ts.getCombinedNodeFlags(node.parent) & ts.NodeFlags.Const)
      );
      for (const name of bindingIdentifiers(node.name)) {
        addBinding(
          name,
          node,
          variableContainer(node),
          isStaticConst
            ? ts.isStringLiteral(initializer)
              ? initializer.text
              : staticNumericKey(initializer)
            : undefined,
        );
      }
    } else if (ts.isParameter(node)) {
      for (const name of bindingIdentifiers(node.name)) addBinding(name, node, scope, undefined);
    } else if (ts.isClassDeclaration(node) && node.name) {
      addBinding(node.name, node, nearestLexicalContainer(node), undefined);
    } else if (
      ts.isBinaryExpression(node)
      && ts.isAssignmentOperator(node.operatorToken.kind)
      && ts.isIdentifier(node.left)
    ) {
      reassignments.push({ name: node.left.text, node: node.left });
    } else if (
      (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node))
      && ts.isIdentifier(node.operand)
      && (
        node.operator === ts.SyntaxKind.PlusPlusToken
        || node.operator === ts.SyntaxKind.MinusMinusToken
      )
    ) {
      reassignments.push({ name: node.operand.text, node: node.operand });
    }
    ts.forEachChild(node, collect);
  }

  function visibleBinding(name, useNode) {
    const containers = [];
    let current = useNode;
    while (current) {
      if (
        current === scope
        || ts.isBlock(current)
        || ts.isSourceFile(current)
        || ts.isCaseBlock(current)
        || ts.isCatchClause(current)
        || ts.isForStatement(current)
        || ts.isForInStatement(current)
        || ts.isForOfStatement(current)
      ) {
        containers.push(current);
      }
      if (current === scope) break;
      current = current.parent;
    }
    for (const container of containers) {
      const binding = bindings.find(candidate => (
        candidate.name === name && candidate.container === container
      ));
      if (binding) return binding;
    }
    return undefined;
  }

  collect(scope);
  const invalidBindings = new Set();
  for (const reassignment of reassignments) {
    const binding = visibleBinding(reassignment.name, reassignment.node);
    if (binding) invalidBindings.add(binding);
  }

  return {
    get(name, useNode) {
      const binding = visibleBinding(name, useNode);
      return (
        binding
        && binding.node.getStart() < useNode.getStart()
        && !invalidBindings.has(binding)
      )
        ? binding.value
        : undefined;
    },
    has(name, useNode) {
      return this.get(name, useNode) !== undefined;
    },
  };
}

function resourcePath(
  node,
  numericIndexAliases = new Map(),
  identifierName = identifier => identifier.text,
) {
  if (ts.isIdentifier(node)) return identifierName(node);
  if (ts.isPropertyAccessExpression(node)) {
    const parent = resourcePath(node.expression, numericIndexAliases, identifierName);
    return parent ? `${parent}.${node.name.text}` : null;
  }
  if (ts.isElementAccessExpression(node)) {
    const parent = resourcePath(node.expression, numericIndexAliases, identifierName);
    const index = unwrappedInitializer(node.argumentExpression);
    const literalIndex = staticNumericKey(index);
    const resolvedIndex = literalIndex !== null
      ? literalIndex
      : ts.isStringLiteral(index) && /^(?:0|[1-9]\d*|-[1-9]\d*)$/.test(index.text)
        ? index.text
        : ts.isIdentifier(index)
          ? numericIndexAliases.get(index.text, index)
          : null;
    if (!parent || resolvedIndex === undefined || resolvedIndex === null) return null;
    return `${parent}[${resolvedIndex}]`;
  }
  return null;
}
function assignmentIdentifier(node) {
  return ts.isIdentifier(node) ? node.text : null;
}

function staticNumericKey(node) {
  if (ts.isNumericLiteral(node)) return String(Number(node.text));
  if (
    ts.isPrefixUnaryExpression(node)
    && (node.operator === ts.SyntaxKind.MinusToken || node.operator === ts.SyntaxKind.PlusToken)
    && ts.isNumericLiteral(node.operand)
  ) {
    const value = Number(node.operand.text);
    return String(node.operator === ts.SyntaxKind.MinusToken ? -value : value);
  }
  return null;
}
function staticPropertyName(node, staticPropertyAliases) {
  if (
    ts.isIdentifier(node)
    || ts.isStringLiteral(node)
    || ts.isNumericLiteral(node)
  ) {
    return node.text;
  }
  if (
    ts.isComputedPropertyName(node)
    && (
      ts.isStringLiteral(node.expression)
      || staticNumericKey(node.expression) !== null
      || (
        ts.isIdentifier(node.expression)
        && staticPropertyAliases.has(node.expression.text, node.expression)
      )
    )
  ) {
    return ts.isIdentifier(node.expression)
      ? staticPropertyAliases.get(node.expression.text, node.expression)
      : ts.isStringLiteral(node.expression)
        ? node.expression.text
        : staticNumericKey(node.expression);
  }
  return null;
}

function markFactoryResult(
  target,
  factory,
  markBinding,
  numericIndexAliases,
  identifierName,
) {
  const targetPath = resourcePath(target, numericIndexAliases, identifierName);
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
      markFactoryResult(
        serverTarget,
        factory,
        markBinding,
        numericIndexAliases,
        identifierName,
      );
    } else {
      markBinding(assignmentIdentifier(serverTarget), 'server');
    }
    markBinding(assignmentIdentifier(browserTarget), 'browser');
  }
}

function closedResource(node, numericIndexAliases, identifierName) {
  if (
    !ts.isAwaitExpression(node)
    || !ts.isCallExpression(node.expression)
    || !ts.isPropertyAccessExpression(node.expression.expression)
    || node.expression.expression.name.text !== 'close'
  ) {
    return null;
  }

  const receiver = node.expression.expression.expression;
  const name = resourcePath(receiver, numericIndexAliases, identifierName);
  const displayName = resourcePath(receiver, numericIndexAliases);
  return name
    ? { name, displayName, node }
    : null;
}

function collectCloseEvents(node, owned, numericIndexAliases, identifierName) {
  const events = [];

  function collect(current) {
    if (current !== node && ts.isFunctionLike(current)) return;
    const resource = closedResource(current, numericIndexAliases, identifierName);
    if (resource && owned.has(resource.name)) {
      events.push({ ...resource, kind: owned.get(resource.name) });
      return;
    }
    ts.forEachChild(current, collect);
  }

  collect(node);
  return events;
}
export function findUnsafeBrowserCleanup(source, fileName = 'browser.test.ts', metrics) {
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
    const knownProperties = new Map();
    const knownArrayLengths = new Map();
    const knownArrays = new Set();
    const numericIndexAliases = staticLiteralAliasResolver(scope);
    const staticPropertyAliases = staticLiteralAliasResolver(scope, true);
    let spreadSnapshotIndex = 0;
    const lexicalScopedNames = new Map();
    const lexicalScopeIds = new Map();
    let nextLexicalScopeId = 1;

    function lexicalContainer(declarationList) {
      const parent = declarationList.parent;
      if (
        (ts.isForStatement(parent) && parent.initializer === declarationList)
        || (
          (ts.isForInStatement(parent) || ts.isForOfStatement(parent))
          && parent.initializer === declarationList
        )
      ) {
        return parent;
      }
      return ts.isVariableStatement(parent) && ts.isBlock(parent.parent)
        ? parent.parent
        : null;
    }

    function addLexicalScopedName(container, name) {
      if (!lexicalScopedNames.has(container)) lexicalScopedNames.set(container, new Set());
      if (!lexicalScopeIds.has(container)) {
        lexicalScopeIds.set(container, nextLexicalScopeId);
        nextLexicalScopeId += 1;
      }
      lexicalScopedNames.get(container).add(name);
    }

    function collectBlockScopedNames(node) {
      if (node !== scope && ts.isFunctionLike(node)) return;
      if (
        ts.isVariableDeclarationList(node)
        && (node.flags & (ts.NodeFlags.Let | ts.NodeFlags.Const))
      ) {
        const container = lexicalContainer(node);
        if (container) {
          for (const declaration of node.declarations) {
            for (const name of bindingIdentifiers(declaration.name)) {
              addLexicalScopedName(container, name.text);
            }
          }
        }
      } else if (
        ts.isCatchClause(node)
        && node.variableDeclaration
      ) {
        for (const name of bindingIdentifiers(node.variableDeclaration.name)) {
          addLexicalScopedName(node, name.text);
        }
      }
      ts.forEachChild(node, collectBlockScopedNames);
    }
    collectBlockScopedNames(scope);

    const scopeBody = ts.isFunctionLike(scope) && scope.body && ts.isBlock(scope.body)
      ? scope.body
      : scope;

    function scopedIdentifierName(identifier) {
      let current = identifier.parent;
      while (current && current !== scopeBody && current !== scope) {
        if (
          (
            ts.isBlock(current)
            || ts.isCatchClause(current)
            || ts.isForStatement(current)
            || ts.isForInStatement(current)
            || ts.isForOfStatement(current)
          )
          && lexicalScopedNames.get(current)?.has(identifier.text)
        ) {
          return `#${lexicalScopeIds.get(current)}:${identifier.text}`;
        }
        current = current.parent;
      }
      return identifier.text;
    }

    const pathFor = node => resourcePath(
      node,
      numericIndexAliases,
      scopedIdentifierName,
    );

    function propertyPath(parentPath, propertyName) {
      return /^(?:0|[1-9]\d*|-[1-9]\d*)$/.test(propertyName)
        ? `${parentPath}[${propertyName}]`
        : `${parentPath}.${propertyName}`;
    }

    function propertyTarget(target, propertyName) {
      return /^(?:0|[1-9]\d*|-[1-9]\d*)$/.test(propertyName)
        ? ts.factory.createElementAccessExpression(
            target,
            ts.factory.createStringLiteral(propertyName),
          )
        : ts.factory.createPropertyAccessExpression(target, propertyName);
    }

    function registerProperty(path) {
      const separator = path.lastIndexOf('.');
      if (separator < 0) return;
      const parent = path.slice(0, separator);
      const property = path.slice(separator + 1);
      if (!knownProperties.has(parent)) knownProperties.set(parent, new Set());
      knownProperties.get(parent).add(property);
    }

    function markBinding(name, kind) {
      if (!name) return;
      clearBinding(name);
      owned.set(name, kind);
      registerProperty(name);
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

    function clearKnownProperties(name) {
      for (const knownName of knownProperties.keys()) {
        if (knownName === name || knownName.startsWith(`${name}.`)) {
          knownProperties.delete(knownName);
        }
      }
    }

    function clearKnownArrayLengths(name) {
      for (const knownName of knownArrayLengths.keys()) {
        if (
          knownName === name
          || knownName.startsWith(`${name}.`)
          || knownName.startsWith(`${name}[`)
        ) {
          knownArrayLengths.delete(knownName);
        }
      }
    }

    function clearKnownArrays(name) {
      for (const knownName of knownArrays) {
        if (
          knownName === name
          || knownName.startsWith(`${name}.`)
          || knownName.startsWith(`${name}[`)
        ) {
          knownArrays.delete(knownName);
        }
      }
    }

    function resourceKinds(value) {
      const expression = unwrappedInitializer(value);
      const factory = calledName(expression);
      if (factory && BROWSER_FACTORIES.test(factory)) return new Set(['browser']);
      if (factory && SERVER_FACTORIES.test(factory)) return new Set(['server']);
      const path = pathFor(expression);
      if (path) {
        const kind = owned.get(path);
        return kind ? new Set([kind]) : new Set();
      }
      if (ts.isConditionalExpression(expression)) {
        const ownedBeforeBranches = new Map(owned);
        const propertiesBeforeBranches = new Map(
          [...knownProperties].map(([path, properties]) => [path, new Set(properties)]),
        );
        function isolatedBranchKinds(branch) {
          owned.clear();
          for (const [path, kind] of ownedBeforeBranches) owned.set(path, kind);
          knownProperties.clear();
          for (const [path, properties] of propertiesBeforeBranches) {
            knownProperties.set(path, new Set(properties));
          }
          return resourceKinds(branch);
        }
        const whenTrueKinds = isolatedBranchKinds(expression.whenTrue);
        const whenFalseKinds = isolatedBranchKinds(expression.whenFalse);
        owned.clear();
        for (const [path, kind] of ownedBeforeBranches) owned.set(path, kind);
        knownProperties.clear();
        for (const [path, properties] of propertiesBeforeBranches) {
          knownProperties.set(path, new Set(properties));
        }
        return new Set([
          ...whenTrueKinds,
          ...whenFalseKinds,
        ]);
      }
      if (
        ts.isBinaryExpression(expression)
        && (
          expression.operatorToken.kind === ts.SyntaxKind.EqualsToken
          || expression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandEqualsToken
          || expression.operatorToken.kind === ts.SyntaxKind.BarBarEqualsToken
          || expression.operatorToken.kind === ts.SyntaxKind.QuestionQuestionEqualsToken
        )
      ) {
        if (expression.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
          recordAssignment(expression.left, expression.right);
        } else {
          recordLogicalAssignment(
            expression.left,
            expression.right,
            expression.operatorToken.kind,
          );
        }
        return resourceKinds(expression.left);
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

    function spreadOwnedProperties(target, source, previousState = null) {
      const targetPath = pathFor(target);
      const initializer = unwrappedInitializer(source);
      if (!targetPath) return;

      function ownedPropertyEntries(sourcePath, property, sourceOwned) {
        const sourceProperty = propertyPath(sourcePath, property);
        return [...sourceOwned]
          .filter(([ownedPath]) => (
            ownedPath === sourceProperty || ownedPath.startsWith(`${sourceProperty}.`)
          ))
          .map(([ownedPath, kind]) => [ownedPath.slice(sourceProperty.length), kind])
          .sort(([leftPath, leftKind], [rightPath, rightKind]) => (
            leftPath.localeCompare(rightPath) || leftKind.localeCompare(rightKind)
          ));
      }

      function snapshotSourcePath(sourcePath) {
        const sourceOwned = sourcePath === targetPath && previousState
          ? previousState.owned
          : owned;
        const sourceKnownProperties = sourcePath === targetPath && previousState
          ? previousState.knownProperties
          : knownProperties;
        const properties = sourceKnownProperties.get(sourcePath);
        if (!properties) return null;
        return new Map([...properties].map(property => [
          property,
          ownedPropertyEntries(sourcePath, property, sourceOwned),
        ]));
      }

      function snapshotObjectLiteral(objectLiteral) {
        const snapshotName = `__browserCleanupSpreadSnapshot${spreadSnapshotIndex}`;
        spreadSnapshotIndex += 1;
        const snapshotTarget = ts.factory.createIdentifier(snapshotName);
        applyObjectLiteral(snapshotTarget, objectLiteral, true);
        const snapshot = snapshotSourcePath(snapshotName) ?? new Map();
        clearBinding(snapshotName);
        clearKnownProperties(snapshotName);
        clearKnownArrayLengths(snapshotName);
        return snapshot;
      }

      function possibleSourceSnapshots(value) {
        const expression = unwrappedInitializer(value);
        const path = pathFor(expression);
        if (path) {
          const snapshot = snapshotSourcePath(path);
          return snapshot ? [snapshot] : [];
        }
        if (ts.isObjectLiteralExpression(expression)) {
          return [snapshotObjectLiteral(expression)];
        }
        if (ts.isConditionalExpression(expression)) {
          return [
            ...possibleSourceSnapshots(expression.whenTrue),
            ...possibleSourceSnapshots(expression.whenFalse),
          ];
        }
        if (
          ts.isBinaryExpression(expression)
          && (
            expression.operatorToken.kind === ts.SyntaxKind.BarBarToken
            || expression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
            || expression.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
          )
        ) {
          return [
            ...possibleSourceSnapshots(expression.left),
            ...possibleSourceSnapshots(expression.right),
          ];
        }
        return [];
      }

      const alternatives = possibleSourceSnapshots(initializer);
      if (alternatives.length === 0) return;
      const properties = new Set(alternatives.flatMap(snapshot => [...snapshot.keys()]));
      const transferred = [];
      for (const property of properties) {
        if (alternatives.some(snapshot => !snapshot.has(property))) continue;
        const targetProperty = propertyPath(targetPath, property);
        clearBinding(targetProperty);
        clearKnownProperties(targetProperty);
        clearKnownArrayLengths(targetProperty);
        const entriesByAlternative = alternatives.map(snapshot => snapshot.get(property));
        const signature = JSON.stringify(entriesByAlternative[0]);
        if (entriesByAlternative.some(entries => JSON.stringify(entries) !== signature)) {
          continue;
        }
        for (const [suffix, kind] of entriesByAlternative[0]) {
          transferred.push([`${targetProperty}${suffix}`, kind]);
        }
      }
      for (const [ownedPath, kind] of transferred) {
        markBinding(ownedPath, kind);
      }
      knownProperties.set(targetPath, new Set([
        ...(knownProperties.get(targetPath) ?? []),
        ...properties,
      ]));
    }

    function applyObjectLiteral(target, initializer, reset) {
      const targetPath = pathFor(target);
      if (!targetPath) return;
      const previousState = reset
        ? {
            owned: new Map(owned),
            knownProperties: new Map(
              [...knownProperties].map(([path, properties]) => [
                path,
                new Set(properties),
              ]),
            ),
          }
        : null;
      if (!knownProperties.has(targetPath)) knownProperties.set(targetPath, new Set());
      if (reset) {
        clearBinding(targetPath);
        clearKnownProperties(targetPath);
        knownProperties.set(targetPath, new Set());
      }
      for (const property of initializer.properties) {
        if (ts.isSpreadAssignment(property)) {
          spreadOwnedProperties(target, property.expression, previousState);
          continue;
        }
        if (
          ts.isGetAccessorDeclaration(property)
          || ts.isSetAccessorDeclaration(property)
          || ts.isMethodDeclaration(property)
        ) {
          const propertyName = staticPropertyName(property.name, staticPropertyAliases);
          if (propertyName === null) continue;
          knownProperties.get(targetPath)?.add(propertyName);
          const targetProperty = propertyTarget(target, propertyName);
          clearBinding(pathFor(targetProperty));
          clearKnownProperties(pathFor(targetProperty));
          clearKnownArrayLengths(pathFor(targetProperty));
          continue;
        }
        if (
          !ts.isPropertyAssignment(property)
          && !ts.isShorthandPropertyAssignment(property)
        ) {
          continue;
        }
        const propertyName = staticPropertyName(property.name, staticPropertyAliases);
        if (propertyName === null) continue;
        knownProperties.get(targetPath)?.add(propertyName);
        const propertyValue = ts.isShorthandPropertyAssignment(property)
          ? property.name
          : property.initializer;
        recordAssignment(
          propertyTarget(target, propertyName),
          propertyValue,
        );
      }
    }

    function appendFixedArrayElements(elements, appendValue, appendOmitted, appendKnownSpread) {
      function appendSpread(expression) {
        const spread = unwrappedInitializer(expression);
        if (ts.isArrayLiteralExpression(spread)) {
          return appendElements(spread.elements);
        }
        return appendKnownSpread(spread);
      }

      function appendElements(values) {
        for (const element of values) {
          if (ts.isOmittedExpression(element)) {
            appendOmitted();
          } else if (ts.isSpreadElement(element)) {
            if (!appendSpread(element.expression)) return false;
          } else {
            appendValue(element);
          }
        }
        return true;
      }

      return appendElements(elements);
    }

    function recordAssignment(target, value) {
      const initializer = unwrappedInitializer(value);
      const factory = calledName(initializer);
      const targetPath = pathFor(target);
      const recognizedFactory = factory && (
        BROWSER_FACTORIES.test(factory)
        || SERVER_FACTORIES.test(factory)
      );
      if (recognizedFactory) {
        if (targetPath) clearKnownArrays(targetPath);
        markFactoryResult(
          target,
          factory,
          markBinding,
          numericIndexAliases,
          scopedIdentifierName,
        );
      } else {
        if (!targetPath) return;
        registerProperty(targetPath);
        if (ts.isObjectLiteralExpression(initializer)) {
          clearKnownArrayLengths(targetPath);
          clearKnownArrays(targetPath);
          applyObjectLiteral(target, initializer, true);
          return;
        }
        if (ts.isArrayLiteralExpression(initializer)) {
          const previousLength = knownArrayLengths.get(targetPath);
          const previousPrefix = `${targetPath}[`;
          const previousOwnership = [...owned]
            .filter(([name]) => name.startsWith(previousPrefix))
            .map(([name, kind]) => [name.slice(targetPath.length), kind]);
          clearBinding(targetPath);
          clearKnownProperties(targetPath);
          clearKnownArrayLengths(targetPath);
          clearKnownArrays(targetPath);
          knownArrays.add(targetPath);
          let length = 0;
          function appendValue(element) {
            recordAssignment(
              ts.factory.createElementAccessExpression(
                target,
                ts.factory.createNumericLiteral(length),
              ),
              element,
            );
            length += 1;
          }
          const expanded = appendFixedArrayElements(
            initializer.elements,
            appendValue,
            () => {
              length += 1;
            },
            spread => {
              const sourcePath = pathFor(spread);
              if (
                !sourcePath
                || (
                  sourcePath === targetPath
                    ? previousLength === undefined
                    : !knownArrayLengths.has(sourcePath)
                )
              ) {
                return false;
              }
              const sourceLength = sourcePath === targetPath
                ? previousLength
                : knownArrayLengths.get(sourcePath);
              if (sourceLength === undefined) return false;
              for (let index = 0; index < sourceLength; index += 1) {
                if (sourcePath === targetPath) {
                  const sourcePrefix = `[${index}]`;
                  for (const [suffix, kind] of previousOwnership) {
                    if (suffix === sourcePrefix || suffix.startsWith(`${sourcePrefix}.`)) {
                      markBinding(`${targetPath}[${length}]${suffix.slice(sourcePrefix.length)}`, kind);
                    }
                  }
                  length += 1;
                  continue;
                }
                appendValue(
                  ts.factory.createElementAccessExpression(
                    spread,
                    ts.factory.createNumericLiteral(index),
                  ),
                );
              }
              return true;
            },
          );
          if (!expanded) {
            clearArrayTracking(targetPath);
            return;
          }
          knownArrayLengths.set(targetPath, length);
          return;
        }
        const kinds = resourceKinds(initializer);
        if (kinds.size === 1) {
          clearKnownArrayLengths(targetPath);
          clearKnownArrays(targetPath);
          markBinding(targetPath, kinds.values().next().value);
        } else {
          clearBinding(targetPath);
          clearKnownProperties(targetPath);
          clearKnownArrayLengths(targetPath);
          clearKnownArrays(targetPath);
        }
      }

      if (ts.isElementAccessExpression(target)) {
        const parentPath = pathFor(target.expression);
        const index = unwrappedInitializer(target.argumentExpression);
        if (
          parentPath
          && (
            ts.isNumericLiteral(index)
            || (ts.isIdentifier(index) && numericIndexAliases.has(index.text, index))
          )
          && knownArrayLengths.has(parentPath)
        ) {
          const resolvedIndex = ts.isNumericLiteral(index)
            ? index.text
            : numericIndexAliases.get(index.text, index);
          knownArrayLengths.set(
            parentPath,
            Math.max(knownArrayLengths.get(parentPath), Number(resolvedIndex) + 1),
          );
        }
      }
    }

    function staticArrayIndex(node) {
      const expression = unwrappedInitializer(node);
      if (ts.isNumericLiteral(expression)) return Number(expression.text);
      if (ts.isPrefixUnaryExpression(expression)) {
        if (expression.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(expression.operand)) {
          return -Number(expression.operand.text);
        }
        if (expression.operator === ts.SyntaxKind.PlusToken && ts.isNumericLiteral(expression.operand)) {
          return Number(expression.operand.text);
        }
      }
      if (
        ts.isIdentifier(expression)
        && numericIndexAliases.has(expression.text, expression)
      ) {
        return Number(numericIndexAliases.get(expression.text, expression));
      }
      return null;
    }

    function remapArrayOwnership(targetPath, mapIndex) {
      const prefix = `${targetPath}[`;
      const entries = [...owned].filter(([name]) => (
        name.startsWith(prefix) && /^\[(?:0|[1-9]\d*)\](?:$|[.[])/.test(name.slice(targetPath.length))
      ));
      for (const [name] of entries) owned.delete(name);
      for (const [name, kind] of entries) {
        const match = name.slice(targetPath.length).match(/^\[(\d+)\](.*)$/);
        if (!match) continue;
        const nextIndex = mapIndex(Number(match[1]));
        if (nextIndex === null) continue;
        owned.set(`${targetPath}[${nextIndex}]${match[2]}`, kind);
      }
    }

    function copyArrayOwnership(targetPath, targetIndex, startIndex, count) {
      const entries = [...owned];
      const prefix = `${targetPath}[`;
      for (let offset = 0; offset < count; offset += 1) {
        clearBinding(`${targetPath}[${targetIndex + offset}]`);
      }
      for (const [name, kind] of entries) {
        if (!name.startsWith(prefix)) continue;
        const match = name.slice(targetPath.length).match(/^\[(\d+)\](.*)$/);
        if (!match) continue;
        const sourceIndex = Number(match[1]);
        if (sourceIndex < startIndex || sourceIndex >= startIndex + count) continue;
        owned.set(
          `${targetPath}[${targetIndex + sourceIndex - startIndex}]${match[2]}`,
          kind,
        );
      }
    }

    function clearArrayTracking(targetPath) {
      clearBinding(targetPath);
      clearKnownArrayLengths(targetPath);
    }

    function arrayLengthTargetPath(target) {
      if (ts.isPropertyAccessExpression(target)) {
        if (target.name.text !== 'length') return null;
      } else if (ts.isElementAccessExpression(target)) {
        const index = unwrappedInitializer(target.argumentExpression);
        const propertyName = ts.isStringLiteral(index)
          ? index.text
          : ts.isIdentifier(index)
            ? staticPropertyAliases.get(index.text, index)
            : null;
        if (propertyName !== 'length') return null;
      } else {
        return null;
      }
      const targetPath = pathFor(target.expression);
      return targetPath && knownArrays.has(targetPath) ? targetPath : null;
    }

    function updateArrayLength(targetPath, length) {
      if (length === null || !Number.isInteger(length) || length < 0) {
        remapArrayOwnership(targetPath, () => null);
        clearKnownArrayLengths(targetPath);
        return;
      }

      remapArrayOwnership(targetPath, index => (index < length ? index : null));
      if (knownArrayLengths.has(targetPath)) {
        knownArrayLengths.set(targetPath, length);
      }
    }

    function recordArrayLengthAssignment(target, value) {
      const targetPath = arrayLengthTargetPath(target);
      if (!targetPath) return false;

      updateArrayLength(targetPath, staticArrayIndex(value));
      return true;
    }

    function recordArrayLengthCompoundAssignment(target, value, operator) {
      const targetPath = arrayLengthTargetPath(target);
      if (!targetPath) return false;

      const currentLength = knownArrayLengths.get(targetPath);
      const operand = staticArrayIndex(value);
      if (currentLength === undefined || operand === null) {
        updateArrayLength(targetPath, null);
        return true;
      }

      const operations = new Map([
        [ts.SyntaxKind.PlusEqualsToken, (left, right) => left + right],
        [ts.SyntaxKind.MinusEqualsToken, (left, right) => left - right],
        [ts.SyntaxKind.AsteriskEqualsToken, (left, right) => left * right],
        [ts.SyntaxKind.SlashEqualsToken, (left, right) => left / right],
        [ts.SyntaxKind.PercentEqualsToken, (left, right) => left % right],
        [ts.SyntaxKind.AsteriskAsteriskEqualsToken, (left, right) => left ** right],
        [ts.SyntaxKind.LessThanLessThanEqualsToken, (left, right) => left << right],
        [ts.SyntaxKind.GreaterThanGreaterThanEqualsToken, (left, right) => left >> right],
        [ts.SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken, (left, right) => left >>> right],
        [ts.SyntaxKind.AmpersandEqualsToken, (left, right) => left & right],
        [ts.SyntaxKind.BarEqualsToken, (left, right) => left | right],
        [ts.SyntaxKind.CaretEqualsToken, (left, right) => left ^ right],
      ]);
      const operation = operations.get(operator);
      if (!operation) return false;
      updateArrayLength(targetPath, operation(currentLength, operand));
      return true;
    }

    function recordArrayLengthIncrement(node) {
      if (
        !ts.isPrefixUnaryExpression(node)
        && !ts.isPostfixUnaryExpression(node)
      ) {
        return false;
      }
      if (
        node.operator !== ts.SyntaxKind.PlusPlusToken
        && node.operator !== ts.SyntaxKind.MinusMinusToken
      ) {
        return false;
      }
      const targetPath = arrayLengthTargetPath(node.operand);
      if (!targetPath) return false;
      const currentLength = knownArrayLengths.get(targetPath);
      updateArrayLength(
        targetPath,
        currentLength === undefined
          ? null
          : currentLength + (node.operator === ts.SyntaxKind.PlusPlusToken ? 1 : -1),
      );
      return true;
    }

    function recordPropertyDeletion(node) {
      if (!ts.isDeleteExpression(node)) return;
      const target = node.expression;
      if (
        !ts.isPropertyAccessExpression(target)
        && !ts.isElementAccessExpression(target)
      ) {
        return;
      }
      const targetPath = pathFor(target.expression);
      if (!targetPath) return;

      const propertyName = ts.isPropertyAccessExpression(target)
        ? target.name.text
        : (
            ts.isStringLiteral(target.argumentExpression)
            || ts.isNumericLiteral(target.argumentExpression)
          )
          ? target.argumentExpression.text
          : staticNumericKey(target.argumentExpression) !== null
            ? staticNumericKey(target.argumentExpression)
            : (
                ts.isIdentifier(target.argumentExpression)
                && staticPropertyAliases.has(
                  target.argumentExpression.text,
                  target.argumentExpression,
                )
              )
              ? staticPropertyAliases.get(
                  target.argumentExpression.text,
                  target.argumentExpression,
                )
              : null;
      if (ts.isElementAccessExpression(target) && knownArrays.has(targetPath)) {
        if (!/^-[1-9]\d*$/.test(propertyName ?? '')) {
          const index = staticArrayIndex(target.argumentExpression);
          if (index === null) {
            remapArrayOwnership(targetPath, () => null);
            clearKnownArrayLengths(targetPath);
          } else if (Number.isInteger(index) && index >= 0) {
            clearBinding(`${targetPath}[${index}]`);
          }
          return;
        }
      }

      if (propertyName === null) {
        for (const property of knownProperties.get(targetPath) ?? []) {
          const deletedPath = propertyPath(targetPath, property);
          clearBinding(deletedPath);
          clearKnownProperties(deletedPath);
          clearKnownArrayLengths(deletedPath);
          clearKnownArrays(deletedPath);
        }
        knownProperties.delete(targetPath);
        return;
      }

      const deletedPath = propertyPath(targetPath, propertyName);
      clearBinding(deletedPath);
      clearKnownProperties(deletedPath);
      clearKnownArrayLengths(deletedPath);
      clearKnownArrays(deletedPath);
      knownProperties.get(targetPath)?.delete(propertyName);
    }

    function recordArrayMutation(node) {
      if (!ts.isCallExpression(node)) return;
      const access = node.expression;
      if (!ts.isPropertyAccessExpression(access) && !ts.isElementAccessExpression(access)) {
        return;
      }
      const target = access.expression;
      const targetPath = pathFor(target);
      if (!targetPath || !knownArrayLengths.has(targetPath)) return;

      const method = ts.isPropertyAccessExpression(access)
        ? access.name.text
        : (
            ts.isStringLiteral(access.argumentExpression)
            || ts.isNoSubstitutionTemplateLiteral(access.argumentExpression)
          )
          ? access.argumentExpression.text
          : ts.isIdentifier(access.argumentExpression)
            ? staticPropertyAliases.get(
                access.argumentExpression.text,
                access.argumentExpression,
              )
            : null;
      if (method === null || method === undefined) {
        // The computed name may be a mutator; indexed ownership is no longer reliable.
        clearArrayTracking(targetPath);
        return;
      }
      if (![
        'push',
        'unshift',
        'shift',
        'splice',
        'reverse',
        'sort',
        'copyWithin',
        'fill',
      ].includes(method)) return;

      let length = knownArrayLengths.get(targetPath);
      if (method === 'reverse') {
        remapArrayOwnership(targetPath, index => length - index - 1);
        return;
      }

      if (method === 'sort') {
        clearArrayTracking(targetPath);
        return;
      }

      if (method === 'copyWithin') {
        const rawTarget = node.arguments.length > 0
          ? staticArrayIndex(node.arguments[0])
          : null;
        const rawStart = node.arguments.length > 1
          ? staticArrayIndex(node.arguments[1])
          : null;
        const rawEnd = node.arguments.length > 2
          ? staticArrayIndex(node.arguments[2])
          : length;
        if (
          rawTarget === null
          || rawStart === null
          || rawEnd === null
          || !Number.isInteger(rawTarget)
          || !Number.isInteger(rawStart)
          || !Number.isInteger(rawEnd)
        ) {
          clearArrayTracking(targetPath);
          return;
        }
        const normalizeIndex = index => (
          index < 0
            ? Math.max(length + index, 0)
            : Math.min(index, length)
        );
        const targetIndex = normalizeIndex(rawTarget);
        const startIndex = normalizeIndex(rawStart);
        const endIndex = normalizeIndex(rawEnd);
        const count = Math.min(
          Math.max(endIndex - startIndex, 0),
          length - targetIndex,
        );
        copyArrayOwnership(targetPath, targetIndex, startIndex, count);
        return;
      }

      if (method === 'fill') {
         const rawStart = node.arguments.length > 1
           ? staticArrayIndex(node.arguments[1])
           : 0;
         const rawEnd = node.arguments.length > 2
           ? staticArrayIndex(node.arguments[2])
           : length;
         if (
           rawStart === null
           || rawEnd === null
           || !Number.isInteger(rawStart)
           || !Number.isInteger(rawEnd)
         ) {
           clearArrayTracking(targetPath);
           return;
         }
         const normalizeIndex = index => (
           index < 0
             ? Math.max(length + index, 0)
             : Math.min(index, length)
         );
         const startIndex = normalizeIndex(rawStart);
         const endIndex = normalizeIndex(rawEnd);
         const value = node.arguments[0];
         const valuePath = value ? pathFor(unwrappedInitializer(value)) : null;
         const replacementOwnership = valuePath
           ? [...owned]
               .filter(([name]) => (
                 name === valuePath
                 || name.startsWith(`${valuePath}.`)
                 || name.startsWith(`${valuePath}[`)
               ))
               .map(([name, kind]) => [name.slice(valuePath.length), kind])
           : [];
         for (let index = startIndex; index < endIndex; index += 1) {
           clearBinding(`${targetPath}[${index}]`);
         }
         for (let index = startIndex; index < endIndex; index += 1) {
           const replacementPath = `${targetPath}[${index}]`;
           if (replacementOwnership.length > 0) {
             for (const [suffix, kind] of replacementOwnership) {
               markBinding(`${replacementPath}${suffix}`, kind);
             }
           } else if (value) {
             recordAssignment(
               ts.factory.createElementAccessExpression(
                 target,
                 ts.factory.createNumericLiteral(index),
               ),
               value,
             );
           }
         }
         return;
       }

      if (method === 'push') {
        function appendValue(value) {
          recordAssignment(
            ts.factory.createElementAccessExpression(
              target,
              ts.factory.createNumericLiteral(length),
            ),
            value,
          );
          length += 1;
        }

        const expanded = appendFixedArrayElements(
          node.arguments,
          appendValue,
          () => {
            length += 1;
          },
          spread => {
            const sourcePath = pathFor(spread);
            if (!sourcePath || !knownArrayLengths.has(sourcePath)) return false;
            const sourceLength = knownArrayLengths.get(sourcePath);
            for (let index = 0; index < sourceLength; index += 1) {
              appendValue(
                ts.factory.createElementAccessExpression(
                  spread,
                  ts.factory.createNumericLiteral(index),
                ),
              );
            }
            return true;
          },
        );
        if (!expanded) {
          clearArrayTracking(targetPath);
          return;
        }
        knownArrayLengths.set(targetPath, length);
        return;
      }

      if (method === 'unshift') {
        if (node.arguments.some(ts.isSpreadElement)) {
          clearArrayTracking(targetPath);
          return;
        }
        const inserted = node.arguments.length;
        remapArrayOwnership(targetPath, index => index + inserted);
        node.arguments.forEach((argument, index) => {
          recordAssignment(
            ts.factory.createElementAccessExpression(
              target,
              ts.factory.createNumericLiteral(index),
            ),
            argument,
          );
        });
        knownArrayLengths.set(targetPath, length + inserted);
        return;
      }

      if (method === 'shift') {
        remapArrayOwnership(targetPath, index => (index === 0 ? null : index - 1));
        knownArrayLengths.set(targetPath, Math.max(0, length - 1));
        return;
      }

      if (node.arguments.length === 0) return;
      const rawStart = node.arguments.length > 0 ? staticArrayIndex(node.arguments[0]) : 0;
      const rawDeleteCount = node.arguments.length > 1
        ? staticArrayIndex(node.arguments[1])
        : length;
      const insertedValues = node.arguments.slice(2);
      if (
        rawStart === null
        || rawDeleteCount === null
        || !Number.isInteger(rawStart)
        || !Number.isInteger(rawDeleteCount)
        || insertedValues.some(ts.isSpreadElement)
      ) {
        clearArrayTracking(targetPath);
        return;
      }
      const start = rawStart < 0
        ? Math.max(length + rawStart, 0)
        : Math.min(rawStart, length);
      const deleteCount = Math.min(Math.max(rawDeleteCount, 0), length - start);
      const inserted = insertedValues.length;
      const delta = inserted - deleteCount;
      remapArrayOwnership(targetPath, index => {
        if (index < start) return index;
        if (index < start + deleteCount) return null;
        return index + delta;
      });
      insertedValues.forEach((argument, offset) => {
        recordAssignment(
          ts.factory.createElementAccessExpression(
            target,
            ts.factory.createNumericLiteral(start + offset),
          ),
          argument,
        );
      });
      knownArrayLengths.set(targetPath, length + delta);
    }

    function recordLogicalAssignment(target, value, operator) {
      const targetPath = pathFor(target);
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

    function recordBindingDefaults(name) {
      if (ts.isIdentifier(name)) return;
      for (const element of name.elements) {
        if (!ts.isBindingElement(element)) continue;
        if (element.initializer) {
          const kinds = resourceKinds(element.initializer);
          if (kinds.size === 1 && ts.isIdentifier(element.name)) {
            markBinding(
              scopedIdentifierName(element.name),
              kinds.values().next().value,
            );
          }
        }
        recordBindingDefaults(element.name);
      }
    }

    function recordAssignmentDefaults(target) {
      if (ts.isObjectLiteralExpression(target)) {
        for (const property of target.properties) {
          if (ts.isShorthandPropertyAssignment(property) && property.objectAssignmentInitializer) {
            const kinds = resourceKinds(property.objectAssignmentInitializer);
            if (kinds.size === 1) {
              markBinding(
                scopedIdentifierName(property.name),
                kinds.values().next().value,
              );
            }
          } else if (ts.isPropertyAssignment(property)) {
            recordAssignmentDefaults(property.initializer);
          }
        }
      } else if (ts.isArrayLiteralExpression(target)) {
        for (const element of target.elements) recordAssignmentDefaults(element);
      } else if (
        ts.isBinaryExpression(target)
        && target.operatorToken.kind === ts.SyntaxKind.EqualsToken
      ) {
        const kinds = resourceKinds(target.right);
        if (kinds.size === 1) {
          const path = pathFor(target.left);
          if (path) markBinding(path, kinds.values().next().value);
        }
        recordAssignmentDefaults(target.left);
      }
    }

    function collect(node) {
      if (node !== scope && ts.isFunctionLike(node)) return;
      if (ts.isVariableDeclaration(node)) {
        if (node.initializer) recordAssignment(node.name, node.initializer);
        recordBindingDefaults(node.name);
      } else if (ts.isCatchClause(node) && node.variableDeclaration) {
        recordBindingDefaults(node.variableDeclaration.name);
      } else if (
        ts.isBinaryExpression(node)
        && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
      ) {
        if (!recordArrayLengthAssignment(node.left, node.right)) {
          recordAssignment(node.left, node.right);
          recordAssignmentDefaults(node.left);
        }
      } else if (
        ts.isBinaryExpression(node)
        && ts.isAssignmentOperator(node.operatorToken.kind)
        && recordArrayLengthCompoundAssignment(
          node.left,
          node.right,
          node.operatorToken.kind,
        )
      ) {
        // Array length ownership was updated above.
      } else if (
        ts.isBinaryExpression(node)
        && (
          node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandEqualsToken
          || node.operatorToken.kind === ts.SyntaxKind.BarBarEqualsToken
          || node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionEqualsToken
        )
      ) {
        recordLogicalAssignment(node.left, node.right, node.operatorToken.kind);
      } else if (
        (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node))
        && recordArrayLengthIncrement(node)
      ) {
        // Array length ownership was updated above.
      } else if (ts.isDeleteExpression(node)) {
        recordPropertyDeletion(node);
      } else if (ts.isCallExpression(node)) {
        recordArrayMutation(node);
      }

      ts.forEachChild(node, collect);
    }
    collect(scope);

    if (![...owned.values()].includes('browser') || ![...owned.values()].includes('server')) {
      return;
    }

    for (const path of cleanupPaths(
      scope,
      owned,
      numericIndexAliases,
      scopedIdentifierName,
      metrics,
    )) {
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
          browser: browserClose.displayName,
          server: serverClose.displayName,
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

export function findDirectBrowserNavigations(source, fileName = 'browser.test.ts') {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const violations = [];

  function visit(node) {
    if (
      ts.isCallExpression(node)
      && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === 'goto'
    ) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      violations.push({
        kind: 'direct-navigation',
        line: line + 1,
        receiver: node.expression.expression.getText(sourceFile),
      });
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return violations;
}

export function checkBrowserCleanupFiles(
  files = fastGlob.sync('tests/browser/*.test.ts'),
) {
  return files.flatMap(file => {
    const source = readFileSync(file, 'utf8');
    return [
      ...findUnsafeBrowserCleanup(source, file)
        .map(violation => ({ file, kind: 'unsafe-cleanup', ...violation })),
      ...findDirectBrowserNavigations(source, file)
        .map(violation => ({ file, ...violation })),
    ];
  });
}

function main() {
  const violations = checkBrowserCleanupFiles();
  if (violations.length === 0) return;

  for (const violation of violations) {
    if (violation.kind === 'direct-navigation') {
      console.error(
        `${violation.file}:${violation.line}: direct ${violation.receiver}.goto() bypasses `
        + 'startup diagnostics; use gotoTestPage().',
      );
    } else {
      console.error(
        `${violation.file}:${violation.line}: unsafe sequential cleanup of `
        + `${violation.browser} and ${violation.server}; use closeBrowserAndServer().`,
      );
    }
  }
  process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();

function cleanupPaths(scope, owned, numericIndexAliases, identifierName, metrics) {
  const initial = [{ closes: [], control: 'normal' }];

  function deduplicateStates(states) {
    const unique = new Map();
    for (const state of states) {
      if (metrics) {
        metrics.stateVisits = (metrics.stateVisits ?? 0) + 1;
        if (metrics.stateVisits > metrics.maxStateVisits) {
          throw new RangeError(`Cleanup analysis exceeded ${metrics.maxStateVisits} state visits`);
        }
      }
      const key = JSON.stringify([
        state.control,
        state.closes.map(close => [close.kind, close.name]),
      ]);
      if (!unique.has(key)) unique.set(key, state);
    }
    return [...unique.values()];
  }

  function appendEvents(states, node) {
    const events = collectCloseEvents(
      node,
      owned,
      numericIndexAliases,
      identifierName,
    );
    if (events.length === 0) return states;
    return states.map(state => ({
      ...state,
      closes: [...state.closes, ...events],
    }));
  }

  function runExpression(expression, states) {
    if (!expression || states.length === 0) return states;

    const resource = closedResource(expression, numericIndexAliases, identifierName);
    if (resource && owned.has(resource.name)) {
      const attempted = appendEvents(states, expression);
      return [
        ...attempted,
        ...attempted.map(state => ({ ...state, control: 'throw' })),
      ];
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
      return deduplicateStates([
        ...runExpression(expression.whenTrue, afterCondition),
        ...runExpression(expression.whenFalse, afterCondition),
      ]);
    }

    if (ts.isBinaryExpression(expression)) {
      const afterLeft = runExpression(expression.left, states);
      if (
        expression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
        || expression.operatorToken.kind === ts.SyntaxKind.BarBarToken
        || expression.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
      ) {
        return deduplicateStates([
          ...afterLeft,
          ...runExpression(expression.right, afterLeft),
        ]);
      }
      return runExpression(expression.right, afterLeft);
    }

    if (ts.isCallExpression(expression)) {
      const children = [expression.expression, ...expression.arguments];
      const completed = children.reduce(
        (current, child) => runExpression(child, current),
        states,
      );
      return deduplicateStates([
        ...completed,
        ...completed.map(state => ({ ...state, control: 'throw' })),
      ]);
    }

    const children = [];
    ts.forEachChild(expression, child => {
      if (!ts.isFunctionLike(child)) children.push(child);
    });
    return children.reduce(
      (current, child) => deduplicateStates(runExpression(child, current)),
      states,
    );
  }

  function runStatements(statements, states) {
    return statements.reduce((current, statement) => {
      const active = current.filter(state => state.control === 'normal');
      const stopped = current.filter(state => state.control !== 'normal');
      return deduplicateStates([
        ...stopped,
        ...runStatement(statement, active),
      ]);
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
    const completedSelector = afterExpression.filter(state => state.control === 'normal');
    const thrownSelector = afterExpression.filter(state => state.control !== 'normal');
    const clauses = statement.caseBlock.clauses;
    const starts = clauses.map((_, index) => index);
    if (!clauses.some(ts.isDefaultClause)) starts.push(clauses.length);

    return [...thrownSelector, ...starts.flatMap(start => {
      const selectedClause = clauses[start];
      const labels = selectedClause && ts.isCaseClause(selectedClause)
        ? clauses.slice(0, start + 1)
        : clauses;
      let paths = labels.reduce(
        (current, clause) => (
          ts.isCaseClause(clause)
            ? runExpression(clause.expression, current)
            : current
        ),
        completedSelector,
      );
      for (const clause of clauses.slice(start)) {
        const active = paths.filter(state => state.control === 'normal');
        const stopped = paths.filter(state => state.control !== 'normal');
        paths = [...stopped, ...runStatements(clause.statements, active)];
      }
      return withNormalControl(paths, ['break']);
    })];
  }

  function runLoop(statement, states, labels = []) {
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
      const bodyResults = deduplicateStates(runStatement(statement.statement, checked));
      exits.push(...withNormalControl(
        bodyResults.filter(state => (
          state.control === 'break'
          || labels.some(label => state.control === `break:${label}`)
        )),
        ['break', ...labels.map(label => `break:${label}`)],
      ));
      stopped.push(...bodyResults.filter(state => (
        state.control !== 'normal'
        && state.control !== 'continue'
        && state.control !== 'break'
        && !labels.some(label => (
          state.control === `continue:${label}`
          || state.control === `break:${label}`
        ))
      )));
      entries = deduplicateStates(withNormalControl(
        bodyResults.filter(state => (
          state.control === 'normal'
          || state.control === 'continue'
          || labels.some(label => state.control === `continue:${label}`)
        )),
        ['continue', ...labels.map(label => `continue:${label}`)],
      ));
      if (incrementor) entries = deduplicateStates(runExpression(incrementor, entries));
      if (condition) exits.push(...deduplicateStates(runExpression(condition, entries)));
    }

    return deduplicateStates([...exits, ...entries, ...stopped]);
  }

  function runLabeledStatement(statement, states, labels = []) {
    const label = statement.label.text;
    const allLabels = [...labels, label];
    const body = statement.statement;
    let results;

    if (ts.isLabeledStatement(body)) {
      results = runLabeledStatement(body, states, allLabels);
    } else if (
      ts.isForStatement(body)
      || ts.isForInStatement(body)
      || ts.isForOfStatement(body)
      || ts.isWhileStatement(body)
      || ts.isDoStatement(body)
    ) {
      results = runLoop(body, states, allLabels);
    } else {
      results = runStatement(body, states);
    }

    return withNormalControl(results, allLabels.map(name => `break:${name}`));
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

    if (ts.isLabeledStatement(statement)) {
      return runLabeledStatement(statement, states);
    }

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
      const label = statement.label?.text;
      return states.map(state => ({
        ...state,
        control: label ? `break:${label}` : 'break',
      }));
    }

    if (ts.isContinueStatement(statement)) {
      const label = statement.label?.text;
      return states.map(state => ({
        ...state,
        control: label ? `continue:${label}` : 'continue',
      }));
    }

    if (ts.isReturnStatement(statement) || ts.isThrowStatement(statement)) {
      return runExpression(statement.expression, states)
        .map(state => ({
          ...state,
          control: state.control === 'normal'
            ? (ts.isReturnStatement(statement) ? 'return' : 'throw')
            : state.control,
        }));
    }

    if (ts.isTryStatement(statement)) {
      const attempted = runStatement(statement.tryBlock, states);
      const completed = attempted.filter(state => state.control !== 'throw');
      const thrown = attempted.filter(state => state.control === 'throw');
      const recovered = statement.catchClause
        ? runStatement(
          statement.catchClause.block,
          thrown.map(state => ({ ...state, control: 'normal' })),
        )
        : [];
      const paths = statement.catchClause
        ? [...completed, ...recovered]
        : attempted;
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
