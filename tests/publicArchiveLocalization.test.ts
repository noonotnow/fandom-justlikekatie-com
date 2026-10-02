import assert from 'node:assert/strict';
import test from 'node:test';
import { localizedPublicArchiveMessage } from '../src/i18n/publicArchiveMessages';

test('public Archive status presentation retains the English wire message and localizes current counts', () => {
  const message = '4 Archive editions were omitted because their public records could not be verified.';
  assert.equal(localizedPublicArchiveMessage(message, 'en'), message);
  assert.equal(localizedPublicArchiveMessage(message, 'zh-CN'), '有 4 期卡组因公开记录无法核验，未列入素材。');
  assert.equal(localizedPublicArchiveMessage('The star count covers loaded editions only, not the complete Archive.', 'zh-CN'), '演员数量仅统计已加载的卡组，不代表整个典藏。');
});

test('public Archive localized failures retain the original date and distinguish untranslated diagnostics', () => {
  assert.equal(localizedPublicArchiveMessage('The public Archive edition for 2026-09-02 is missing a verified edition link.', 'zh-CN'), '2026-09-02 期卡组缺少已核验的期次链接。');
  assert.equal(localizedPublicArchiveMessage('The public Archive edition could not be loaded (HTTP 503).', 'zh-CN'), '无法加载公开典藏（HTTP 503），请重试。');
  assert.match(localizedPublicArchiveMessage('Unexpected storage failure.', 'zh-CN'), /原始信息（英文）：Unexpected storage failure\./);
  assert.equal(localizedPublicArchiveMessage('已有中文错误', 'zh-CN'), '已有中文错误');
});