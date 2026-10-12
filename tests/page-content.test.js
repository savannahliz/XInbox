import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';

const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const templates=JSON.parse(readFileSync(new URL('../public/assets/figma-templates.json',import.meta.url),'utf8'));
const declarations=['const named =','const namedAll =','const paragraphs =','const textAt ='].map(start=>app.split('\n').find(line=>line.startsWith(start))).join('\n');
const control=app.slice(app.indexOf('function control('),app.indexOf('function reference('));
function detail(record,origin=null){
  const dom=new JSDOM(templates['11-1445'],{runScripts:'outside-only'}),w=dom.window;
  w.bookmark={id:'1',title:'测试文章',author:'作者',username:'writer',tags:[],links:[],...record};
  const favorite=app.slice(app.indexOf('function favoriteButton('),app.indexOf('function bindBookmarkCard('));
  const fn=app.slice(app.indexOf('function bindDetail('),app.indexOf('function referenceFrame('));
  const titles=app.split('\n').find(line=>line.startsWith('const titles ='));
  w.eval(`const state={id:'1'},detailOrigin=${JSON.stringify(origin)},all=()=>[bookmark],assistant={entry(){}},askAgent={entry(){}},esc=v=>v,initials=()=>'',handle=()=>'',date=()=>'',cat=()=>'',metric=()=>0,countText=()=>'',priorityText=()=>'',referenceTags=()=>{},readState=()=>{},safeUrl=v=>v,renderRecordMedia=()=>'',enableImageZoom=()=>{};${titles}${declarations}${control}${favorite}${fn};bindDetail(document.body);`);
  return dom;
}
test('详情保留单换行、空行和全部长文，不从设计稿插入重复引文',()=>{
  const text='第一段\n1. 第一项\n2. 第二项\n\n'+('长文内容。'.repeat(1500))+'\n全文末尾 <script>不执行</script>';
  const dom=detail({text}),d=dom.window.document;
  const body=[...d.querySelectorAll('[data-name="正文内容"] > .record-text')];
  assert.equal(body.map(n=>n.textContent).join('\n\n'),text);
  assert.equal(d.querySelector('[data-name="核心判断"]'),null);
  assert.equal(d.querySelector('[data-name="正文内容"] script'),null);
  dom.window.close();
});
test('网页导入的段落、标题和配图仍按原始 blocks 渲染',()=>{
  const dom=detail({text:'标题\n第一行\n第二行',blocks:[{type:'heading',text:'标题'},{type:'paragraph',text:'第一行\n第二行'},{type:'image',url:'/media/example.png',alt:'配图'}]}),d=dom.window.document;
  assert.equal(d.querySelector('.import-heading').textContent,'标题');
  assert.equal(d.querySelector('.import-paragraph').textContent,'第一行\n第二行');
  assert.equal(d.querySelector('.import-image img').getAttribute('src'),'/media/example.png');
  dom.window.close();
});
test('所有分页使用前后页及页码跳转，边界不循环，筛选后校正页码',()=>{
  assert.ok(app.includes('function bindPagination('),'需要统一分页控件');
  const fn=app.slice(app.indexOf('function goToPage('),app.indexOf('function bindCards('));
  for(const name of ['分页控制','合集分页','记录分页']){
    const dom=new JSDOM(`<div data-name="${name}"></div>`,{runScripts:'outside-only'}),w=dom.window;
    w.scrollTo=()=>{};
    w.eval(`const state={page:0},countText=n=>String(n).padStart(2,'0');let total=13;const root=document.body;${declarations}${fn};function render(){bindPagination(root,total,6,'${name}');}render();window.goto=goToPage;window.updateTotal=n=>{total=n;render();};window.page=()=>state.page;`);
    const d=w.document;
    assert.equal(d.querySelector('[data-action="previous-page"]').disabled,true);
    assert.equal(d.querySelector('[data-action="next-page"]').disabled,false);
    assert.equal(d.querySelector('[name="page"]').value,'1');
    w.goto(2);assert.equal(d.querySelector('[name="page"]').value,'3');assert.equal(d.querySelector('[data-action="next-page"]').disabled,true);
    w.goto(1);assert.equal(w.page(),1);w.goto(0);assert.equal(w.page(),0);
    for(const page of [-1,3,0.5,NaN])assert.throws(()=>w.goto(page));
    w.goto(2);w.updateTotal(2);assert.equal(w.page(),0);assert.equal(d.querySelector('[data-action="next-page"]').disabled,true);
    w.updateTotal(0);assert.equal(d.querySelector('[name="page"]').value,'1');assert.ok(d.querySelector('.pagination-range').textContent.includes('00–00 / 0'));
    dom.window.close();
  }
});

test('详情收藏按钮明确显示当前状态，收藏与取消使用同一记录 ID',()=>{
  for(const favorite of [false,true]){
    const dom=detail({text:'文章全文',favorite}),button=dom.window.document.querySelector('[data-favorite]');
    assert.equal(button.dataset.favorite,'1');assert.equal(button.getAttribute('aria-pressed'),String(favorite));
    assert.equal(button.getAttribute('aria-label'),favorite?'取消收藏文章':'收藏文章');dom.window.close();
  }
});

test('正文返回入口指向进入前的索引，不重新打开第一页',()=>{
  for(const [view,label] of [['home','总览'],['archive','全部收藏'],['favorites','收藏文章'],['collections','主题合集'],['tags','标签矩阵'],['queue','阅读队列']]){
    const dom=detail({text:'文章全文'},{view,page:2}),back=dom.window.document.querySelector('[data-name="返回入口"]');
    assert.equal(back.dataset.action,'return-records');assert.equal(back.dataset.view,undefined);assert.ok(back.textContent.includes('返回'+label));dom.window.close();
  }
});
