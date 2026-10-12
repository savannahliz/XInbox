import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { categories, search } from './catalog.js';
import { demoBookmarks } from './demo.js';
import { createStore } from './store.js';
import { authorization, createXClient } from './x-client.js';
import { providers, aiConfig, safeConfig, generateTags, cleanTags } from './ai-client.js';
import { tagRules } from './tag-rules.js';
import { JEV_TAGS, jevConfig, evaluateBookmark, jevCacheKey } from './jev-client.js';
import { importArticle } from './url-import.js';
import { createAssistant } from './ai-assistant.js';
import { createLibrary } from './library.js';
import { createOperations } from './operations.js';
import { createAgents } from './agent-runtime.js';
import applicationConfig from './application-config.json' with {type:'json'};

const project = dirname(dirname(fileURLToPath(import.meta.url)));
const equal = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const cookies = req => Object.fromEntries((req.headers.cookie || '').split(';').map(c => c.trim().split('=')).filter(p => p.length === 2));

export function createApp(config = {}, fetcher = fetch) {
  const dataDir = config.dataDir || join(project, 'data');
  const store = createStore(dataDir);
  const xConfig = () => ({ ...config, clientId:config.clientId ?? applicationConfig.xClientId,redirectUri:config.redirectUri || `http://127.0.0.1:${config.port || 4318}/auth/callback`, ...(store.secret('xConfig') || {}) });
  const session = randomBytes(24).toString('hex');
  const pending = new Map();
  let progress = store.get('sync') || { phase: 'idle', fetched: 0, added: 0, unavailable: 0 };
  if (progress.phase === 'running') progress = { ...progress, phase: 'partial', message: '上次同步被中断，已导入内容仍然保留。' };
  let syncing = false;
  let organizing = false;
  let aiProgress = { phase: 'idle', done: 0, total: 0 };

  const { library, saveState } = createLibrary(store);
  const operations = createOperations({store,library,saveState,dataDir,fetcher:fetcher === fetch ? undefined : fetcher});
  const assistant = createAssistant(store, library, fetcher);
  const agents = createAgents({store,library,dataDir});
  const activeJev = () => { const cfg=store.secret('jevConfig');return cfg?.enabled?cfg:null; };
  async function organizeJev(mode, force, cfg) {
    const initial=library(mode),rules=tagRules(store.get('tagRules') || {});
    const posts=initial.all.filter(b=>(!b.manualTags&&(force||b.method!=='Jev')) || (!b.manual&&(force||b.categoryMethod!=='Jev')));
    const existing=[...new Set(initial.all.flatMap(b=>b.tags || []))];
    const retained=[...new Set(initial.all.filter(b=>!b.manualTags&&['AI','Jev'].includes(b.method)&&!posts.some(p=>p.id===b.id)).flatMap(b=>b.tags || []))];
    let pool=[...new Set([...retained,...cfg.candidates,...(rules.reuseExisting?existing:[])])].filter(t=>!rules.maxLength||[...t].length<=rules.maxLength);
    if (rules.maxTags) pool=pool.slice(0,rules.maxTags);
    const proposals=new Map();
    aiProgress={phase:'running',done:0,total:posts.length,cached:0,engine:'Jev'};
    for (const book of posts) {
      if (library(mode).owner!==initial.owner) throw new Error('账号已切换，请重新整理。');
      const key=jevCacheKey(cfg,book,pool,rules),contextKey=jevCacheKey(cfg,book,[],rules),saved=store.get('jevCache:'+initial.owner+':'+book.id);
      let result;
      const reusable=saved?.contextKey===contextKey&&pool.every(t=>saved.candidates.includes(t))&&saved.result.tags.every(t=>pool.includes(t));
      if (saved?.key===key || reusable) { result=saved.result;aiProgress.cached++; }
      else {
        result=await evaluateBookmark(cfg,book,pool,rules,fetcher,event=>assistant.record(cfg,event));
        store.set('jevCache:'+initial.owner+':'+book.id,{key,contextKey,candidates:pool,result});
      }
      proposals.set(book.id,result);aiProgress.done++;
    }
    const current=library(mode);
    if (current.owner!==initial.owner) throw new Error('账号已切换，请重新整理。');
    const union=new Set(current.all.filter(b=>!b.manualTags&&(proposals.has(b.id)||['AI','Jev'].includes(b.method))).flatMap(b=>proposals.get(b.id)?.tags || b.tags || []));
    if (rules.maxTags&&union.size>rules.maxTags) throw new Error(`AI 标签超过全库 ${rules.maxTags} 个限制，请重新整理。`);
    for (const book of current.all) {
      const result=proposals.get(book.id);if(!result)continue;
      const patch={};
      if (!book.manualTags) Object.assign(patch,{tags:result.tags,method:'Jev'});
      if (!book.manual) Object.assign(patch,{autoCategory:result.category,categoryMethod:'Jev'});
      if (Object.keys(patch).length) saveState(initial.owner,book.id,patch);
    }
    aiProgress.phase='done';
  }
  async function organize(mode = '', force = false) {
    if (organizing) return;
    const cfg = store.secret('aiConfig'),jev=activeJev();
    if (!cfg && !jev) return;
    organizing = true;
    if (jev) {
      try { await organizeJev(mode,force,jev); }
      catch(error) {aiProgress={...aiProgress,phase:'error',message:error.message+' 本次整理未保存。'};}
      finally {organizing=false;}
      return;
    }
    const initial = library(mode);
    const rules = tagRules(store.get('tagRules') || {});
    const posts = initial.all.filter(b => !b.manualTags && (force || b.method !== 'AI'));
    const targets = new Set(posts.map(b => b.id)), proposals = new Map();
    const vocabulary = new Set(initial.all.filter(b => !b.manualTags && ['AI','Jev'].includes(b.method) && !targets.has(b.id)).flatMap(b => b.tags || []));
    aiProgress = { phase: 'running', done: 0, total: posts.length };
    try {
      for (let i = 0; i < posts.length; i += 8) {
        const current = library(mode);
        if (current.owner !== initial.owner) throw new Error('账号已切换，请重新整理。');
        const preferred = [...new Set(current.all.flatMap(b => b.tags || []))];
        const items = await generateTags(cfg, posts.slice(i, i + 8), [...vocabulary], fetcher, event => assistant.record(cfg, event), rules, preferred);
        for (const item of items) { proposals.set(item.id, item.tags); item.tags.forEach(t => vocabulary.add(t)); }
        aiProgress.done += items.length;
      }
      const current = library(mode);
      if (current.owner !== initial.owner) throw new Error('账号已切换，请重新整理。');
      const aiBooks = current.all.filter(b => !b.manualTags && (proposals.has(b.id) || ['AI','Jev'].includes(b.method)));
      const union = new Set(aiBooks.flatMap(b => proposals.get(b.id) || b.tags || []));
      if (rules.maxTags && union.size > rules.maxTags) throw new Error(`AI 标签超过全库 ${rules.maxTags} 个限制，请重新整理。`);
      for (const b of aiBooks) if (proposals.has(b.id)) saveState(initial.owner, b.id, { tags: proposals.get(b.id), method: 'AI' });
      aiProgress.phase = 'done';
    } catch (error) { aiProgress = { ...aiProgress, phase: 'error', message: error.message + ' 本次 AI 标签未保存。' }; }
    finally { organizing = false; }
  }

  function status() {
    const account = store.get('account');
    return { configured: Boolean(xConfig().clientId), connected: Boolean(store.tokens()), account, xAuth:store.get('xAuth'),
      ai: { configured: Boolean(store.secret('aiConfig')), config: safeConfig(store.secret('aiConfig')), test: store.get('aiTest'), job: aiProgress },
      jev: {configured:Boolean(store.secret('jevConfig')),enabled:Boolean(activeJev()),config:safeConfig(store.secret('jevConfig')),test:store.get('jevTest')},
      sync: progress, count: (account ? store.list(account.id).length : 0) + store.list('local').length, redirectUri: xConfig().redirectUri };
  }
  async function activeToken() {
    let t = store.tokens();
    if (!t) throw new Error('请先连接 X 账号。');
    if (Date.now() > t.expiresAt - 60000) {
      if (!t.refresh_token) throw new Error('授权已过期，请重新连接 X。');
      const next = await createXClient(xConfig(), fetcher).refresh(t.refresh_token);
      t = { ...next, refresh_token: next.refresh_token || t.refresh_token }; store.saveTokens(t);
    }
    return t.access_token;
  }
  async function synchronize() {
    if (syncing) return;
    syncing = true;
    const account = store.get('account');
    const cursor = progress.phase === 'partial' || progress.phase === 'error' ? progress.cursor || null : null;
    progress = { phase: 'running', fetched: 0, added: 0, unavailable: 0, cursor, startedAt: new Date().toISOString() };
    store.set('sync', progress);
    try {
      const token = await activeToken();
      await createXClient(xConfig(), fetcher).sync(account.id, token, (bookmarks, stats) => {
        const added = store.save(account.id, bookmarks);
        progress = { ...progress, ...stats, added: progress.added + added }; store.set('sync', progress);
      }, cursor);
      progress = { ...progress, phase: progress.unavailable ? 'partial' : 'done', cursor: null,
        finishedAt: new Date().toISOString(), message: progress.unavailable ? '部分推文未获取，已保留可用内容。' : '已导入本次接口返回的全部内容。' };
    } catch (error) {
      progress = { ...progress, phase: progress.fetched ? 'partial' : 'error', message: error.message, cursor: error.cursor ?? progress.cursor };
    } finally { syncing = false; store.set('sync', progress); if (progress.fetched) void organize(); }
  }
  const server = createServer(async (req, res) => {
    const origin = `http://127.0.0.1:${server.address()?.port || config.port || 4318}`;
    const json = (code, value) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
    const redirect = path => { res.writeHead(302, { Location: path }); res.end(); };
    const readBody = async (limit = 8192) => {
      const chunks = [];let length = 0;
      for await (const part of req) {length += part.length;if(length>limit)throw new Error('请求内容过大。');chunks.push(part);}
      const body = Buffer.concat(chunks).toString('utf8');
      return body ? JSON.parse(body) : {};
    };
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https://pbs.twimg.com https://abs.twimg.com; media-src 'self' https://video.twimg.com; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    if (req.headers.host !== new URL(origin).host) return json(403, { error: '只允许从本机地址访问。' });
    if (!['GET', 'POST'].includes(req.method)) return json(405, { error: '不支持此请求方式。' });
    const url = new URL(req.url, origin), path = url.pathname;
    const jar = cookies(req);
    if (req.method === 'POST' && req.headers.origin !== origin) return json(403, { error: '请求来源不匹配。' });
    if ((path.startsWith('/api/') || path.startsWith('/media/') || path === '/auth/start') && !equal(jar.recall_session, session)) return json(401, { error: '请先在浏览器中打开应用。' });
    try {
      if (path === '/api/status') return json(200, status());
      if (path === '/api/mcp/config') return json(200,{dataDir,toml:`[mcp_servers.inbox]\ncommand = ${JSON.stringify(process.execPath)}\nargs = [${JSON.stringify(join(project,'src/mcp-server.js'))}]\ntool_timeout_sec = 660\n\n[mcp_servers.inbox.env]\nINBOX_DATA_DIR = ${JSON.stringify(dataDir)}\n`});
      if (path === '/api/agents/settings' && req.method === 'GET') return json(200,agents.status());
      if (path === '/api/agents/settings' && req.method === 'POST') return json(200,agents.saveConfig(await readBody()));
      if (path === '/api/agents/sessions') return json(200,{sessions:agents.sessions()});
      if (path === '/api/agents/session') return json(200,agents.get(url.searchParams.get('id')));
      if (path === '/api/agents/start' && req.method === 'POST') return json(202,await agents.start(await readBody(65536)));
      if (path === '/api/agents/cancel' && req.method === 'POST') return json(200,await agents.cancel((await readBody()).id));
      if (path === '/api/agents/permissions' && req.method === 'GET') return json(200,{requests:agents.pending()});
      if (path === '/api/agents/permissions' && req.method === 'POST') {const b=await readBody();if(typeof b.approved !== 'boolean')throw new Error('请选择确认或拒绝。');agents.decide(b.id,b.approved,b.optionId);return json(200,{saved:true});}
      if (path === '/api/approvals' && req.method === 'GET') return json(200,{requests:operations.approvals()});
      if (path === '/api/approvals' && req.method === 'POST') { const b = await readBody(); if (typeof b.approved !== 'boolean') throw new Error('请选择确认或拒绝。'); operations.decide(b.id,b.approved); return json(200,{saved:true}); }
      if (path === '/api/collections' && req.method === 'GET') return json(200,{collections:operations.collections(url.searchParams.get('mode'))});
      if (path === '/api/collections' && req.method === 'POST') return json(200,await operations.execute('create_collection',await readBody(),{confirmed:true}));
      if (path === '/api/collections/add' && req.method === 'POST') return json(200,await operations.execute('add_to_collection',await readBody(),{confirmed:true}));
      if (path === '/api/canvas' && req.method === 'GET') return json(200,store.get('researchCanvas:'+library().owner) || {cards:[],edges:[],viewport:{x:80,y:80,zoom:1}});
      if (path === '/api/canvas' && req.method === 'POST') {
        const b = await readBody(4 * 1024 * 1024), lib = library();
        if (!Array.isArray(b.cards) || b.cards.length > 1500 || !Array.isArray(b.edges) || b.edges.length > 4000 || !b.viewport || ![b.viewport.x,b.viewport.y,b.viewport.zoom].every(Number.isFinite) || b.viewport.zoom < .1 || b.viewport.zoom > 3) throw new Error('白板数据无效。');
        const seen = new Set();
        for (const c of b.cards) {
          if (typeof c.id !== 'string' || seen.has(c.id) || !['record','note','ai','shape'].includes(c.type) || ![c.x,c.y].every(Number.isFinite) || (c.type === 'record' && !lib.all.some(r => r.id === c.recordId)) || (c.type !== 'record' && (typeof c.text !== 'string' || c.text.length > 200000)) || (c.sources && (!Array.isArray(c.sources) || c.sources.some(id => !lib.all.some(r => r.id === id))))) throw new Error('白板卡片无效。');
          if (c.type === 'shape' && (!['rectangle','ellipse'].includes(c.shape) || [c.width,c.height].some(v=>v!==undefined&&(!Number.isFinite(v)||v<60||v>2000)))) throw new Error('白板形状无效。');
          seen.add(c.id);
        }
        if (b.edges.some(e => typeof e.id !== 'string' || !seen.has(e.from) || !seen.has(e.to) || typeof e.label !== 'string' || e.label.length > 80 || (e.arrow!==undefined&&!['none','end','both'].includes(e.arrow)) || (e.pattern!==undefined&&!['solid','dashed','dotted'].includes(e.pattern)) || (e.route!==undefined&&!['straight','elbow','curve'].includes(e.route)))) throw new Error('白板连线无效。');
        // Record cards hold references, never a second copy of article content.
        const cards = b.cards.map(c => ({id:c.id,type:c.type,x:c.x,y:c.y,...(c.group ? {group:String(c.group).slice(0,100)} : {}),...(c.type === 'record' ? {recordId:c.recordId} : {text:c.text,sources:c.sources || [],...(c.type==='shape'?{shape:c.shape,...(c.width!==undefined?{width:c.width}:{}),...(c.height!==undefined?{height:c.height}:{})}:{})})}));
        store.set('researchCanvas:'+lib.owner,{cards,edges:b.edges.map(e => ({id:e.id,from:e.from,to:e.to,label:e.label,arrow:e.arrow || 'none',pattern:e.pattern || 'solid',route:e.route || 'straight'})),showEdges:b.showEdges!==false,viewport:b.viewport}); return json(200,{saved:true});
      }
      if (path === '/api/onboarding' && req.method === 'GET') return json(200,{complete:!!store.get('onboardingComplete'),tipsDismissed:!!store.get('onboardingTipsDismissed')});
      if (path === '/api/onboarding' && req.method === 'POST') {const body=await readBody();store.set('onboardingComplete',true);if(body.dismissTips)store.set('onboardingTipsDismissed',true);return json(200,{saved:true});}
      if (path === '/api/settings') return json(200, { providers, ai: safeConfig(store.secret('aiConfig')), jev:safeConfig(store.secret('jevConfig')),jevTags:JEV_TAGS,jevUsage:assistant.usage(store.secret('jevConfig')), tagRules: tagRules(store.get('tagRules') || {}), tagColors: library(url.searchParams.get('mode')).tagColors, prompts: assistant.prompts(), usage: assistant.usage(), x: { clientId: xConfig().clientId || '', hasSecret: Boolean(xConfig().clientSecret), redirectUri: status().redirectUri } });
      if (path === '/api/settings/jev' && req.method === 'POST') {
        if (organizing) return json(409,{error:'请等待当前整理结束后修改 Jev。'});
        const body=await readBody(32768);
        store.saveSecret('jevConfig',body.remove?null:jevConfig(body,store.secret('jevConfig') || {}));
        store.set('jevTest',null);
        return json(200,status());
      }
      if (path === '/api/jev/test' && req.method === 'POST') {
        const cfg=store.secret('jevConfig');if(!cfg)return json(409,{error:'请先配置 Jev。'});
        try {
          const result=await evaluateBookmark(cfg,{title:'连接测试',text:'学习如何提高工作效率。'},['工作方法'],{},fetcher,event=>assistant.record(cfg,event));
          store.set('jevTest',{ok:true,at:new Date().toISOString()});return json(200,{connected:true,...result});
        } catch(error) {store.set('jevTest',{ok:false,at:new Date().toISOString(),message:error.message});return json(400,{error:error.message});}
      }
      if (path === '/api/settings/tags' && req.method === 'POST') {
        if (organizing) return json(409, { error: '请等待当前 AI 整理结束后修改规则。' });
        const rules = tagRules(await readBody(16384));
        store.set('tagRules', rules);
        return json(200, { tagRules: rules });
      }
      if (path === '/api/settings/prompts' && req.method === 'POST') return json(200, { prompts: assistant.savePrompts((await readBody(1024 * 1024)).prompts) });
      if (path === '/api/settings/budget' && req.method === 'POST') return json(200, assistant.saveBudget(await readBody()));
      if (path === '/api/ai/usage') return json(200, assistant.usage());
      if (path === '/api/ai/balance' && req.method === 'POST') return json(200, await assistant.refreshBalance());
      if (path === '/api/ai/thread' && req.method === 'GET') return json(200, assistant.thread(JSON.parse(url.searchParams.get('scope') || '{}'), url.searchParams.get('mode')));
      if (path === '/api/ai/ask' && req.method === 'POST') return json(202, assistant.start(await readBody(16384)));
      if (path === '/api/ai/stop' && req.method === 'POST') { const body = await readBody(); return json(200, assistant.cancel(body.scope, body.mode)); }
      if (path === '/api/settings/ai' && req.method === 'POST') {
        if (organizing || assistant.busy()) return json(409, { error: '请等待 AI 任务完成，或先停止对话任务。' });
        const body = await readBody();
        if (body.remove) { store.saveSecret('aiConfig', null); store.set('aiTest', null); }
        else { const cfg = aiConfig(body, body.provider === store.secret('aiConfig')?.provider ? store.secret('aiConfig') : {}); store.saveSecret('aiConfig', cfg); store.set('aiTest', null); }
        return json(200, status());
      }
      if (path === '/api/settings/x' && req.method === 'POST') {
        if (syncing || organizing) return json(409, { error: '请等待当前任务结束。' });
        const body = await readBody();
        if (typeof body.clientId !== 'string' || !body.clientId.trim() || body.clientId.length > 512) return json(400, { error: 'X 应用配置无效。' });
        const redirectUri = body.redirectUri || status().redirectUri;
        const callback = new URL(redirectUri);
        if (callback.protocol !== 'http:' || callback.hostname !== '127.0.0.1' || callback.pathname !== '/auth/callback' || callback.search || callback.hash || callback.username || callback.password || callback.port !== new URL(status().redirectUri).port) throw new Error('Callback URL 必须是当前 INbox 本机回调地址。');
        store.saveSecret('xConfig', { clientId:body.clientId.trim(),clientSecret:'',redirectUri });
        store.saveTokens(null); pending.clear();
        return json(200, status());
      }
      if (path === '/api/x/connect' && req.method === 'POST') {
        if (!xConfig().clientId) return json(409,{error:'此 INbox 版本尚未配置发布应用的 X Client ID。开发者可在 Advanced 中完成配置。'});
        if (syncing || organizing) return json(409,{error:'请等待当前同步或整理完成。'});
        for (const [key,p] of pending) if (p.expires < Date.now()) pending.delete(key);
        const cfg = {...xConfig(),clientSecret:''}, flow = authorization(cfg);
        pending.set(flow.state,{...flow,external:true,client:createXClient(cfg,fetcher),expires:Date.now()+600000});
        store.set('xAuth',{phase:'authorizing',at:new Date().toISOString()});
        return json(200,{url:flow.url});
      }
      if (path === '/api/ai/test' && req.method === 'POST') {
        const cfg = store.secret('aiConfig');
        if (!cfg) return json(409, { error: '请先配置 AI API。' });
        try {
          await generateTags(cfg, [{ id: 'test', title: '连接测试', text: '学习如何提高工作效率。' }], [], fetcher, event => assistant.record(cfg, event), tagRules(store.get('tagRules') || {}));
          store.set('aiTest', { ok: true, at: new Date().toISOString() });
          return json(200, { connected: true });
        } catch (error) { store.set('aiTest', { ok: false, at: new Date().toISOString() }); return json(400, { error: error.message }); }
      }
      if (path === '/api/ai/organize' && req.method === 'POST') {
        if (!store.secret('aiConfig') && !activeJev()) return json(409, { error: '请先在终端设置中配置 AI 或启用 Jev。' });
        const { mode } = await readBody();
        if (!organizing) void organize(mode === 'demo' ? 'demo' : '', true);
        return json(202, status());
      }
      if (path === '/api/bookmarks') {
        const { demo, all, collections } = library(url.searchParams.get('mode'));
        const category = url.searchParams.get('category') || 'all';
        return json(200, { demo, total: all.length, categories: [...categories.map(c => ({ ...c, count: all.filter(b => b.category === c.id).length })),...collections.map(c => ({...c,count:c.recordIds.length}))],
          bookmarks: search(all, (url.searchParams.get('q') || '').slice(0, 500), category) });
      }
      if (path === '/api/import/url' && req.method === 'POST') {
        const { url:articleUrl, html } = await readBody(12 * 1024 * 1024);
        if (typeof articleUrl !== 'string' || !articleUrl.trim() || articleUrl.length > 8192 || (html !== undefined && (typeof html !== 'string' || Buffer.byteLength(html) > 8 * 1024 * 1024))) return json(400,{error:'链接或网页文件无效。'});
        const article = await importArticle(articleUrl,join(dataDir,'media'),{html,fetcher:fetcher === fetch ? undefined : fetcher});
        const added = store.save('local',[article]);
        if (store.secret('aiConfig') || activeJev()) void organize();
        return json(200,{id:article.id,title:article.title,characters:article.text.length,images:article.imageImport,added:Boolean(added),source:article.source});
      }
      if (path === '/api/bookmarks/update' && req.method === 'POST') {
        const { ids, tags, tagsMode, read, queue, favorite, priority, note, mode } = await readBody(1024 * 1024);
        const { owner, all } = library(mode);
        if (!Array.isArray(ids) || !ids.length || ids.length > 100 || ids.some(id => !all.some(b => b.id === id))) return json(400, { error: '请选择有效收藏。' });
        const patch = {};
        if (note !== undefined) { if (typeof note !== 'string' || note.length > 2000) return json(400, { error: '批注最多 2000 字。' }); patch.note = note; }
        if (tags !== undefined) {
          if(tagsMode!==undefined&&!['add','replace'].includes(tagsMode))throw new Error('标签操作无效。');
          patch.tags = cleanTags(tags);
          patch.manualTags = true; patch.method = '手动编辑';
        }
        if (read !== undefined) { if (typeof read !== 'boolean') return json(400, { error: '阅读状态无效。' }); patch.read = read; if (read) patch.queue = false; }
        if (queue !== undefined) { if (typeof queue !== 'boolean') return json(400, { error: '队列状态无效。' }); patch.queue = queue; if (queue) patch.read = false; }
        if (favorite !== undefined) { if (typeof favorite !== 'boolean') return json(400, { error: '收藏状态无效。' }); patch.favorite = favorite; }
        if (priority !== undefined) { if (priority !== null && ![0, 1, 2].includes(priority)) return json(400, { error: '优先级无效。' }); patch.priority = priority; }
        ids.forEach(id => saveState(owner, id, {...patch,...(tagsMode==='add'&&patch.tags?{tags:cleanTags([...all.find(b=>b.id===id).tags,...patch.tags])}:{})}));
        return json(200, { saved: true });
      }
      if (path === '/api/tags/edit' && req.method === 'POST') {
        const { from, to, mode } = await readBody(1024 * 1024);
        const { owner, all, tagColors } = library(mode);
        if (!all.some(b => b.tags?.includes(from))) return json(404, { error: '标签不存在。' });
        const [name] = cleanTags([to]);
        const changes = all.filter(b => b.tags?.includes(from)).map(b => ({ id: b.id, tags: [...new Set(b.tags.map(t => t === from ? name : t))] }));
        changes.forEach(b => saveState(owner, b.id, { tags: b.tags, manualTags: true, method: '手动编辑' }));
        if (from !== name) for (const key of new Set([owner, ...(changes.some(b => b.id.startsWith('web-')) ? ['local'] : [])])) {
          let colors = store.get('tagColors:' + key) || {};
          if (!Object.hasOwn(tagColors, name) && Object.hasOwn(tagColors, from)) colors = { ...colors, [name]: tagColors[from] };
          delete colors[from]; store.set('tagColors:' + key, colors);
        }
        return json(200, { saved: true });
      }
      if (path === '/api/tags/color' && req.method === 'POST') {
        const { tag, color, mode } = await readBody();
        const { owner, all } = library(mode);
        if (!all.some(b => b.tags?.includes(tag))) return json(404, { error: '标签不存在。' });
        if (color !== null && (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color))) return json(400, { error: '标签颜色请输入 #RRGGBB。' });
        for (const key of new Set([owner, ...(all.some(b => b.id.startsWith('web-') && b.tags?.includes(tag)) ? ['local'] : [])])) {
          let colors = store.get('tagColors:' + key) || {};
          if (color === null) delete colors[tag]; else colors = { ...colors, [tag]: color.toLowerCase() };
          store.set('tagColors:' + key, colors);
        }
        return json(200, { saved: true });
      }
      if (path === '/api/categorize' && req.method === 'POST') {
        const { id, category } = await readBody();
        if (!categories.some(c => c.id === category) || typeof id !== 'string') return json(400, { error: '分类无效。' });
        if (demoBookmarks.some(b => b.id === id)) store.set('demoCategories', { ...(store.get('demoCategories') || {}), [id]: category });
        else {
          if (id.startsWith('web-')) {
            if (!store.categorize('local',id,category)) return json(404,{error:'没有找到这条收藏。'});
            return json(200,{saved:true});
          }
          const account = store.get('account');
          if (!account || !store.categorize(account.id, id, category)) return json(404, { error: '没有找到这条收藏。' });
        }
        return json(200, { saved: true });
      }
      if (path === '/api/sync' && req.method === 'POST') {
        if (!store.tokens() || !store.get('account')) return json(409, { error: '请先连接 X 账号。' });
        if (!syncing) void synchronize();
        return json(202, status());
      }
      if (path === '/api/disconnect' && req.method === 'POST') {
        if (syncing) return json(409, { error: '请等待当前同步结束。' });
        store.saveTokens(null);
        return json(200, status());
      }
      if (path === '/auth/start') {
        if (!xConfig().clientId) return redirect('/?view=sync&notice=setup');
        if (syncing || organizing) return redirect('/?view=sync&notice=busy');
        for (const [key, p] of pending) if (p.expires < Date.now()) pending.delete(key);
        const cfg = xConfig();
        const flow = authorization(cfg); pending.set(flow.state, { ...flow, client: createXClient(cfg, fetcher), expires: Date.now() + 600000 });
        res.setHeader('Set-Cookie', `recall_oauth=${flow.state}; HttpOnly; SameSite=Lax; Path=/auth; Max-Age=600`);
        return redirect(flow.url);
      }
      if (path === '/auth/callback') {
        const state = url.searchParams.get('state'), flow = pending.get(state);
        if (!flow || flow.expires < Date.now() || (!flow.external && (!equal(state, jar.recall_oauth) || !equal(jar.recall_session, session)))) {
          store.set('xAuth',{phase:'error',stage:'callback',message:'授权请求已失效，请点击「连接 X」重新授权。',at:new Date().toISOString()});
          return redirect('/?view=sync&notice=auth-failed');
        }
        pending.delete(state);
        res.setHeader('Set-Cookie', 'recall_oauth=; HttpOnly; SameSite=Lax; Path=/auth; Max-Age=0');
        if (url.searchParams.has('error') || !url.searchParams.get('code')) { store.set('xAuth',{phase:'cancelled',message:'X 授权已取消，可以重新连接。',at:new Date().toISOString()});return redirect('/?view=sync&notice=cancelled'); }
        let stage='exchange';
        try {
          const t = await flow.client.exchange(url.searchParams.get('code'), flow.verifier);
          stage='account';
          const account = await flow.client.user(t.access_token);
          if (!account?.id) throw new Error('账号信息未获取。');
          if (store.get('account')?.id !== account.id) { progress = { phase: 'idle', fetched: 0, added: 0, unavailable: 0 }; store.set('sync', progress); }
          store.saveTokens(t); store.set('account', account);
          store.set('xAuth',{phase:'connected',at:new Date().toISOString()});
          if (flow.external) {
            res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
            return res.end('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><link rel="stylesheet" href="/style.css"><title>INbox · X 已连接</title><main class="oauth-return panel"><h1>X 已连接</h1><p>授权已保存，可以返回 INbox 同步收藏。</p>'+(config.desktop ? '<a class="button primary" href="inbox://oauth/complete">返回 INbox</a>' : '<a class="button primary" href="/?view=sync">返回 INbox</a>')+'</main></html>');
          }
          return redirect('/?view=sync&notice=connected');
        } catch (error) {
          store.set('xAuth',{phase:'error',stage,httpStatus:error.status || null,message:error.message,at:new Date().toISOString()});
          return redirect('/?view=sync&notice=auth-failed');
        }
      }
      if (path.startsWith('/api/')) return json(404, { error: '接口不存在。' });
      if (/^\/media\/[a-f0-9]{64}\.(jpg|png|gif|webp|avif)$/.test(path) && req.method === 'GET') {
        const types = {jpg:'image/jpeg',png:'image/png',gif:'image/gif',webp:'image/webp',avif:'image/avif'};
        try {
          const bytes = await readFile(join(dataDir,path.slice(1)));
          res.writeHead(200,{'Content-Type':types[path.split('.').at(-1)]});return res.end(bytes);
        } catch { return json(404,{error:'图片不存在。'}); }
      }
      const files = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/media.js':['media.js','text/javascript'], '/panel-icons.js':['panel-icons.js','text/javascript'], '/ai-assistant.js': ['ai-assistant.js', 'text/javascript'], '/ask-agent.js':['ask-agent.js','text/javascript'], '/research-canvas.js':['research-canvas.js','text/javascript'], '/onboarding.js':['onboarding.js','text/javascript'], '/style.css': ['style.css', 'text/css'], '/bookmark.svg': ['bookmark.svg', 'image/svg+xml'] };
      if (/^\/assets\/[a-zA-Z0-9-]+\.(svg|png|jpg|woff2|ttf|json)$/.test(path)) files[path] = [path.slice(1), path.endsWith('.svg') ? 'image/svg+xml' : path.endsWith('.json') ? 'application/json' : path.endsWith('.woff2') ? 'font/woff2' : path.endsWith('.ttf') ? 'font/ttf' : path.endsWith('.jpg') ? 'image/jpeg' : 'image/png'];
      if (!files[path] || req.method !== 'GET') return json(404, { error: '页面不存在。' });
      const [file, type] = files[path];
      const content = await readFile(join(project, 'public', file));
      if (path === '/') res.setHeader('Set-Cookie', `recall_session=${session}; HttpOnly; SameSite=Lax; Path=/`);
      res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` }); res.end(content);
    } catch (error) { json(400, { error: error instanceof SyntaxError ? '请求格式无效。' : error.message || '操作未完成，请重试。', ...(error.requiresHtml ? {requiresHtml:true} : {}) }); }
  });
  return { server, store, agents, operations, library };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.env.PORT || 4318);
  const config = { port, dataDir:process.env.INBOX_DATA_DIR, clientId: process.env.X_CLIENT_ID,
    redirectUri: process.env.X_REDIRECT_URI || `http://127.0.0.1:${port}/auth/callback` };
  const { server, agents, store } = createApp(config);
  let closing=false;
  const close=async()=>{if(closing)return;closing=true;await agents.close();server.close(()=>{store.close();process.exit(0);});};
  process.on('SIGTERM',close);process.on('SIGINT',close);
  server.listen(port, '127.0.0.1', () => console.log(`INbox  http://127.0.0.1:${port}`));
}
