export const categories = [
  { id: 'inspiration', label: '激励与警醒', code: '01' },
  { id: 'efficiency', label: '学习与效率', code: '02' },
  { id: 'career', label: '工作实践', code: '03' },
  { id: 'resources', label: '资源合集', code: '04' },
  { id: 'review', label: '待确认', code: '05' },
];

const rules = {
  inspiration: ['行动', '开始', '坚持', '自律', '人生', '勇敢', '焦虑', '成长', '准备', '完美', 'motivation', 'courage', 'mindset'],
  efficiency: ['效率', '学习', '专注', '注意力', '时间管理', '番茄', '复习', '记忆', '笔记', '深度工作', 'productivity', 'focus', 'learning'],
  career: ['产品经理', '面试', '求职', '简历', '作品集', '实践', '评估', '需求', '职业', '工作', 'portfolio', 'interview', 'product manager', 'evaluation'],
  resources: ['合集', '资源', '工具箱', '题库', '书单', '网站', '开源', '资料', '清单', '导航', 'github', 'toolkit', 'resources', 'collection'],
};

const tagRules = {
  'AI产品': ['ai 产品', 'ai产品', '产品经理', '产品评审'],
  'AI技术': ['agent', '模型', '评估', '人工智能', 'ai '],
  '产品设计': ['设计', '需求', '交互', '产品', '作品集'],
  '学习成长': ['学习', '复习', '入门', '成长', '书架'],
  '效率工具': ['工具', '效率', '开源', 'github'],
  '工作方法': ['工作', '专注', '时间', '注意力', '反馈'],
  '知识管理': ['知识', '笔记', '索引', '整理'],
  '职业发展': ['面试', '职业', '简历', '求职'],
  '资源合集': ['资源', '书单', '合集', '资料', '题库'],
  '个人习惯': ['自律', '坚持', '行动', '开始', '完美', '勇敢'],
};

export function classify(text) {
  const normalized = text.toLowerCase();
  const scores = Object.entries(rules).map(([id, terms]) => ({ id, matched: terms.filter(term => normalized.includes(term)) }));
  scores.sort((a, b) => b.matched.length - a.matched.length);
  const best = scores[0];
  const tags = Object.entries(tagRules).filter(([, terms]) => terms.some(t => normalized.includes(t))).map(([tag]) => tag).slice(0, 3);
  return { category: best.matched.length ? best.id : 'review', tags, method: '本地规则' };
}

const synonyms = [
  ['作品集', 'portfolio', '案例展示'], ['面试', 'interview', '求职'],
  ['产品经理', 'product manager', 'pm'], ['效率', '高效', 'productivity'],
  ['注意力', '专注', 'focus'], ['开始', '行动', '拖延', '完美'],
  ['资源', '资料', '合集', '工具箱', 'resources'], ['评估', 'evaluation', 'eval'],
];
const stop = new Set(['之前', '那个', '那篇', '帖子', '讲的', '关于', '怎么', '记得', '一篇', '讲', '的', '了', '我', '是', '有', '和', 'the', 'that', 'about', 'how']);
const segmenter = new Intl.Segmenter('zh', { granularity: 'word' });

export function queryTerms(query) {
  const raw = query.toLowerCase().trim();
  const terms = new Set([...segmenter.segment(raw)].filter(s => s.isWordLike && s.segment.length > 1 && !stop.has(s.segment)).map(s => s.segment));
  for (const group of synonyms) if (group.some(term => raw.includes(term))) {
    for (const term of group) {
      if (raw.includes(term)) for (const part of segmenter.segment(term)) terms.delete(part.segment);
      terms.add(term);
    }
  }
  return [...terms];
}

export function search(bookmarks, query = '', category = 'all') {
  const terms = queryTerms(query);
  const filtered = bookmarks.filter(b => category === 'all' || b.category === category || b.collections?.includes(category));
  if (!query.trim()) return filtered.map(b => ({ ...b, matches: [] }));
  if (!terms.length) return [];
  const ranked = filtered.map(b => {
    const haystack = [b.title, b.text, b.author, b.username, b.summary, ...(b.tags || []), ...(b.links || []).map(l => `${l.title || ''} ${l.url}`)].join(' ').toLowerCase();
    const matches = terms.filter(term => haystack.includes(term));
    const score = matches.reduce((n, term) => n + (b.title.toLowerCase().includes(term) ? 3 : 1), 0);
    return { ...b, matches, score };
  }).filter(b => b.score > 0).sort((a, b) => b.score - a.score);
  const threshold = ranked.length ? Math.max(1, ranked[0].score * .3) : 1;
  return ranked.filter(b => b.score >= threshold);
}

export function normalizePosts(payload, importedAt = new Date().toISOString()) {
  const users = new Map((payload.includes?.users || []).map(u => [u.id, u]));
  const media = new Map((payload.includes?.media || []).map(m => [m.media_key, m]));
  return (payload.data || []).filter(p => p.id && (p.text || p.note_post?.text || p.note_tweet?.text)).map(p => {
    const user = users.get(p.author_id);
    const note = p.note_post || p.note_tweet;
    let text = note?.text || p.text;
    const entities = note?.entities || p.entities;
    const mediaKeys = p.attachments?.media_keys || [];
    const attachmentPosts = new Set([p.id, ...(p.attachments?.media_source_tweet_id || [])]);
    const isAttachment = l => mediaKeys.includes(l.media_key) || (mediaKeys.length && attachmentPosts.has(/^https?:\/\/(?:www\.)?(?:x|twitter)\.com\/(?:[^/]+\/status|i\/web\/status)\/(\d+)\/(?:photo|video)\/\d+(?:[?#].*)?$/.exec(l.expanded_url || '')?.[1]));
    const links = (entities?.urls || []).filter(l => !isAttachment(l)).map(l => ({ url: l.expanded_url || l.url, title: l.title || l.description || '' }));
    for (const l of entities?.urls || []) text = text.replaceAll(l.url, isAttachment(l) ? '' : l.expanded_url || l.url);
    text = text.trim();
    return {
      id: p.id, title: (p.article_title?.text || (typeof p.article_title === 'string' && p.article_title) || text.split('\n').find(l => l.trim()) || '').slice(0, 90),
      text, author: user?.name || '作者信息未获取', username: user?.username || '',
      url: `https://x.com/i/web/status/${p.id}`, createdAt: p.created_at || null, importedAt,
      media: mediaKeys.map(k => media.get(k) || { media_key: k }).map(m => ({ media_key: m.media_key, type: m.type || 'unknown', url: m.url || '', preview_image_url: m.preview_image_url || '', alt: m.alt_text || '', variants: m.variants || [], duration_ms: m.duration_ms ?? null, width: m.width ?? null, height: m.height ?? null })),
      links, metrics: p.public_metrics || {}, ...classify(text), demo: false,
    };
  });
}
