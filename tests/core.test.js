import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { classify, normalizePosts, search } from '../src/catalog.js';
import { demoBookmarks } from '../src/demo.js';
import { createStore } from '../src/store.js';
import { authorization, createXClient } from '../src/x-client.js';

test('模糊中文查询优先找回作品集，排除不相关的鸡汤', () => {
  const results = search(demoBookmarks, '之前那篇讲 AI 产品经理怎么做作品集的');
  assert.equal(results[0].id, 'demo-1');
  assert.ok(!results.some(b => b.id === 'demo-2' || b.id === 'demo-4'));
  assert.ok(results[0].matches.includes('作品集'));
});
test('英文近义词和分类筛选可结合使用', () => {
  assert.equal(search(demoBookmarks, 'portfolio')[0].id, 'demo-1');
  assert.equal(search(demoBookmarks, 'focus', 'efficiency')[0].id, 'demo-4');
  assert.equal(search(demoBookmarks, '完全不存在的银河引擎').length, 0);
});
test('自动分类保留待确认状态，不强行归类', () => {
  assert.equal(classify('深度工作：提高学习效率，保持专注').category, 'efficiency');
  assert.equal(classify('面试作品集与职业实践').category, 'career');
  assert.equal(classify('资源合集、网站、开源工具清单').category, 'resources');
  assert.equal(classify('坚持行动，勇敢开始').category, 'inspiration');
  assert.equal(classify('今天的天空很蓝').category, 'review');
});
test('保存长推文、作者、配图与资源链接，不把导入时间当收藏时间', () => {
  const [b] = normalizePosts({ data: [{ id: '123', text: '短内容', author_id: 'u', public_metrics: {like_count:742,repost_count:96}, note_post: { text: '完整长文 https://t.co/a', entities: { urls: [{ url: 'https://t.co/a', expanded_url: 'https://example.com/guide', title: '实践指南' }] } }, attachments: { media_keys: ['m'] } }], includes: { users: [{ id: 'u', username: 'writer', name: '作者' }], media: [{ media_key: 'm', type: 'photo', url: 'https://pbs.twimg.com/a.jpg' }] } }, '2026-10-02T10:00:00Z');
  assert.ok(b.text.includes('完整长文 https://example.com/guide'));
  assert.equal(b.username, 'writer'); assert.equal(b.media.length, 1);
  assert.equal(b.links[0].title, '实践指南'); assert.equal(b.importedAt, '2026-10-02T10:00:00Z');
  assert.ok(!('bookmarkedAt' in b));
  assert.equal(b.metrics.like_count,742);assert.equal(b.metrics.repost_count,96);
});
test('重复同步不覆盖手动分类和首次导入时间，不同账户隔离', t => {
  const dir = mkdtempSync(join(tmpdir(), 'recall-test-')); const db = createStore(dir);
  t.after(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });
  const b = { ...demoBookmarks[0], importedAt: 'old' };
  assert.equal(db.save('alice', [b]), 1); db.categorize('alice', b.id, 'resources');
  assert.equal(db.save('alice', [{ ...b, importedAt: 'new', text: '更新原文' }]), 0);
  assert.equal(db.list('alice')[0].category, 'resources');
  assert.equal(db.list('alice')[0].text, '更新原文'); assert.equal(db.list('alice')[0].importedAt, 'old');
  assert.equal(db.list('bob').length, 0);
});
test('授权令牌本地加密，数据库中不保存明文', t => {
  const dir = mkdtempSync(join(tmpdir(), 'recall-token-')); const db = createStore(dir);
  t.after(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });
  db.saveTokens({ access_token: 'test-secret-token', expiresAt: 123 });
  assert.equal(db.tokens().access_token, 'test-secret-token');
  assert.ok(!readFileSync(join(dir, 'recall.sqlite')).includes(Buffer.from('test-secret-token')));
});
test('OAuth 使用 S256 PKCE，只请求读取范围', () => {
  const flow = authorization({ clientId: 'test-client', redirectUri: 'http://127.0.0.1:4318/auth/callback' });
  const params = new URL(flow.url).searchParams;
  assert.equal(params.get('code_challenge_method'), 'S256');
  assert.ok(params.get('scope').includes('bookmark.read')); assert.ok(!params.get('scope').includes('write'));
  assert.notEqual(params.get('code_challenge'), flow.verifier);
});
test('X 分页按真实返回数量推进，保留部分获取失败', async () => {
  const urls = [], pages = [], replies = [
    { data: [{ id: '1', text: '面试实践' }], meta: { next_token: 'next' } },
    { data: [{ id: '2', text: '专注效率' }], errors: [{ title: 'not found' }], meta: {} },
  ];
  const client = createXClient({}, async url => { urls.push(url); return Response.json(replies.shift()); });
  const result = await client.sync('me', 'token', (b, stats) => pages.push({ b, stats }));
  assert.equal(result.fetched, 2); assert.equal(result.unavailable, 1);
  assert.equal(new URL(urls[1]).searchParams.get('pagination_token'), 'next');
  assert.ok(new URL(urls[0]).searchParams.get('post.fields').includes('public_metrics'));
  const params=new URL(urls[0]).searchParams;
  assert.ok(params.get('expansions').split(',').includes('attachments.media_keys'));
  for(const field of ['media_key','type','url','preview_image_url','variants','duration_ms','width','height'])assert.ok(params.get('media.fields').split(',').includes(field),field);
  assert.equal(pages[0].stats.cursor, 'next'); assert.equal(pages[1].stats.cursor, null);
  assert.equal(pages[0].b[0].importedAt, pages[1].b[0].importedAt);
});
test('分页中途限流保留可恢复游标，不丢掉第一批', async () => {
  let count = 0, saved = [];
  const client = createXClient({}, async () => ++count === 1 ? Response.json({ data: [{ id: '1', text: '资源合集' }], meta: { next_token: 'resume' } }) : new Response('', { status: 429 }));
  await assert.rejects(client.sync('me', 'token', b => { saved.push(...b); }), e => e.status === 429 && e.cursor === 'resume');
  assert.equal(saved.length, 1);
});
