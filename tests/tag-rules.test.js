import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.js';
import { generateTags, aiConfig } from '../src/ai-client.js';

async function app(t, fetcher) {
  const dataDir = mkdtempSync(join(tmpdir(), 'inbox-tags-'));
  const a = createApp({ dataDir }, fetcher);
  await new Promise(resolve => a.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => a.server.close(resolve)); a.store.close(); rmSync(dataDir, { recursive: true, force: true }); });
  const origin = `http://127.0.0.1:${a.server.address().port}`;
  const cookie = (await fetch(origin)).headers.get('set-cookie').split(';')[0];
  const get = async path => (await fetch(origin + path, { headers: { Cookie: cookie } })).json();
  const post = (path, body) => fetch(origin + path, { method: 'POST', headers: { Cookie: cookie, Origin: origin }, body: JSON.stringify(body) });
  return { ...a, get, post };
}
async function finish(a) {
  for (let i = 0; i < 100; i++) {
    const { ai } = await a.get('/api/status');
    if (ai.job.phase !== 'running') return ai.job;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('整理未结束');
}
const answer = tags => Response.json({ choices: [{ message: { content: JSON.stringify({ items: tags }) } }] });

test('标签设置可修改并持久保存，数量 0 表示 AI 不限，手动标签不受规则影响', async t => {
  const a = await app(t);
  const defaults = (await a.get('/api/settings')).tagRules;
  assert.equal(defaults?.perPost, 3); assert.equal(defaults?.maxTags, 16);
  const rules = { ...defaults, perPost: 1, maxTags: 2, maxLength: 6, instructions: '按大主题归类', reuseExisting: false };
  assert.equal((await a.post('/api/settings/tags', rules)).status, 200);
  assert.deepEqual((await a.get('/api/settings')).tagRules, rules);
  const tags = Array.from({ length: 24 }, (_, i) => '手动主题' + i);
  assert.equal((await a.post('/api/bookmarks/update', { ids: ['demo-1'], tags })).status, 200);
  assert.deepEqual((await a.get('/api/bookmarks')).bookmarks.find(b => b.id === 'demo-1').tags, tags);
  assert.equal((await a.post('/api/settings/tags', { ...rules, perPost: 0, maxTags: 0 })).status, 200);
  assert.equal(a.store.get('tagRules').maxTags, 0);
  assert.equal((await a.post('/api/settings/tags', { ...rules, perPost: -1 })).status, 400);
  assert.equal((await a.post('/api/settings/tags', { ...rules, maxTags: 1.5 })).status, 400);
});

test('AI 规则进入模型指令，支持自定义数量、粒度和不设数量上限', async () => {
  const cfg = aiConfig({ provider: 'deepseek', apiKey: 'test' }), posts = [{ id: '1', title: 'Agent', text: '原文' }];
  const rules = { perPost: 4, maxTags: 2, maxLength: 20, reuseExisting: false, instructions: '保留 Agent 作为独立技术标签' };
  const items = await generateTags(cfg, posts, [], async (_, options) => {
    const instruction = JSON.parse(options.body).messages[0].content;
    assert.ok(instruction.includes(rules.instructions)); assert.match(instruction, /4/); assert.match(instruction, /2/);
    return answer([{ id: '1', tags: ['Agent', '产品设计'] }]);
  }, undefined, rules);
  assert.deepEqual(items[0].tags, ['Agent', '产品设计']);
  await assert.rejects(generateTags(cfg, posts, [], async () => answer([{ id: '1', tags: ['甲', '乙', '丙'] }]), undefined, rules), /2/);
  const unlimited = { ...rules, perPost: 0, maxTags: 0 };
  assert.equal((await generateTags(cfg, posts, [], async () => answer([{ id: '1', tags: Array.from({ length: 20 }, (_, i) => '主题' + i) }]), undefined, unlimited))[0].tags.length, 20);
  await assert.rejects(generateTags(cfg, posts, [], async () => answer([{ id: '1', tags: ['面试'] }]), undefined, { maxLength: 2 }), /2 个字/);
});

test('手动标签不占 AI 配额，显式整理按新规则重新生成已有 AI 标签', async t => {
  const requested = [];
  const a = await app(t, async (_, options) => {
    const body = JSON.parse(options.body); requested.push(body.messages[0].content);
    return answer(JSON.parse(body.messages[1].content).map(b => ({ id: b.id, tags: ['新主题'] })));
  });
  await a.post('/api/bookmarks/update', { ids: ['demo-1'], tags: Array.from({ length: 24 }, (_, i) => '手动' + i) });
  const overrides = a.store.get('bookmarkState:demo');
  for (let i = 2; i <= 12; i++) overrides['demo-' + i] = { tags: ['旧 AI ' + i], method: 'AI' };
  a.store.set('bookmarkState:demo', overrides);
  const defaults = (await a.get('/api/settings')).tagRules;
  await a.post('/api/settings/tags', { ...defaults, perPost: 1, maxTags: 1 });
  await a.post('/api/settings/ai', { provider: 'deepseek', apiKey: 'test' });
  assert.equal((await a.post('/api/ai/organize', {})).status, 202);
  const job = await finish(a); assert.equal(job.phase, 'done'); assert.equal(job.done, 11);
  const books = (await a.get('/api/bookmarks')).bookmarks;
  assert.equal(books.find(b => b.id === 'demo-1').tags.length, 24);
  assert.ok(books.filter(b => !b.manualTags).every(b => b.tags.join() === '新主题'));
  assert.ok(requested[0].includes('还可新增 1 个'));
});

test('AI 整理失败不部分覆盖，运行中用户编辑受保护', async t => {
  let calls = 0, release;
  const a = await app(t, async (_, options) => {
    calls++;
    if (calls === 1) await new Promise(resolve => release = resolve);
    const input = JSON.parse(JSON.parse(options.body).messages[1].content);
    return calls === 2 ? new Response('', { status: 429 }) : answer(input.map(b => ({ id: b.id, tags: ['AI主题'] })));
  });
  await a.post('/api/settings/ai', { provider: 'deepseek', apiKey: 'test' });
  const before = (await a.get('/api/bookmarks')).bookmarks.find(b => b.id === 'demo-2').tags;
  await a.post('/api/ai/organize', {});
  await a.post('/api/bookmarks/update', { ids: ['demo-1'], tags: ['用户优先'] });
  release();
  assert.equal((await finish(a)).phase, 'error');
  const books = (await a.get('/api/bookmarks')).bookmarks;
  assert.deepEqual(books.find(b => b.id === 'demo-1').tags, ['用户优先']);
  assert.deepEqual(books.find(b => b.id === 'demo-2').tags, before);
});

test('标签颜色保存、重命名继承、合并保留目标颜色，支持恢复默认', async t => {
  const a = await app(t);
  await a.post('/api/bookmarks/update', { ids: ['demo-1'], tags: ['手动甲', '手动乙'] });
  assert.equal((await a.post('/api/tags/color', { tag: '手动甲', color: '#6699FF' })).status, 200);
  assert.equal((await a.get('/api/settings')).tagColors['手动甲'], '#6699ff');
  assert.equal((await a.post('/api/tags/color', { tag: '手动乙', color: 'url(x)' })).status, 400);
  await a.post('/api/tags/edit', { from: '手动甲', to: '新名称' });
  assert.equal((await a.get('/api/settings')).tagColors['新名称'], '#6699ff');
  await a.post('/api/tags/color', { tag: '手动乙', color: '#ffd84a' });
  await a.post('/api/tags/edit', { from: '新名称', to: '手动乙' });
  let colors = (await a.get('/api/settings')).tagColors;
  assert.equal(colors['手动乙'], '#ffd84a'); assert.ok(!colors['新名称']);
  await a.post('/api/tags/color', { tag: '手动乙', color: null });
  assert.ok(!(await a.get('/api/settings')).tagColors['手动乙']);
  await a.post('/api/bookmarks/update', { ids: ['demo-1'], tags: ['constructor', '__proto__'] });
  await a.post('/api/tags/color', { tag: '__proto__', color: '#6e9bff' });
  await a.post('/api/tags/edit', { from: '__proto__', to: 'constructor' });
  assert.equal((await a.get('/api/settings')).tagColors.constructor, '#6e9bff');
});

test('整理成功时也保留运行中的手动修改，规则不能在任务中改变', async t => {
  let release;
  const a = await app(t, async (_, options) => {
    if (!release) await new Promise(resolve => release = resolve);
    return answer(JSON.parse(JSON.parse(options.body).messages[1].content).map(b => ({ id: b.id, tags: ['学习成长'] })));
  });
  await a.post('/api/settings/ai', { provider: 'deepseek', apiKey: 'test' });
  await a.post('/api/ai/organize', {});
  assert.equal((await a.post('/api/settings/tags', { perPost: 1 })).status, 409);
  await a.post('/api/bookmarks/update', { ids: ['demo-1'], tags: ['临时手动', '第二项', '第三项', '第四项'] });
  release(); assert.equal((await finish(a)).phase, 'done');
  const books = (await a.get('/api/bookmarks')).bookmarks;
  assert.deepEqual(books.find(b => b.id === 'demo-1').tags, ['临时手动', '第二项', '第三项', '第四项']);
  assert.deepEqual(books.find(b => b.id === 'demo-2').tags, ['学习成长']);
});

test('本机网页标签颜色在切换 X 账号后保留，X 专属颜色不跨账户', async t => {
  const a = await app(t);
  const web = { id: 'web-color-test', title: '本机文章', text: '正文', tags: ['本机主题'], category: 'resources' };
  a.store.save('local', [web]);
  a.store.set('account', { id: 'x-1' });
  a.store.save('x-1', [{ ...web, id: 'x-record-1', tags: ['专属主题'] }]);
  await a.post('/api/tags/color', { tag: '本机主题', color: '#6e9bff' });
  await a.post('/api/tags/color', { tag: '专属主题', color: '#ffd84a' });
  a.store.set('account', { id: 'x-2' });
  assert.equal((await a.get('/api/settings')).tagColors['本机主题'], '#6e9bff');
  assert.ok(!(await a.get('/api/settings')).tagColors['专属主题']);
  await a.post('/api/tags/color', { tag: '本机主题', color: null });
  assert.ok(!(await a.get('/api/settings')).tagColors['本机主题']);
});
