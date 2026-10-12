import { panelButton } from './panel-icons.js';
import { createAIAssistant } from './ai-assistant.js';
import { createAskAgent, mountConfirmations } from './ask-agent.js';
import { createResearchCanvas } from './research-canvas.js';
import { createOnboarding } from './onboarding.js';
import { isDynamicMedia, mediaPreview, renderRecordMedia, enableImageZoom } from './media.js';
const initial = new URLSearchParams(location.search);
const state = { view: initial.get('view') || 'home', id: initial.get('id'), q: '', category: 'all', tag: '', filter: 'all', sort: 'latest', layout: 'grid', page: 0, tagFilter: 'all', selected: new Set(), catalog: null, status: null, settings: null };
const content = document.querySelector('#content'), editor = document.querySelector('#editor');
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
const safeUrl = v => { try { const u = new URL(v, location.origin); return ['http:','https:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } };
const date = v => v ? new Date(v).toLocaleString('zh-CN', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' }) : '示例内容';
const pageAssets = { home:'2-2315', archive:'10-9510', favorites:'10-9510', collections:'10-9852', tags:'10-10195', queue:'10-10584', detail:'11-1445', sync:'10-9510', settings:'10-10195', canvas:'10-9510' };
const titles = { home:['00','PRIMARY ARCHIVE','X 收藏档案库'], archive:['00','PRIMARY ARCHIVE / 全量索引','全部收藏'], favorites:['00','FAVORITE ARTICLES / 收藏索引','收藏文章'], collections:['10','THEMATIC COLLECTIONS / 主题节点','主题合集'], tags:['20','SEMANTIC TAG MATRIX / 语义索引','标签矩阵'], queue:['30','READING QUEUE / 消化管线','阅读队列'], sync:['40','CONNECTION CENTER','同步中心'], settings:['50','TERMINAL SETTINGS','终端设置'] };
const palettes = {
  terminal:{ name:'绿黄终端', bg:'#090c0a', surface:'#0c110e', accent:'#8bcf3a', secondary:'#ffd84a', text:'#e8f0e6' },
  neon:{ name:'霓虹都市', bg:'#090c15', surface:'#101525', accent:'#32e6f2', secondary:'#ff57c9', text:'#eefaff' },
  ultraviolet:{ name:'紫电黄光', bg:'#100b18', surface:'#181022', accent:'#c496ff', secondary:'#ffe35b', text:'#f3edf9' },
  amber:{ name:'琥珀电路', bg:'#120e08', surface:'#1b150e', accent:'#ffb84d', secondary:'#64e8d2', text:'#fff7e9' },
};
let theme = { ...palettes.terminal, preset:'terminal' }, toastTimer, refreshId=0, pollTimer;
try { const saved=JSON.parse(localStorage.getItem('inbox-theme')); if (saved && ['bg','surface','accent','secondary','text'].every(k=>/^#[0-9a-f]{6}$/i.test(saved[k]))) theme=saved; } catch {}
function applyTheme(value) { theme=value; ['bg','surface','accent','secondary','text'].forEach(k=>document.documentElement.style.setProperty('--'+k,value[k])); document.body.classList.toggle('alternate-theme',value.preset!=='terminal'); }
applyTheme(theme);
let navigationHidden=localStorage.getItem('inbox-navigation-hidden')==='true',detailInfoHidden=localStorage.getItem('inbox-detail-info-hidden')==='true';
function applyPanels() {
  document.querySelector('.shell').classList.toggle('navigation-hidden',navigationHidden);
  document.querySelector('#sidebar').hidden=navigationHidden;
  const info=document.querySelector('[data-name="归档上下文"]');if(info)info.hidden=detailInfoHidden;
  document.querySelector('[data-action="toggle-navigation"]')?.setAttribute('aria-expanded',String(!navigationHidden));
  document.querySelector('[data-action="toggle-detail-info"]')?.setAttribute('aria-expanded',String(!detailInfoHidden));
}
let fontScale=1;
try {const saved=Number(localStorage.getItem('inbox-font-scale'));if([1,1.15,1.3].includes(saved))fontScale=saved;}catch{}
function setFontScale(scale){fontScale=scale;document.documentElement.style.setProperty('--font-scale',String(scale));document.body.classList.toggle('font-enlarged',scale!==1);localStorage.setItem('inbox-font-scale',String(scale));}
setFontScale(fontScale);
let uiScale=100;
try {const saved=Number(localStorage.getItem('inbox-ui-scale'));if(Number.isInteger(saved)&&saved>=50&&saved<=200)uiScale=saved;}catch{}
function setUIScale(percent){if(!Number.isInteger(percent)||percent<50||percent>200)throw new Error('全局大小请输入 50%–200% 的整数。');uiScale=percent;document.documentElement.style.setProperty('--ui-scale',String(percent/100));localStorage.setItem('inbox-ui-scale',String(percent));const input=document.querySelector('#ui-scale');if(input)input.value=String(percent);document.querySelectorAll('[data-ui-scale]').forEach(b=>{const selected=Number(b.dataset.uiScale)===percent;b.classList.toggle('primary',selected);b.setAttribute('aria-pressed',String(selected));});}
setUIScale(uiScale);
function closeSelectMenus(){document.querySelectorAll('.select-options').forEach(n=>n.hidden=true);document.querySelectorAll('.select-trigger').forEach(n=>n.setAttribute('aria-expanded','false'));}
function updateSelectLabel(select){const label=select?.closest('.select-menu')?.querySelector('.select-value');if(label)label.textContent=select.selectedOptions[0]?.textContent||'';select?.closest('.select-menu')?.querySelectorAll('.select-option').forEach(o=>o.setAttribute('aria-selected',String(o.dataset.selectValue===select.value)));}
function mountSelectMenus(root){
  root.querySelectorAll('select:not([hidden])').forEach((select,index)=>{
    const menu=document.createElement('div');menu.className='select-menu';
    const id='select-list-'+(select.id||select.name||index);
    const label=select.closest('label')?.firstChild?.textContent.trim()||select.getAttribute('aria-label')||select.name||'选择选项';
    menu.innerHTML=`<button type="button" class="select-trigger" data-select-toggle="" role="combobox" aria-label="${esc(label)}" aria-controls="${esc(id)}" aria-expanded="false" aria-haspopup="listbox"><span class="select-value">${esc(select.selectedOptions[0]?.textContent||'')}</span><span class="select-arrow">⌄</span></button><div class="select-options" role="listbox" id="${esc(id)}" aria-label="${esc(label)}选项" hidden>${[...select.options].map(o=>`<button type="button" role="option" class="select-option" data-select-value="${esc(o.value)}" aria-selected="${o.selected}">${esc(o.textContent)}</button>`).join('')}</div>`;
    select.before(menu);select.hidden=true;menu.prepend(select);
  });
}
document.addEventListener('click',e=>{if(!e.target.closest('.select-menu'))closeSelectMenus();});
async function api(path,body) { const r=await fetch(path,body===undefined?{}:{ method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body) }); const d=await r.json(); if (!r.ok) throw Object.assign(new Error(d.error||'请求未完成。'),{requiresHtml:d.requiresHtml}); return d; }
function toast(message) { const e=document.querySelector('#toast'); e.textContent=message; e.hidden=false; clearTimeout(toastTimer); toastTimer=setTimeout(()=>e.hidden=true,5000); }
function icon(name,page=state.view) { const path=state.assets?.[pageAssets[page]]?.['img'+name]||state.assets?.['2-2315']?.['img'+name]; return path?`<img class="icon" src="${path}" alt="">`:''; }
const label=(code,text)=>`<span class="terminal-label">${esc(text)}</span>`;
const btn=(text,action,symbol='',primary=false,extra='')=>`<button class="button ${primary?'primary':''}" data-action="${action}" ${extra}>${symbol?icon(symbol):''}${text}</button>`;
const all=()=>state.catalog.bookmarks;
const tags=()=>[...new Set(all().flatMap(b=>b.tags||[]))];
const cat=id=>state.catalog.categories.find(c=>c.id===id)?.label||'待确认';
const initials=b=>[...(b.author||b.username||'X')].slice(0,2).join('').toUpperCase();
const handle=b=>b.source==='wechat'?'微信公众号':b.source==='web'?b.username:'@'+b.username;
const chips=values=>values.map(t=>`<button class="tag" data-tag="${esc(t)}">#${esc(t)}</button>`).join('');
const empty=(text='暂无收藏')=>`<div class="empty"><p>${text}</p>${btn('清除筛选','clear')}</div>`;
const heading=(code,title,right='')=>`<div class="section-heading">${label(code,title)}${right}</div>`;
const assistant=createAIAssistant({state,api,esc,heading,toast,navigate,refresh,showEditor,editor,mountSelectMenus});
const askAgent=createAskAgent({state,api,esc,toast,mountSelectMenus,refresh,navigate});
const canvas=createResearchCanvas({state,api,esc,toast,askAgent,showEditor,editor,mountSelectMenus});
const onboarding=createOnboarding({api,esc,state,mountSelectMenus,toast,refresh,navigate});
const priorityText = p => p === null || p === undefined ? '未设优先级' : ['P0 · 今天优先','P1 · 近期阅读','P2 · 有空再看'][p];
const priorityOptions = (p,bulk=false) => `${bulk?'<option value="keep" selected>保留原优先级</option>':''}<option value="" ${!bulk&&p==null?'selected':''}>不设置优先级</option>${[0,1,2].map(i=>`<option value="${i}" ${p===i?'selected':''}>${priorityText(i)}</option>`).join('')}`;
const priorityValue = v => v === '' ? null : Number(v);
const navigationFields=['view','id','q','category','tag','filter','sort','layout','page','tagFilter'];
let detailOrigin=history.state?.detailOrigin||null,detailDepth=history.state?.detailDepth||0;
history.scrollRestoration='manual';
function navigationSnapshot() {
  return {...Object.fromEntries(navigationFields.map(key=>[key,state[key]])),selected:[...state.selected],searchIds:state.searchIds?[...state.searchIds]:null,scrollX:window.scrollX,scrollY:window.scrollY};
}
function restoreNavigation(snapshot) {
  navigationFields.forEach(key=>state[key]=snapshot[key]);state.selected=new Set(snapshot.selected||[]);state.searchIds=snapshot.searchIds?new Set(snapshot.searchIds):null;
  render();window.scrollTo({left:snapshot.scrollX||0,top:snapshot.scrollY||0,behavior:'instant'});
}
function navigate(view,options={}) {
  const previous=navigationSnapshot();history.replaceState({inbox:previous,detailOrigin,detailDepth},'',location.href);
  if(view==='detail'){if(state.view!=='detail'){detailOrigin=previous;detailDepth=1;}else if(detailOrigin)detailDepth++;}
  else{detailOrigin=null;detailDepth=0;}
  state.view=view;state.page=0;state.selected.clear();
  if(view!=='detail'){state.id=null;state.q='';state.searchIds=null;state.category='all';state.tag='';state.filter='all';state.tagFilter='all';}
  Object.assign(state,options);const url=new URL(location.href);url.search=new URLSearchParams({view,...(state.id?{id:state.id}:{})});
  history.pushState({inbox:{...navigationSnapshot(),scrollX:0,scrollY:0},detailOrigin,detailDepth},'',url);render();window.scrollTo({top:0});
}
function returnToRecords() {
  if(detailOrigin&&detailDepth)history.go(-detailDepth);else navigate('archive');
}
function restoreHistory(entry) {
  detailOrigin=entry?.detailOrigin||null;detailDepth=entry?.detailDepth||0;
  if(entry?.inbox)restoreNavigation(entry.inbox);
  else{const p=new URLSearchParams(location.search);Object.assign(state,{view:p.get('view')||'home',id:p.get('id'),page:0,q:'',searchIds:null,category:'all',tag:'',filter:'all',tagFilter:'all'});state.selected.clear();render();window.scrollTo({top:0});}
}
function visible() { return all().filter(b=>(state.view!=='favorites'||b.favorite)&&(state.view!=='queue'||b.queue&&!b.read)&&(!state.searchIds||state.searchIds.has(b.id))&&(state.category==='all'||b.category===state.category||b.collections?.includes(state.category))&&(!state.tag||b.tags?.includes(state.tag))&&(state.filter==='all'||state.filter==='unread'&&!b.read||state.filter==='read'&&b.read||state.filter==='media'&&b.media?.length||/^p[012]$/.test(state.filter)&&b.priority===Number(state.filter.slice(1))||state.filter==='unset'&&b.priority==null)).sort((a,b)=>state.sort==='priority'?(a.priority??3)-(b.priority??3):state.sort==='oldest'?(a.importedAt||'').localeCompare(b.importedAt||''):(b.importedAt||'').localeCompare(a.importedAt||'')); }
function relatedTags(tag) { return tags().filter(t=>t!==tag&&all().some(b=>b.tags?.includes(tag)&&b.tags.includes(t))).sort((a,b)=>all().filter(x=>x.tags?.includes(tag)&&x.tags.includes(b)).length-all().filter(x=>x.tags?.includes(tag)&&x.tags.includes(a)).length); }
const tagLimit = n => n ? '≤ ' + n : '不限';
const canOrganize = () => state.status.ai.configured || state.status.jev?.enabled;
const tagColor = name => Object.hasOwn(state.settings.tagColors,name) ? state.settings.tagColors[name] : '';
function tagColorForm(selected=tags().includes(state.colorTag)?state.colorTag:tags()[0]) {
  return `<form id="tag-color-form"><label>标签<select name="tag" id="tag-color-name">${tags().map(t=>`<option value="${esc(t)}" ${t===selected?'selected':''}>#${esc(t)}</option>`).join('')}</select></label><label>自定义颜色<input name="color" id="tag-color-value" value="${esc(tagColor(selected)||theme.accent)}" pattern="#[0-9a-fA-F]{6}" maxlength="7" required></label><div class="tag-color-swatches">${['#8bcf3a','#ffd84a','#6e9bff','#e8f0e6'].map(c=>`<button type="button" data-tag-preset="${c}" data-color="${c}" aria-label="${c}"></button>`).join('')}<span class="tag-color-preview" id="tag-color-preview">#${esc(selected||'标签')}</span></div><div class="form-actions"><button class="button primary" type="submit" ${selected?'':'disabled'}>保存标签颜色</button>${btn('恢复默认颜色','reset-tag-color','',false,'type="button" '+(selected?'':'disabled'))}</div></form>`;
}
function tagSettings() {
  const r=state.settings.tagRules;
  return `<section class="panel font-settings" id="tag-rule-panel">${heading('57','AI TAG RULES / 标签整理规则')}<form id="tag-rules-form"><div class="tag-rule-fields">${[['perPost','每条 AI 标签上限'],['maxTags','AI 标签总数上限'],['maxLength','AI 标签字数上限']].map(([key,name])=>`<label>${name}<input name="${key}" id="tag-rule-${key}" type="number" min="0" step="1" value="${r[key]}" required></label>`).join('')}</div><label class="tag-rule-checkbox"><input name="reuseExisting" type="checkbox" ${r.reuseExisting?'checked':''}>优先复用已有标签</label><label>AI 整理要求<textarea name="instructions" rows="3" maxlength="3000" required>${esc(r.instructions)}</textarea></label><p class="form-help">数量与字数填 0 表示不限。规则仅用于 AI 自动整理；手动标签不限数量，AI 不会覆盖。保存后执行 AI 自动整理以更新已有 AI 标签。</p><div class="form-actions"><button class="button primary" type="submit">保存标签规则</button>${btn('恢复默认规则','reset-tag-rules','',false,'type="button"')}${btn('AI 自动整理','organize','Sparkles',false,'type="button" '+(canOrganize()?'':'disabled'))}${btn('手动新建标签','new-tag','',false,'type="button"')}</div></form></section><section class="panel font-settings">${heading('58','TAG COLORS / 标签颜色')}${tagColorForm()}</section>`;
}
function paintTagColors(root) {
  root.querySelectorAll('[data-tag-name]').forEach(n=>{const color=tagColor(n.dataset.tagName);n.classList.toggle('tag-custom-color',!!color);if(color)n.style.setProperty('--tag-color',color);else n.style.removeProperty('--tag-color');});
}
function previewTagColor() {
  const select=document.querySelector('#tag-color-name'),input=document.querySelector('#tag-color-value'),preview=document.querySelector('#tag-color-preview');
  if(!preview)return;preview.textContent='#'+(select.value||'标签');preview.style.setProperty('--tag-color',/^#[0-9a-f]{6}$/i.test(input.value)?input.value:theme.accent);
}
function jevSettings() {
  const cfg=state.settings.jev,service=cfg?.service || 'gateway',u=state.settings.jevUsage,totals=u.totals || {},job=state.status.ai.job;
  return `<section class="panel font-settings" id="jev-panel">${heading('59','JEV / 标签与归类',`<span class="status-pill">${state.status.jev?.test?.ok?'测试通过':cfg?'已配置':'未配置'}</span>`)}${state.status.jev?.test?.ok===false?`<p class="notice">${esc(state.status.jev.test.message || '连接测试未通过')}${/信用卡|valid credit card/i.test(state.status.jev.test.message || '')?' <a href="https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai%3Fmodal%3Dadd-credit-card" target="_blank" rel="noreferrer">打开 Vercel 控制台 ↗</a>':''}</p>`:''}<form id="jev-form"><div class="ai-field-row"><label>Jev 服务<select name="service"><option value="gateway" ${service==='gateway'?'selected':''}>Vercel AI Gateway</option><option value="typesafe" ${service==='typesafe'?'selected':''}>TypeSafe</option></select></label><label>Jev API Key<input name="apiKey" type="password" autocomplete="new-password" placeholder="${cfg?.hasKey?'已保存，留空保留':'输入 API Key'}"></label></div><label>候选标签（逗号分隔）<textarea name="candidates" rows="2" required>${esc((cfg?.candidates || state.settings.jevTags).join('，'))}</textarea></label><label class="tag-rule-checkbox"><input name="enabled" type="checkbox" ${cfg?.enabled!==false?'checked':''}>使用 Jev 自动匹配标签与主题分类</label><p class="form-help">Jev 从候选及已有标签中判断，遵守 AI 标签规则，保留手动标签与分类。每条发送标题与正文前 6000 字；相同内容和规则复用缓存。翻译、总结与问答使用下方模型连接。</p><div class="form-actions"><button class="button primary" type="submit">保存 Jev</button>${btn('测试 Jev','test-jev','Activity',false,'type="button" '+(cfg?'':'disabled'))}${btn('移除 Jev','remove-jev','',false,'type="button" '+(cfg?'':'disabled'))}${btn('AI 自动整理','organize','Sparkles',false,'type="button" '+(canOrganize()&&job.phase!=='running'?'':'disabled'))}</div></form><div class="ai-usage-metrics">${[['JEV REQUESTS / 调用',totals.calls || 0],['JEV TOKENS / 用量',totals.total || 0],['INPUT / 输入',totals.input || 0],['OUTPUT / 输出',totals.output || 0]].map(([name,value])=>`<div><small>${name}</small><strong>${value.toLocaleString()}</strong></div>`).join('')}</div>${totals.unknown?`<p class="form-help">${totals.unknown} 次调用未返回用量；未计为零消耗。</p>`:''}${u.warnings.map(w=>`<p class="notice">Jev：${esc(w)}</p>`).join('')}${job.engine==='Jev'?`<p class="job-status">${job.phase==='running'?'整理中':job.phase==='done'?'整理完成':'整理中断'} ${job.done} / ${job.total} · 缓存命中 ${job.cached} ${esc(job.message || '')}</p>`:''}</section>`;
}
function settings() {
  const cfg=state.settings.ai,provider=cfg?.provider||'deepseek',preset=state.settings.providers[provider];return `<div class="settings-grid">${jevSettings()}${tagSettings()}<section class="panel">${heading('51','AI CONNECTION / 模型连接',`<span class="status-pill">${state.status.ai.test?.ok?'测试通过':cfg?'已配置':'未配置'}</span>`)}<form id="ai-form"><label>AI 服务<select name="provider" id="ai-provider">${Object.entries(state.settings.providers).map(([id,p])=>`<option value="${id}" ${provider===id?'selected':''}>${p.label}</option>`).join('')}</select></label><label>API 地址<input name="baseUrl" id="ai-base" type="url" value="${esc(cfg?.baseUrl||preset.baseUrl)}" required></label><label>模型 / Endpoint ID<input name="model" id="ai-model" value="${esc(cfg?.model||preset.model)}" placeholder="模型名称或 ep-…" required></label><label>API Key<input name="apiKey" type="password" autocomplete="new-password" placeholder="${cfg?.hasKey?'已保存，留空保留':'输入 API Key'}"></label><label>接口协议<select name="protocol" id="ai-protocol"><option value="chat" ${(cfg?.protocol||preset.protocol)!=='responses'?'selected':''}>Chat Completions</option><option value="responses" ${(cfg?.protocol||preset.protocol)==='responses'?'selected':''}>Responses API</option></select></label><p class="form-help">使用 API Key，不读取 Codex 登录凭据。整理时发送收藏正文，保留手动标签。</p><div class="form-actions"><button class="button primary" type="submit">保存连接</button>${btn('测试连接','test-ai','Activity',false,cfg?'':'disabled')}${btn('移除','remove-ai','',false,cfg?'':'disabled')}</div></form><div class="tag-policy"><span>AI 每条 ${tagLimit(state.settings.tagRules.perPost)}</span><span>AI 总数 ${tagLimit(state.settings.tagRules.maxTags)}</span><span>手动不限</span></div>${btn('AI 自动整理','organize','Sparkles',false,canOrganize()&&state.status.ai.job.phase!=='running'?'':'disabled')}${state.status.ai.job.phase!=='idle'?`<p class="job-status">${state.status.ai.job.phase==='running'?'整理中':state.status.ai.job.phase==='done'?'整理完成':'整理中断'} ${state.status.ai.job.done} / ${state.status.ai.job.total} ${esc(state.status.ai.job.message||'')}</p>`:''}</section><section class="panel">${heading('52','COLOR SYSTEM / 终端配色')}<div class="palette-grid">${Object.entries(palettes).map(([id,p])=>`<button class="palette ${theme.preset===id?'active':''}" data-palette="${id}"><span class="palette-swatches"><i data-color="${p.bg}"></i><i data-color="${p.accent}"></i><i data-color="${p.secondary}"></i><i data-color="${p.text}"></i></span><strong>${p.name}</strong></button>`).join('')}</div><form id="theme-form"><div class="color-fields">${[['bg','背景'],['surface','面板'],['accent','主色'],['secondary','辅色'],['text','文字']].map(([key,name])=>`<label>${name}<input type="text" pattern="#[0-9a-fA-F]{6}" maxlength="7" name="${key}" value="${theme[key]}"></label>`).join('')}</div><div class="form-actions"><button class="button primary" type="submit">保存自定义配色</button>${btn('恢复默认','reset-theme')}</div></form></section><section class="panel font-settings">${heading('53','TYPE SCALE / 文字大小')}<div class="font-options">${[[1,'原稿大小'],[1.15,'较大'],[1.3,'大号']].map(([scale,name])=>`<button class="button ${fontScale===scale?'primary':''}" data-font-scale="${scale}" aria-pressed="${fontScale===scale}">${name} · ${Math.round(scale*100)}%</button>`).join('')}</div><p class="font-preview">收藏、标签和设置会使用同一文字比例。<span>INbox / PERSONAL ARCHIVE</span></p></section><section class="panel font-settings ui-settings">${heading('54','UI SCALE / 全局大小')}<div class="font-options">${[75,100,125,150].map(percent=>`<button type="button" class="button ${uiScale===percent?'primary':''}" data-ui-scale="${percent}" aria-pressed="${uiScale===percent}">${percent}%</button>`).join('')}</div><form id="ui-scale-form" class="ui-scale-form" novalidate><label>自定义比例 (%)<input name="scale" id="ui-scale" type="number" min="50" max="200" step="1" value="${uiScale}" required></label><button class="button primary" type="submit">应用缩放</button>${btn('恢复 100%','reset-ui-scale','',false,'type="button"')}</form></section>${assistant.settingsPanels()}<div id="agent-settings-panel"></div>${xAdvanced()}<section class="panel">${heading('','使用引导')}${btn('重新打开使用引导','onboarding')}</section></div>`;
}
function xAdvanced() {
  const x=state.settings.x;
  return `<section class="panel"><details><summary>Advanced / 开发者设置</summary><form id="x-form"><label>INbox X Client ID<input name="clientId" value="${esc(x.clientId)}" required autocomplete="off"></label><label>Callback URL<input name="redirectUri" value="${esc(x.redirectUri)}" required></label><p class="form-help">Native/Desktop 使用 OAuth 2.0 PKCE。发布应用的 Client ID 应由开发者配置，无需 Client Secret。</p><button class="button primary" type="submit">保存 X 应用配置</button></form></details></section>`;
}
function sync() {
  const s=state.status,p=s.sync;
  return `<section class="panel connection-panel">${heading('','X BOOKMARK CONNECTION',`<span class="status-pill">${s.connected?'已连接':'未连接'}</span>`)}<h2>${s.account?'@'+esc(s.account.username):'X 收藏夹'}</h2><p class="muted">上次同步：${p.finishedAt?date(p.finishedAt):'尚未同步'}</p>${s.xAuth?.message?`<p class="notice">${esc(s.xAuth.stage?({callback:'授权回调',exchange:'令牌交换',account:'账号读取'}[s.xAuth.stage]+'：'):'')}${esc(s.xAuth.message)}</p>`:''}<div class="form-actions">${s.connected?btn('立即同步','sync','RefreshCw',true,p.phase==='running'?'disabled':'')+btn('断开连接','disconnect','',false,p.phase==='running'?'disabled':''):btn('连接 X','connect-x','',true)}</div><div class="sync-metrics">${[['FETCHED',p.fetched],['NEW_RECORDS',p.added],['UNAVAILABLE',p.unavailable]].map(([text,count])=>`<div><strong>${count||0}</strong><small>${text}</small></div>`).join('')}</div><p class="job-status">${esc({idle:'尚未同步',running:'正在同步…',done:'同步完成',partial:'部分完成，可继续同步',error:'同步失败'}[p.phase])}</p>${p.message?`<p class="muted">${esc(p.message)}</p>`:''}${btn('查看收藏','go-archive')}</section>`;
}

const named = (root,name) => root?.querySelector(`[data-name="${name}"]`);
const namedAll = (root,name) => [...(root?.querySelectorAll(`[data-name="${name}"]`)||[])];
const paragraphs = root => [...(root?.querySelectorAll(':scope > p')||[])];
const textAt = (root,index,value) => { const p=paragraphs(root)[index]; if(p)p.textContent=value; };
function control(node,data,tag='button') {
  if(!node)return null;
  const element=document.createElement(tag);
  for(const attr of node.attributes)element.setAttribute(attr.name,attr.value);
  element.append(...node.childNodes);
  if(tag==='button')element.type='button';
  Object.assign(element.dataset,data);node.replaceWith(element);return element;
}
function reference(view) {
  const t=document.createElement('template');t.innerHTML=state.templates[pageAssets[view]];return t.content.firstElementChild;
}
function referenceTags(container,values) {
  if(!container)return;
  const originals=namedAll(container,'标签').map(n=>n.cloneNode(true));
  container.replaceChildren();
  container.classList.toggle('tags-expanded',values.length>Math.max(3,originals.length));
  if(values.length>Math.max(3,originals.length))container.closest('[data-name="收藏记录"],[data-name="推文收藏卡片"],[data-name="归档标签"],[data-name="归档位置"],[data-name="内容侧栏"]')?.classList.add('has-many-tags');
  values.forEach((t,i)=>{const node=(originals[i%originals.length]||originals[0])?.cloneNode(true);if(!node)return;textAt(node,0,'#'+t);container.append(node);node.dataset.tagName=t;control(node,{tag:t});});
}
function readState(root,b) {
  const status=named(root,'已读状态')||named(root,'阅读状态');
  if(!status)return;
  textAt(status,0,b.read?'已读':'未读');status.classList.toggle('is-read',!!b.read);
}
const unread = items => items.filter(b=>!b.read).length;
const countText = n => String(n).padStart(2,'0');
const metric = (b,key) => {const value=key==='retweet_count'?(b.metrics?.repost_count??b.metrics?.retweet_count):b.metrics?.[key];return value===undefined?'—':Number(value).toLocaleString('zh-CN');};
const engagement = b => `${metric(b,'reply_count')} 回复 · ${metric(b,'like_count')} 喜欢 · ${metric(b,'impression_count')} 浏览`;
const minutes = b => Math.max(1,Math.ceil(b.text.length/350));
function bindSidebar(root) {
  textAt(named(root,'品牌文字'),0,'INbox');textAt(named(root,'品牌文字'),1,'PERSONAL INTEL');
  const identity=named(root,'身份卡');textAt(identity,0,state.status.account?`${state.status.account.name} / @${state.status.account.username}`:state.catalog.demo?'示例档案 / DEMO':'本机档案 / LOCAL');textAt(identity,1,state.status.connected?'X CONNECTED // 私有节点':state.catalog.demo?'X 未连接 // 本地示例':'X 未连接 // 本地导入');control(identity,{view:'sync'});
  const navs=namedAll(root,'导航项'),views=['home','archive','collections','tags','queue','sync','export','settings'];
  const current=state.view==='detail'?(detailOrigin?.view||'archive'):state.view,navIcons=['LayoutDashboard','Bookmark','FolderKanban','Tags','Clock3','RefreshCw','Download','Settings2'];
  const counts={archive:all().length,collections:state.catalog.categories?.filter(c=>c.id!=='review').length || 4,tags:tags().length,queue:all().filter(b=>b.queue&&!b.read).length};
  navs.forEach((n,i)=>{const v=views[i];const ps=paragraphs(n);if(ps[2]&&counts[v]!==undefined){ps[2].textContent=counts[v];ps[2].dataset.navCount='true';}const button=control(n,v==='export'?{action:'export'}:{view:v});button.classList.add(v===current?'custom-nav-current':'custom-nav-other');if(v===current)button.setAttribute('aria-current','page');const image=button.querySelector('img');if(image)image.src=state.assets[v==='archive'?'10-10195':'10-9510']['img'+navIcons[i]];});
  const boundNavs=namedAll(root,'导航项'),archiveEntry=boundNavs[1];
  if(archiveEntry){const entry=archiveEntry.cloneNode(true);entry.removeAttribute('aria-current');entry.dataset.view='favorites';entry.classList.toggle('custom-nav-current',current==='favorites');entry.classList.toggle('custom-nav-other',current!=='favorites');textAt(entry,1,'收藏文章');textAt(entry,2,all().filter(b=>b.favorite).length);if(current==='favorites')entry.setAttribute('aria-current','page');archiveEntry.after(entry);}
  const queueEntry=boundNavs[4];
  if (queueEntry) {const entry=queueEntry.cloneNode(true);entry.removeAttribute('aria-current');entry.dataset.view='canvas';entry.classList.toggle('custom-nav-current',state.view==='canvas');entry.classList.toggle('custom-nav-other',state.view!=='canvas');const ps=paragraphs(entry);if(ps[1])ps[1].textContent='研究白板';if(ps[2])ps[2].textContent='';if(state.view==='canvas')entry.setAttribute('aria-current','page');queueEntry.after(entry);}
  const storage=named(root,'存储标题');if(storage){textAt(storage,0,'LOCAL VAULT');textAt(storage,1,`${tags().length} TAGS`);}
  const storageText=named(root,'存储状态');if(storageText){const p=paragraphs(storageText);if(p.length)p[p.length-1].textContent='手动标签 · 数量不限';}
  const progress=named(root,'存储进度');if(progress)progress.style.width='100%';
  const syncState=named(root,'同步状态');if(syncState){textAt(syncState,0,state.status.connected?'X 已连接':state.catalog.demo?'X 未连接 · 示例模式':'X 未连接 · 本机档案');control(syncState,{view:'sync'});}
}
function metricsFor(view) {
  const items=all().filter(b=>view!=='favorites'||b.favorite),nodes=tags();
  if(view==='tags')return [nodes.length,nodes.reduce((n,t)=>n+relatedTags(t).length,0)/2,items.filter(b=>!b.tags?.length).length,0];
  if(view==='collections')return [state.catalog.categories.filter(c=>c.id!=='review').length,items.filter(b=>b.category!=='review').length,unread(items),4];
  if(['archive','favorites'].includes(view))return [items.length,unread(items),items.filter(b=>b.importedAt&&new Date(b.importedAt).toDateString()===new Date().toDateString()).length,items.filter(b=>b.media?.length).length];
  if(view==='queue')return [items.filter(b=>b.queue&&!b.read).length,items.filter(b=>b.queue&&!b.read&&b.priority===0).length,items.filter(b=>b.queue&&!b.read&&(b.readProgress||0)>0).length,items.filter(b=>b.read).length];
  return [items.length,view==='home'?items.filter(b=>b.importedAt&&Date.now()-new Date(b.importedAt).getTime()<7*86400000).length:unread(items),items.filter(b=>b.queue&&!b.read).length,nodes.length];
}
function bindHeader(root,view) {
  const metrics=metricsFor(view);
  namedAll(root,'档案统计').forEach((n,i)=>textAt(named(n,'统计值')||named(n,'统计数值行'),0,countText(metrics[i])));
  const badge=named(root,'在线徽章');if(badge){textAt(badge,0,['home','archive','favorites'].includes(view)?state.status.account?.username?'@'+state.status.account.username:'未连接':state.catalog.demo?'DEMO':state.status.connected?'LIVE':'LOCAL');badge.title=state.status.account?.name||'连接 X 后显示你的账号';badge.classList.toggle('account-badge',['home','archive','favorites'].includes(view));}
  textAt(named(root,'索引提示'),0,`LOCAL INDEX // ${all().length} ${state.catalog.demo?'DEMO':'LOCAL'} RECORDS`);
  const title=named(root,'页面标题');
  if(view==='favorites'){textAt(named(title,'标题行'),0,'收藏文章');textAt(named(title,'终端标签'),1,'FAVORITE ARTICLES / 收藏索引');}
  if(title){const ps=paragraphs(title);if(ps.length)ps[ps.length-1].textContent=({home:'同步 X 收藏与导入网页全文，按主题整理，随时查找。',archive:`检索 ${all().length} 条收藏，查看正文、批注与标签。`,favorites:`检索 ${all().filter(b=>b.favorite).length} 篇收藏文章。`,collections:'围绕激励、效率、工作实践与资源建立主题入口。',tags:`查看 ${tags().length} 个标签的密度、趋势与关联；AI 标签每条 ${tagLimit(state.settings.tagRules.perPost)}，AI 总数 ${tagLimit(state.settings.tagRules.maxTags)}，手动不限。`,queue:'按阅读时间窗整理收藏，记录阅读进度。'})[view];}
}
function bindSearch(root) {
  const box=named(root,'搜索框');if(box){const ps=paragraphs(box),p=ps[0],input=document.createElement('input');input.id='search-input';input.name='q';input.className=p.className;input.value=state.q;input.placeholder=p.textContent;input.setAttribute('aria-label','搜索收藏');input.autocomplete='off';p.replaceWith(input);const form=control(box,{},'form');form.id='search-form';control(ps[1],{},'button')?.setAttribute('aria-label','搜索');const submit=form.lastElementChild;if(submit?.tagName==='BUTTON')submit.type='submit';}
  const drawer=document.createElement('div');drawer.id='filter-drawer';drawer.className='filter-drawer';drawer.hidden=true;drawer.innerHTML=`<label>主题<select id="filter-category"><option value="all">全部主题</option>${state.catalog.categories.map(c=>`<option value="${c.id}" ${state.category===c.id?'selected':''}>${c.label}</option>`).join('')}</select></label><label>标签<select id="filter-tag"><option value="">全部标签</option>${tags().map(t=>`<option ${state.tag===t?'selected':''}>${esc(t)}</option>`).join('')}</select></label>${btn('清除筛选','clear')}`;named(root,'搜索筛选')?.after(drawer);if(!drawer.isConnected&& !root.contains(drawer))named(root,'搜索与筛选')?.after(drawer);
  if(['home','archive','favorites'].includes(state.view)){
    const row=named(root,'搜索与筛选')||named(root,'搜索筛选');
    const entry=namedAll(row,'终端按钮').find(n=>paragraphs(n)[0]?.textContent.trim()==='高级筛选').cloneNode(true);
    entry.removeAttribute('data-node-id');entry.querySelectorAll('[data-node-id]').forEach(n=>n.removeAttribute('data-node-id'));entry.dataset.name='URL导入按钮';entry.classList.add('import-entry');textAt(entry,0,'导入 URL');
    const symbol=entry.querySelector('img').parentElement;symbol.dataset.name='导入图标';symbol.classList.add('import-icon');symbol.setAttribute('aria-hidden','true');symbol.innerHTML='<svg viewBox="0 0 14 14" fill="none"><path d="M3 7H11M7 3V11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
    row.append(control(entry,{action:'import-url'}));if(state.view==='home')askAgent.entry(row);else{const batch=document.createElement('div');batch.className='archive-batch';batch.innerHTML=`<span>已选 ${state.selected.size} 条</span>${btn('批量标签 / 优先级','bulk-tags')}${btn('加入队列','bulk-queue')}${btn('加入合集','bulk-filing')}`;row.after(batch);}
  }
}
function bindButtons(root) {
  const actions={'最新收录':'sort','最近更新':'sort','全部合集':'clear','使用频率':'sort','优先级排序':'sort','优先级':'sort','全部队列':'clear','移入合集':'bulk-filing','添加标签':'bulk-tags','智能重排':'organize','添加收藏':'choose-queue','全部标签':'filter-tags','高级筛选':'filters','含媒体':'media','标记已读':'bulk-read','批量标记已读':state.view==='tags'?'tag-read':'bulk-read','加入队列':'bulk-queue','编辑标签':'bulk-tags','合并标签':'rename-tag','新建标签':'new-tag','编辑标签规则':'tag-policy','全部标记已读':'collection-read','编辑合集规则':'tag-policy','智能推荐':'organize','从收藏库添加':'choose-queue','新建合集':'new-collection'};
  namedAll(root,'终端按钮').forEach(n=>{const p=paragraphs(n)[0],text=p?.textContent.trim();if(actions[text])control(n,{action:actions[text]});});
  for(const [name,layout] of [['卡片视图','grid'],['列表视图','list']])control(named(root,name),{layout});
  namedAll(root,'布局按钮').forEach((n,i)=>control(n,{layout:i?'list':'grid'}));
  for(const title of ['批量工具','批量操作','批量工具栏','批量操作栏']){
    const area=named(root,title);if(!area)continue;const box=named(area,'选择框');if(box)selectBox(box,'all');
    const p=paragraphs(area).find(p=>p.textContent.includes('选'));if(p)p.textContent=`已选 ${state.selected.size} 条`;const unreadText=paragraphs(area).find(p=>p.textContent.startsWith('UNREAD'));if(unreadText)unreadText.textContent='UNREAD '+unread(visible());
  }
}
function selectBox(node,id) {
  if(!node)return;
  const input=control(node,{},'input');input.type='checkbox';input.setAttribute('aria-label',id==='all'?'选择全部收藏':'选择 '+all().find(b=>b.id===id)?.title);
  if(id==='all'){input.id='select-all';input.checked=visible().length>0&&visible().every(b=>state.selected.has(b.id));}else{input.dataset.select=id;input.checked=state.selected.has(id);}
}
function bindFilters(root) {
  const holder=named(root,'视图筛选')||named(root,'筛选标签')||named(root,'筛选条件')||named(root,'队列筛选')||named(root,'合集视图筛选')||named(root,'状态筛选');if(!holder)return;
  const nodes=namedAll(holder,'标签'),items=all().filter(b=>state.view!=='favorites'||b.favorite);
  const specs=state.view==='tags'?[['all','全部',tags().length],['growth','本周增长',0],['unread','有未读',tags().filter(t=>all().some(b=>b.tags?.includes(t)&&!b.read)).length],['low','低频',tags().filter(t=>all().filter(b=>b.tags?.includes(t)).length<=1).length]]:state.view==='queue'?[['all','全部',all().filter(b=>b.queue&&!b.read).length],['p0','P0 今天优先',all().filter(b=>b.queue&&!b.read&&b.priority===0).length],['p1','P1 近期阅读',all().filter(b=>b.queue&&!b.read&&b.priority===1).length],['p2','P2 有空再看',all().filter(b=>b.queue&&!b.read&&b.priority===2).length]]:[['all','全部',items.length],['unread','未读',unread(items)],['media','含媒体',items.filter(b=>b.media?.length).length],['read','已读',items.filter(b=>b.read).length]];
  if(state.view==='queue'&&nodes[0]){const node=nodes[0].cloneNode(true);holder.append(node);nodes.push(node);specs.push(['unset','未设优先级',all().filter(b=>b.queue&&!b.read&&b.priority==null).length]);}
  nodes.forEach((n,i)=>{const spec=specs[i];if(!spec)return;textAt(n,0,`#${spec[1]} ${spec[2]}`);const button=control(n,state.view==='tags'?{tagFilter:spec[0]}:{filter:spec[0]});button.setAttribute('aria-pressed',String((state.view==='tags'?state.tagFilter:state.filter)===spec[0]));});
}
function bindCollectionCards(root) {
  const cats=['career','efficiency','resources','inspiration'].map(id=>state.catalog.categories.find(c=>c.id===id));
  if(state.view==='collections'){const originals=namedAll(root,'主题合集');for(const c of state.catalog.categories.filter(c=>c.id.startsWith('collection-'))){const node=originals[0].cloneNode(true);node.classList.add('custom-collection');named(root,'合集网格').append(node);cats.push(c);}}
  namedAll(root,'主题合集').forEach((n,i)=>{const c=cats[i];if(!c)return;named(n,'合集顶部')?.querySelectorAll('p').forEach(p=>{if(/^COL_/.test(p.textContent))p.remove();});const title=named(n,'合集标题行');textAt(title,0,c.label);textAt(title,1,c.count);const bottom=named(n,'合集底部')||named(n,'合集元数据');if(bottom){textAt(bottom,0,'未读 '+unread(all().filter(b=>b.category===c.id||b.collections?.includes(c.id))));textAt(bottom,1,'本地索引');}n.classList.add('collection-node');n.classList.toggle('collection-selected',state.category==='all'?i===0:state.category===c.id);n.classList.toggle('collection-unselected',state.category==='all'?i!==0:state.category!==c.id);control(n,{collection:c.id});});
}
function favoriteButton(b) {
  const button=document.createElement('button');button.type='button';button.className='button record-favorite';button.dataset.favorite=b.id;button.textContent=b.favorite?'★ 已收藏':'☆ 收藏';button.setAttribute('aria-label',b.favorite?'取消收藏文章':'收藏文章');button.setAttribute('aria-pressed',String(!!b.favorite));return button;
}
function bindBookmarkCard(node,b,home) {
  textAt(named(node,'作者头像'),0,initials(b));
  const author=named(node,home?'作者名行':'作者行');textAt(author,0,b.author);textAt(author,1,handle(b));
  textAt(named(node,home?'作者信息':'作者文字'),0,`${b.demo?'示例收藏':date(b.importedAt)} · ${cat(b.category)}`);
  if(home){const header=named(node,'推文头部');if(b.source)textAt(header,0,'↗');textAt(header,1,(b.source?b.id.slice(0,16):b.id).toUpperCase());}
  const ps=paragraphs(node);if(home){if(ps[0]){ps[0].textContent=b.text;ps[0].classList.add('record-excerpt');control(ps[0],{open:b.id});}}else{if(ps[0]){ps[0].textContent=b.title;control(ps[0],{open:b.id});}if(ps[1]){ps[1].textContent=b.text;ps[1].classList.add('record-excerpt');}}
  textAt(named(node,'档案批注'),0,b.note||'尚未添加批注');textAt(named(node,'媒体信息'),0,b.media?.[0]?.alt||'示例配图');
  referenceTags(named(node,home?'推文标签':'标签组'),b.tags||[]);
  readState(node,b);
  const metrics=namedAll(node,'互动指标');metrics.forEach((n,i)=>textAt(n,0,metric(b,['reply_count','retweet_count','like_count','impression_count'][i])));
  const archiveBottom=named(node,'标签与互动');if(archiveBottom)textAt(archiveBottom,0,`◯ ${metric(b,'reply_count')}  ↻ ${metric(b,'retweet_count')}  ♡ ${metric(b,'like_count')}  ║ ${metric(b,'impression_count')}`);
  const external=named(node,'external-link');if(external){const link=control(external,b.url?{}:{open:b.id},b.url?'a':'button');link.setAttribute('aria-label','打开原文');if(b.url){link.href=safeUrl(b.url);link.target='_blank';link.rel='noreferrer';}}
  const more=named(node,'more-horizontal');if(more){const button=control(more,{editTags:b.id});button.setAttribute('aria-label','编辑 '+b.title+' 的标签');}
  const bookmark=named(node,'收藏标记');if(bookmark){const button=control(bookmark,{queue:b.id});button.setAttribute('aria-label',b.queue?'移出阅读队列':'加入阅读队列');button.setAttribute('aria-pressed',String(b.queue));}
  const priority=document.createElement('button');priority.className='record-priority';priority.textContent=priorityText(b.priority);priority.dataset.editTags=b.id;priority.setAttribute('aria-label','编辑标签与阅读优先级');node.append(priority,favoriteButton(b));if(!home){const check=document.createElement('input');check.type='checkbox';check.className='archive-select';check.dataset.select=b.id;check.checked=state.selected.has(b.id);check.setAttribute('aria-label','选择 '+b.title);node.prepend(check);}
  let media=named(node,'媒体附件');const attachment=b.media?.find(m=>isDynamicMedia(m)&&mediaPreview(m)) || b.media?.find(m=>mediaPreview(m)),src=mediaPreview(attachment);
  if(src){node.classList.add('has-record-media');if(!media){media=document.createElement('div');media.dataset.name='媒体附件';const tags=named(node,home?'推文标签':'标签组');([...node.children].find(child=>child.contains(tags)) || priority).before(media);}media.classList.add('record-media-preview');media.replaceChildren();const image=document.createElement('img');image.src=src;image.alt=attachment.alt || '媒体缩略图';image.loading='lazy';media.append(image);if(isDynamicMedia(attachment)){const badge=document.createElement('span');badge.className='media-kind';badge.textContent=attachment.type==='animated_gif'?'GIF':'VIDEO';media.append(badge);}control(media,{open:b.id});media.setAttribute('aria-label','查看 '+b.title+' 的媒体附件');}else media?.remove();
}
function goToPage(page) {
  if(!Number.isInteger(page)||page<0||page>=state.pages)throw new Error(`页码请输入 1–${state.pages} 的整数。`);
  state.page=page;render();window.scrollTo({top:0});
}
function bindPagination(root,total,size,name='分页控制') {
  state.pages=Math.max(1,Math.ceil(total/size));state.page=Math.max(0,Math.min(state.page,state.pages-1));
  const page=named(root,name);if(!page)return;
  page.className='record-pagination';page.setAttribute('aria-label','收藏分页');
  page.innerHTML=`<span class="pagination-range">${countText(total?state.page*size+1:0)}–${countText(Math.min(total,(state.page+1)*size))} / ${total}</span><div class="pagination-actions"><button class="button" data-action="previous-page" ${state.page===0?'disabled':''}>‹ 上一页</button><span class="pagination-count" aria-live="polite">${countText(state.page+1)} / ${countText(state.pages)}</span><button class="button" data-action="next-page" ${state.page===state.pages-1?'disabled':''}>下一页 ›</button><form id="pagination-form" novalidate><label>第 <input name="page" aria-label="跳转页码" inputmode="numeric" value="${state.page+1}"> 页</label><button class="button" type="submit">跳转</button></form></div>`;
}
function bindCards(root,home) {
  const items=visible(),size=6;bindPagination(root,items.length,size);
  const shown=items.slice(state.page*size,state.page*size+size);
  const columns=namedAll(root,'卡片列');const name=home?'推文收藏卡片':'收藏记录';
  const originals=namedAll(root,name).map(n=>n.cloneNode(true));
  columns.forEach(c=>c.replaceChildren());
  shown.forEach((b,i)=>{const n=originals[i%originals.length].cloneNode(true);bindBookmarkCard(n,b,home);columns[Math.floor(i/3)].append(n);});
  if(!shown.length){columns[0].innerHTML=empty('没有匹配的收藏');}
  const result=named(root,'结果计数');if(result)textAt(result,0,items.length+' RECORDS');
  const grid=named(root,home?'卡片网格':'收藏卡片网格');if(grid)grid.classList.toggle('list-layout',state.layout==='list');
}
function bindRow(node,b,collection=false) {
  selectBox(named(node,'选择框'),b.id);readState(node,b);const priority=document.createElement('button');priority.className='row-priority';priority.dataset.editTags=b.id;priority.textContent=priorityText(b.priority);node.append(priority);
  if(collection){const title=named(node,'记录标题行');const p=paragraphs(title)[0];if(p){p.textContent=b.title;control(p,{open:b.id});}const metadata=named(node,'记录元数据');[b.author,handle(b),b.demo?'示例收藏':'收藏于 '+date(b.importedAt)].forEach((t,i)=>textAt(metadata,i,t));referenceTags(named(node,'记录标签'),b.tags||[]);textAt(node,0,engagement(b));}
  else{const text=named(node,'记录文字'),p=paragraphs(text)[0];if(p){p.textContent=b.title;control(p,{open:b.id});}const metadata=named(node,'元数据');textAt(metadata,0,b.author+' · '+handle(b));textAt(metadata,1,b.demo?'示例收藏':'收藏于 '+date(b.importedAt));const tagLine=paragraphs(node)[0];if(tagLine){if((b.tags||[]).length>3){tagLine.classList.add('tag-line-expanded');node.classList.add('has-many-tags');}tagLine.replaceChildren();(b.tags||[]).filter(t=>t!==state.tag).forEach((t,i)=>{if(i)tagLine.append(' · ');const span=document.createElement('span');span.textContent=t;span.dataset.tagName=t;tagLine.append(span);});}textAt(node,1,engagement(b));}
}
function replaceRows(root,name,items,collection=false) {
  bindPagination(root,items.length,4,collection?'合集分页':'记录分页');
  const original=namedAll(root,name);if(!original.length)return;
  const templates=original.map(n=>n.cloneNode(true)),parent=original[0].parentNode,anchor=original.at(-1).nextSibling;
  original.forEach(n=>n.remove());
  items.slice(state.page*4,state.page*4+4).forEach((b,i)=>{const node=templates[i%templates.length].cloneNode(true);bindRow(node,b,collection);parent.insertBefore(node,anchor);});
  if(!items.length){const e=document.createElement('div');e.innerHTML=empty('暂无相关收藏');parent.insertBefore(e.firstChild,anchor);}
}
function bindCollections(root) {
  if(state.category==='all')state.category='career';
  bindCollectionCards(root);const c=state.catalog.categories.find(c=>c.id===state.category),items=visible();
  const panel=named(root,'合集详情');textAt(named(panel,'详情标题'),0,c.label);textAt(named(panel,'详情标题'),1,'PRIVATE');textAt(panel,0,'按主题汇集相关收藏。标签默认由 AI 生成，支持手动调整。');
  namedAll(panel,'详情数据行').forEach((n,i)=>textAt(n,1,[items.length,unread(items),'本地档案'][i]));
  referenceTags(named(panel,'合集标签'),[...new Set(items.flatMap(b=>b.tags))].slice(0,4));textAt(named(panel,'自动规则'),0,'AI TAGS · '+tagLimit(state.settings.tagRules.perPost)+' / RECORD');textAt(named(panel,'自动规则'),1,'AI 总数 '+tagLimit(state.settings.tagRules.maxTags)+' · 手动不限');
  const recordsHeading=named(root,'记录区标题');textAt(named(recordsHeading,'终端标签'),1,'NODE RECORDS / '+items.length+' 条记录');textAt(named(recordsHeading,'记录操作'),0,unread(items)+' UNREAD');replaceRows(root,'合集记录',items,true);const result=named(root,'结果计数');if(result)textAt(result,0,items.length+' RECORDS');
}
function weekly(tag) {
  const now=Date.now(),week=7*86400000;const records=all().filter(b=>b.tags?.includes(tag));
  const current=records.filter(b=>b.importedAt&&now-new Date(b.importedAt).getTime()<week).length;
  const previous=records.filter(b=>b.importedAt&&now-new Date(b.importedAt).getTime()>=week&&now-new Date(b.importedAt).getTime()<2*week).length;
  return previous?Math.round((current-previous)/previous*100):current?100:0;
}
function bindTagMatrix(root) {
  let nodes=tags();if(state.q)nodes=nodes.filter(t=>t.toLowerCase().includes(state.q.toLowerCase())||all().some(b=>state.searchIds?.has(b.id)&&b.tags?.includes(t)));
  if(state.tagFilter==='unread')nodes=nodes.filter(t=>all().some(b=>b.tags?.includes(t)&&!b.read));
  if(state.tagFilter==='growth')nodes=nodes.filter(t=>weekly(t)>0);
  if(state.tagFilter==='low')nodes=nodes.filter(t=>all().filter(b=>b.tags?.includes(t)).length<=1);
  if(state.sort==='oldest')nodes.sort((a,b)=>all().filter(x=>x.tags.includes(b)).length-all().filter(x=>x.tags.includes(a)).length);
  if(!state.tag||!nodes.includes(state.tag))state.tag=nodes[0]||'';
  const originals=namedAll(root,'标签节点').map(n=>n.cloneNode(true)),rows=namedAll(root,'标签行');rows.forEach(r=>r.replaceChildren());
  nodes.forEach((t,i)=>{const n=originals[i%originals.length].cloneNode(true);const title=named(n,'标签标题行'),data=named(n,'标签数据'),records=all().filter(b=>b.tags.includes(t)),delta=weekly(t);textAt(title,0,'#'+t);textAt(title,1,(delta>=0?'+':'')+delta+'%');textAt(data,0,records.length);textAt(data,1,'未读 '+unread(records));textAt(named(n,'关联标签'),0,'↔ '+(relatedTags(t)[0]||'独立标签'));n.dataset.tagName=t;n.classList.add('tag-node');n.classList.toggle('node-selected',t===state.tag);n.classList.toggle('node-unselected',t!==state.tag);const trend=n.querySelector('[data-name="标签标题行"] p:last-child');trend?.classList.toggle('negative-trend',delta<0);if(trend?.classList.contains('text-[#ff6b6b]')&&delta>=0)trend.style.color='var(--secondary)';if(i>=12&&i%4===0){const row=rows[0].cloneNode(false);rows[0].parentNode.append(row);rows.push(row);}rows[Math.floor(i/4)].append(n);control(n,{nodeTag:t});});
  root.classList.toggle('many-tag-nodes',nodes.length>12);
  const panel=named(root,'标签详情'),items=visible(),delta=weekly(state.tag);paragraphs(panel)[0].dataset.tagName=state.tag;textAt(panel,0,'#'+(state.tag||'未选择'));textAt(panel,1,state.tag?`与 ${state.tag} 相关的收藏，点击标签可筛选，关联标签来自共同收藏。`:'当前筛选下没有标签。');namedAll(panel,'统计行').forEach((n,i)=>textAt(n,1,[items.length,unread(items),(delta>=0?'+':'')+delta+'%'][i]));referenceTags(named(panel,'关联标签组'),relatedTags(state.tag).slice(0,4));
  const headingLabel=named(named(root,'记录标题栏'),'终端标签');textAt(headingLabel,1,'TAGGED RECORDS / #'+state.tag);replaceRows(root,'标签记录',items);textAt(named(root,'结果计数'),0,nodes.length+' TAG NODES');const heading=named(root,'记录操作');textAt(heading,0,unread(items)+' UNREAD');
}
function bindQueue(root) {
  const items=visible().filter(b=>b.queue&&!b.read);
  const lanes=namedAll(root,'队列分组');if(lanes[0]){const unset=lanes[0].cloneNode(true);unset.classList.add('queue-unset-lane');lanes[lanes.length-1].after(unset);}
  namedAll(root,'队列分组').forEach((lane,p)=>{const priorityValue=p===3?null:p;const records=items.filter(b=>b.priority===priorityValue || priorityValue===null&&b.priority==null),old=namedAll(lane,'队列记录'),templates=old.map(n=>n.cloneNode(true)),anchor=named(lane,'添加记录');old.forEach(n=>n.remove());textAt(named(lane,'分组计数'),0,countText(records.length));textAt(named(lane,'分组文字'),0,p===3?'UNASSIGNED':'P'+p);textAt(named(lane,'分组文字'),1,priorityText(priorityValue));textAt(lane,0,`${priorityText(priorityValue)} · 预计阅读 ${records.reduce((n,b)=>n+minutes(b),0)} 分钟`);
    records.forEach((b,i)=>{const n=templates[i%templates.length].cloneNode(true);textAt(named(n,'优先级'),0,p===3?'—':'P'+p);const priority=control(named(n,'优先级'),{priorityEditor:b.id});priority?.setAttribute('aria-label','修改 '+b.title+' 的优先级');textAt(named(n,'优先级与时间'),0,`${b.demo?'示例入列':date(b.importedAt)} · ${minutes(b)} 分钟`);textAt(n,0,b.title);const title=paragraphs(n)[0];if(title)control(title,{open:b.id});textAt(n,0,`${b.author} · ${handle(b)} · ${b.demo?'示例收藏':date(b.importedAt)}`);const progress=Math.max(0,Math.min(100,b.read?100:b.readProgress||0));textAt(named(n,'阅读进度'),0,progress+'%');const fill=named(n,'进度值');if(fill)fill.style.width=progress+'%';const bar=named(n,'阅读进度');if(bar){const button=control(bar,{read:b.id});button.setAttribute('aria-label','标记 '+b.title+' 已读');}referenceTags(named(n,'队列标签'),b.tags.slice(0,2));textAt(n,1,engagement(b));lane.insertBefore(n,anchor);});
    if(anchor)control(anchor,{addPriority:p===3?'':String(p)});
  });
  const summary=named(root,'队列摘要');textAt(summary,0,`READ QUEUE: ${items.length} 条 · 已完成 ${all().filter(b=>b.read).length} 条`);textAt(summary,1,`预计阅读 ${items.reduce((n,b)=>n+minutes(b),0)} 分钟`);textAt(named(root,'结果计数'),0,items.length+' QUEUED');
}
function bindDetail(root) {
  const b=all().find(b=>b.id===state.id)||all()[0];if(!b)return;state.id=b.id;
  const back=named(root,'返回入口');textAt(back,0,`返回${detailOrigin?.view==='home'?'总览':titles[detailOrigin?.view]?.[2]||'全部收藏'} / RECORDS`);textAt(back,1,(b.source?b.id.slice(0,16):b.id).toUpperCase());control(back,{action:'return-records'});
  const actions=named(root,'页头操作');namedAll(actions,'终端按钮').forEach((n,i)=>{if(i&&b.source)textAt(n,0,'打开原文 ↗');const button=control(n,{action:i?'open-source':'copy-link'});if(!b.url)button.disabled=true;});actions.append(favoriteButton(b));assistant.entry(actions,true);askAgent.entry(actions,true);
  textAt(named(root,'标题信息'),0,b.title);textAt(named(root,'作者头像'),0,initials(b));textAt(named(root,'作者信息'),0,b.author+' / '+handle(b));textAt(named(root,'作者信息'),1,b.url?'SOURCE: '+(b.sourceName||'X')+' · '+b.url.replace(/^https?:\/\//,''):'SOURCE: DEMO · 示例内容');
  readState(root,b);textAt(named(root,'已读状态'),0,b.read?'已读 / READ':'未读 / UNREAD');const toggle=control(named(root,'状态切换'),{toggleRead:b.id});toggle?.setAttribute('aria-label',b.read?'标记未读':'标记已读');toggle?.setAttribute('aria-pressed',String(b.read));toggle?.classList.toggle('switch-unread',!b.read);
  textAt(named(root,'收藏时间'),1,b.demo?'示例收藏':date(b.importedAt));textAt(named(root,'同步来源'),1,b.demo?'本地示例':b.source==='wechat'?'微信公众号全文导入':b.source==='web'?'网页全文导入':'X Bookmark Sync');textAt(named(root,'记录校验'),1,b.id.startsWith('web-')?b.id.slice(4,16).toUpperCase():b.id.toUpperCase());
  const article=named(root,'正文内容'),header=named(article,'正文标题栏'),footer=named(article,'原文标记');
  textAt(header,0,`FULL TEXT · ${b.text.length} 字`);textAt(footer,0,b.createdAt?'发布于 '+date(b.createdAt):b.source?'全文已保存至本机':'示例内容 · 非 X 同步记录');
  [...article.children].filter(n=>n!==header&&n!==footer).forEach(n=>n.remove());
  if(b.blocks){for(const block of b.blocks){let n;if(block.type==='image'){n=document.createElement('figure');n.className='import-image';if(block.url){const image=document.createElement('img');image.src=block.url;image.alt=block.alt||'文章配图';image.loading='lazy';n.append(image);}else{const link=document.createElement('a');link.href=safeUrl(block.originalUrl);link.target='_blank';link.rel='noreferrer';link.textContent='图片未保存 · 查看原图 ↗';n.append(link);}if(block.alt){const caption=document.createElement('figcaption');caption.textContent=block.alt;n.append(caption);}}else{n=document.createElement(block.type==='heading'?'h2':block.type==='quote'?'blockquote':block.type==='code'?'pre':'p');n.className='import-text import-'+block.type;n.textContent=block.text;}footer.before(n);}}
  else{const text=document.createElement('p');text.className='record-text';text.textContent=b.text;footer.before(text);}
  named(article,'原文标记').insertAdjacentHTML('beforebegin',renderRecordMedia(b,esc));enableImageZoom(article);
  const link=b.links?.[0],linkPanel=named(root,'链接摘要');textAt(named(linkPanel,'链接摘要标题'),0,link?'LINK AVAILABLE':'NO EXTERNAL LINK');
  const info=named(linkPanel,'链接信息');textAt(info,0,link?new URL(link.url,location.origin).hostname:'无外部链接');textAt(info,1,link?.title||'该收藏没有附带链接');textAt(info,2,link?.description||'通过原始链接查看完整资料。');
  const action=named(linkPanel,'链接动作');textAt(action,0,link?'查看原始链接':'无链接');const a=control(action,{},'a');if(link){a.href=safeUrl(link.url);a.target='_blank';a.rel='noreferrer';}else{a.removeAttribute('href');}
  const image=named(linkPanel,'链接封面')?.querySelector('img');if(image){if(link&&b.cover)image.src=b.cover;else image.remove();image.alt='链接封面';}
  referenceTags(named(named(root,'归档标签'),'标签组'),b.tags||[]);
  namedAll(named(root,'指标组'),'指标文字').forEach((n,i)=>textAt(n,0,metric(b,['like_count','retweet_count','impression_count'][i])));
  const note=named(root,'个人批注');textAt(note,0,b.note||'点击右上角添加批注。');textAt(named(note,'批注元数据'),0,b.demo?'NOTE · DEMO':'NOTE · LOCAL');textAt(named(note,'批注元数据'),1,(b.note?.length||0)+' CHARS');const pencil=control(named(note,'pencil'),{note:b.id});pencil?.setAttribute('aria-label','编辑批注');
  const filing=named(root,'归档位置');namedAll(filing,'信息行').forEach((n,i)=>textAt(n,1,[cat(b.category),priorityText(b.priority),b.queue?'阅读队列中':'未设提醒','仅本机可见'][i]));referenceTags(named(filing,'归档标签'),b.tags||[]);control(named(filing,'终端按钮'),{action:'filing'});
  const related=all().filter(x=>x.id!==b.id&&x.tags.some(t=>b.tags.includes(t))).slice(0,3);textAt(named(root,'关联收藏标题'),0,countText(related.length)+' MATCHES');
  namedAll(root,'关联收藏').forEach((n,i)=>{const r=related[i];if(!r){n.remove();return;}textAt(named(n,'关联状态'),0,'#'+r.tags.find(t=>b.tags.includes(t)));readState(n,r);textAt(n,0,r.title);textAt(named(n,'关联元数据'),0,r.author+' / '+handle(r));textAt(named(n,'关联元数据'),1,r.demo?'示例收藏':date(r.importedAt));control(n,{open:r.id});});
  const index=all().findIndex(x=>x.id===b.id);namedAll(root,'相邻记录').forEach((n,i)=>{const r=all()[index+(i?1:-1)];textAt(n,1,r?.title||'已到档案边界');textAt(n,2,r?`${r.id.startsWith('web-')?r.id.slice(0,16):r.id} · ${handle(r)} · ${r.read?'已读':'未读'}`:'—');const button=control(n,r?{open:r.id}:{});button.disabled=!r;});
}
function referenceFrame(view) {
  const custom=['settings','sync','canvas'].includes(view),source=reference(custom?'archive':view),base=reference('archive');
  const side=named(base,'侧边导航'),work=view==='detail'?source:named(source,'档案工作区');
  work.className=named(base,'档案工作区').className;
  return {side,work,custom};
}
function render() {
  if(!state.catalog||!state.templates)return;
  const view=state.view,{side,work,custom}=referenceFrame(view);
  document.body.classList.toggle('imported-article',view==='detail'&&!!all().find(b=>b.id===state.id)?.blocks);
  bindSidebar(side);
  const themeEntry=named(work,'主题合集标题');if(themeEntry){const arrow=named(themeEntry,'arrow-up-right');if(arrow)control(arrow,{view:'collections'});} 
  if(custom){work.replaceChildren();if(view==='canvas')work.innerHTML=canvas.view();else work.innerHTML=`<header class="custom-header">${label(view==='settings'?'50':'40',view==='settings'?'TERMINAL SETTINGS':'CONNECTION CENTER')}<h1>${titles[view][2]}</h1></header>${view==='settings'?settings():sync()}`;}
  else {bindHeader(work,view);bindSearch(work);bindButtons(work);bindFilters(work);
    if(view==='home'){bindCollectionCards(work);bindCards(work,true);}if(['archive','favorites'].includes(view))bindCards(work,false);if(view==='collections')bindCollections(work);if(view==='tags')bindTagMatrix(work);if(view==='queue')bindQueue(work);if(view==='detail')bindDetail(work);
  }
  for(const p of work.querySelectorAll('p')){if(p.textContent.startsWith('RANGE:'))p.textContent=state.catalog.demo?'RANGE: DEMO RECORDS':'RANGE: LOCAL ARCHIVE';}
  for(const p of work.querySelectorAll('p')){if(p.textContent.startsWith('查看全部')){p.textContent='查看全部 '+state.catalog.categories.filter(c=>c.id!=='review').length+' 个合集';control(p,{view:'collections'});}if(p.textContent.includes('ALL RECORDS ENCRYPTED'))p.textContent=`LOCAL NODE / INbox · ${state.catalog.demo?'DEMO RECORDS':'LOCAL ARCHIVE'}`;if(p.textContent==='LOCAL ENCRYPTION ACTIVE')p.textContent='LOCAL VAULT / 本机档案';if(p.textContent.includes('Kōenji'))p.textContent='DEMO IMAGE / 示例配图';}
  const footer=named(work,'档案页脚');if(footer)textAt(footer,0,`LOCAL NODE / INbox · ${state.catalog.demo?'DEMO RECORDS':'LOCAL ARCHIVE'}`);
  const targetSide=document.querySelector('#sidebar'),targetWork=document.querySelector('#workspace');
  [ [targetSide,side],[targetWork,work] ].forEach(([target,original])=>{target.className=original.className;target.dataset.nodeId=original.dataset.nodeId;target.dataset.name=original.dataset.name;});
  targetSide.replaceChildren(...side.childNodes);content.replaceChildren(...work.childNodes);content.dataset.view=view;content.setAttribute('aria-busy','false');targetWork.classList.toggle('custom-view',custom);targetWork.classList.toggle('many-tag-nodes',work.classList.contains('many-tag-nodes'));document.body.classList.toggle('many-tags',!!document.querySelector('.has-many-tags,.many-tag-nodes'));
  document.querySelector('.workspace-panel-bar')?.remove();
  const bar=document.createElement('div');bar.className='workspace-panel-bar';bar.innerHTML=panelButton('sidebar','展开或收起导航','data-action="toggle-navigation" aria-controls="sidebar"')+'<span class="mono muted">INbox</span>'+(view==='detail'?panelButton('reader','展开或收起文章详细信息','data-action="toggle-detail-info"'):'');content.before(bar);applyPanels();
  document.querySelectorAll('[data-color]').forEach(e=>e.style.backgroundColor=e.dataset.color);mountSelectMenus(document.querySelector('#workspace'));paintTagColors(document);previewTagColor();assistant.onRender();askAgent.onRender();stripIndexes(document);if(view==='canvas')void canvas.mount();if(view==='settings'){const panel=document.querySelector('#agent-settings-panel');askAgent.settingsPanel().then(html=>{if(panel.isConnected){panel.innerHTML=html;mountSelectMenus(panel);}}).catch(e=>toast(e.message));}
}

async function refresh() { const id=++refreshId;try {const [status,catalog,settings]=await Promise.all([api('/api/status'),api('/api/bookmarks'),api('/api/settings')]);if(id!==refreshId)return;Object.assign(state,{status,catalog,settings});if(state.q){const r=await api('/api/bookmarks?q='+encodeURIComponent(state.q));if(id!==refreshId)return;state.searchIds=new Set(r.bookmarks.map(b=>b.id));}else state.searchIds=null;render();clearTimeout(pollTimer);if(status.sync.phase==='running'||status.ai.job.phase==='running')pollTimer=setTimeout(refresh,1600);}catch(e){toast(e.message);if(!state.catalog)content.innerHTML=`<div class="empty">服务暂时不可用。${btn('重新加载','reload')}</div>`;} }
async function update(ids,patch) { await api('/api/bookmarks/update',{ids,...patch,mode:state.catalog.demo?'demo':''});await refresh(); }
function showEditor(title,body) { editor.innerHTML=`<header><h2 id="editor-title">${title}</h2><button data-action="close-editor" aria-label="关闭">×</button></header>${body}`;mountSelectMenus(editor);paintTagColors(editor);editor.querySelectorAll('[data-color]').forEach(n=>n.style.backgroundColor=n.dataset.color);previewTagColor();if(!editor.open)editor.showModal(); }
function urlImporter(){showEditor('导入 URL',`<form id="url-import-form"><label>网页 / 公众号链接<input name="url" type="url" placeholder="https://…" required autocomplete="off"></label><p class="form-help" id="import-message">保存文章全文，正文配图尽量下载到本机。</p><details id="html-fallback"><summary>网页需要验证？从 HTML 文件导入</summary><p class="form-help">在浏览器打开文章并完成验证，再“另存为”网页 HTML。保留上面的原始链接，选择保存的文件。</p><input type="file" id="import-html" accept=".html,.htm,text/html" hidden>${btn('选择 HTML 文件','choose-import-html','',false,'type="button"')}<span id="import-filename" class="form-help">未选择文件</span></details><button class="button primary" type="submit">导入全文</button></form>`);}
function tagEditor(ids) { if(!ids.length)return toast('请先选择收藏');const b=all().find(b=>b.id===ids[0]);showEditor('标签与阅读优先级',`<form id="tag-form"><input type="hidden" name="ids" value="${esc(JSON.stringify(ids))}"><label>标签（逗号分隔，数量不限）<input name="tags" id="tag-value" value="${esc((ids.length===1?b.tags:[]).join('，'))}"></label>${ids.length>1?'<label>标签操作<select name="tagsMode"><option value="add">追加标签（留空保留原标签）</option><option value="replace">替换全部标签</option></select></label>':''}<label>阅读优先级<select name="priority">${priorityOptions(ids.length===1?b.priority:null,ids.length>1)}</select></label><div class="suggested-tags">${tags().map(t=>`<button type="button" data-tag-name="${esc(t)}" data-add-tag="${esc(t)}">#${esc(t)}</button>`).join('')}</div><p class="form-help">应用到 ${ids.length} 条收藏；AI 不会覆盖你的编辑。</p><button class="button primary" type="submit">保存标签与优先级</button></form>`); }
function renameTag() { if(!state.tag)return toast('先选择标签');showEditor('重命名 / 合并标签',`<form id="rename-form"><input type="hidden" name="from" value="${esc(state.tag)}"><label>标签名称<input name="to" value="${esc(state.tag)}" required></label><p class="form-help">输入已有标签名称即可合并，关联收藏一起更新。</p><button class="button primary" type="submit">保存</button></form>`); }
function queuePicker(priority) {showEditor('加入阅读队列',`<form id="queue-form"><input type="hidden" name="priority" value="${priority===undefined?'keep':priority??''}"><div class="queue-picker">${all().filter(b=>!b.queue).map(b=>`<label><input type="checkbox" name="id" value="${esc(b.id)}"><span>${esc(b.title)}</span></label>`).join('')||'<p>全部收藏已在队列中</p>'}</div><button class="button primary" type="submit">加入队列</button></form>`);}
document.addEventListener('submit',async e=>{const form=e.target;if(!form.matches('form')||form.dataset.aiForm||form.dataset.agentForm||form.dataset.canvasForm||form.dataset.onboardForm)return;e.preventDefault();const data=new FormData(form),submit=form.querySelector('[type="submit"]');if(submit)submit.disabled=true;try{switch(form.getAttribute('id')){
  case 'pagination-form':goToPage(Number(data.get('page'))-1);break;
  case 'search-form':state.page=0;state.q=document.querySelector('#search-input').value.trim();await refresh();break;
  case 'url-import-form':{const file=document.querySelector('#import-html').files[0];if(file?.size>8*1024*1024)throw new Error('网页文件超过 8 MB，未截断导入。');let html;if(file){const bytes=await file.arrayBuffer(),encoding=new TextDecoder('latin1').decode(bytes.slice(0,2048)).match(/charset\s*=\s*["']?([^\s;"'/>]+)/i)?.[1]||'utf-8';html=new TextDecoder(encoding).decode(bytes);}form.querySelector('#import-message').textContent='正在提取全文与保存配图…';const result=await api('/api/import/url',{url:data.get('url'),...(html?{html}:{})});editor.close();await refresh();navigate('detail',{id:result.id});toast(`${result.added?'已导入':'已更新'} ${result.characters} 字 · 配图 ${result.images.saved}/${result.images.total}${result.images.failed?'（部分图片未保存）':''}`);break;}
  case 'ai-form':await api('/api/settings/ai',Object.fromEntries(data));toast('AI 配置已保存');await refresh();break;
  case 'jev-form':await api('/api/settings/jev',{...Object.fromEntries(data),candidates:data.get('candidates').split(/[,，\n]/).map(t=>t.trim()).filter(Boolean),enabled:data.has('enabled')});toast('Jev 配置已保存');await refresh();break;
  case 'x-form':await api('/api/settings/x',Object.fromEntries(data));toast('X 配置已保存，可以开始授权');await refresh();break;
  case 'tag-form':{const values=data.get('tags').split(/[,，]/).map(t=>t.trim()).filter(Boolean),keepTags=data.get('tagsMode')==='add'&&!values.length;await update(JSON.parse(data.get('ids')),{...(keepTags?{}:{tags:values,tagsMode:data.get('tagsMode') || 'replace'}),...(data.get('priority')==='keep'?{}:{priority:priorityValue(data.get('priority'))})});editor.close();toast('标签与优先级已保存');break;}
  case 'rename-form':await api('/api/tags/edit',{...Object.fromEntries(data),mode:state.catalog.demo?'demo':''});state.tag=data.get('to').trim();editor.close();await refresh();toast('标签已更新');break;
  case 'queue-form':{const ids=data.getAll('id');if(!ids.length)throw new Error('请选择收藏');await update(ids,{queue:true,...(data.get('priority')==='keep'?{}:{priority:priorityValue(data.get('priority'))})});editor.close();toast('已加入阅读队列');break;}
  case 'note-form':await update([data.get('id')],{note:data.get('note')});editor.close();toast('批注已保存');break;
  case 'filing-form':await api('/api/collections/add',{record_ids:[data.get('id')],collection_id:data.get('category')});await update([data.get('id')],{priority:priorityValue(data.get('priority'))});editor.close();toast('归档信息已保存');break;
  case 'bulk-filing-form':await api('/api/collections/add',{record_ids:JSON.parse(data.get('ids')),collection_id:data.get('category')});editor.close();await refresh();break;
  case 'new-collection-form':await api('/api/collections',{name:data.get('name'),record_ids:JSON.parse(data.get('ids'))});editor.close();await refresh();toast('合集已创建');break;
  case 'priority-form':await update([data.get('id')],{priority:priorityValue(data.get('priority'))});editor.close();break;
  case 'new-tag-form':{const ids=data.getAll('id'),tag=data.get('tag').trim();if(!ids.length)throw new Error('选择至少一条收藏');for(const id of ids)await update([id],{tags:[...all().find(b=>b.id===id).tags,tag]});state.colorTag=tag;editor.close();render();toast('标签已创建');break;}
  case 'tag-rules-form':await api('/api/settings/tags',{perPost:Number(data.get('perPost')),maxTags:Number(data.get('maxTags')),maxLength:Number(data.get('maxLength')),reuseExisting:data.has('reuseExisting'),instructions:data.get('instructions')});await refresh();toast('AI 标签规则已保存');break;
  case 'tag-color-form':await api('/api/tags/color',{...Object.fromEntries(data),mode:state.catalog.demo?'demo':''});await refresh();toast('标签颜色已保存');break;
  case 'theme-form':{const value={...Object.fromEntries(data),name:'自定义',preset:'custom'};applyTheme(value);localStorage.setItem('inbox-theme',JSON.stringify(value));render();toast('配色已保存');break;}
  case 'ui-scale-form':setUIScale(Number(data.get('scale')));toast('全局大小已保存');break;
}}catch(e){if(form.getAttribute('id')==='url-import-form'){form.querySelector('#import-message').textContent=e.message;if(e.requiresHtml)form.querySelector('#html-fallback').open=true;}toast(e.message);}finally{if(submit)submit.disabled=false;}});
document.addEventListener('change',e=>{const el=e.target;if(el.id==='import-html')document.querySelector('#import-filename').textContent=el.files[0]?.name||'未选择文件';if(el.dataset.select){el.checked?state.selected.add(el.dataset.select):state.selected.delete(el.dataset.select);render();}if(el.id==='select-all'){state.selected=el.checked?new Set(visible().map(b=>b.id)):new Set();render();}if(el.dataset.priority)update([el.dataset.priority],{priority:Number(el.value)}).catch(e=>toast(e.message));if(el.id==='filter-category'){state.page=0;state.category=el.value;render();}if(el.id==='filter-tag'){state.page=0;state.tag=el.value;render();}if(el.id==='tag-color-name'){state.colorTag=el.value;document.querySelector('#tag-color-value').value=tagColor(el.value)||theme.accent;previewTagColor();}if(el.id==='ai-provider'){const p=state.settings.providers[el.value];document.querySelector('#ai-base').value=p.baseUrl;document.querySelector('#ai-model').value=p.model;document.querySelector('#ai-protocol').value=p.protocol;updateSelectLabel(document.querySelector('#ai-protocol')); document.querySelector('#ai-form [name="apiKey"]').value='';}});
document.addEventListener('input',e=>{if(e.target.id==='tag-color-value')previewTagColor();});
document.addEventListener('click',async e=>{const el=e.target.closest('button,a');if(!el)return;const d=el.dataset;try{
  if(d.selectToggle!==undefined){const menu=el.closest('.select-menu'),options=menu.querySelector('.select-options'),open=options.hidden;closeSelectMenus();options.hidden=!open;el.setAttribute('aria-expanded',String(open));if(open)options.querySelector('[aria-selected="true"]')?.focus();return;}
  if(d.selectValue!==undefined){const menu=el.closest('.select-menu'),select=menu.querySelector('select');select.value=d.selectValue;menu.querySelector('.select-value').textContent=select.selectedOptions[0].textContent;menu.querySelectorAll('.select-option').forEach(o=>o.setAttribute('aria-selected',String(o.dataset.selectValue===select.value)));closeSelectMenus();select.dispatchEvent(new Event('change',{bubbles:true}));menu.querySelector('.select-trigger').focus();return;}
  if(d.tagPreset){document.querySelector('#tag-color-value').value=d.tagPreset;previewTagColor();return;}
  if(d.fontScale){setFontScale(Number(d.fontScale));document.querySelectorAll('[data-font-scale]').forEach(b=>{const selected=Number(b.dataset.fontScale)===fontScale;b.classList.toggle('primary',selected);b.setAttribute('aria-pressed',String(selected));});return;}
  if(d.uiScale){setUIScale(Number(d.uiScale));return;}
  if(d.priorityEditor){const b=all().find(b=>b.id===d.priorityEditor);showEditor('阅读优先级',`<form id="priority-form"><input type="hidden" name="id" value="${esc(b.id)}"><label>阅读优先级<select name="priority">${priorityOptions(b.priority)}</select></label><button class="button primary" type="submit">保存</button></form>`);return;}
  if(d.view){navigate(d.view);return;}if(d.open){navigate('detail',{id:d.open});return;}if(d.collection){state.page=0;if(state.view!=='collections')navigate('collections',{category:d.collection});else{state.category=d.collection;render();}return;}if(d.tag){if(state.view==='tags'){state.page=0;state.tag=d.tag;render();}else navigate('archive',{tag:d.tag});return;}if(d.nodeTag){state.tag=d.nodeTag;state.page=0;render();return;}if(d.filter){state.filter=d.filter;state.page=0;render();return;}if(d.tagFilter){state.tagFilter=d.tagFilter;state.page=0;render();return;}if(d.layout){state.layout=d.layout;render();return;}if(d.editTags){tagEditor([d.editTags]);return;}if(d.favorite){await update([d.favorite],{favorite:!all().find(b=>b.id===d.favorite).favorite});toast(all().find(b=>b.id===d.favorite)?.favorite?'文章已收藏':'已取消收藏');return;}if(d.queue){await update([d.queue],{queue:!all().find(b=>b.id===d.queue).queue});return;}if(d.removeQueue){await update([d.removeQueue],{queue:false});return;}if(d.read||d.toggleRead){const id=d.read||d.toggleRead;await update([id],{read:d.read?true:!all().find(b=>b.id===id).read});return;}if(d.note){const b=all().find(b=>b.id===d.note);showEditor('编辑批注',`<form id="note-form"><input type="hidden" name="id" value="${esc(b.id)}"><textarea name="note" aria-label="批注" maxlength="2000" rows="7">${esc(b.note||'')}</textarea><button class="button primary" type="submit">保存批注</button></form>`);return;}if(d.palette){const value={...palettes[d.palette],preset:d.palette};applyTheme(value);localStorage.setItem('inbox-theme',JSON.stringify(value));render();return;}if(d.addPriority!==undefined){queuePicker(priorityValue(d.addPriority));return;}if(d.addTag){const input=document.querySelector('#tag-value'),values=input.value.split(/[,，]/).map(s=>s.trim()).filter(Boolean);if(!values.includes(d.addTag))input.value=[...values,d.addTag].join('，');return;}
  const ids=[...state.selected];switch(d.action){
  case 'return-records':returnToRecords();break;
  case 'toggle-navigation':navigationHidden=!navigationHidden;localStorage.setItem('inbox-navigation-hidden',String(navigationHidden));applyPanels();break;
  case 'toggle-detail-info':detailInfoHidden=!detailInfoHidden;localStorage.setItem('inbox-detail-info-hidden',String(detailInfoHidden));applyPanels();break;
    case 'onboarding':onboarding.open();break;
    case 'new-collection':showEditor('新建合集',`<form id="new-collection-form"><label>合集名称<input name="name" maxlength="80" required></label><input type="hidden" name="ids" value="${esc(JSON.stringify(ids))}"><button class="button primary" type="submit">创建合集</button></form>`);break;
    case 'mcp-config':{const cfg=await api('/api/mcp/config');showEditor('INbox MCP / stdio',`<pre class="mcp-config">${esc(cfg.toml)}</pre><p class="form-help">${esc(cfg.dataDir)}</p>`);break;}
    case 'connect-x':{el.disabled=true;try{const r=await api('/api/x/connect',{});if(window.webkit?.messageHandlers?.openExternal)window.webkit.messageHandlers.openExternal.postMessage(r.url);else window.open(r.url,'_blank','noopener,noreferrer');toast('在系统浏览器中完成 X 授权');let tries=0;const watch=async()=>{await refresh();if(!state.status.connected&&++tries<200)setTimeout(watch,3000);};setTimeout(watch,2000);}finally{el.disabled=false;}break;}
    case 'import-url':urlImporter();break;
    case 'choose-import-html':document.querySelector('#import-html').click();break;
    case 'reset-tag-rules':await api('/api/settings/tags',{});await refresh();toast('已恢复默认 AI 规则');break;
    case 'reset-tag-color':await api('/api/tags/color',{tag:document.querySelector('#tag-color-name').value,color:null,mode:state.catalog.demo?'demo':''});await refresh();toast('已恢复默认标签颜色');break;
    case 'reset-ui-scale':setUIScale(100);break;
    case 'close-editor':editor.close();break;case 'reload':await refresh();break;
    case 'previous-page':goToPage(state.page-1);break;
    case 'next-page':goToPage(state.page+1);break;
    case 'open-source':{const source=all().find(b=>b.id===state.id).url;if(source)window.open(safeUrl(source),'_blank','noopener,noreferrer');break;}
    case 'tag-policy':navigate('settings');document.querySelector('#tag-rule-perPost').focus();break;
    case 'new-tag':showEditor('新建标签',`<form id="new-tag-form"><label>标签名称<input name="tag" required></label><div class="queue-picker">${all().map(b=>`<label><input type="checkbox" name="id" value="${esc(b.id)}"><span>${esc(b.title)}</span></label>`).join('')}</div><p class="form-help">手动标签关联到收藏，不限数量，AI 不会覆盖。</p><button class="button primary" type="submit">保存</button></form>`);break;
    case 'sort':state.page=0;state.sort=state.view==='queue'?(state.sort==='priority'?'latest':'priority'):state.sort==='latest'?'oldest':'latest';render();break;
    case 'clear':state.page=0;state.q='';state.searchIds=null;state.category='all';state.tag='';state.filter='all';render();break;
    case 'media':state.page=0;state.filter=state.filter==='media'?'all':'media';render();break;
    case 'filters':document.querySelector('#filter-drawer').hidden=!document.querySelector('#filter-drawer').hidden;break;
    case 'filter-tags':document.querySelector('#filter-drawer').hidden=false;document.querySelector('#filter-tag').closest('.select-menu').querySelector('.select-trigger').focus();break;
    case 'bulk-filing':if(!ids.length)throw new Error('请先选择收藏');showEditor('移入合集',`<form id="bulk-filing-form"><input type="hidden" name="ids" value="${esc(JSON.stringify(ids))}"><label>主题<select name="category">${state.catalog.categories.map(c=>`<option value="${c.id}">${c.label}</option>`).join('')}</select></label><button class="button primary" type="submit">保存</button></form>`);break;
    case 'bulk-read':case 'bulk-queue':if(!ids.length)throw new Error('请先选择收藏');await update(ids,d.action==='bulk-read'?{read:true}:{queue:true});state.selected.clear();render();break;
    case 'bulk-tags':tagEditor(ids);break;case 'collection-read':{const ids=visible().map(b=>b.id);if(ids.length)await update(ids,{read:true});break;}
    case 'tag-read':{const ids=all().filter(b=>b.tags?.includes(state.tag)).map(b=>b.id);if(ids.length)await update(ids,{read:true});break;}
    case 'rename-tag':renameTag();break;case 'choose-queue':queuePicker();break;case 'go-archive':navigate('archive');break;
    case 'test-ai':el.disabled=true;await api('/api/ai/test',{});toast('AI 连接测试通过');await refresh();break;
    case 'test-jev':el.disabled=true;try{await api('/api/jev/test',{});toast('Jev 连接测试通过');}finally{await refresh();}break;
    case 'remove-jev':await api('/api/settings/jev',{remove:true});await refresh();toast('Jev 配置已移除');break;
    case 'remove-ai':await api('/api/settings/ai',{remove:true});await refresh();toast('AI 配置已移除');break;
    case 'organize':if(!canOrganize()){navigate('settings');toast('先配置 AI API 或启用 Jev');break;}el.disabled=true;await api('/api/ai/organize',{mode:state.catalog.demo?'demo':''});await refresh();break;
    case 'sync':el.disabled=true;await api('/api/sync',{});await refresh();break;case 'disconnect':await api('/api/disconnect',{});await refresh();break;
    case 'detail-queue':{const b=all().find(b=>b.id===state.id);await update([b.id],{queue:!b.queue});break;}
    case 'copy-link':await navigator.clipboard.writeText(all().find(b=>b.id===state.id).url);toast('原文链接已复制');break;
    case 'filing':{const b=all().find(b=>b.id===state.id);showEditor('编辑归档信息',`<form id="filing-form"><input type="hidden" name="id" value="${esc(b.id)}"><label>主题<select name="category">${state.catalog.categories.map(c=>`<option value="${c.id}" ${c.id===b.category?'selected':''}>${c.label}</option>`).join('')}</select></label><label>阅读优先级<select name="priority">${priorityOptions(b.priority)}</select></label><button class="button primary" type="submit">保存</button></form>`);break;}
    case 'reset-theme':{const value={...palettes.terminal,preset:'terminal'};applyTheme(value);localStorage.setItem('inbox-theme',JSON.stringify(value));render();break;}
    case 'export':{const blob=new Blob([JSON.stringify({product:'INbox',demo:state.catalog.demo,bookmarks:all()},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='INbox-bookmarks.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('已导出收藏');break;}
  }
}catch(e){toast(e.message);el.disabled=false;}});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeSelectMenus();}if(e.target.matches('.select-option')&&['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();const options=[...e.target.parentNode.children],index=options.indexOf(e.target);options[(index+(e.key==='ArrowDown'?1:-1)+options.length)%options.length].focus();}if((e.metaKey||e.ctrlKey)&&e.key==='k'&&!editor.open){e.preventDefault();document.querySelector('#search-input')?.focus();}});
window.addEventListener('popstate',e=>restoreHistory(e.state));
try{[state.assets,state.templates]=await Promise.all([api('/assets/manifest.json'),api('/assets/figma-templates.json')]);await refresh();if(history.state?.inbox)restoreHistory(history.state);mountConfirmations({api,esc,refresh,toast});await onboarding.firstRun();}catch(e){content.innerHTML='<div class="empty">资源加载失败，请重新加载。</div>';toast(e.message);}

function stripIndexes(root){root.querySelectorAll('[data-name="终端标签"] > p:first-child').forEach(n=>{if(/^\[[^\]]+\]$/.test(n.textContent.trim()))n.remove();});root.querySelectorAll('[data-name="导航项"] > p:first-child').forEach(n=>{if(/^\d{2}$/.test(n.textContent.trim()))n.remove();});}
window.addEventListener('inbox-oauth-complete',()=>{refresh().then(()=>navigate('sync')).catch(e=>toast(e.message));});
