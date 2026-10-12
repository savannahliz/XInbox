import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.js';
import { jevConfig, evaluateBookmark, jevCacheKey } from '../src/jev-client.js';

const cfg = () => jevConfig({ apiKey: 'test-key' });
const result = body => Response.json({ answers: Object.fromEntries(Object.entries(body.questions).map(([id,q]) => [id,q.type === 'choice' ? { type:'choice',choice:'career',confidence:0.9 } : { type:'noul',noul:id==='tag0'?0.96:0.2 }])), usage:{input_tokens:100,output_tokens:12} });
test('Jev 使用官方 Gateway 的评估协议，在一次请求中匹配多个标签和分类', async () => {
  let event;
  const out = await evaluateBookmark(cfg(), { title:'面试作品集',text:'原文' }, ['职业发展','资源合集'], {}, async (url, options) => {
    assert.equal(url,'https://ai-gateway.vercel.sh/typesafe/v1/systemone');
    const body=JSON.parse(options.body);
    assert.equal(body.model,'typesafe-ai/jev');
    assert.equal(body.questions.category.type,'choice');
    assert.equal(body.questions.tag0.type,'noul');
    assert.equal(Object.keys(body.questions).length,3);
    assert.ok(!body.messages);
    return result(body);
  }, value => event=value);
  assert.deepEqual(out.tags,['职业发展']); assert.equal(out.category,'career');
  assert.deepEqual(event,{usage:{input:100,output:12,total:112},failed:false});
  assert.equal(jevConfig({service:'typesafe',apiKey:'test'}).model,'jev-latest');
});
test('Jev 拒绝缺失、越界答案，不把不确定判断强行打标签；规则变化使缓存失效', async () => {
  await assert.rejects(evaluateBookmark(cfg(),{text:'a'},['主题'],{},async()=>Response.json({answers:{}})),/答案/);
  const uncertain = await evaluateBookmark(cfg(),{text:'a'},['主题'],{},async()=>Response.json({answers:{category:{type:'choice',choice:'career',confidence:0.3},tag0:{type:'noul',noul:0.4}}}));
  assert.deepEqual(uncertain,{tags:[],category:'review'});
  const book={text:'a'}, key=jevCacheKey(cfg(),book,['主题'],{});
  assert.notEqual(key,jevCacheKey(cfg(),book,['主题'],{perPost:1}));
  assert.notEqual(key,jevCacheKey(cfg(),{text:'b'},['主题'],{}));
  assert.notEqual(key,jevCacheKey(cfg(),book,['新主题'],{}));
});
test('Jev 显示 Gateway 的信用卡验证原因，失败用量未知且不会输出密钥', async () => {
  let event;
  await assert.rejects(evaluateBookmark(cfg(),{text:'测试'},[],{},async()=>Response.json({error:{message:'AI Gateway requires a valid credit card on file to service requests.'}},{status:403}),e=>event=e),/信用卡/);
  assert.deepEqual(event,{usage:null,failed:true});
  await assert.rejects(evaluateBookmark(cfg(),{text:'测试'},[],{},async()=>Response.json({error:{message:'Access denied: test-key'}},{status:403})),e=>!e.message.includes('test-key'));
});
async function app(t, fetcher) {
  const dataDir=mkdtempSync(join(tmpdir(),'inbox-jev-')),a=createApp({dataDir},fetcher);
  await new Promise(r=>a.server.listen(0,'127.0.0.1',r));
  t.after(async()=>{await new Promise(r=>a.server.close(r));a.store.close();rmSync(dataDir,{recursive:true,force:true});});
  const origin=`http://127.0.0.1:${a.server.address().port}`,cookie=(await fetch(origin)).headers.get('set-cookie').split(';')[0];
  const get=async p=>(await fetch(origin+p,{headers:{Cookie:cookie}})).json();
  const post=(p,b)=>fetch(origin+p,{method:'POST',headers:{Cookie:cookie,Origin:origin},body:JSON.stringify(b)});
  const finish=async()=>{for(let i=0;i<200;i++){const s=await get('/api/status');if(s.ai.job.phase!=='running')return s.ai.job;await new Promise(r=>setTimeout(r,10));}throw Error('未完成');};
  return {...a,get,post,finish};
}
test('Jev 独立接入、密钥不返回、保护手动分类/标签，二次整理命中缓存且遵守 AI 配额', async t => {
  let calls=0;
  const a=await app(t,async(_,options)=>{calls++;return result(JSON.parse(options.body));});
  assert.equal((await a.post('/api/settings/jev',{apiKey:'test-key',candidates:['工作方法','AI产品']})).status,200);
  const settings=await a.get('/api/settings');
  assert.equal(settings.jev.hasKey,true); assert.equal(settings.jev.apiKey,undefined);
  await a.post('/api/settings/tags',{maxTags:1,perPost:1});
  await a.post('/api/bookmarks/update',{ids:['demo-1'],tags:Array.from({length:24},(_,i)=>'手动'+i)});
  await a.post('/api/categorize',{id:'demo-2',category:'resources'});
  assert.equal((await a.post('/api/ai/organize',{})).status,202);
  assert.equal((await a.finish()).phase,'done');
  let books=(await a.get('/api/bookmarks')).bookmarks;
  assert.equal(books.find(b=>b.id==='demo-1').tags.length,24);
  assert.equal(books.find(b=>b.id==='demo-1').category,'career');
  assert.equal(books.find(b=>b.id==='demo-2').category,'resources');
  assert.ok(books.filter(b=>!b.manualTags).every(b=>b.tags.join()==='工作方法'));
  const first=calls;
  await a.post('/api/ai/organize',{}); const job=await a.finish();
  assert.equal(calls,first); assert.equal(job.cached,12);
  const usage=(await a.get('/api/settings')).jevUsage;
  assert.equal(usage.totals.calls,12); assert.equal(usage.totals.total,1344);
  await a.post('/api/categorize',{id:'demo-3',category:'inspiration'});
  books=(await a.get('/api/bookmarks')).bookmarks;
  assert.equal(books.find(b=>b.id==='demo-3').category,'inspiration');
  await a.post('/api/settings/jev',{enabled:false});
  assert.equal((await a.post('/api/ai/organize',{})).status,409);
});
test('Jev 整理失败不部分保存；整理中用户编辑优先，配置不得改变', async t => {
  let release,calls=0;
  const a=await app(t,async(_,o)=>{calls++;if(calls===1)await new Promise(r=>release=r);if(calls===2)return new Response('',{status:429});return result(JSON.parse(o.body));});
  await a.post('/api/settings/jev',{apiKey:'test-key'});
  const before=(await a.get('/api/bookmarks')).bookmarks.find(b=>b.id==='demo-2');
  await a.post('/api/ai/organize',{});
  await a.post('/api/bookmarks/update',{ids:['demo-1'],tags:['手动优先']});
  await a.post('/api/categorize',{id:'demo-1',category:'efficiency'});
  assert.equal((await a.post('/api/settings/jev',{enabled:false})).status,409);
  release(); assert.equal((await a.finish()).phase,'error');
  const books=(await a.get('/api/bookmarks')).bookmarks;
  assert.deepEqual(books.find(b=>b.id==='demo-1').tags,['手动优先']);
  assert.equal(books.find(b=>b.id==='demo-1').category,'efficiency');
  assert.deepEqual(books.find(b=>b.id==='demo-2').tags,before.tags);
  assert.equal(books.find(b=>b.id==='demo-2').category,before.category);
});
test('默认候选池整理后收敛仍命中缓存；新增候选或修改规则才重新评估', async t => {
  let calls=0;
  const a=await app(t,async(_,o)=>{calls++;return result(JSON.parse(o.body));});
  await a.post('/api/settings/ai',{provider:'deepseek',apiKey:'generation-key'});
  await a.post('/api/settings/jev',{apiKey:'test-key'});
  await a.post('/api/ai/organize',{});assert.equal((await a.finish()).phase,'done');
  const first=calls;
  await a.post('/api/ai/organize',{});assert.equal((await a.finish()).cached,12);assert.equal(calls,first);
  await a.post('/api/settings/jev',{candidates:['新标签']});
  await a.post('/api/ai/organize',{});assert.equal((await a.finish()).phase,'done');assert.equal(calls,first+12);
  await a.post('/api/settings/tags',{perPost:1});
  await a.post('/api/ai/organize',{});assert.equal((await a.finish()).phase,'done');assert.equal(calls,first+24);
});
test('Jev 成功提交也保留运行中的手动编辑', async t => {
  let release,calls=0;
  const a=await app(t,async(_,o)=>{if(++calls===1)await new Promise(r=>release=r);return result(JSON.parse(o.body));});
  await a.post('/api/settings/jev',{apiKey:'test-key'});
  await a.post('/api/ai/organize',{});
  await a.post('/api/bookmarks/update',{ids:['demo-1'],tags:['手动保留']});
  await a.post('/api/categorize',{id:'demo-1',category:'resources'});
  release();assert.equal((await a.finish()).phase,'done');
  const book=(await a.get('/api/bookmarks')).bookmarks.find(b=>b.id==='demo-1');
  assert.deepEqual(book.tags,['手动保留']);assert.equal(book.category,'resources');
});
