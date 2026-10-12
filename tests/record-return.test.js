import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';

const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const start=app.includes('const navigationFields=')?app.indexOf('const navigationFields='):app.indexOf('function navigate(');
const navigation=app.slice(start,app.indexOf('function visible('));
const popstate=app.split('\n').find(line=>line.startsWith("window.addEventListener('popstate'"));
function fixture(view='archive',entry=null){
  const dom=new JSDOM('',{url:'http://127.0.0.1/?view='+view,runScripts:'outside-only'}),w=dom.window;
  w.testState={view,id:null,q:'',category:'all',tag:'',filter:'all',sort:'latest',layout:'grid',page:0,tagFilter:'all',selected:new Set(),searchIds:null};
  w.scrollTo=({left=0,top=0})=>{w.scrollX=left;w.scrollY=top;};
  if(entry)w.history.replaceState(entry,'');
  w.eval(`const state=testState;function render(){document.body.textContent=JSON.stringify({...state,selected:[...state.selected],searchIds:state.searchIds?[...state.searchIds]:null});}${navigation}${popstate};window.navigate=navigate;window.returnToRecords=typeof returnToRecords==='function'?returnToRecords:()=>navigate('archive');if(history.state?.inbox&&typeof restoreHistory==='function')restoreHistory(history.state);render();`);
  return dom;
}
function traversal(w,action){
  return new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(Error('没有收到返回事件')),1000);
    w.addEventListener('popstate',()=>{clearTimeout(timeout);resolve();},{once:true});action();
  });
}
const rendered=w=>JSON.parse(w.document.body.textContent);

test('从各索引进入正文后返回，保留页码、搜索、筛选、排序、选中项和滚动位置',async()=>{
  for(const view of ['home','archive','favorites','collections','tags','queue']){
    const dom=fixture(view),w=dom.window;
    Object.assign(w.testState,{page:2,q:'Agent Memory',category:'work',tag:'Agent',filter:'unread',tagFilter:'growing',sort:'oldest',layout:'list',selected:new Set(['a']),searchIds:new Set(['a','b'])});
    w.scrollTo({left:0,top:840});const before=JSON.parse(JSON.stringify({...w.testState,selected:['a'],searchIds:['a','b']}));
    w.navigate('detail',{id:'b'});
    assert.equal(rendered(w).view,'detail');assert.equal(w.scrollY,0);
    await traversal(w,()=>w.returnToRecords());
    assert.deepEqual(rendered(w),before,view);assert.equal(w.scrollY,840,view+' 恢复位置');
    dom.window.close();
  }
});

test('连续打开关联正文和使用浏览器前后退后，正文返回仍回到原索引',async()=>{
  const dom=fixture('favorites'),w=dom.window;
  w.testState.page=4;w.scrollTo({top:560});w.navigate('detail',{id:'a'});w.navigate('detail',{id:'b'});w.navigate('detail',{id:'c'});
  await traversal(w,()=>w.history.back());assert.equal(rendered(w).id,'b');
  await traversal(w,()=>w.history.forward());assert.equal(rendered(w).id,'c');
  await traversal(w,()=>w.returnToRecords());
  assert.equal(rendered(w).view,'favorites');assert.equal(rendered(w).page,4);assert.equal(w.scrollY,560);
  dom.window.close();
});

test('刷新正文保留来源，直接打开正文链接时返回全部收藏',async()=>{
  const dom=fixture('queue'),w=dom.window;
  w.testState.page=3;w.testState.filter='p1';w.navigate('detail',{id:'a'});
  const entry=JSON.parse(JSON.stringify(w.history.state)),reload=fixture('detail',entry);
  assert.equal(rendered(reload.window).id,'a');
  let offset;reload.window.history.go=n=>{offset=n;};reload.window.returnToRecords();assert.equal(offset,-1);
  assert.equal(entry.detailOrigin.view,'queue');assert.equal(entry.detailOrigin.page,3);assert.equal(entry.detailOrigin.filter,'p1');
  reload.window.close();dom.window.close();
  const direct=fixture('detail');direct.window.returnToRecords();assert.equal(rendered(direct.window).view,'archive');assert.equal(rendered(direct.window).page,0);direct.window.close();
});
