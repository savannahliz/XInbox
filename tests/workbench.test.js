import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {createStore} from '../src/store.js';
import {createLibrary} from '../src/library.js';
import {createOperations} from '../src/operations.js';
import {createApp} from '../src/server.js';
import {selectScope} from '../src/ai-assistant.js';
import {canvasRecordFilter,selectRange} from '../public/research-canvas.js';

function fixture(t){const dataDir=mkdtempSync(join(tmpdir(),'inbox-workbench-')),store=createStore(dataDir),lib=createLibrary(store),ops=createOperations({store,...lib,dataDir});t.after(()=>{store.close();rmSync(dataDir,{recursive:true,force:true});});return{dataDir,store,...lib,ops};}
test('新收藏默认无优先级，加入队列不强制设置；手动标签不受 AI 上限限制',async t=>{
  const f=fixture(t);f.store.save('local',[{id:'web-test',title:'New',text:'全文',tags:[],category:'review',importedAt:new Date().toISOString()}]);assert.equal(f.library().all[0].priority,null);
  await f.ops.execute('add_to_reading_queue',{record_ids:['web-test']},{confirmed:true});assert.equal(f.library().all[0].priority,null);
  await f.ops.execute('add_tags',{record_ids:['web-test'],tags:Array.from({length:25},(_,i)=>'标签'+i)},{confirmed:true});assert.ok(f.library().all[0].tags.length>=25);
});
test('MCP 修改先确认，拒绝或取消不改数据；确认后 UI 读同一份库',async t=>{
  const f=fixture(t),controller=new AbortController();
  const change=f.ops.execute('create_collection',{name:'Agent Memory',record_ids:['demo-1']},{signal:controller.signal});
  assert.equal(f.library().collections.length,0);const p=f.ops.approvals()[0];assert.equal(p.records[0].id,'demo-1');f.ops.decide(p.id,true);const result=await change;
  assert.equal(f.library().collections[0].id,result.collection.id);assert.ok(f.library().all.find(b=>b.id==='demo-1').collections.includes(result.collection.id));
  const denied=f.ops.execute('mark_as_read',{record_ids:['demo-1']});f.ops.decide(f.ops.approvals()[0].id,false);await assert.rejects(denied,/拒绝/);assert.equal(f.library().all.find(b=>b.id==='demo-1').read,false);
  const cancelled=f.ops.execute('add_tags',{record_ids:['demo-1'],tags:['MCP']},{signal:controller.signal});controller.abort();await assert.rejects(cancelled,/取消/);assert.equal(f.ops.approvals().length,0);
});
test('合集、标签、最近记录、完整文章与上下文隔离共用库',async t=>{
  const f=fixture(t);await f.ops.execute('create_collection',{name:'研究',record_ids:['demo-1']},{confirmed:true});const c=f.library().collections[0];
  await f.ops.execute('add_to_collection',{collection_id:c.id,record_ids:['demo-2']},{confirmed:true});assert.equal(f.library().collections[0].recordIds.length,2);
  assert.ok((await f.ops.execute('list_tags')).tags.length);assert.equal((await f.ops.execute('list_collections')).collections.length,6);
  assert.equal((await f.ops.execute('get_record',{record_id:'demo-1'})).text,f.library().all.find(b=>b.id==='demo-1').text);
  await assert.rejects(f.ops.execute('get_record',{record_id:'demo-2'},{recordIds:['demo-1']}),/上下文/);
  assert.equal((await f.ops.execute('list_recent_records',{}, {recordIds:['demo-1']})).total,1);
  await f.ops.execute('mark_as_read',{record_ids:['demo-2']},{confirmed:true});assert.equal(f.library().all.find(b=>b.id==='demo-2').read,true);
});
test('stdio MCP 使用官方客户端完成握手、发现 11 个工具并查询现有记录',async t=>{
  const f=fixture(t),client=new Client({name:'inbox-test',version:'1'}),transport=new StdioClientTransport({command:process.execPath,args:[join(process.cwd(),'src/mcp-server.js')],env:{...process.env,INBOX_DATA_DIR:f.dataDir,INBOX_SESSION_ID:'source-test'},stderr:'pipe'});
  await client.connect(transport);t.after(()=>client.close());const tools=await client.listTools();assert.equal(tools.tools.length,11);assert.ok(tools.tools.find(t=>t.name==='get_record').annotations.readOnlyHint);
  await client.callTool({name:'get_record',arguments:{record_id:'demo-1'}});assert.deepEqual(f.store.get('agentReadLog:source-test'),['demo-1']);
  const result=await client.callTool({name:'search_records',arguments:{query:'作品集'}});assert.ok(JSON.parse(result.content[0].text).records.some(b=>b.id==='demo-1'));
  const p=client.callTool({name:'add_to_reading_queue',arguments:{record_ids:['demo-1'],priority:0}},undefined,{timeout:5000});
  for(let i=0;i<25&&!f.ops.approvals().length;i++)await new Promise(r=>setTimeout(r,50));f.ops.decide(f.ops.approvals()[0].id,true);const saved=await p;assert.ok(!saved.isError);assert.equal(f.library().all.find(b=>b.id==='demo-1').priority,0);
});
test('Canvas 全文/作者/摘要/标签/日期筛选，以及 Command 和 Shift 多选',()=>{
  const rows=[{id:'a',title:'A',text:'Agent Memory details',author:'Alice',tags:['MCP'],summary:'缓存',importedAt:'2026-10-01T12:00:00Z'},{id:'b',title:'B',text:'other',author:'Bob',tags:['Runtime'],importedAt:'2026-08-01T12:00:00Z'}];
  assert.deepEqual(canvasRecordFilter(rows,{query:'Agent Memory',tag:'MCP',from:'2026-09-01',to:'2026-10-01'}).map(b=>b.id),['a']);assert.equal(canvasRecordFilter(rows,{query:'Alice'}).length,1);assert.equal(canvasRecordFilter(rows,{query:'缓存'}).length,1);
  assert.deepEqual([...selectRange(['a','b','c'],new Set(['a']),'c',{shift:true,anchor:'a'})],['a','b','c']);assert.deepEqual([...selectRange(['a','b'],new Set(['a']),'b',{toggle:true})],['a','b']);
  assert.deepEqual(selectScope(rows,{type:'selection',ids:['a']}).books.map(b=>b.id),['a']);assert.throws(()=>selectScope(rows,{type:'selection',ids:['missing']}));
});
test('系统浏览器 PKCE 无同浏览器 cookie 也可安全回调，state 单次使用且不传 Client Secret',async t=>{
  const f=fixture(t);let exchanges=0;const app=createApp({dataDir:f.dataDir,clientId:'public-client',clientSecret:'old-web-secret',redirectUri:'http://127.0.0.1/auth/callback'},async(url,opt)=>{
    if(url.endsWith('/oauth2/token')){exchanges++;assert.equal(opt.headers.Authorization,undefined);assert.equal(new URLSearchParams(opt.body).get('client_id'),'public-client');assert.ok(new URLSearchParams(opt.body).get('code_verifier'));return Response.json({access_token:'test-token',expires_in:7200});}
    return Response.json({data:{id:'x-owner',username:'test-user',name:'Test'}});
  });await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>app.server.close(r));app.store.close();});const base='http://127.0.0.1:'+app.server.address().port,home=await fetch(base),cookie=home.headers.get('set-cookie').split(';')[0];
  const start=await(await fetch(base+'/api/x/connect',{method:'POST',headers:{origin:base,cookie},body:'{}'})).json(),url=new URL(start.url);assert.equal(url.hostname,'x.com');assert.equal(url.searchParams.get('code_challenge_method'),'S256');
  const state=url.searchParams.get('state');assert.equal((await fetch(base+'/auth/callback?state=wrong&code=x',{redirect:'manual'})).status,302);assert.equal(exchanges,0);
  const result=await fetch(base+'/auth/callback?state='+state+'&code=ok');assert.match(await result.text(),/X 已连接/);assert.equal(exchanges,1);
  await fetch(base+'/auth/callback?state='+state+'&code=again',{redirect:'manual'});assert.equal(exchanges,1);assert.equal(app.store.get('account').username,'test-user');
});
test('X 授权失败显示具体阶段与公开错误，保留重试入口且不暴露凭据',async t=>{
  const f=fixture(t),app=createApp({dataDir:f.dataDir,clientId:'public-client'},async()=>Response.json({error:'invalid_client',error_description:'private-code-and-token'},{status:401}));
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>app.server.close(r));app.store.close();});const base='http://127.0.0.1:'+app.server.address().port,home=await fetch(base),cookie=home.headers.get('set-cookie').split(';')[0];
  const start=await(await fetch(base+'/api/x/connect',{method:'POST',headers:{origin:base,cookie},body:'{}'})).json(),state=new URL(start.url).searchParams.get('state');
  await fetch(base+'/auth/callback?state='+state+'&code=private-code',{redirect:'manual'});const status=await(await fetch(base+'/api/status',{headers:{cookie}})).json();
  assert.equal(status.connected,false);assert.equal(status.xAuth.phase,'error');assert.equal(status.xAuth.stage,'exchange');assert.equal(status.xAuth.httpStatus,401);assert.match(status.xAuth.message,/Native App/);assert.ok(!JSON.stringify(status).includes('private-code'));
  await fetch(base+'/api/x/connect',{method:'POST',headers:{origin:base,cookie},body:'{}'});assert.equal(app.store.get('xAuth').phase,'authorizing');
});
test('白板仅保存 Record 引用，AI Note 保留 Sources；优先级可清空，引导只自动出现一次',async t=>{
  const f=fixture(t),app=createApp({dataDir:f.dataDir});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>app.server.close(r));app.store.close();});const base='http://127.0.0.1:'+app.server.address().port,home=await fetch(base),cookie=home.headers.get('set-cookie').split(';')[0],request=async(path,body)=>{const r=await fetch(base+path,{headers:{cookie,origin:base},...(body===undefined?{}:{method:'POST',body:JSON.stringify(body)})});return [r.status,await r.json()];};
  assert.equal((await request('/api/onboarding'))[1].complete,false);await request('/api/onboarding',{});assert.equal((await request('/api/onboarding'))[1].complete,true);
  const board={cards:[{id:'r',type:'record',recordId:'demo-1',x:0,y:0,text:'duplicate content'},{id:'n',type:'ai',text:'Analysis',sources:['demo-1'],x:320,y:0},{id:'s',type:'shape',shape:'ellipse',text:'观点',width:180,height:160,x:200,y:400}],edges:[{id:'e',from:'r',to:'n',label:'支持',arrow:'both',pattern:'dashed',route:'curve'}],showEdges:false,viewport:{x:100,y:100,zoom:1}};
  assert.equal((await request('/api/canvas',board))[0],200);const saved=(await request('/api/canvas'))[1];assert.equal(saved.cards[0].text,undefined);assert.deepEqual(saved.cards[1].sources,['demo-1']);assert.equal(saved.cards[2].shape,'ellipse');assert.equal(saved.cards[2].width,180);assert.equal(saved.edges[0].arrow,'both');assert.equal(saved.edges[0].pattern,'dashed');assert.equal(saved.edges[0].route,'curve');assert.equal(saved.showEdges,false);
  assert.equal((await request('/api/canvas',{...board,edges:[{...board.edges[0],arrow:'invalid'}]}))[0],400);assert.equal((await request('/api/canvas',{...board,cards:[{...board.cards[2],width:1}]}))[0],400);assert.equal((await request('/api/canvas'))[1].cards[2].width,180);
  assert.equal((await request('/api/bookmarks/update',{ids:['demo-1'],priority:0,queue:true}))[0],200);assert.equal((await request('/api/bookmarks/update',{ids:['demo-1'],priority:null}))[0],200);assert.equal((await request('/api/bookmarks'))[1].bookmarks.find(b=>b.id==='demo-1').priority,null);
});
