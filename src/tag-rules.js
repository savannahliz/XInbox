export const DEFAULT_TAG_RULES = {
  perPost: 3, maxTags: 16, maxLength: 12, reuseExisting: true,
  instructions: '生成简洁、宽泛的中文主题标签，不使用人名、文章标题、年份或细碎关键词，避免近义重复标签。',
};

export function tagRules(input = {}) {
  const rules = { ...DEFAULT_TAG_RULES, ...input };
  for (const key of ['perPost', 'maxTags', 'maxLength']) {
    if (!Number.isSafeInteger(rules[key]) || rules[key] < 0) throw new Error('AI 标签数量与字数请输入非负整数；0 表示不限。');
  }
  if (typeof rules.reuseExisting !== 'boolean') throw new Error('标签复用规则无效。');
  if (typeof rules.instructions !== 'string' || !rules.instructions.trim() || rules.instructions.length > 3000) throw new Error('整理要求需要 1–3000 字。');
  return { perPost: rules.perPost, maxTags: rules.maxTags, maxLength: rules.maxLength, reuseExisting: rules.reuseExisting, instructions: rules.instructions.trim() };
}
