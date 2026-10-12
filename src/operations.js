import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { categories, search } from './catalog.js';
import { cleanTags } from './ai-client.js';
import { importArticle } from './url-import.js';

export const toolDescriptions = {
  search_records: 'Search INbox records by keyword in full text, title, author, summary and tags; optional tags and date range.',
  get_record: 'Read one INbox record including its complete saved text and image blocks.',
  list_recent_records: 'List recent INbox records, optionally within a saved-date range.',
  list_tags: 'List every INbox tag with record counts and custom colors.',
  list_collections: 'List existing topic collections and user-created collections.',
  add_tags: 'Add manual tags to records. INbox asks the user to confirm before writing.',
  create_collection: 'Create a named collection of record references. INbox asks the user to confirm.',
  add_to_collection: 'Add records to an existing collection. INbox asks the user to confirm.',
  add_to_reading_queue: 'Add records to the reading queue; priority is optional. Requires user confirmation.',
  mark_as_read: 'Mark records as read and remove them from the queue. Requires user confirmation.',
  import_url: 'Import a URL with full article text and available images using INbox existing importer. Requires confirmation.',
};
export const writes = new Set(['add_tags','create_collection','add_to_collection','add_to_reading_queue','mark_as_read','import_url']);
const compact = b => ({ id:b.id, title:b.title, author:b.author, username:b.username, source:b.source || 'x', url:b.url, summary:b.summary || b.text.slice(0,320), tags:b.tags, savedAt:b.importedAt, read:b.read, queue:b.queue, priority:b.priority, collections:b.collections });

export function createOperations({ store, library, saveState, dataDir, fetcher }) {
  const approvals = () => (store.get('operationApprovals') || []).filter(p => p.status === 'pending' && p.expires > Date.now());
  const decide = (id, approved) => {
    let found = false;
    store.change('operationApprovals', values => (values || []).map(p => {
      if (p.id !== id || p.status !== 'pending' || p.expires < Date.now()) return p;
      found = true; return { ...p, status:approved ? 'approved' : 'denied' };
    }));
    if (!found) throw new Error('确认请求已失效。');
  };
  const collections = mode => {
    const lib = library(mode);
    return [...categories.map(c => ({ ...c, builtin:true, recordIds:lib.all.filter(b => b.category === c.id).map(b => b.id) })), ...lib.collections];
  };
  async function execute(name, args = {}, context = {}) {
    const lib = library(context.mode), allowed = context.recordIds ? new Set(context.recordIds) : null;
    const all = lib.all.filter(b => !allowed || allowed.has(b.id));
    const ids = args.record_ids || (args.record_id ? [args.record_id] : []);
    if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string' || !all.some(b => b.id === id))) throw new Error('收藏不存在或不在当前任务的上下文中。');
    const targets = () => { if (!ids.length || ids.length > 1000) throw new Error('请选择 1–1000 条有效收藏。'); return ids.map(id => all.find(b => b.id === id)); };
    const filtered = () => {
      if (args.from && !Number.isFinite(Date.parse(args.from)) || args.to && !Number.isFinite(Date.parse(args.to))) throw new Error('日期范围无效。');
      const before = args.to ? Date.parse(args.to) + (/^\d{4}-\d{2}-\d{2}$/.test(args.to) ? 86400000 - 1 : 0) : Infinity;
      return search(all,args.query || '').filter(b => (!args.tags?.length || args.tags.every(t => b.tags?.includes(t))) && (!args.from || Date.parse(b.importedAt) >= Date.parse(args.from)) && (!args.to || Date.parse(b.importedAt) <= before));
    };
    if (name === 'search_records' || name === 'list_recent_records') {
      const found = filtered().sort((a,b) => (b.importedAt || '').localeCompare(a.importedAt || ''));
      const limit = args.limit ?? 40, offset = args.offset ?? 0;
      if (!Number.isInteger(limit) || limit < 1 || limit > 200 || !Number.isInteger(offset) || offset < 0) throw new Error('分页参数无效。');
      return { total:found.length, records:found.slice(offset,offset+limit).map(compact) };
    }
    if (name === 'get_record') return targets()[0];
    if (name === 'list_tags') return { tags:[...new Set(all.flatMap(b => b.tags || []))].map(name => ({ name, count:all.filter(b => b.tags?.includes(name)).length, color:lib.tagColors[name] || null })) };
    if (name === 'list_collections') return { collections:collections(context.mode).map(c => ({ ...c, recordIds:c.recordIds.filter(id => !allowed || allowed.has(id)) })) };
    if (!writes.has(name)) throw new Error('未知 INbox 工具。');
    if (['add_tags','add_to_collection','add_to_reading_queue','mark_as_read'].includes(name)) targets();
    if (name === 'add_tags') cleanTags(args.tags);
    if (name === 'create_collection' && (typeof args.name !== 'string' || !args.name.trim() || args.name.length > 80)) throw new Error('合集名称请输入 1–80 字。');
    if (name === 'add_to_collection' && !collections(context.mode).some(c => c.id === args.collection_id)) throw new Error('合集不存在。');
    if (name === 'add_to_reading_queue' && args.priority !== undefined && args.priority !== null && ![0,1,2].includes(args.priority)) throw new Error('阅读优先级无效。');
    if (name === 'import_url' && (typeof args.url !== 'string' || args.url.length > 8192 || !/^https?:\/\//.test(args.url))) throw new Error('URL 无效。');
    if (!context.confirmed) {
      const id = randomUUID(), expires = Date.now() + 600000;
      const names = { add_tags:'添加标签', create_collection:'创建合集', add_to_collection:'加入合集', add_to_reading_queue:'加入阅读队列', mark_as_read:'标记已读', import_url:'导入 URL' };
      const proposal = { id, name, args, owner:lib.owner, origin:context.origin || 'MCP Agent', status:'pending', expires, label:names[name], records:ids.map(id => ({ id, title:all.find(b => b.id === id).title })) };
      store.change('operationApprovals', values => [...(values || []).filter(p => p.expires > Date.now()), proposal]);
      try {
        while (Date.now() < expires) {
          if (context.signal?.aborted) throw new Error('任务已取消。');
          const saved = (store.get('operationApprovals') || []).find(p => p.id === id);
          if (saved?.status === 'denied') throw new Error('用户拒绝此修改，数据未改变。');
          if (saved?.status === 'approved') {
            if (library(context.mode).owner !== lib.owner) throw new Error('账号已改变，请重新确认。');
            return await execute(name,args,{ ...context,confirmed:true });
          }
          await new Promise(resolve => setTimeout(resolve,300));
        }
        throw new Error('确认超时，数据未改变。请在 INbox 保持打开时重试。');
      } finally { store.change('operationApprovals', values => (values || []).filter(p => p.id !== id)); }
    }
    if (name === 'import_url') {
      const b = await importArticle(args.url,join(dataDir,'media'),{ fetcher }); store.save('local',[b]); return { record:compact(b) };
    }
    if (name === 'create_collection') {
      const c = { id:'collection-'+randomUUID(), name:args.name.trim(), label:args.name.trim(), description:(args.description || '').slice(0,1000), recordIds:[...new Set(ids)], createdAt:new Date().toISOString() };
      store.change('collections:'+lib.owner, values => [...(values || []),c]); return { collection:c };
    }
    if (name === 'add_to_collection') {
      if (categories.some(c => c.id === args.collection_id)) {
        for (const b of targets()) {
          if (lib.demo) store.change('demoCategories', values => ({ ...values,[b.id]:args.collection_id }));
          else store.categorize(b.id.startsWith('web-') ? 'local' : lib.owner,b.id,args.collection_id);
        }
      } else store.change('collections:'+lib.owner, values => (values || []).map(c => c.id === args.collection_id ? { ...c,recordIds:[...new Set([...c.recordIds,...ids])] } : c));
    } else for (const b of targets()) {
      const patch = name === 'add_tags' ? { tags:[...new Set([...b.tags,...cleanTags(args.tags)])],manualTags:true,method:'手动编辑' } : name === 'mark_as_read' ? { read:true,queue:false } : { read:false,queue:true,...(args.priority !== undefined ? { priority:args.priority } : {}) };
      saveState(lib.owner,b.id,patch);
    }
    return { saved:true,record_ids:ids };
  }
  return { execute, approvals, decide, collections };
}
