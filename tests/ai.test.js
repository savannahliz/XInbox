import test from 'node:test';
import assert from 'node:assert/strict';
import { generateTags, aiConfig, cleanTags, safeConfig } from '../src/ai-client.js';

test('用户标签保留原意，规范空白与去重，AI 字数限制单独校验', () => {
  assert.deepEqual(cleanTags([' #面试 ', '面试', 'AI产品']), ['面试', 'AI产品']);
  assert.equal(cleanTags(['这是一个超过十二个字符长度的详细标签']).length, 1);
  assert.throws(() => cleanTags(['这是一个超过十二个字符长度的详细标签'], 12));
});
test('OpenAI Responses、DeepSeek 与豆包使用正确端点与模型，公开配置隐藏 Key', async () => {
  for (const provider of ['openai', 'deepseek', 'doubao']) {
    const cfg = aiConfig({ provider, apiKey: 'test-key', ...(provider === 'doubao' ? { model: 'ep-test' } : {}) });
    assert.equal(safeConfig(cfg).hasKey, true); assert.ok(!('apiKey' in safeConfig(cfg)));
    const result = await generateTags(cfg, [{ id: '1', title: '学习', text: '专注工作' }], [], async (url, options) => {
      assert.equal(options.headers.Authorization, 'Bearer test-key');
      const body = JSON.parse(options.body);
      assert.equal(body.model, cfg.model);
      assert.ok(url.endsWith(provider === 'openai' ? '/responses' : '/chat/completions'));
      const text = JSON.stringify({ items: [{ id: '1', tags: ['学习成长', '工作流'] }] });
      return Response.json(provider === 'openai' ? { output: [{ content: [{ type: 'output_text', text }] }] } : { choices: [{ message: { content: text } }] });
    });
    assert.deepEqual(result, [{ id: '1', tags: ['学习成长', '工作方法'] }]);
  }
});
test('无效 AI 输出、重复 ID、过细标签、超出数量与超出全库上限均不保存', async () => {
  const cfg = aiConfig({ provider: 'deepseek', apiKey: 'test' });
  const post = [{ id: '1', title: '产品', text: '原文' }];
  const reply = content => async () => Response.json({ choices: [{ message: { content: JSON.stringify(content) } }] });
  await assert.rejects(generateTags(cfg, post, [], reply({ items: [{ id: 'wrong', tags: ['产品设计'] }] })), /ID/);
  await assert.rejects(generateTags(cfg, post, [], reply({ items: [{ id: '1', tags: ['甲', '乙', '丙', '丁'] }] })), /数量/);
  await assert.rejects(generateTags(cfg, post, Array.from({length:16},(_,i)=>'主题'+i), reply({ items: [{ id: '1', tags: ['新主题'] }] })), /16/);
  await assert.rejects(generateTags(cfg, post, [], async()=>new Response('', {status:401})), /Key/);
  await assert.rejects(generateTags(cfg, post, [], async()=>Response.json({choices:[{message:{content:'不是 JSON'}}]})), /格式/);
});
test('不接受含凭据或明文远程 API 地址，可配置本机兼容服务', () => {
  assert.throws(()=>aiConfig({ provider:'custom',baseUrl:'http://remote.example',model:'test',apiKey:'test' }));
  assert.equal(aiConfig({ provider:'custom',baseUrl:'http://127.0.0.1:9999/v1',model:'test',apiKey:'test' }).baseUrl, 'http://127.0.0.1:9999/v1');
});
