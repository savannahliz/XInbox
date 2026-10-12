import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const templates = JSON.parse(readFileSync(new URL('../public/assets/figma-templates.json', import.meta.url), 'utf8'));
const assets = JSON.parse(readFileSync(new URL('../public/assets/manifest.json', import.meta.url), 'utf8'));
const declarations = ['const named =', 'const namedAll =', 'const paragraphs =', 'const textAt =', 'const all=', 'const tags='].map(start => app.split('\n').find(line => line.startsWith(start))).join('\n');
const control = app.slice(app.indexOf('function control('), app.indexOf('function reference('));
const bind = app.slice(app.indexOf('function bindSidebar('), app.indexOf('function metricsFor('));

test('切换页面共用同一侧栏和工作区外框，不继承各稿的缩小字号与间距', () => {
  const start = app.indexOf('function referenceFrame(');
  assert.ok(start >= 0, '页面需要使用公共外框');
  const frame = app.slice(start, app.indexOf('\nfunction ', start + 1));
  const dom = new JSDOM('', { runScripts: 'outside-only' });
  dom.window.templates = templates;
  dom.window.eval(`${declarations}\nfunction reference(view){const t=document.createElement('template');t.innerHTML=templates[${JSON.stringify({ home:'2-2315',archive:'10-9510',favorites:'10-9510',collections:'10-9852',tags:'10-10195',queue:'10-10584',detail:'11-1445' })}[view]];return t.content.firstElementChild;}\n${frame}\nwindow.frame=referenceFrame;`);
  const base = dom.window.frame('archive');
  for (const view of ['home','archive','favorites','collections','tags','queue','detail','settings','sync']) {
    const current = dom.window.frame(view);
    assert.equal(current.side.outerHTML, base.side.outerHTML, view + ' 侧栏尺寸一致');
    assert.equal(current.work.className, base.work.className, view + ' 工作区外框一致');
  }
  dom.window.close();
});

test('侧栏按当前页面选中唯一入口，总览不继承全部收藏的高亮', () => {
  for (const [view, page, expected, origin] of [
    ['home', '2-2315', 'home'], ['archive', '10-9510', 'archive'], ['favorites','10-9510','favorites'],
    ['collections', '10-9852', 'collections'], ['tags', '10-10195', 'tags'],
    ['queue', '10-10584', 'queue'], ['canvas','10-9510','canvas'], ['sync', '10-9510', 'sync'],
    ['settings', '10-9510', 'settings'], ['detail', '10-9510', 'archive'],
    ['detail', '10-9510', 'home', 'home'], ['detail', '10-9510', 'favorites', 'favorites'],
    ['detail', '10-9510', 'collections', 'collections'], ['detail', '10-9510', 'tags', 'tags'], ['detail', '10-9510', 'queue', 'queue'],
  ]) {
    const dom = new JSDOM(templates[page], { runScripts: 'outside-only' });
    dom.window.testState = { view, assets, status: { connected: false }, catalog: { demo: true, bookmarks: [{ tags: ['测试'], queue: true, read: false }] } };
    dom.window.eval(`const state=testState,detailOrigin=${origin?JSON.stringify({view:origin}):'null'};${declarations}${control}${bind}bindSidebar(document.querySelector('[data-name="侧边导航"]'));`);
    const navs = [...dom.window.document.querySelectorAll('[data-name="导航项"]')];
    const selected = navs.filter(n => n.getAttribute('aria-current') === 'page');
    assert.equal(selected.length, 1, view + ' 应只有一个选中入口');
    assert.equal(selected[0].dataset.view, expected);
    assert.ok(selected[0].classList.contains('custom-nav-current'));
    for (const n of navs.filter(n => n !== selected[0])) {
      assert.ok(n.classList.contains('custom-nav-other'));
      assert.equal(n.getAttribute('aria-current'), null);
      const svg = readFileSync(new URL('../public' + n.querySelector('img').getAttribute('src'), import.meta.url), 'utf8');
      assert.ok(!svg.includes('stroke="#030403"'), '未选中入口应恢复原稿绿色图标');
    }
    dom.window.close();
  }
});

test('导航与文章归档栏能独立收起，重新渲染后仍保留状态和展开入口',()=>{
  const dom=new JSDOM('<div class="shell"><aside id="sidebar"></aside><main><button data-action="toggle-navigation"></button><button data-action="toggle-detail-info"></button><div data-name="归档上下文"></div><article>全文</article></main></div>',{runScripts:'outside-only'});
  const fn=app.slice(app.indexOf('function applyPanels()'),app.indexOf('let fontScale='));
  dom.window.eval('let navigationHidden=true,detailInfoHidden=true;'+fn+';window.showPanels=()=>{navigationHidden=false;detailInfoHidden=false;applyPanels();};window.applyPanels=applyPanels;');dom.window.applyPanels();
  const d=dom.window.document;assert.equal(d.querySelector('#sidebar').hidden,true);assert.equal(d.querySelector('[data-name="归档上下文"]').hidden,true);assert.equal(d.querySelector('[data-action="toggle-navigation"]').getAttribute('aria-expanded'),'false');assert.equal(d.querySelector('article').textContent,'全文');
  d.querySelector('#sidebar').hidden=false;dom.window.applyPanels();assert.equal(d.querySelector('#sidebar').hidden,true);
  dom.window.showPanels();assert.equal(d.querySelector('#sidebar').hidden,false);assert.equal(d.querySelector('[data-name="归档上下文"]').hidden,false);assert.equal(d.querySelector('[data-action="toggle-detail-info"]').getAttribute('aria-expanded'),'true');dom.window.close();
});
