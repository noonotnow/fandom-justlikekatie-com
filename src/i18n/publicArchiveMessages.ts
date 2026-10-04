import type { Locale } from './locale';

const messages: Readonly<Record<string, string>> = {
  'The public Archive returned an invalid actor directory.': '公开典藏返回的演员目录无效，请重试。',
  'The actor directory is partial; some public actors could not be verified.': '演员目录不完整；部分公开演员未能通过核验。',
  'The actor directory could not finish loading. Retry to verify missing actors.': '演员目录未能加载完成，请重试以核验缺少的演员。',
  'The actor directory could not be loaded.': '无法加载演员目录，请重试。',
  'The public Archive returned editions for a different actor.': '公开典藏返回了其他演员的卡组，请重试。',
  'The public Archive returned an invalid edition record.': '公开典藏返回的期次记录无效。',
  'The public Archive did not return its actor inventory.': '公开典藏未返回演员素材列表。',
  'The public Archive returned an invalid actor inventory.': '公开典藏返回的演员素材列表无效。',
  'The public Archive returned invalid pagination details.': '公开典藏返回的分页信息无效。',
  'The public Archive returned an invalid inventory page.': '公开典藏返回的素材分页无效。',
  'The public Archive returned a response that was not JSON.': '公开典藏返回的数据格式不正确，请重试。',
  'Choose a valid public Archive edition date.': '请选择有效的公开典藏期次日期。',
  'The public Archive inventory could not be loaded.': '无法加载公开典藏素材，请重试。',
  'The next public Archive page could not be loaded.': '无法加载下一页公开典藏素材，请重试。',
  '1 Archive edition was omitted because its public record could not be verified.': '有 1 期卡组因公开记录无法核验，未列入素材。',
  'Some Archive editions were omitted because their public records could not be verified.': '部分卡组因公开记录无法核验，未列入素材。',
  'Archive storage was temporarily unavailable during verification; additional editions may be missing.': '核验时典藏存储暂不可用，素材列表可能缺少部分期次。',
  'The safe Archive scan limit was reached; additional editions may be available on later pages.': '已达到本次安全检索上限；后续分页可能还有更多卡组。',
  'The star count covers loaded editions only, not the complete Archive.': '演员数量仅统计已加载的卡组，不代表整个典藏。',
};

/** Presentation only: never change inventory, provenance, or the underlying failure. */
export function localizedPublicArchiveMessage(message: string, locale: Locale): string {
  if (locale !== 'zh-CN' || /\p{Script=Han}/u.test(message)) return message;
  if (messages[message]) return messages[message];
  const omitted = /^(\d+) Archive editions were omitted because their public records could not be verified\.$/.exec(message);
  if (omitted) return `有 ${omitted[1]} 期卡组因公开记录无法核验，未列入素材。`;
  const date = /(?:edition for |exists for )(\d{4}-\d{2}-\d{2})/.exec(message)?.[1];
  if (date && /missing a verified edition link/.test(message)) return `${date} 期卡组缺少已核验的期次链接。`;
  if (date && /invalid (?:image reference|image inventory|display images)/.test(message)) return `${date} 期卡组的图片素材数据无效。`;
  if (date && /^No public Archive edition exists/.test(message)) return `${date} 暂无公开典藏卡组。`;
  const http = /^The public Archive(?: edition)? could not be loaded \(HTTP (\d{3})\)\.$/.exec(message);
  if (http) return `无法加载公开典藏（HTTP ${http[1]}），请重试。`;
  return `公开典藏暂时无法加载，请重试。原始信息（英文）：${message}`;
}