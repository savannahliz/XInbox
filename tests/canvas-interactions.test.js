import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {canvasEdgeGeometry} from '../public/research-canvas.js';

async function canvasFixture(t) {
  const dom=new JSDOM('<main id="content"></main><dialog id="editor"></dialog>',{url:'http://localhost',runScripts:'outside-only'}),w=dom.window;
  t.after(()=>w.close());w.HTMLElement.prototype.setPointerCapture=()=>{};
  const icons=readFileSync(new URL('../public/panel-icons.js',import.meta.url),'utf8').replaceAll('export function','function');
  const source=readFileSync(new URL('../public/research-canvas.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replaceAll('export function','function');
  const media=readFileSync(new URL('../public/media.js',import.meta.url),'utf8').replaceAll('export function','function');
  w.eval(icons+media+source+';window.createCanvas=createResearchCanvas;');
  const state={view:'canvas',catalog:{demo:true,bookmarks:[{id:'demo-1',title:'A',text:'Memory',tags:[]},{id:'demo-2',title:'B',text:'MCP',tags:[]}]},status:{}};
  let saved,modalCount=0;
  const initial={cards:[{id:'a',type:'record',recordId:'demo-1',x:0,y:0},{id:'b',type:'record',recordId:'demo-2',x:500,y:0}],edges:[],viewport:{x:80,y:80,zoom:1}};
  const canvas=w.createCanvas({state,esc:v=>String(v??''),api:async(path,body)=>{if(body){saved=structuredClone(body);return{saved:true};}return structuredClone(initial);},toast:()=>{},askAgent:{},showEditor:()=>modalCount++,editor:w.document.querySelector('dialog'),mountSelectMenus:()=>{}});
  w.document.querySelector('main').innerHTML=canvas.view();const viewport=w.document.querySelector('.canvas-viewport');Object.defineProperties(viewport,{clientWidth:{value:1000},clientHeight:{value:600}});viewport.getBoundingClientRect=()=>({left:0,top:0,right:1000,bottom:600});await canvas.mount();
  const $=s=>w.document.querySelector(s),click=action=>$('[data-canvas-action="'+action+'"]').click();
  const pointer=(n,type='pointerdown',extra={})=>n.dispatchEvent(new w.MouseEvent(type,{bubbles:true,cancelable:true,button:0,clientX:100,clientY:100,...extra}));
  return {w,$,click,pointer,viewport,modalCount:()=>modalCount,saved:()=>saved};
}
test('连线沿点击顺序创建，文字在中点输入，空文字点击画布后隐藏且不弹模态框',async t=>{
  const f=await canvasFixture(t);f.click('connect');f.pointer(f.$('[data-card-id="b"]'));f.pointer(f.$('[data-card-id="a"]'));
  assert.equal(f.$('.canvas-edge-editor').hidden,false);assert.equal(f.$('.canvas-edge-editor input'),f.w.document.activeElement);
  assert.match(f.$('.edge-line').getAttribute('d'),/^M500 126 L280 126$/);assert.equal(f.$('.edge-line').getAttribute('marker-end'),'url(#canvas-arrow)');
  assert.equal(f.$('.canvas-edge-editor').style.left,'470px');f.pointer(f.viewport);f.pointer(f.viewport,'pointerup');
  assert.equal(f.$('.canvas-edge-editor').hidden,true);assert.equal(f.$('.canvas-edges text'),null);assert.equal(f.modalCount(),0);
  await new Promise(r=>setTimeout(r,400));assert.equal(f.saved().edges[0].from,'b');assert.equal(f.saved().edges[0].to,'a');assert.equal(f.saved().edges[0].label,'');
});
test('关系模式支持连续输入、切换线型和隐藏连接符，再次点击关系返回移动',async t=>{
  const f=await canvasFixture(t);f.click('connect');f.pointer(f.$('[data-card-id="a"]'));f.pointer(f.$('[data-card-id="b"]'));f.click('connect');
  f.click('connect');f.pointer(f.$('[data-card-id="b"]'));f.pointer(f.$('[data-card-id="a"]'));f.click('relation');
  const edges=[...f.w.document.querySelectorAll('[data-edge-id]')].map(n=>n.dataset.edgeId);
  f.$('[data-edge-id="'+edges[0]+'"]').dispatchEvent(new f.w.MouseEvent('click',{bubbles:true}));
  const input=f.$('.canvas-edge-editor input');input.value='支持';input.dispatchEvent(new f.w.Event('input',{bubbles:true}));input.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
  assert.equal(f.$('[data-canvas-action="relation"]').getAttribute('aria-pressed'),'true');
  // Clicking a second line must keep relation mode active and focus its own input.
  f.pointer(f.$('[data-edge-id="'+edges[1]+'"]'));f.$('[data-edge-id="'+edges[1]+'"]').dispatchEvent(new f.w.MouseEvent('click',{bubbles:true}));
  assert.equal(f.$('.canvas-edge-editor').hidden,false);input.value='反对';input.dispatchEvent(new f.w.Event('input',{bubbles:true}));
  for(const [key,value] of [['arrow','both'],['pattern','dashed'],['route','curve']]){const n=f.$('#canvas-edge-'+key);n.value=value;n.dispatchEvent(new f.w.Event('change',{bubbles:true}));}
  const line=f.$('[data-edge-id="'+edges[1]+'"] .edge-line');assert.equal(line.getAttribute('marker-start'),'url(#canvas-arrow)');assert.equal(line.getAttribute('stroke-dasharray'),'9 5');assert.match(line.getAttribute('d'),/C/);
  f.click('toggle-edges');assert.equal(f.$('.canvas-edges').hidden,true);f.click('toggle-edges');assert.equal(f.$('.canvas-edges').hidden,false);
  f.click('relation');assert.equal(f.$('[data-canvas-action="relation"]').getAttribute('aria-pressed'),'false');assert.equal(f.$('[data-canvas-action="move"]').getAttribute('aria-pressed'),'true');assert.equal(f.modalCount(),0);
  await new Promise(r=>setTimeout(r,400));assert.deepEqual(f.saved().edges.map(e=>e.label),['支持','反对']);
});
test('形状可添加、缩放、移动，收藏栏可收起再恢复且保留筛选',async t=>{
  const f=await canvasFixture(t);f.click('new-rectangle');f.click('new-ellipse');assert.equal(f.w.document.querySelectorAll('.shape-card').length,2);
  const shape=f.$('.shape-ellipse'),id=shape.dataset.cardId;assert.equal(shape.style.width,'160px');
  f.pointer(shape.querySelector('.canvas-shape-resize'));f.pointer(shape,'pointermove',{clientX:160,clientY:140});f.pointer(shape,'pointerup');assert.equal(shape.style.width,'220px');assert.equal(shape.style.height,'200px');
  const x=parseFloat(shape.style.left);f.pointer(shape);f.pointer(shape,'pointermove',{clientX:150,clientY:150});f.pointer(shape,'pointerup');assert.equal(parseFloat(shape.style.left),x+50);
  const query=f.$('#canvas-query');query.value='Memory';query.dispatchEvent(new f.w.Event('input',{bubbles:true}));f.click('toggle-picker');assert.equal(f.$('.canvas-picker').hidden,true);f.click('toggle-picker');assert.equal(query.value,'Memory');assert.equal(f.w.document.querySelectorAll('[data-picker-id]').length,1);
  await new Promise(r=>setTimeout(r,400));const saved=f.saved().cards.find(c=>c.id===id);assert.equal(saved.type,'shape');assert.equal(saved.width,220);assert.equal(saved.height,200);
});
test('连接点落在矩形与圆形边缘，支持折线与曲线，并处理重叠中心',()=>{
  const a={type:'shape',shape:'ellipse',x:0,y:0,width:100,height:100},b={type:'shape',shape:'rectangle',x:300,y:0,width:100,height:100};
  const g=canvasEdgeGeometry(a,b);assert.deepEqual(g.start,{x:100,y:50});assert.deepEqual(g.end,{x:300,y:50});assert.match(canvasEdgeGeometry(a,b,'elbow').d,/H/);assert.match(canvasEdgeGeometry(a,b,'curve').d,/C/);assert.equal(canvasEdgeGeometry(a,a),null);
});
test('Backspace 删除最后一张卡片后焦点留在画布，继续按键也不返回历史页面',async t=>{
  const f=await canvasFixture(t);
  f.w.history.replaceState({},'', '/?view=queue');f.w.history.pushState({},'', '/?view=canvas');
  for(const id of ['a','b']){
    f.pointer(f.$('[data-card-id="'+id+'"]'));f.pointer(f.viewport,'pointerup');
    assert.equal(f.w.document.activeElement,f.viewport);
    const key=new f.w.KeyboardEvent('keydown',{key:'Backspace',bubbles:true,cancelable:true});
    f.w.document.activeElement.dispatchEvent(key);assert.equal(key.defaultPrevented,true);
    assert.equal(f.$('[data-card-id="'+id+'"]'),null);assert.equal(f.w.document.activeElement,f.viewport);
  }
  const key=new f.w.KeyboardEvent('keydown',{key:'Backspace',bubbles:true,cancelable:true});f.viewport.dispatchEvent(key);
  assert.equal(key.defaultPrevented,true);assert.equal(f.w.location.search,'?view=canvas');
  const input=f.$('#canvas-query');input.focus();const typing=new f.w.KeyboardEvent('keydown',{key:'Backspace',bubbles:true,cancelable:true});input.dispatchEvent(typing);assert.equal(typing.defaultPrevented,false);
  await new Promise(r=>setTimeout(r,400));assert.equal(f.saved().cards.length,0);
});
