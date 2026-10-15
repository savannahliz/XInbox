import { panelButton } from './panel-icons.js';
import { drawerGeometry } from './ai-assistant.js';

export function createAskAgent({state,api,esc,toast,mountSelectMenus,refresh,navigate}) {
  const drawer=document.createElement('aside');drawer.id='agent-drawer';drawer.className='ai-drawer agent-drawer';drawer.hidden=true;drawer.setAttribute('aria-label','Ask Agent');document.body.append(drawer);
  let scope,mode='quick',value,timer,epoch=0,onNote,sessionId,drag,width=520,controlsHidden=false;
  const button=(text,action,extra='')=>`<button type="button" class="button" data-agent-action="${action}" ${extra}>${text}</button>`;
  const busy=()=>value?.job?.phase==='running';
  const resize=()=>{const s=drawerGeometry(width,document.documentElement.clientWidth,Number.parseFloat(document.documentElement.style.getPropertyValue('--ui-scale')) || 1);drawer.style.setProperty('--ai-drawer-width',s.width+'px');};
  const sources=()=>scope?.type==='selection'?scope.ids:scope?.type==='article'?[scope.id]:state.catalog.bookmarks.filter(b=>scope?.type==='all'||scope?.type==='tag'&&b.tags?.includes(scope.value)||scope?.type==='category'&&(b.category===scope.value||b.collections?.includes(scope.value))).map(b=>b.id);
  const title=()=>scope.type==='selection'?`选中 ${scope.ids.length} 篇资料`:scope.type==='article'?state.catalog.bookmarks.find(b=>b.id===scope.id)?.title:'收藏档案';
  async function settingsPanel() {
    const runtime=await api('/api/agents/settings');
    return `<section class="panel"><span class="terminal-label">AGENT RUNTIMES / 执行后端</span><form id="agent-settings-form"><label>Codex 程序路径<input name="codexCommand" value="${esc(runtime.codex.command)}" placeholder="自动检测 Codex CLI"></label><p class="form-help">${runtime.codex.available?'已检测到 Codex':'尚未检测到 Codex'} · 使用本机 Codex 登录和官方 app-server</p><label>DeepSeek Harness 程序路径<input name="dshCommand" value="${esc(runtime.dsh.command)}" placeholder="自动检测 dsh"></label><label>Harness 模型<input name="dshModel" value="${esc(runtime.dsh.model)}"></label><label>Harness API Key（可选）<input name="dshKey" type="password" autocomplete="new-password" placeholder="${runtime.dsh.hasKey?'已保存，留空保留':'复用 DeepSeek 模型 Key 或 Harness 已有配置'}"></label><p class="form-help">${runtime.dsh.available?'已检测到 DSH':'尚未检测到 DSH'} · 本地 ACP Session，连接 INbox MCP</p><button class="button primary" type="submit">保存 Runtime</button></form><div class="mcp-status"><strong>INbox MCP · stdio</strong><span>与当前档案共用数据库；Agent 修改需要确认</span><button class="button" type="button" data-action="mcp-config">查看 MCP 配置</button></div></section>`;
  }
  function entry(parent,article=false) {if(!parent)return;const group=document.createElement('div');group.className=article?'article-ai-tools':'global-ai-entry';group.innerHTML=button('Ask Agent ↗',article?'article':'global','aria-controls="agent-drawer" aria-expanded="false"');parent.append(group);}
  function draw() {
    const draft=drawer.querySelector('textarea')?.value || '';
    drawer.innerHTML=`<div class="ai-drawer-resize" role="separator" tabindex="0" aria-label="调整 Agent 侧栏宽度" aria-orientation="vertical"></div><header class="ai-drawer-header panel-bar"><strong title="${esc(title())}">Ask Agent</strong><div class="panel-bar-tools">${panelButton('controls','展开或收起 Agent 选项','data-agent-action="toggle-controls" aria-expanded="'+!controlsHidden+'"')}${panelButton('reader','关闭 Ask Agent','data-agent-action="close"')}</div></header><div class="ai-drawer-controls" ${controlsHidden?'hidden':''}><p class="ai-scope-name">${esc(title())}</p><label>模式<select id="agent-mode"><option value="quick">Quick AI</option><option value="codex">Codex</option><option value="dsh">DeepSeek Harness</option></select></label>${!['article','selection'].includes(scope.type)?`<div class="ai-scope-fields"><label>范围<select id="agent-scope"><option value="all">全部收藏</option><option value="tag">特定标签</option><option value="category">特定合集</option></select></label>${scope.type!=='all'?`<label>${scope.type==='tag'?'标签':'合集'}<select id="agent-scope-value">${(scope.type==='tag'?[...new Set(state.catalog.bookmarks.flatMap(b=>b.tags))].map(t=>({id:t,label:'#'+t})):state.catalog.categories).map(c=>`<option value="${esc(c.id)}" ${c.id===scope.value?'selected':''}>${esc(c.label)}</option>`).join('')}</select></label>`:''}</div>`:''}<p class="form-help">${mode==='quick'?'读取所选全文，仅回答问题':'通过 INbox MCP 读取资料，修改前确认'}</p><div class="agent-quick-actions">${['比较','总结','综合','找共同点','找冲突'].map(t=>button(t,'preset',`data-preset="${t}"`)).join('')}</div>${mode!=='quick'?`<div class="agent-session-tools">${button('新对话','new')}${button('恢复对话','sessions')}</div>`:''}</div><div class="ai-messages" aria-live="polite"></div><div class="ai-job-status" role="status"></div><form class="ai-question-form" data-agent-form="question"><div class="ai-shortcuts">${(state.settings.prompts || []).map(p=>button('/'+esc(p.keyword),'shortcut',`data-keyword="${esc(p.keyword)}"`)).join('')}</div><textarea name="question" rows="3" maxlength="4000" aria-label="Agent 任务" placeholder="向所选资料提问…"></textarea><div class="ai-send-row"><small>⌘ / Ctrl + Enter</small><button class="button primary" type="submit">发送 ↗</button></div></form>`;
    drawer.querySelector('#agent-mode').value=mode;if(drawer.querySelector('#agent-scope'))drawer.querySelector('#agent-scope').value=scope.type;
    drawer.querySelector('textarea').value=draft;mountSelectMenus(drawer);resize();paint();
  }
  function paint() {
    if(drawer.hidden)return;
    const messages=drawer.querySelector('.ai-messages');
    const eventsOpen=messages.querySelector('.agent-events')?.open ?? true;
    messages.innerHTML=(value?.messages || []).map((m,i)=>`<article class="ai-message ${m.role}"><header>${m.role==='user'?'YOU':mode==='quick'?'QUICK AI':mode==='codex'?'CODEX':'DEEPSEEK HARNESS'}</header><div class="ai-answer">${esc(m.text)}</div>${m.role==='assistant'&&onNote?button('添加到白板','note',`data-message="${i}"`):''}</article>`).join('') || '<p class="ai-empty">选择问题，或输入自己的任务</p>';
    if(busy()&&mode==='quick'){
      const job=value.job,progress=[`${job.sources?.length || 0} 篇资料`,job.stage || '准备资料',job.total?`${job.done}/${job.total} 次模型调用`:'',job.currentSource?`来源 ${job.currentSource.number} · ${job.currentSource.title}`:''].filter(Boolean).join(' · ');
      messages.innerHTML+=`<article class="ai-message assistant"><header>处理进度</header><div class="ai-answer">${esc(progress)}</div></article>`;
    }
    if(busy()&&value.job.text)messages.innerHTML+=`<article class="ai-message assistant"><header>处理中</header><div class="ai-answer">${esc(value.job.text)}</div></article>`;
    if(mode!=='quick'&&value?.events?.length)messages.innerHTML+=`<details class="agent-events" ${eventsOpen?'open':''}><summary>执行过程 · ${value.events.length}</summary>${value.events.slice(-25).map(e=>`<p>${esc(e.text)}</p>`).join('')}</details>`;
    messages.scrollTop=messages.scrollHeight;
    drawer.querySelector('.ai-job-status').innerHTML=value?.job?`<span>${esc({running:'执行中',done:'完成',error:'执行失败',stopped:'已取消',interrupted:'上次执行已中断'}[value.job.phase] || value.job.phase)}${value.job.error?' · '+esc(value.job.error):''}</span>${busy()?button('取消任务','cancel'):''}`:'';
    drawer.querySelector('[type="submit"]').disabled=busy() || mode==='quick'&&!state.status.ai.configured;
    drawer.querySelector('#agent-mode').disabled=busy();
    drawer.querySelectorAll('.ai-drawer-controls .select-trigger,[data-agent-action="new"],[data-agent-action="sessions"]').forEach(b=>b.disabled=busy());
  }
  async function load() {
    const e=epoch,result=mode==='quick'?await api('/api/ai/thread?'+new URLSearchParams({scope:JSON.stringify(scope),mode:state.catalog.demo?'demo':''})):sessionId?await api('/api/agents/session?id='+encodeURIComponent(sessionId)):null;
    if(e!==epoch || drawer.hidden)return;value=result;paint();clearTimeout(timer);if(busy())timer=setTimeout(()=>load().catch(e=>toast(e.message)),800);else if(value?.job?.phase==='done')await refresh();
  }
  async function open(next,options={}) {
    epoch++;clearTimeout(timer);scope=next;onNote=options.onNote;sessionId=undefined;value=null;drawer.hidden=false;
    document.dispatchEvent(new Event('inbox-agent-open'));draw();syncExpanded();await load();
    drawer.querySelector('textarea').value=options.question || '';
    drawer.querySelector('textarea').focus();
  }
  function syncExpanded(){document.querySelectorAll('[aria-controls="agent-drawer"]').forEach(b=>b.setAttribute('aria-expanded',String(!drawer.hidden)));}
  function close(){epoch++;clearTimeout(timer);drawer.hidden=true;syncExpanded();}
  async function ask(question) {
    const e=epoch,result=mode==='quick'?await api('/api/ai/ask',{kind:'chat',scope,mode:state.catalog.demo?'demo':'',question}):await api('/api/agents/start',{runtime:mode,scope,question,sessionId});
    if(e!==epoch)return;value=result;if(mode!=='quick')sessionId=value.id;paint();timer=setTimeout(()=>load().catch(e=>toast(e.message)),500);
  }
  drawer.addEventListener('pointerdown',e=>{if(e.button!==0||!e.target.closest('.ai-drawer-resize'))return;drag={x:e.clientX,width};e.target.setPointerCapture(e.pointerId);e.preventDefault();});
  drawer.addEventListener('pointermove',e=>{if(drag){const scale=Number.parseFloat(document.documentElement.style.getPropertyValue('--ui-scale')) || 1;width=Math.max(320,Math.min(960,drag.width+(drag.x-e.clientX)/scale));resize();}});
  drawer.addEventListener('pointerup',()=>drag=null);drawer.addEventListener('pointercancel',()=>drag=null);window.addEventListener('resize',resize);
  document.addEventListener('click',async e=>{const b=e.target.closest('[data-agent-action]');if(!b)return;try{const a=b.dataset.agentAction;
    if(a==='global')drawer.hidden||scope?.type!=='all'?await open({type:'all'}):close();else if(a==='article')drawer.hidden||scope?.type!=='article'||scope.id!==state.id?await open({type:'article',id:state.id}):close();else if(a==='close')close();
    else if(a==='toggle-controls'){controlsHidden=!controlsHidden;drawer.querySelector('.ai-drawer-controls').hidden=controlsHidden;b.setAttribute('aria-expanded',String(!controlsHidden));}
    else if(a==='preset'){drawer.querySelector('textarea').value=b.dataset.preset+'所选资料，引用原文来源并保留限定条件。';drawer.querySelector('textarea').focus();}
    else if(a==='shortcut'){drawer.querySelector('textarea').value='/'+b.dataset.keyword+' ';drawer.querySelector('textarea').focus();}
    else if(a==='note'){const m=value.messages[Number(b.dataset.message)];const ids=Array.isArray(m.sources)?m.sources.map(s=>typeof s==='string'?s:s.id):sources();await onNote(m.text,ids);toast('AI Note 已添加到白板');}
    else if(a==='cancel'){if(mode==='quick')await api('/api/ai/stop',{scope,mode:state.catalog.demo?'demo':''});else await api('/api/agents/cancel',{id:sessionId});await load();}
    else if(a==='new'){sessionId=undefined;value=null;draw();}
    else if(a==='sessions'){const r=await api('/api/agents/sessions');drawer.querySelector('.ai-messages').innerHTML=r.sessions.filter(s=>s.runtime===mode).map(s=>button(esc(s.title),'resume',`data-session="${s.id}"`)).join('')||'<p class="ai-empty">暂无会话</p>';}
    else if(a==='resume'){value=await api('/api/agents/session?id='+encodeURIComponent(b.dataset.session));scope=value.scope;sessionId=value.id;draw();await load();}
  }catch(error){toast(error.message);}});
  drawer.addEventListener('submit',async e=>{e.preventDefault();const input=drawer.querySelector('textarea'),text=input.value;try{await ask(text);if(input.value===text)input.value='';}catch(error){toast(error.message);}});
  drawer.addEventListener('change',async e=>{try{if(e.target.id==='agent-mode'){mode=e.target.value;epoch++;sessionId=undefined;value=null;draw();await load();}
    else if(e.target.id==='agent-scope'||e.target.id==='agent-scope-value'){const type=drawer.querySelector('#agent-scope').value,value=e.target.id==='agent-scope-value'?e.target.value:type==='tag'?state.catalog.bookmarks.flatMap(b=>b.tags)[0]:state.catalog.categories[0]?.id;await open(type==='all'?{type}:{type,value});}}catch(error){toast(error.message);}});
  drawer.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key==='Enter'&&e.target.tagName==='TEXTAREA'&&!busy()){e.preventDefault();drawer.querySelector('form').requestSubmit();}if(e.key==='Escape'&&!drawer.querySelector('.select-trigger[aria-expanded="true"]'))close();if(e.target.classList.contains('ai-drawer-resize')&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();width=Math.max(320,Math.min(960,width+(e.key==='ArrowLeft'?24:-24)));resize();}});
  document.addEventListener('inbox-quick-open',close);
  document.addEventListener('submit',async e=>{if(e.target.id!=='agent-settings-form')return;e.preventDefault();try{await api('/api/agents/settings',Object.fromEntries(new FormData(e.target)));toast('Agent Runtime 已保存');}catch(error){toast(error.message);}});
  return {open,entry,settingsPanel,onRender:()=>{resize();syncExpanded();},close};
}

export function mountConfirmations({api,esc,refresh,toast}) {
  const dialog=document.createElement('dialog');dialog.className='agent-confirm';dialog.setAttribute('aria-label','确认 Agent 修改');document.body.append(dialog);
  let current,stopped=false;
  async function poll(){if(stopped)return;try{const [ops,runtime]=await Promise.all([api('/api/approvals'),api('/api/agents/permissions')]);const requests=[...ops.requests.map(p=>({...p,endpoint:'/api/approvals'})),...runtime.requests.map(p=>({...p,endpoint:'/api/agents/permissions'}))];const next=requests[0];
    if(!next){if(dialog.open)dialog.close();current=null;}else if(current?.id!==next.id){current=next;dialog.innerHTML=`<header><span class="terminal-label">CONFIRM / ${esc(next.origin)}</span><h2>${esc(next.label)}</h2></header>${next.args?.name?`<p>合集：${esc(next.args.name)}</p>`:''}${next.args?.tags?`<p>标签：${esc(next.args.tags.join(' · '))}</p>`:''}${next.args?.url?`<p class="form-help">${esc(next.args.url)}</p>`:''}${next.records?.length?`<p>${next.records.length} 条收藏</p><ul>${next.records.slice(0,12).map(r=>`<li>${esc(r.title)}</li>`).join('')}</ul>`:''}${next.detail?`<pre>${esc(next.detail)}</pre>`:''}<div class="form-actions"><button class="button" data-confirm="no">拒绝</button><button class="button primary" data-confirm="yes">确认修改</button></div>`;if(!dialog.open)dialog.showModal();}
  }catch{}finally{if(!stopped)setTimeout(poll,1200);}}
  async function answer(approved){if(!current)return;const p=current;current=null;dialog.close();await api(p.endpoint,{id:p.id,approved});if(approved)setTimeout(()=>refresh(),600);}
  dialog.addEventListener('click',e=>{const b=e.target.closest('[data-confirm]');if(b)answer(b.dataset.confirm==='yes').catch(e=>toast(e.message));});
  dialog.addEventListener('cancel',e=>{e.preventDefault();answer(false).catch(e=>toast(e.message));});poll();
  window.addEventListener('beforeunload',()=>stopped=true);
}
