import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.js';
import { callAI } from '../src/ai-client.js';
import { splitText } from '../src/ai-assistant.js';

const reply = (text, usage = { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 }) => Response.json({ choices: [{ message: { content: text }, finish_reason: 'stop' }], ...(usage ? { usage } : {}) });
async function app(t, fetcher) {
  const dataDir = mkdtempSync(join(tmpdir(), 'inbox-assistant-'));
  const a = createApp({ dataDir }, fetcher);
  await new Promise(resolve => a.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => a.server.close(resolve)); a.store.close(); rmSync(dataDir, { recursive: true, force: true }); });
  const origin = `http://127.0.0.1:${a.server.address().port}`, page = await fetch(origin), cookie = page.headers.get('set-cookie').split(';')[0];
  const request = async (path, body) => {
    const r = await fetch(origin + path, { headers: { Cookie: cookie, ...(body === undefined ? {} : { Origin: origin, 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }) });
    return { status: r.status, data: await r.json() };
  };
  await request('/api/settings/ai', { provider: 'deepseek', apiKey: 'private-test-key' });
  const thread = scope => request('/api/ai/thread?scope=' + encodeURIComponent(JSON.stringify(scope)));
  const finish = async scope => {
    for (let i = 0; i < 100; i++) { const result = (await thread(scope)).data; if (result.job?.phase !== 'running') return result; await new Promise(resolve => setTimeout(resolve, 5)); }
    throw new Error('任务未结束');
  };
  return { ...a, request, thread, finish };
}
const book = (id, text, tags = ['测试'], category = 'career') => ({ id, title: '标题 ' + id, text, author: '作者', username: 'author', tags, category });
const article = id => ({ type: 'article', id });

test('分段不丢段落、文章末尾或 Unicode 字符', () => {
  const original = '第一段\n\n' + '中文🙂'.repeat(4000) + '\n\n最后一段。';
  const parts = splitText(original, 3000);
  assert.equal(parts.join(''), original); assert.ok(parts.every(p => [...p].length <= 3000));
  assert.ok(parts.every(p => !/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/.test(p)));
});
test('两种 AI 协议提取实际用量，输出截断仍计费而不冒充完整', async () => {
  for (const protocol of ['chat', 'responses']) {
    const events = [], cfg = { baseUrl: 'https://ai.example/v1', protocol, model: 'model', apiKey: 'key' };
    const result = await callAI(cfg, 'system', '完整输入', { onUsage: e => events.push(e), fetcher: async (url, options) => {
      const body = JSON.parse(options.body); assert.equal(options.headers.Authorization, 'Bearer key');
      if (protocol === 'responses') { assert.equal(body.input, '完整输入'); assert.equal(body.store, false); return Response.json({ status: 'completed', output: [{ content: [{ type: 'output_text', text: '回答' }] }], usage: { input_tokens: 40, output_tokens: 8, total_tokens: 48 } }); }
      assert.equal(body.messages[1].content, '完整输入'); return reply('回答');
    } });
    assert.equal(result, '回答'); assert.equal(events.length, 1); assert.equal(events[0].failed, false);
    assert.equal(events[0].usage.total, protocol === 'responses' ? 48 : 30);
    events.length = 0;
    await assert.rejects(callAI(cfg, 'system', 'input', { onUsage: e => events.push(e), fetcher: async () => Response.json(protocol === 'responses' ? { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, usage: { input_tokens: 40, output_tokens: 8 }, output: [] } : { choices: [{ finish_reason: 'length', message: { content: '部分' } }], usage: { prompt_tokens: 40, completion_tokens: 8 } }) }), /不完整/);
    assert.deepEqual(events, [{ usage: { input: 40, output: 8, total: 48 }, failed: true }]);
  }
});
test('全文翻译覆盖 6000 字之后的段落，保存结果、用量和预算预警', async t => {
  const inputs = [], a = await app(t, async (url, options) => {
    const body = JSON.parse(options.body), input = JSON.parse(body.messages[1].content); inputs.push(input.text);
    assert.ok(body.messages[0].content.includes('English')); return reply(input.text);
  });
  const original = '开头\n\n' + '中文🙂'.repeat(3000) + '\n\nTAIL_END';
  a.store.save('local', [book('long', original)]);
  const scope = article('long');
  assert.equal((await a.request('/api/ai/ask', { kind: 'translation', language: 'English', scope })).status, 202);
  const done = await a.finish(scope);
  assert.equal(done.job.phase, 'done'); assert.equal(done.job.done, done.job.total); assert.equal(inputs.join(''), original);
  assert.ok(done.messages.at(-1).text.endsWith('TAIL_END')); assert.equal(done.messages.at(-1).complete, true);
  assert.equal((await a.thread(scope)).data.messages.length, 2);
  let u = (await a.request('/api/ai/usage')).data;
  assert.equal(u.totals.total, inputs.length * 30); assert.equal(u.totals.unknown, 0);
  u = (await a.request('/api/settings/budget', { tokens: u.totals.total + 5, warningPercent: 20, balanceThreshold: 5 })).data;
  assert.equal(u.remaining, 5); assert.match(u.warnings[0], /预算/);
  assert.ok(!JSON.stringify(u).includes('private-test-key'));
  a.store.save('local', [book('long', '更新后的正文')]);
  assert.equal((await a.thread(scope)).data.messages.length, 0, '更新原文后不能复用旧译文');
});
test('全文总结分段读取与合并，保留末尾材料', async t => {
  const seen = [], a = await app(t, async (url, options) => {
    const input = JSON.parse(JSON.parse(options.body).messages[1].content);
    if (input.documents) { seen.push(...input.documents.map(d => d.text)); return reply(input.documents.map(d => '[1] ' + d.text.slice(-40)).join('\n')); }
    assert.ok(input.notes.join('').includes('LAST_FACT')); return reply('完整总结 LAST_FACT [1]');
  });
  const text = '第一段 ' + '全文信息。'.repeat(4000) + '\n\nLAST_FACT'; a.store.save('local', [book('summary', text)]);
  const scope = article('summary'); await a.request('/api/ai/ask', { scope, kind: 'summary' }); const result = await a.finish(scope);
  assert.equal(seen.join(''), text); assert.equal(result.job.phase, 'done'); assert.ok(result.job.text.includes('LAST_FACT'));
});
test('大范围提问逐层合并全部材料，不截断最后一批；后续问题带同范围对话历史', async t => {
  let reductions = 0, followupHistory;
  const a = await app(t, async (url, options) => {
    const body = JSON.parse(options.body), system = body.messages[0].content, raw = body.messages[1].content;
    if (system.includes('为任务合并')) { reductions++; return reply(raw.includes('TAIL_EVIDENCE') ? '[1] TAIL_EVIDENCE' : '[1] 中间证据'); }
    const input = JSON.parse(raw);
    if (input.documents && input.documents.length > 1) { followupHistory = input.history; return reply('后续回答 [1]'); }
    if (system.includes('提取本段')) return reply('[1] ' + '摘录信息。'.repeat(600) + (input.documents[0].text.includes('TAIL_EVIDENCE') ? 'TAIL_EVIDENCE' : ''));
    assert.ok(input.notes.join('').includes('TAIL_EVIDENCE')); return reply('合并结果 TAIL_EVIDENCE [1]');
  });
  a.store.save('local', [book('large', '正文材料。'.repeat(7000) + 'TAIL_EVIDENCE')]);
  const scope = { type: 'all' }; await a.request('/api/ai/ask', { scope, kind: 'chat', question: '整库有哪些证据？' });
  const done = await a.finish(scope); assert.equal(done.job.phase, 'done'); assert.ok(reductions > 0); assert.match(done.job.text, /TAIL_EVIDENCE/);
  a.store.save('local', [book('large', '原文一'), book('second', '原文二')]);
  await a.request('/api/ai/ask', { scope, kind: 'chat', question: '如何应用刚才的结论？' }); await a.finish(scope);
  assert.equal(followupHistory.length, 2); assert.equal(followupHistory[0].role, 'user'); assert.match(followupHistory[1].text, /TAIL_EVIDENCE/);
});
test('大范围提问在首个模型响应前可读取来源和处理阶段', async t => {
  let release;
  const a = await app(t, async () => {
    if (!release) return new Promise(resolve => { release = () => resolve(reply('[1] 相关要点')); });
    return reply('最终回答 [1]');
  });
  a.store.save('local', [book('long', '资料正文。'.repeat(4000))]);
  const scope = { type: 'all' };
  await a.request('/api/ai/ask', { scope, kind: 'chat', question: '总结资料' });
  assert.ok(release);
  const running = (await a.thread(scope)).data.job;
  assert.equal(running.phase, 'running'); assert.equal(running.stage, '提取要点');
  assert.equal(running.done, 0); assert.ok(running.total > 1);
  assert.deepEqual(running.currentSource, { number: 1, title: '标题 long', part: 1 });
  release();
  assert.equal((await a.finish(scope)).job.phase, 'done');
});
test('全库、标签、主题提问读取正确范围并提供来源，账号之间对话隔离', async t => {
  const inputs = [], a = await app(t, async (url, options) => { inputs.push(JSON.parse(JSON.parse(options.body).messages[1].content)); return reply('回答 [1]'); });
  a.store.save('local', [book('a', '全文 A', ['甲'], 'career'), book('b', '全文 B', ['乙'], 'efficiency'), book('c', '全文 C', ['甲'], 'career')]);
  for (const [scope, expected] of [[{ type: 'all' }, ['a', 'b', 'c']], [{ type: 'tag', value: '甲' }, ['a', 'c']], [{ type: 'category', value: 'efficiency' }, ['b']]]) {
    await a.request('/api/ai/ask', { kind: 'chat', scope, question: '如何应用？' }); const result = await a.finish(scope);
    assert.equal(result.job.phase, 'done'); assert.deepEqual(result.job.sources.map(s => s.id).sort(), expected);
    assert.deepEqual(inputs.at(-1).documents.map(d => d.text).sort(), expected.map(id => '全文 ' + id.toUpperCase()));
  }
  assert.equal((await a.request('/api/ai/ask', { kind: 'chat', scope: { type: 'tag', value: '不存在' }, question: '问题' })).status, 400);
  a.store.set('account', { id: 'account-a' }); a.store.save('account-a', [book('private', '私有正文')]);
  await a.request('/api/ai/ask', { scope: { type: 'all' }, kind: 'chat', question: 'A 账号提问' }); await a.finish({ type: 'all' });
  a.store.set('account', { id: 'account-b' });
  assert.equal((await a.thread({ type: 'all' })).data.messages.length, 0);
  assert.equal((await a.thread(article('private'))).status, 400);
});
test('自定义 prompt 的快捷词可调用，校验重复与未知词，删除后不能调用', async t => {
  const systems = [], a = await app(t, async (url, options) => { systems.push(JSON.parse(options.body).messages[0].content); return reply('依据文章作答'); });
  const values = [{ id: 'mine', keyword: '复盘', name: '我的复盘', text: '按背景、决策、教训来复盘。' }];
  assert.equal((await a.request('/api/settings/prompts', { prompts: values })).status, 200);
  assert.equal((await a.request('/api/settings/prompts', { prompts: [...values, { ...values[0], id: 'other' }] })).status, 400);
  assert.equal((await a.request('/api/settings/prompts', { prompts: [{ ...values[0], keyword: '<bad>' }] })).status, 400);
  const scope = article('demo-1');
  await a.request('/api/ai/ask', { scope, kind: 'chat', question: '/复盘 我的第一步？' }); const done = await a.finish(scope);
  assert.equal(done.job.phase, 'done'); assert.match(systems[0], /按背景、决策、教训/); assert.match(systems[0], /我的第一步/);
  assert.equal((await a.request('/api/ai/ask', { scope, kind: 'chat', question: '/未知' })).status, 400);
  await a.request('/api/settings/prompts', { prompts: [] });
  assert.equal((await a.request('/api/ai/ask', { scope, kind: 'chat', promptId: 'mine' })).status, 400);
});
test('任务失败与停止保留已完成译文，重复请求及中途修改 API 配置不会重复收费', async t => {
  let calls = 0, release;
  const a = await app(t, async (url, options) => {
    calls++; if (calls === 1) return reply('第一段译文');
    await new Promise(resolve => { release = resolve; options.signal.addEventListener('abort', resolve, { once: true }); });
    if (options.signal.aborted) throw new Error('abort'); return new Response('', { status: 429 });
  });
  a.store.save('local', [book('partial', '正文'.repeat(4000))]); const scope = article('partial');
  await a.request('/api/ai/ask', { scope, kind: 'translation' });
  while (!release) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal((await a.request('/api/ai/ask', { scope, kind: 'translation' })).status, 400);
  assert.equal((await a.request('/api/settings/ai', { remove: true })).status, 409);
  await a.request('/api/ai/stop', { scope }); const stopped = await a.finish(scope);
  assert.equal(stopped.job.phase, 'stopped'); assert.equal(stopped.messages.at(-1).text, '第一段译文'); assert.equal(stopped.messages.at(-1).complete, false);
  const u = (await a.request('/api/ai/usage')).data; assert.equal(u.totals.total, 30); assert.equal(u.totals.calls, 2); assert.equal(u.totals.failed, 1); assert.equal(u.totals.unknown, 1);
});
test('DeepSeek 余额读取与预警使用真实返回值，不支持或读取失败时不虚构余额', async t => {
  let fail = false;
  const a = await app(t, async (url, options) => {
    assert.equal(url, 'https://api.deepseek.com/user/balance'); assert.equal(options.headers.Authorization, 'Bearer private-test-key');
    if (fail) return new Response('', { status: 401 });
    return Response.json({ is_available: true, balance_infos: [{ currency: 'CNY', total_balance: '2.40', granted_balance: '0', topped_up_balance: '2.40' }] });
  });
  let u = (await a.request('/api/ai/balance', {})).data; assert.equal(u.balance.items[0].total, '2.40'); assert.match(u.warnings[0], /余额/); assert.equal(u.totals.calls, 0);
  fail = true; u = (await a.request('/api/ai/balance', {})).data; assert.equal(u.balance.status, 'error'); assert.equal(u.balance.items[0].total, '2.40'); assert.match(u.balance.error, /401/);
  await a.request('/api/settings/ai', { provider: 'openai', apiKey: 'other-key' });
  assert.equal((await a.request('/api/ai/balance', {})).status, 400);
  u = (await a.request('/api/ai/usage')).data; assert.equal(u.balance.supported, false); assert.equal(u.totals.calls, 0); assert.equal(u.remaining, null);
});
test('未配置模型时不生成假回答；失败后没有完整结果但仍保留实际消耗', async t => {
  const a = await app(t, async () => Response.json({ status: 'incomplete', output: [], usage: { input_tokens: 20, output_tokens: 10, total_tokens: 30 } }));
  await a.request('/api/settings/ai', { provider: 'openai', apiKey: 'key' }); const scope = article('demo-1');
  await a.request('/api/ai/ask', { scope, kind: 'summary' }); const result = await a.finish(scope);
  assert.equal(result.job.phase, 'error'); assert.equal(result.messages.filter(m => m.role === 'assistant').length, 0);
  assert.equal((await a.request('/api/ai/usage')).data.totals.total, 30);
  await a.request('/api/settings/ai', { remove: true });
  assert.equal((await a.request('/api/ai/ask', { scope, kind: 'chat', question: '问题' })).status, 400);
});
