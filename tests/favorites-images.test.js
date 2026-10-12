import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';

const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const media=readFileSync(new URL('../public/media.js',import.meta.url),'utf8').replaceAll('export function','function');
test('图片查看器支持正文和导入长图，完整适应窗口、放大、关闭及焦点返回',()=>{
  const dom=new JSDOM(`<article><figure><img src="https://pbs.twimg.com/tall.jpg" alt="长图"></figure><figure><img src="/media/${'a'.repeat(64)}.png"></figure><img src="javascript:alert(1)"></article>`,{runScripts:'outside-only'}),w=dom.window,d=w.document;
  w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
  w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');this.dispatchEvent(new w.Event('close'));};
  w.eval(media+';enableImageZoom(document.querySelector("article"));enableImageZoom(document.querySelector("article"));');
  assert.equal(d.querySelectorAll('.image-zoom').length,2,'不会重复包装图片或允许非图片地址');
  const button=d.querySelector('.image-zoom');button.click();
  const dialog=d.querySelector('.image-viewer'),image=dialog.querySelector('img'),viewport=dialog.querySelector('.image-viewer-viewport');
  Object.defineProperties(image,{naturalWidth:{value:800},naturalHeight:{value:2400}});
  Object.defineProperties(viewport,{clientWidth:{value:1200},clientHeight:{value:600}});
  image.dispatchEvent(new w.Event('load'));
  assert.ok(parseFloat(image.style.width)/800*2400<=600-32+0.001,'适应窗口显示完整长图');
  assert.equal(image.alt,'长图');assert.equal(image.src,'https://pbs.twimg.com/tall.jpg');
  dialog.querySelector('[data-zoom="1"]').click();assert.equal(image.style.width,'800px');
  dialog.querySelector('[data-zoom="in"]').click();assert.equal(image.style.width,'1000px');
  dialog.querySelector('[data-zoom="out"]').click();assert.equal(image.style.width,'800px');
  dialog.querySelector('[data-zoom="fit"]').click();assert.ok(parseFloat(image.style.width)<800);
  let keys=0;d.addEventListener('keydown',()=>keys++);dialog.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Backspace',bubbles:true}));assert.equal(keys,0,'查看器内按键不会删除白板卡片');
  dialog.querySelector('[data-close]').click();assert.equal(d.querySelector('.image-viewer'),null);assert.equal(d.activeElement,button);
  button.click();assert.equal(d.querySelectorAll('.image-viewer').length,1);d.querySelector('[data-close]').click();
  dom.window.close();
});
test('收藏文章页面只检索收藏记录，并支持标签、未读和分页后的空列表',()=>{
  const dom=new JSDOM('',{runScripts:'outside-only'}),w=dom.window;
  const visible=app.slice(app.indexOf('function visible()'),app.indexOf('function relatedTags('));
  w.eval(`const records=[{id:'1',favorite:true,read:false,tags:['Agent'],text:'全文',importedAt:'2026-10-01'},{id:'2',favorite:false,read:false,tags:['Agent'],importedAt:'2026-10-02'},{id:'3',favorite:true,read:true,tags:['Memory'],importedAt:'2026-10-03'}],state={view:'favorites',category:'all',filter:'all'},all=()=>records;${visible};window.ids=()=>visible().map(b=>b.id).join(',');window.filter=value=>state.filter=value;window.tag=value=>state.tag=value;window.search=ids=>state.searchIds=new Set(ids);`);
  assert.equal(w.ids(),'3,1');w.filter('unread');assert.equal(w.ids(),'1');
  w.filter('all');w.tag('Memory');assert.equal(w.ids(),'3');
  w.tag('');w.search(['1','2']);assert.equal(w.ids(),'1');w.search(['2']);assert.equal(w.ids(),'');
  dom.window.close();
});
