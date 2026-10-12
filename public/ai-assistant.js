import { panelButton } from './panel-icons.js';
export function drawerGeometry(width, viewport, scale = 1) {
  const max=Math.min(960,viewport/scale),min=Math.min(320,max);
  return {width:Math.max(min,Math.min(max,width)),min,max};
}
export function createAIAssistant({ state, api, esc, heading, toast, navigate, refresh, showEditor, editor, mountSelectMenus }) {
  const drawer = document.createElement('aside');
  drawer.id = 'ai-drawer'; drawer.className = 'ai-drawer'; drawer.hidden = true;
  drawer.setAttribute('aria-label', 'AI 助手'); document.body.append(drawer);
  let scope, thread, timer, revision = 0, opener, openedView, editingId = '';
  let drawerWidth=480,drag,controlsHidden=false;
  try {const saved=Number(localStorage.getItem('inbox-ai-width'));if(saved>=320&&saved<=960)drawerWidth=saved;}catch{}
  const uiScale=()=>Number.parseFloat(document.documentElement.style.getPropertyValue('--ui-scale')) || 1;
  function applyWidth() {
    const size=drawerGeometry(drawerWidth,document.documentElement.clientWidth,uiScale());
    drawer.style.setProperty('--ai-drawer-width',size.width+'px');
    const handle=drawer.querySelector('.ai-drawer-resize');
    if(handle)for(const [key,value] of Object.entries({min:size.min,max:size.max,now:size.width}))handle.setAttribute('aria-value'+key,String(Math.round(value)));
  }
  function resizeWidth(width) {drawerWidth=Math.max(320,Math.min(960,width));applyWidth();localStorage.setItem('inbox-ai-width',String(Math.round(drawerWidth)));}
  drawer.addEventListener('pointerdown',e=>{
    if(e.button!==0||!e.target.closest('.ai-drawer-resize'))return;
    drag={x:e.clientX,width:drawer.getBoundingClientRect().width/uiScale()};
    e.target.setPointerCapture(e.pointerId);document.body.classList.add('ai-resizing');e.preventDefault();
  });
  drawer.addEventListener('pointermove',e=>{if(drag){drawerWidth=Math.max(320,Math.min(960,drag.width-(e.clientX-drag.x)/uiScale()));applyWidth();}});
  const finishResize=()=>{if(drag){drag=null;document.body.classList.remove('ai-resizing');resizeWidth(drawerWidth);}};
  drawer.addEventListener('pointerup',finishResize);drawer.addEventListener('pointercancel',finishResize);
  drawer.addEventListener('keydown',e=>{
    if(!e.target.matches('.ai-drawer-resize'))return;
    if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();resizeWidth(e.key==='Home'?320:e.key==='End'?960:drawerWidth+(e.key==='ArrowLeft'?24:-24));}
  });
  window.addEventListener('resize',applyWidth);
  const mode = () => state.catalog.demo ? 'demo' : '';
  const running = () => thread?.job?.phase === 'running';
  const button = (text, action, extra = '', primary = false) => `<button type="button" class="button ${primary ? 'primary' : ''}" data-ai-action="${action}" ${extra}>${text}</button>`;
  const options = items => items.map(([value, text]) => `<option value="${esc(value)}">${esc(text)}</option>`).join('');
  const fmt = n => Number(n || 0).toLocaleString('zh-CN');

  function usagePanel(u) {
    if (!u) return '';
    const t = u.totals, b = u.budget, balance = u.balance;
    return `<section class="panel api-usage-panel">${heading('56', 'API USAGE / 用量与预警')}<div class="ai-usage-overview"><div class="ai-usage-metrics"><div><small>INPUT TOKENS</small><strong>${t ? fmt(t.input) : '—'}</strong></div><div><small>OUTPUT TOKENS</small><strong>${t ? fmt(t.output) : '—'}</strong></div><div><small>REQUESTS</small><strong>${t ? fmt(t.calls) : '—'}</strong></div><div><small>LOCAL REMAINING</small><strong>${u.remaining === null ? '—' : (t?.unknown ? '≤ ' : '') + fmt(u.remaining)}</strong></div></div><p class="form-help">INbox 当前 Key 本机累计 · ${t ? fmt(t.total) + ' 已知 token · ' + fmt(t.failed) + ' 次失败' : '尚未配置 AI'}${t?.unknown ? ' · ' + t.unknown + ' 次未返回用量（含失败），实际消耗可能更高' : ''}</p>${u.warnings.map(w => `<p class="notice" role="status">${esc(w)}</p>`).join('')}<div class="ai-balance"><span class="terminal-label">ACCOUNT BALANCE</span>${balance.items ? balance.items.map(i => `<strong>${esc(i.total)} <small>${esc(i.currency)}</small></strong>`).join('') : `<span class="muted">${balance.supported ? '尚未读取' : '当前接口未提供可读取余额'}</span>`}${balance.status === 'error' ? `<p class="job-status">${esc(balance.error)}${balance.items ? ' · 上方为上次读取值' : ''}</p>` : ''}${balance.at ? `<small class="muted">读取于 ${esc(new Date(balance.at).toLocaleString('zh-CN'))}</small>` : ''}${button('刷新余额', 'balance', balance.supported ? '' : 'disabled')}</div></div><form data-ai-form="budget" novalidate><label>本机 token 预算（0 = 不设置）<input name="tokens" type="number" min="0" max="10000000000" step="1" value="${b.tokens}" required></label><div class="ai-field-row"><label>剩余比例预警 (%)<input name="warningPercent" type="number" min="1" max="99" value="${b.warningPercent}" required></label><label>账户余额预警 (CNY / USD)<input name="balanceThreshold" type="number" min="0" step="0.01" value="${b.balanceThreshold}" required></label></div><button class="button primary" type="submit">保存预警</button></form><p class="form-help">本机预算按当前 API Key 的累计 token 扣减；不是账户充值额度。余额需手动刷新。</p></section>`;
  }
  function settingsPanels() {
    return `<section class="panel prompt-panel">${heading('55', 'PROMPT SHORTCUTS / 快捷指令', button('＋ 新建', 'new-prompt'))}<div class="prompt-list">${state.settings.prompts.map(p => `<div class="prompt-row"><div><strong>${esc(p.name)}</strong><span>/${esc(p.keyword)}</span></div>${button('编辑', 'edit-prompt', `data-prompt-id="${esc(p.id)}"`)}${button('删除', 'delete-prompt', `data-prompt-id="${esc(p.id)}"`)}</div>`).join('') || '<p class="muted">暂无快捷指令</p>'}</div></section>${usagePanel(state.settings.usage)}`;
  }
  function entry(parent, article = false) {
    if (!parent) return;
    const group = document.createElement('div'); group.className = article ? 'article-ai-tools' : 'global-ai-entry';
    group.innerHTML = article ? button('全文翻译', 'translation') + button('AI 总结', 'summary') + panelButton('reader','AI 对话','data-ai-action="article" aria-controls="ai-drawer" aria-expanded="false"') : button('AI 提问', 'global', 'aria-controls="ai-drawer" aria-expanded="false"');
    parent.append(group);
  }
  const sourceName = () => scope.type === 'article' ? state.catalog.bookmarks.find(b => b.id === scope.id)?.title || '文章' : scope.type === 'all' ? '全部收藏' : scope.type === 'tag' ? '#' + scope.value : state.catalog.categories.find(c => c.id === scope.value)?.label || '主题';
  function scopeFields() {
    const type = scope.type;
    if (type === 'article') return '';
    const values = type === 'tag' ? [...new Set(state.catalog.bookmarks.flatMap(b => b.tags || []))].map(t => [t, '#' + t]) : state.catalog.categories.map(c => [c.id, c.label]);
    return `<div class="ai-scope-fields"><label>提问范围<select id="ai-scope-type">${options([['all', '全部收藏'], ['tag', '特定标签'], ['category', '主题合集']])}</select></label>${type !== 'all' ? `<label>${type === 'tag' ? '标签' : '主题'}<select id="ai-scope-value">${options(values)}</select></label>` : ''}</div>`;
  }
  function draw() {
    drawer.innerHTML = `<div class="ai-drawer-resize" role="separator" aria-label="调整 AI 侧栏宽度" aria-orientation="vertical" tabindex="0" title="拖动调整宽度；左右方向键微调"></div><header class="ai-drawer-header panel-bar"><strong>${scope.type === 'article' ? '内容对话' : '全局提问'}</strong><div class="panel-bar-tools">${panelButton('controls','展开或收起 AI 选项','data-ai-action="toggle-controls" aria-expanded="'+!controlsHidden+'"')}${panelButton('reader','隐藏 AI 对话框','data-ai-action="close"')}</div></header><div class="ai-drawer-controls" ${controlsHidden?'hidden':''}><div id="ai-config-notice">${!state.status.ai.configured ? `<p class="notice">先配置 AI API</p>${button('模型设置 ↗', 'settings')}` : ''}</div><p class="ai-scope-name">${esc(sourceName())}</p>${scopeFields()}${scope.type === 'article' ? `<div class="ai-article-actions"><label>译文语言<select id="ai-language">${options([['中文', '中文'], ['English', 'English']])}</select></label>${button('全文翻译', 'run-translation')}${button('AI 总结', 'run-summary')}</div>` : ''}<div id="ai-warning"></div></div><div id="ai-messages" class="ai-messages" aria-live="polite"></div><div id="ai-job-status" class="ai-job-status" role="status"></div><form data-ai-form="question" class="ai-question-form"><div class="ai-shortcuts"></div><label for="ai-question" class="sr-only">AI 问题</label><textarea id="ai-question" name="question" rows="3" maxlength="4000" placeholder="${scope.type === 'article' ? '关于这篇文章提问' : '关于所选收藏提问'}，或输入 /快捷词…"></textarea><div class="ai-send-row"><small>⌘ / Ctrl + Enter</small><button class="button primary" type="submit">发送 ↗</button></div></form>`;
    if (scope.type !== 'article') {
      drawer.querySelector('#ai-scope-type').value = scope.type;
      if (scope.value) drawer.querySelector('#ai-scope-value').value = scope.value;
    }
    mountSelectMenus(drawer); applyWidth(); paint();
  }
  function paint() {
    if (drawer.hidden) return;
    const messages = drawer.querySelector('#ai-messages'), previousBottom = messages.scrollHeight - messages.scrollTop - messages.clientHeight < 60;
    const job = thread?.job;
    const entries = thread?.messages || [];
    messages.innerHTML = entries.map(m => `<article class="ai-message ${m.role}"><header><span>${m.role === 'user' ? 'YOU' : m.kind === 'translation' ? 'AI / TRANSLATION · ' + esc(m.language || '中文') : m.kind === 'summary' ? 'AI / SUMMARY' : 'AI'}</span>${m.complete === false ? '<span class="ai-partial">未完成 · 部分结果</span>' : ''}</header><div class="ai-answer">${esc(m.text)}</div>${m.role === 'assistant' && m.sources ? `<details class="ai-sources"><summary>${m.sources.length} 条来源</summary>${m.sources.map(s => `<button type="button" data-ai-action="source" data-source-id="${esc(s.id)}">[${s.number}] ${esc(s.title)}</button>`).join('')}</details>` : ''}</article>`).join('') || `<div class="ai-empty">${thread ? '选择快捷指令，或输入问题' : '读取对话中…'}</div>`;
    if (running() && job.text) messages.innerHTML += `<article class="ai-message assistant"><header>AI / TRANSLATION · 处理中</header><div class="ai-answer">${esc(job.text)}</div></article>`;
    if (previousBottom || running()) messages.scrollTop = messages.scrollHeight;
    drawer.querySelector('#ai-job-status').innerHTML = job ? `<span>${esc({ running: '处理中', done: '完成', error: '未完成', stopped: '已停止' }[job.phase])} · ${job.done}/${job.total} · ${job.sources.length} 条全文 / ${fmt(job.characters)} 字${job.error ? '<br>' + esc(job.error) : ''}</span>${running() ? button('停止', 'stop') : ''}` : '';
    drawer.querySelector('.ai-shortcuts').innerHTML = (state.settings.prompts || []).map(p => `<button type="button" data-ai-action="shortcut" data-keyword="${esc(p.keyword)}" title="${esc(p.name)}" ${running() ? 'disabled' : ''}>/${esc(p.keyword)}</button>`).join('');
    drawer.querySelector('[type="submit"]').disabled = running() || !state.status.ai.configured;
    drawer.querySelectorAll('[data-ai-action^="run-"]').forEach(b => b.disabled = running() || !state.status.ai.configured);
    drawer.querySelector('#ai-warning').innerHTML = (state.settings.usage?.warnings || []).map(w => `<p class="notice">${esc(w)}</p>`).join('');
  }
  async function load() {
    const current = revision;
    const result = await api('/api/ai/thread?' + new URLSearchParams({ scope: JSON.stringify(scope), mode: mode() }));
    if (revision !== current || drawer.hidden) return;
    const wasRunning = running(); thread = result; paint(); clearTimeout(timer);
    if (running()) timer = setTimeout(() => load().catch(e => toast(e.message)), 1200);
    else if (wasRunning) {
      state.settings.usage = await api('/api/ai/usage'); paint();
      if (thread.job?.phase === 'done') toast('AI 处理完成');
    }
  }
  async function open(next, kind) {
    const draft=JSON.stringify(scope)===JSON.stringify(next)?drawer.querySelector('#ai-question')?.value || '':'';
    document.dispatchEvent(new Event('inbox-quick-open'));
    clearTimeout(timer); revision++; scope = next; thread = null; openedView = state.view;
    drawer.hidden = false; draw();drawer.querySelector('#ai-question').value=draft; syncExpanded(); await load();
    if (kind && state.status.ai.configured && !running() && !thread.messages.some(m => m.role === 'assistant' && m.kind === kind && m.complete && (kind !== 'translation' || m.language === '中文'))) await ask(kind);
    drawer.querySelector('#ai-question')?.focus();
  }
  async function ask(kind = 'chat', question = '') {
    const current = revision;
    const result = await api('/api/ai/ask', { kind, scope, mode: mode(), question, language: drawer.querySelector('#ai-language')?.value || '中文' });
    if (revision !== current || drawer.hidden) return;
    thread = result; paint(); clearTimeout(timer); timer = setTimeout(() => load().catch(e => toast(e.message)), 500);
  }
  function syncExpanded() { document.querySelectorAll('[aria-controls="ai-drawer"]').forEach(b => b.setAttribute('aria-expanded', String(!drawer.hidden))); }
  function close() { finishResize();drawer.hidden = true; revision++; clearTimeout(timer); syncExpanded(); if (opener?.isConnected) opener.focus(); }
  document.addEventListener('inbox-agent-open',close);
  function onRender() {
    if(state.view==='settings'){const panel=document.querySelector('.api-usage-panel');api('/api/ai/usage').then(u=>{state.settings.usage=u;if(!panel?.isConnected)return;const template=document.createElement('template');template.innerHTML=usagePanel(u);panel.querySelector('.ai-usage-overview').replaceWith(template.content.querySelector('.ai-usage-overview'));}).catch(e=>toast(e.message));}
    if (!drawer.hidden && (openedView !== state.view || (scope.type === 'article' && state.id !== scope.id))) close();
    if (!drawer.hidden) {applyWidth();paint();} syncExpanded();
  }
  function editPrompt(id = '') {
    editingId = id; const p = state.settings.prompts.find(p => p.id === id);
    showEditor(p ? '编辑快捷指令' : '新建快捷指令', `<form data-ai-form="prompt" novalidate><label>名称<input name="name" maxlength="30" value="${esc(p?.name || '')}" required></label><label>快捷词（输入 /快捷词 调用）<input name="keyword" maxlength="16" value="${esc(p?.keyword || '')}" required></label><label>Prompt<textarea name="text" rows="7" maxlength="6000" required>${esc(p?.text || '')}</textarea></label><button class="button primary" type="submit">保存快捷指令</button></form>`);
  }
  document.addEventListener('click', async e => {
    const target = e.target.closest('[data-ai-action]'); if (!target) return;
    const action = target.dataset.aiAction;
    try {
      if (['article', 'summary', 'translation', 'global'].includes(action)) {
        if (action === 'article' && !drawer.hidden && scope?.type === 'article' && scope.id === state.id) { close(); return; }
        opener = target; await open(action === 'global' ? { type: 'all' } : { type: 'article', id: state.id }, ['summary', 'translation'].includes(action) ? action : null);
      } else if (action === 'close') close();
      else if (action === 'toggle-controls') {controlsHidden=!controlsHidden;drawer.querySelector('.ai-drawer-controls').hidden=controlsHidden;target.setAttribute('aria-expanded',String(!controlsHidden));}
      else if (action === 'settings') { close(); navigate('settings'); }
      else if (action === 'source') { close(); navigate('detail', { id: target.dataset.sourceId }); }
      else if (action === 'shortcut') { const input = drawer.querySelector('#ai-question'); input.value = '/' + target.dataset.keyword + ' ' + input.value.replace(/^\/\S+\s*/, ''); input.focus(); }
      else if (action.startsWith('run-')) { target.disabled = true; await ask(action.slice(4)); }
      else if (action === 'stop') { target.disabled = true; await api('/api/ai/stop', { scope, mode: mode() }); await load(); }
      else if (action === 'new-prompt') editPrompt();
      else if (action === 'edit-prompt') editPrompt(target.dataset.promptId);
      else if (action === 'delete-prompt') { await api('/api/settings/prompts', { prompts: state.settings.prompts.filter(p => p.id !== target.dataset.promptId) }); await refresh(); }
      else if (action === 'balance') { target.disabled = true; const u = await api('/api/ai/balance', {}); await refresh(); toast(u.balance.status === 'error' ? u.balance.error : '余额已更新'); }
    } catch (e) { toast(e.message); target.disabled = false; }
  });
  document.addEventListener('submit', async e => {
    const form = e.target, kind = form.dataset.aiForm; if (!kind) return;
    e.preventDefault(); const data = Object.fromEntries(new FormData(form)), submit = form.querySelector('[type="submit"]'); submit.disabled = true;
    try {
      if (kind === 'question') { const input = form.querySelector('textarea'), question = input.value; await ask('chat', question); if (input.value === question) input.value = ''; }
      else if (kind === 'prompt') { const values = [...state.settings.prompts], value = { ...data, id: editingId || crypto.randomUUID() }, index = values.findIndex(p => p.id === editingId); if (index < 0) values.push(value); else values[index] = value; await api('/api/settings/prompts', { prompts: values }); editor.close(); await refresh(); toast('快捷指令已保存'); }
      else if (kind === 'budget') { await api('/api/settings/budget', data); await refresh(); toast('预警已保存'); }
    } catch (e) { toast(e.message); }
    finally { submit.disabled = kind === 'question' ? running() || !state.status.ai.configured : false; }
  });
  document.addEventListener('change', async e => {
    if (!['ai-scope-type', 'ai-scope-value'].includes(e.target.id)) return;
    const type = drawer.querySelector('#ai-scope-type').value;
    const value = e.target.id === 'ai-scope-value' ? e.target.value : type === 'tag' ? [...new Set(state.catalog.bookmarks.flatMap(b => b.tags || []))][0] : state.catalog.categories.find(c => c.count)?.id || state.catalog.categories[0]?.id;
    try { await open(type === 'all' ? { type } : { type, value }); } catch (e) { toast(e.message); }
  });
  document.addEventListener('keydown', e => {
    if (drawer.hidden) return;
    if (e.key === 'Escape' && !editor.open && !drawer.querySelector('.select-trigger[aria-expanded="true"]')) close();
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && e.target.id === 'ai-question' && !running() && state.status.ai.configured) { e.preventDefault(); drawer.querySelector('form').requestSubmit(); }
  });
  return { settingsPanels, entry, onRender };
}
