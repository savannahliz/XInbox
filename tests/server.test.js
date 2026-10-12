import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.js';
import { createStore } from '../src/store.js';
import { createLibrary } from '../src/library.js';

async function app(t, config = {}, fetcher) {
  const dataDir = mkdtempSync(join(tmpdir(), 'recall-http-'));
  const result = createApp({ ...config, dataDir }, fetcher);
  await new Promise(resolve => result.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => result.server.close(resolve)); result.store.close(); rmSync(dataDir, { recursive: true, force: true }); });
  const origin = `http://127.0.0.1:${result.server.address().port}`;
  const page = await fetch(origin); const cookie = page.headers.get('set-cookie').split(';')[0];
  return { ...result, dataDir, origin, cookie, request: (path, options = {}) => fetch(origin + path, { ...options, headers: { Cookie: cookie, ...options.headers } }) };
}
test('匿名请求无法读私有数据，已打开页面可查询示例，状态不含令牌', async t => {
  const a = await app(t);
  assert.equal((await fetch(a.origin + '/api/bookmarks')).status, 401);
  const catalog = await (await a.request('/api/bookmarks?q=portfolio')).json();
  assert.equal(catalog.demo, true); assert.equal(catalog.total, 12); assert.equal(catalog.bookmarks[0].id, 'demo-1');
  const status = await (await a.request('/api/status')).json();
  assert.equal(status.configured, true); assert.equal(status.connected, false);
  assert.ok(!JSON.stringify(status).includes('access_token'));
});
test('外站不能修改分类，同源修改可以持久保存', async t => {
  const a = await app(t);
  const body = JSON.stringify({ id: 'demo-1', category: 'efficiency' });
  assert.equal((await a.request('/api/categorize', { method: 'POST', headers: { Origin: 'https://other.example' }, body })).status, 403);
  assert.equal((await a.request('/api/categorize', { method: 'POST', headers: { Origin: a.origin }, body })).status, 200);
  const data = await (await a.request('/api/bookmarks')).json();
  assert.equal(data.bookmarks.find(b => b.id === 'demo-1').category, 'efficiency');
});
test('缺少 OAuth 配置给出设置入口，无凭证同步明确失败', async t => {
  const a = await app(t, {clientId:''});
  const auth = await a.request('/auth/start', { redirect: 'manual' });
  assert.equal(auth.status, 302); assert.ok(auth.headers.get('location').includes('notice=setup'));
  assert.equal((await a.request('/api/sync', { method: 'POST', headers: { Origin: a.origin }, body: '{}' })).status, 409);
});
test('OAuth 回调校验 state 与浏览器 cookie，伪造回调不会换 token', async t => {
  let calls = 0;
  const a = await app(t, { clientId: 'client', redirectUri: 'http://127.0.0.1/auth/callback' }, async () => { calls++; return Response.json({}); });
  const start = await a.request('/auth/start', { redirect: 'manual' });
  const state = new URL(start.headers.get('location')).searchParams.get('state');
  const callback = await a.request(`/auth/callback?state=${state}&code=bad`, { redirect: 'manual' });
  assert.ok(callback.headers.get('location').includes('auth-failed')); assert.equal(calls, 0);
});
test('完整 OAuth 与后台分页同步返回真实收藏，断开后仍可读取本地内容', async t => {
  const fake = async url => {
    if (url.endsWith('/oauth2/token')) return Response.json({ access_token: 'secret-access', refresh_token: 'refresh', expires_in: 7200 });
    if (url.endsWith('/users/me')) return Response.json({ data: { id: 'owner', name: 'Reader', username: 'reader' } });
    return Response.json({ data: [{ id: '1234', text: '产品经理面试实践', author_id: 'writer' }], includes: { users: [{ id: 'writer', name: 'Writer', username: 'writer' }] }, meta: {} });
  };
  const a = await app(t, { clientId: 'client', redirectUri: 'http://127.0.0.1/auth/callback' }, fake);
  const start = await a.request('/auth/start', { redirect: 'manual' });
  const state = new URL(start.headers.get('location')).searchParams.get('state');
  const oauthCookie = start.headers.get('set-cookie').split(';')[0];
  const callback = await a.request(`/auth/callback?state=${state}&code=valid`, { redirect: 'manual', headers: { Cookie: a.cookie + '; ' + oauthCookie } });
  assert.ok(callback.headers.get('location').includes('connected'));
  const started = await a.request('/api/sync', { method: 'POST', headers: { Origin: a.origin }, body: '{}' }); assert.equal(started.status, 202);
  let status;
  for (let i = 0; i < 20; i++) { status = await (await a.request('/api/status')).json(); if (status.sync.phase !== 'running') break; await new Promise(r => setTimeout(r, 10)); }
  assert.equal(status.sync.phase, 'done'); assert.equal(status.count, 1);
  assert.ok(!JSON.stringify(status).includes('secret-access'));
  const catalog = await (await a.request('/api/bookmarks')).json(); assert.equal(catalog.demo, false); assert.equal(catalog.bookmarks[0].id, '1234');
  await a.request('/api/disconnect', { method: 'POST', headers: { Origin: a.origin }, body: '{}' });
  assert.equal((await (await a.request('/api/bookmarks')).json()).total, 1);
});

test('标签、批注和队列可编辑，标签合并更新所有关联收藏', async t => {
  const a = await app(t);
  const post = (path, body) => a.request(path, { method:'POST', headers:{Origin:a.origin}, body:JSON.stringify(body) });
  assert.equal((await post('/api/bookmarks/update', {ids:['demo-1'],tags:['面试','产品设计'],note:'下周复习',queue:true,priority:0})).status,200);
  let data = await (await a.request('/api/bookmarks')).json();
  const one = data.bookmarks.find(b=>b.id==='demo-1');
  assert.deepEqual(one.tags,['面试','产品设计']);assert.equal(one.manualTags,true);assert.equal(one.queue,true);assert.equal(one.priority,0);assert.equal(one.note,'下周复习');
  assert.equal((await post('/api/bookmarks/update',{ids:['demo-2'],tags:['一','二','三','四']})).status,200);
  assert.equal((await post('/api/tags/edit',{from:'面试',to:'职业发展'})).status,200);
  assert.equal((await post('/api/bookmarks/update',{ids:['demo-1'],read:true})).status,200);
  data = await (await a.request('/api/bookmarks')).json();
  assert.ok(data.bookmarks.find(b=>b.id==='demo-1').tags.includes('职业发展'));
  assert.equal(data.bookmarks.find(b=>b.id==='demo-1').queue,false);
});
test('重新同步补全旧收藏的媒体元数据，不重建记录或覆盖用户整理，并开放 X 视频 CSP',async t=>{
  const requests=[],payload={data:[{id:'old-video',text:'原有视频观点 https://t.co/v',attachments:{media_keys:['v']},entities:{urls:[{url:'https://t.co/v',expanded_url:'https://pbs.twimg.com/poster.jpg',media_key:'v'}]}},{id:'old-photo',text:'配图观点',attachments:{media_keys:['p']}}],includes:{media:[{media_key:'v',type:'video',preview_image_url:'https://pbs.twimg.com/poster.jpg',duration_ms:12000,width:1280,height:720,variants:[{content_type:'video/mp4',bit_rate:832000,url:'https://video.twimg.com/video.mp4'}]},{media_key:'p',type:'photo',url:'https://pbs.twimg.com/photo.jpg'}]},meta:{}};
  const a=await app(t,{},async url=>{requests.push(url);return Response.json(payload);});
  a.store.set('account',{id:'owner',username:'reader'});a.store.saveTokens({access_token:'test-token',expiresAt:Date.now()+3600000});
  a.store.save('owner',payload.data.map(p=>({id:p.id,title:p.text,text:p.text,tags:[],category:'review',media:[],links:[],importedAt:'2026-09-01T00:00:00Z'})));
  a.store.categorize('owner','old-video','resources');
  const post=(path,body)=>a.request(path,{method:'POST',headers:{Origin:a.origin},body:JSON.stringify(body)});
  await post('/api/bookmarks/update',{ids:['old-video'],tags:['手动标签'],note:'保留批注',read:true,priority:1});
  await post('/api/bookmarks/update',{ids:['old-photo'],queue:true,priority:2});
  const collection=await(await post('/api/collections',{name:'保留合集',record_ids:['old-video']})).json();
  assert.equal((await post('/api/sync',{})).status,202);let status;
  for(let i=0;i<30;i++){status=await(await a.request('/api/status')).json();if(status.sync.phase!=='running')break;await new Promise(r=>setTimeout(r,10));}
  assert.equal(status.sync.phase,'done');assert.equal(status.sync.added,0);assert.equal(status.count,2);
  const data=await(await a.request('/api/bookmarks')).json(),b=data.bookmarks.find(b=>b.id==='old-video');
  assert.equal(b.media[0].media_key,'v');assert.equal(b.media[0].variants[0].url,'https://video.twimg.com/video.mp4');assert.equal(b.media[0].duration_ms,12000);
  assert.deepEqual(b.tags,['手动标签']);assert.equal(b.note,'保留批注');assert.equal(b.queue,false);assert.equal(b.read,true);assert.equal(b.priority,1);assert.equal(b.importedAt,'2026-09-01T00:00:00Z');assert.equal(b.category,'resources');assert.ok(b.collections.includes(collection.collection.id));assert.equal(b.links.length,0);
  const photo=data.bookmarks.find(b=>b.id==='old-photo');assert.equal(photo.media[0].url,'https://pbs.twimg.com/photo.jpg');assert.equal(photo.queue,true);assert.equal(photo.priority,2);assert.ok(requests[0].includes('variants'));
  const page=await a.request('/');assert.match(page.headers.get('content-security-policy'),/media-src 'self' https:\/\/video\.twimg\.com/);assert.equal((await a.request('/media.js')).status,200);
});
test('AI 配置加密，连接测试发起模型请求，后台整理保留用户标签', async t => {
  let calls=0;
  const a = await app(t,{},async(url, options)=>{
    calls++;assert.ok(url.endsWith('/chat/completions'));
    const input=JSON.parse(JSON.parse(options.body).messages[1].content);
    return Response.json({choices:[{message:{content:JSON.stringify({items:input.map(b=>({id:b.id,tags:['学习成长']}))})}}]});
  });
  const post=(path,body)=>a.request(path,{method:'POST',headers:{Origin:a.origin},body:JSON.stringify(body)});
  await post('/api/bookmarks/update',{ids:['demo-1'],tags:['用户标签']});
  assert.equal((await post('/api/settings/ai',{provider:'deepseek',apiKey:'test-private-key'})).status,200);
  assert.ok(!a.store.get('aiConfig').includes('test-private-key'));
  assert.ok(!JSON.stringify(await(await a.request('/api/settings')).json()).includes('test-private-key'));
  assert.equal((await post('/api/ai/test',{})).status,200);
  assert.equal((await post('/api/ai/organize',{})).status,202);
  let status;
  for(let i=0;i<20;i++){status=await(await a.request('/api/status')).json();if(status.ai.job.phase!=='running')break;await new Promise(r=>setTimeout(r,10));}
  assert.equal(status.ai.job.phase,'done');assert.equal(status.ai.job.done,11);assert.equal(calls,3);
  const data=await(await a.request('/api/bookmarks')).json();
  assert.deepEqual(data.bookmarks.find(b=>b.id==='demo-1').tags,['用户标签']);
  assert.deepEqual(data.bookmarks.find(b=>b.id==='demo-2').tags,['学习成长']);
  const usage=await(await a.request('/api/ai/usage')).json();
  assert.equal(usage.totals.calls,3);assert.equal(usage.totals.unknown,3);assert.equal(usage.totals.total,0);
});
test('Advanced 保存公开 X Client ID 后使用 PKCE，忽略 Client Secret', async t => {
  const a=await app(t,{redirectUri:'http://127.0.0.1/auth/callback'},async(url,options)=>{
    if(url.endsWith('/oauth2/token')){assert.equal(options.headers.Authorization,undefined);assert.equal(new URLSearchParams(options.body).get('client_id'),'web-client');return Response.json({access_token:'token',expires_in:7200});}
    return Response.json({data:{id:'owner',name:'Reader',username:'reader'}});
  });
  const saved=await a.request('/api/settings/x',{method:'POST',headers:{Origin:a.origin},body:JSON.stringify({clientId:'web-client',clientSecret:'private-secret'})});assert.equal(saved.status,200);
  const settings=await(await a.request('/api/settings')).json();assert.equal(settings.x.hasSecret,false);assert.ok(!JSON.stringify(settings).includes('private-secret'));
  const start=await a.request('/auth/start',{redirect:'manual'}), auth=new URL(start.headers.get('location'));
  assert.equal(auth.searchParams.get('client_id'),'web-client');
  const oauthCookie=start.headers.get('set-cookie').split(';')[0];
  const callback=await a.request('/auth/callback?state='+auth.searchParams.get('state')+'&code=valid',{redirect:'manual',headers:{Cookie:a.cookie+'; '+oauthCookie}});
  assert.ok(callback.headers.get('location').includes('connected'));
});

test('URL 全文导入可独立于 X 使用，去重、编辑、查询及本机图片均持久保存',async t=>{
  const end='最后一段：导入必须覆盖全部内容。';
  const html=`<article><h1>产品经理实践</h1>${Array.from({length:100},()=>'<p>学习产品经理工作中的需求、评估和反馈方法。记录每一项实践的过程与判断，而不只保留工具名称。</p>').join('')}<img src="https://images.example/image.png"><p>${end}</p></article>`;
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5XcAAAAASUVORK5CYII=','base64');
  const a=await app(t,{},async url=>url.includes('images.example')?new Response(png):new Response(html,{headers:{'content-type':'text/html'}}));
  const post=(path,body)=>a.request(path,{method:'POST',headers:{Origin:a.origin},body:JSON.stringify(body)});
  const body={url:'https://articles.example/read#fragment'};
  const imported=await(await post('/api/import/url',body)).json();assert.equal(imported.added,true);assert.equal(imported.images.saved,1);
  const duplicate=await(await post('/api/import/url',body)).json();assert.equal(duplicate.added,false);assert.equal(duplicate.id,imported.id);
  let catalog=await(await a.request('/api/bookmarks')).json();assert.equal(catalog.demo,false);assert.equal(catalog.total,1);assert.ok(catalog.bookmarks[0].text.endsWith(end));
  const media=catalog.bookmarks[0].media[0].url;assert.equal((await fetch(a.origin+media)).status,401);assert.equal((await a.request(media)).status,200);
  await post('/api/bookmarks/update',{ids:[imported.id],tags:['实践'],note:'保存后再看',queue:true,favorite:true});
  await post('/api/categorize',{id:imported.id,category:'efficiency'});
  a.store.set('account',{id:'another-x-account',username:'test_reader',name:'测试用户'});
  catalog=await(await a.request('/api/bookmarks?q=最后一段')).json();assert.equal(catalog.bookmarks.length,1);assert.deepEqual(catalog.bookmarks[0].tags,['实践']);assert.equal(catalog.bookmarks[0].note,'保存后再看');assert.equal(catalog.bookmarks[0].category,'efficiency');assert.equal(catalog.bookmarks[0].queue,true);assert.equal(catalog.bookmarks[0].favorite,true);
});

test('公众号验证页不入库，浏览器保存的 HTML 可全文导入',async t=>{
  const a=await app(t,{},async()=>new Response('<html><title>环境异常</title><p>请进行访问验证</p></html>',{headers:{'content-type':'text/html'}}));
  const post=body=>a.request('/api/import/url',{method:'POST',headers:{Origin:a.origin},body:JSON.stringify(body)});
  const failed=await post({url:'https://mp.weixin.qq.com/s/test'});assert.equal(failed.status,400);assert.equal((await failed.json()).requiresHtml,true);assert.equal(a.store.list('local').length,0);
  const text='这是一篇供全文导入验证的公众号文章。内容涵盖学习和工作中的实践方法，并保留文字结束后的最后一段。';
  const html=`<h1 id="activity-name">公众号导入测试</h1><span id="js_name">测试作者</span><div id="js_content"><p>${text}</p><p>文章结束。</p></div>`;
  const saved=await post({url:'https://mp.weixin.qq.com/s/test',html});assert.equal(saved.status,200);
  const b=(await(await a.request('/api/bookmarks')).json()).bookmarks[0];assert.equal(b.source,'wechat');assert.equal(b.title,'公众号导入测试');assert.ok(b.text.endsWith('文章结束。'));
});


test('批量只修改优先级保留标签，追加标签保留各条原标签，替换操作可明确清空',async t=>{
  const a=await app(t),post=body=>a.request('/api/bookmarks/update',{method:'POST',headers:{Origin:a.origin},body:JSON.stringify(body)});
  const before=(await(await a.request('/api/bookmarks')).json()).bookmarks;
  assert.equal((await post({ids:['demo-1','demo-2'],priority:null})).status,200);
  assert.equal((await post({ids:['demo-1','demo-2'],tags:['阅读'],tagsMode:'add'})).status,200);
  let books=(await(await a.request('/api/bookmarks')).json()).bookmarks;
  for(const id of ['demo-1','demo-2']){const b=books.find(b=>b.id===id);assert.deepEqual(b.tags,[...before.find(b=>b.id===id).tags,'阅读']);assert.equal(b.priority,null);}
  await post({ids:['demo-2'],tags:[],tagsMode:'replace'});books=(await(await a.request('/api/bookmarks')).json()).bookmarks;assert.deepEqual(books.find(b=>b.id==='demo-2').tags,[]);
});

test('文章收藏独立于队列，持久保存，重新同步不覆盖，取消不删除原文',async t=>{
  const a=await app(t),post=body=>a.request('/api/bookmarks/update',{method:'POST',headers:{Origin:a.origin},body:JSON.stringify(body)});
  a.store.set('account',{id:'favorite-owner',username:'reader'});
  const record={id:'favorite-record',title:'Agent Memory',text:'完整正文',tags:['Agent'],category:'resources',importedAt:'2026-10-01T00:00:00Z'};
  a.store.save('favorite-owner',[record]);
  assert.equal(a.library().all[0].favorite,false);
  assert.equal((await post({ids:[record.id],favorite:'true'})).status,400);
  assert.equal((await post({ids:[record.id],favorite:true})).status,200);
  let b=(await(await a.request('/api/bookmarks')).json()).bookmarks[0];
  assert.equal(b.favorite,true);assert.equal(b.queue,false);assert.equal(b.read,false);
  await post({ids:[record.id],queue:true,priority:0,tags:['人工标签']});
  await post({ids:[record.id],read:true});
  a.store.save('favorite-owner',[{...record,text:'同步更新后的全文'}]);
  const secondStore=createStore(a.dataDir);
  try{b=createLibrary(secondStore).library().all[0];assert.equal(b.favorite,true);assert.equal(b.read,true);assert.equal(b.queue,false);assert.equal(b.priority,0);assert.deepEqual(b.tags,['人工标签']);assert.equal(b.text,'同步更新后的全文');}finally{secondStore.close();}
  assert.equal((await post({ids:[record.id],favorite:false})).status,200);
  b=(await(await a.request('/api/bookmarks')).json()).bookmarks[0];
  assert.equal(b.favorite,false);assert.equal(b.text,'同步更新后的全文');assert.equal(b.read,true);
  a.store.set('account',{id:'another-owner',username:'other'});a.store.save('another-owner',[record]);assert.equal(a.library().all[0].favorite,false);
});
