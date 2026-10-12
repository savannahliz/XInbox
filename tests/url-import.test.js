import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArticle, importArticle, publicUrl, publicAddress } from '../src/url-import.js';

const longText='学习和工作需要完整的上下文。记录判断、实践方法、评估结果与反馈，再把这些内容整理为可以查询的知识。';
const last='全文结束标记：这段内容必须保留，不能只保存摘要或前六千字。';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5XcAAAAASUVORK5CYII=','base64');
const wechat=body=>`<!doctype html><html><head><title>测试公众号文章</title></head><body><h1 id="activity-name">学习实践完整指南</h1><span id="js_name">INbox 测试公众号</span><span id="publish_time">2026-10-02</span><div id="js_content">${body}</div><footer>不应导入页脚导航</footer></body></html>`;

test('公众号保留全部正文、嵌套段落、图文顺序和懒加载图片，不执行源代码',()=>{
  const html=wechat(`<section>${Array.from({length:180},(_,i)=>`<p><span>第 ${i+1} 段：${longText}</span></p>`).join('')}<img data-src="https://mmbiz.qpic.cn/test.png" src="data:image/gif;base64,AAA=" alt="示意图"><p>${last}</p><script>throw new Error('不能执行');</script></section>`);
  const article=parseArticle(html,'http://mp.weixin.qq.com/s/test#rd');
  assert.equal(article.source,'wechat');assert.equal(article.title,'学习实践完整指南');assert.equal(article.author,'INbox 测试公众号');
  assert.ok(article.text.length>6000);assert.ok(article.text.endsWith(last));assert.ok(article.text.includes('第 180 段'));
  assert.ok(!article.text.includes('不能执行'));assert.ok(!article.text.includes('页脚导航'));
  assert.equal(article.blocks.at(-2).type,'image');assert.equal(article.blocks.at(-2).originalUrl,'https://mmbiz.qpic.cn/test.png');
  assert.ok(article.url.startsWith('https://'));assert.ok(!article.url.includes('#'));
  assert.equal(parseArticle(Buffer.from(html),'https://mp.weixin.qq.com/s/test').text,article.text);
});

test('通用网页提取正文、相对链接和图片，并保留最后一段',()=>{
  const html=`<html><head><title>实践方法</title><meta name="author" content="作者甲"></head><body><nav>导航菜单</nav><article><h1>实践方法</h1>${Array.from({length:20},()=>`<p>${longText}</p>`).join('')}<img data-original="/images/chart.png"><p>相关阅读：<a href="./next">后续实践</a></p><p>${last}</p></article><footer>页脚菜单</footer></body></html>`;
  const article=parseArticle(html,'https://articles.example/guides/start');
  assert.ok(article.text.endsWith(last));assert.equal(article.author,'作者甲');
  assert.equal(article.blocks.find(b=>b.type==='image').originalUrl,'https://articles.example/images/chart.png');
  assert.ok(article.links.some(l=>l.url==='https://articles.example/guides/next'));assert.equal(article.coverUrl,'');
  assert.ok(!article.text.includes('页脚菜单'));
});

test('拒绝微信验证页、脚本链接、内网地址与映射 IPv6 地址',async()=>{
  assert.throws(()=>parseArticle('<html><title>环境异常</title><p>请验证后继续访问文章。</p></html>','https://mp.weixin.qq.com/s/test'),e=>e.requiresHtml);
  for(const url of ['file:///etc/passwd','javascript:alert(1)','http://127.1','http://0x7f000001','http://[::1]','http://[::ffff:127.0.0.1]','http://192.168.1.1','https://user:pass@example.com'])assert.throws(()=>publicUrl(url));
  assert.equal(publicAddress('8.8.8.8'),true);assert.equal(publicAddress('2001:4860:4860::8888'),true);assert.equal(publicAddress('169.254.169.254'),false);
  await assert.rejects(()=>importArticle('https://articles.example/read',tmpdir(),{fetcher:async()=>new Response(null,{status:302,headers:{location:'http://127.0.0.1/private'}})}),/公开网页/);
  let requests=0;
  await assert.rejects(()=>importArticle('https://mp.weixin.qq.com/s/test',tmpdir(),{fetcher:async(_url,options)=>{requests++;assert.equal(options.headers['User-Agent'],'INbox/0.1 (local article reader)');return new Response(null,{status:302,headers:{location:'https://mp.weixin.qq.com/mp/wappoc_appmsgcaptcha'}});}}),e=>e.requiresHtml);
  assert.equal(requests,1);
});

test('正文图片缓存为本机文件，失败图片明确计数，内嵌图片也能保存',async t=>{
  const directory=mkdtempSync(join(tmpdir(),'inbox-image-'));t.after(()=>rmSync(directory,{recursive:true,force:true}));
  const html=wechat(`<p>${longText}</p><img data-src="https://images.example/ok.png"><p>图片之间的文字同样需要保留。</p><img src="https://images.example/fail.png"><img src="data:image/png;base64,${png.toString('base64')}"><p>${last}</p>`);
  const article=await importArticle('https://mp.weixin.qq.com/s/test',directory,{html,fetcher:async url=>url.endsWith('ok.png')?new Response(png,{headers:{'content-type':'image/png'}}):new Response('missing',{status:404})});
  assert.ok(article.text.endsWith(last));assert.deepEqual(article.imageImport,{total:3,saved:2,failed:1});
  assert.equal(article.media.length,2);assert.ok(article.cover.startsWith('/media/'));
  assert.deepEqual(readFileSync(join(directory,article.cover.split('/').at(-1))),png);
  assert.equal(article.blocks.filter(b=>b.type==='image')[1].url,'');
});

test('重定向后的正文链接用最终地址，过大响应不会作为截断全文保存',async t=>{
  const directory=mkdtempSync(join(tmpdir(),'inbox-redirect-'));t.after(()=>rmSync(directory,{recursive:true,force:true}));
  const article=await importArticle('https://articles.example/short',directory,{fetcher:async url=>url.endsWith('/short')?new Response(null,{status:302,headers:{location:'/actual'}}):new Response(`<article><h1>文章标题</h1><p>${longText.repeat(8)}</p><p>${last}</p></article>`,{headers:{'content-type':'text/html'}})});
  assert.equal(article.url,'https://articles.example/actual');assert.ok(article.text.endsWith(last));
  await assert.rejects(()=>importArticle('https://articles.example/large',directory,{fetcher:async()=>new Response('x'.repeat(8*1024*1024+1))}),/过大/);
});
