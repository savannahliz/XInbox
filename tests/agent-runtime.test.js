import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createStore} from '../src/store.js';
import {createLibrary} from '../src/library.js';
import {createAgents} from '../src/agent-runtime.js';

async function until(check){for(let i=0;i<100;i++){if(check())return;await new Promise(r=>setTimeout(r,10));}assert.fail('Agent 状态等待超时');}
for(const runtime of ['codex','dsh'])test(runtime+' Session 流式回答、默认快捷词、上下文、权限拒绝、恢复和取消',async t=>{
  const dataDir=mkdtempSync(join(tmpdir(),'inbox-agent-')),store=createStore(dataDir),{library}=createLibrary(store),peers=[];
  const peerFactory=(command,args,handlers)=>{const p={args,handlers,calls:[],closed:false,send(m){this.sent=m;},async close(){this.closed=true;},async call(method,params){this.calls.push({method,params});if(method==='initialize')return {agentCapabilities:{sessionCapabilities:{resume:{}}}};if(method==='thread/start'||method==='thread/resume')return{thread:{id:'codex-session'}};if(method==='session/new'||method==='session/resume')return{sessionId:'dsh-session'};if(method==='turn/start'||method==='session/prompt'){const text=params.input?.[0]?.text||params.prompt[0].text;assert.match(text,/demo-1/);assert.match(text,/总结关键观点/);if(peers.length===1){handlers.notification(runtime==='codex'?'item/agentMessage/delta':'session/update',runtime==='codex'?{delta:'来自 MCP 的回答'}:{update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'来自 MCP 的回答'}}});const answer=handlers.request({method:runtime==='codex'?'item/commandExecution/requestApproval':'session/request_permission',params:{command:'test action',options:[{kind:'allow_once',optionId:'allow-once'}]}});await until(()=>agents.pending().length);agents.decide(agents.pending()[0].id,false);assert.deepEqual(await answer,runtime==='codex'?{decision:'decline'}:{outcome:{outcome:'cancelled'}});if(runtime==='codex')handlers.notification('turn/completed',{turn:{status:'completed'}});return runtime==='codex'?{turn:{id:'t1'}}:{stopReason:'end_turn'};}return runtime==='codex'?{turn:{id:'t2'}}:new Promise(()=>{});}return {};}};peers.push(p);return p;};
  const agents=createAgents({store,library,dataDir,peerFactory});agents.saveConfig({codexCommand:process.execPath,dshCommand:process.execPath});t.after(async()=>{await agents.close();store.close();rmSync(dataDir,{recursive:true,force:true});});
  const scope={type:'selection',ids:['demo-1']},v=await agents.start({runtime,scope,question:'/总结'});await until(()=>agents.get(v.id).job.phase==='done');assert.equal(agents.get(v.id).messages[1].text,'来自 MCP 的回答');assert.equal(agents.get(v.id).runtimeId,runtime+'-session');
  assert.ok(peers[0].args.some(a=>a.includes('mcp_servers.inbox'))||runtime==='dsh');const create=peers[0].calls.find(c=>c.method===(runtime==='codex'?'thread/start':'session/new'));if(runtime==='codex')assert.equal(create.params.sandbox,'read-only');else assert.ok(create.params.mcpServers[0].env.some(e=>e.name==='INBOX_CONTEXT_IDS'&&e.value==='["demo-1"]'));
  await agents.cancel(v.id);await agents.start({runtime,scope,sessionId:v.id,question:'/总结'});await until(()=>peers[1]?.calls.some(c=>c.method===(runtime==='codex'?'turn/start':'session/prompt')));assert.ok(peers[1].calls.some(c=>c.method===(runtime==='codex'?'thread/resume':'session/resume')));await agents.cancel(v.id);assert.equal(agents.get(v.id).job.phase,'stopped');assert.equal(peers[1].closed,true);if(runtime==='dsh')assert.equal(peers[1].sent.method,'session/cancel');
});
