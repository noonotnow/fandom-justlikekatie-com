import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import fastGlob from 'fast-glob';
import ts from 'typescript';

const BROWSER_RESOURCE = /browser/i;
const SERVER_RESOURCE = /server/i;

function closedResourceName(node) {
  if (
    !ts.isAwaitExpression(node)
    || !ts.isCallExpression(node.expression)
    || !ts.isPropertyAccessExpression(node.expression.expression)
    || node.expression.expression.name.text !== 'close'
  ) {
    return null;
  }

  return node.expression.expression.expression.getText();
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

  function inspectFinallyBlock(block) {
    const closes = [];
    function collect(node) {
      const resource = closedResourceName(node);
      if (resource) closes.push({ resource, node });
      ts.forEachChild(node, collect);
    }
    collect(block);

    for (let index = 0; index < closes.length; index += 1) {
      if (!BROWSER_RESOURCE.test(closes[index].resource)) continue;
      const serverClose = closes
        .slice(index + 1)
        .find(close => SERVER_RESOURCE.test(close.resource));
      if (!serverClose) continue;

      const position = sourceFile.getLineAndCharacterOfPosition(closes[index].node.getStart());
      violations.push({
        line: position.line + 1,
        browser: closes[index].resource,
        server: serverClose.resource,
      });
      break;
    }
  }

  function visit(node) {
    if (ts.isTryStatement(node) && node.finallyBlock) inspectFinallyBlock(node.finallyBlock);
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
      + `${violation.browser} before ${violation.server}; use closeBrowserAndServer().`,
    );
  }
  process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();