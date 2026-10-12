import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {normalizePosts} from '../src/catalog.js';
import {mediaPreview,playbackVariants,renderRecordMedia} from '../public/media.js';

const mediaPayload={data:[
  {id:'100',author_id:'u',text:'视频观点 https://t.co/video https://t.co/article',attachments:{media_keys:['v','p']},entities:{urls:[{url:'https://t.co/video',expanded_url:'https://x.com/writer/status/100/video/1'},{url:'https://t.co/article',expanded_url:'https://example.com/guide'}]}},
  {id:'101',text:'动态演示',attachments:{media_keys:['g']}},
],includes:{users:[{id:'u',name:'Writer',username:'writer'}],media:[
  {media_key:'p',type:'photo',url:'https://pbs.twimg.com/photo.jpg',alt_text:'配图',width:1200,height:800},
  {media_key:'g',type:'animated_gif',preview_image_url:'https://pbs.twimg.com/gif.jpg',variants:[{content_type:'video/mp4',url:'https://video.twimg.com/gif.mp4'}]},
  {media_key:'v',type:'video',preview_image_url:'https://pbs.twimg.com/video.jpg',duration_ms:24000,width:1920,height:1080,variants:[{content_type:'application/x-mpegURL',url:'https://video.twimg.com/video.m3u8'},{bit_rate:256000,content_type:'video/mp4',url:'https://video.twimg.com/low.mp4'},{bit_rate:2176000,content_type:'video/mp4',url:'https://video.twimg.com/high.mp4'}]},
]}};
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
test('X 按 media_key 关联多附件，保留视频与 GIF 元数据，并与文章链接分开',()=>{
  const [video,gif]=normalizePosts(mediaPayload);
  assert.deepEqual(video.media.map(m=>m.media_key),['v','p']);assert.equal(video.media[0].variants.length,3);
  assert.equal(video.media[0].duration_ms,24000);assert.equal(video.media[0].width,1920);assert.equal(video.media[1].alt,'配图');
  assert.deepEqual(video.links,[{url:'https://example.com/guide',title:''}]);assert.ok(!video.text.includes('/video/1'));
  assert.equal(gif.media[0].type,'animated_gif');assert.equal(gif.media[0].variants[0].content_type,'video/mp4');
});
test('媒体实体链接单独归入附件，缺失 expansion 仍保留媒体键以便再次补全',()=>{
  const [b]=normalizePosts({data:[{id:'102',text:'图片 https://t.co/p',attachments:{media_keys:['p']},entities:{urls:[{url:'https://t.co/p',expanded_url:'https://pbs.twimg.com/p.jpg',media_key:'p'}]}}]});
  assert.equal(b.media[0].media_key,'p');assert.equal(b.media[0].type,'unknown');assert.equal(b.links.length,0);assert.equal(b.text,'图片');
});
test('详情播放优先 MP4 和最高码率，保留其他 variant，GIF 使用循环静音视频',()=>{
  const [b,gif]=normalizePosts(mediaPayload),d=new JSDOM(renderRecordMedia(b,esc)+renderRecordMedia(gif,esc)).window.document;
  const video=d.querySelector('video');assert.equal(video.poster,'https://pbs.twimg.com/video.jpg');assert.equal(video.controls,true);
  assert.equal(video.querySelector('source').src,'https://video.twimg.com/high.mp4');assert.equal(video.querySelectorAll('source').length,3);
  assert.equal(d.querySelector('img').alt,'配图');const animated=d.querySelectorAll('video')[1];assert.equal(animated.loop,true);assert.equal(animated.autoplay,true);assert.ok(animated.hasAttribute('muted'));
  assert.equal(d.querySelectorAll('.record-media').length,3);assert.equal(mediaPreview({type:'video',url:'https://pbs.twimg.com/legacy.jpg'}),'https://pbs.twimg.com/legacy.jpg');
  assert.equal(mediaPreview({type:'video',url:'https://video.twimg.com/a.mp4'}),'');assert.equal(playbackVariants({variants:[{url:'javascript:alert(1)',content_type:'video/mp4'}]}).length,0);
});
test('仅有缩略图的视频明确缺失播放地址，导入网页配图不重复显示',()=>{
  const html=renderRecordMedia({url:'https://x.com/i/web/status/100',media:[{type:'video',url:'https://pbs.twimg.com/legacy.jpg'}]},esc),d=new JSDOM(html).window.document;
  assert.equal(d.querySelector('video'),null);assert.equal(d.querySelector('.media-unavailable').hidden,false);assert.equal(d.querySelector('.media-kind').textContent,'VIDEO');
  assert.equal(renderRecordMedia({blocks:[],media:[{type:'photo',url:'https://pbs.twimg.com/a.jpg'}]},esc),'');
});
test('首页与全部收藏的任意卡片都能显示视频缩略图，详情附件不会混入 Link Intelligence',()=>{
  const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8'),media=readFileSync(new URL('../public/media.js',import.meta.url),'utf8').replaceAll('export function','function');
  const templates=JSON.parse(readFileSync(new URL('../public/assets/figma-templates.json',import.meta.url),'utf8'));
  const declarations=['const named =','const namedAll =','const paragraphs =','const textAt ='].map(start=>app.split('\n').find(line=>line.startsWith(start))).join('\n');
  const control=app.slice(app.indexOf('function control('),app.indexOf('function reference('));
  const functions=app.slice(app.indexOf('function favoriteButton('),app.indexOf('function bindCards('))+app.slice(app.indexOf('function bindDetail('),app.indexOf('function referenceFrame('));
  const [b]=normalizePosts(mediaPayload);b.media.reverse();b.links=[];b.cover='https://pbs.twimg.com/video.jpg';
  for(const [page,name,home] of [['2-2315','推文收藏卡片',true],['10-9510','收藏记录',false],['11-1445',null,false]]){
    const dom=new JSDOM(templates[page],{runScripts:'outside-only'}),w=dom.window;w.bookmark=b;w.escapeHtml=esc;
    w.eval(`const state={id:'100',selected:new Set()},detailOrigin=null,titles={},all=()=>[bookmark],esc=escapeHtml,assistant={entry(){}},askAgent={entry(){}},initials=()=>'',handle=()=>'',date=()=>'',cat=()=>'',metric=()=>0,countText=()=>'',priorityText=()=>'',referenceTags=()=>{},readState=()=>{},safeUrl=v=>v;${declarations}${control}${media}${functions};window.card=bindBookmarkCard;window.detail=bindDetail;`);
    if(name){const card=w.document.querySelector('[data-name="'+name+'"]');w.card(card,b,home);assert.equal(card.querySelector('.record-media-preview img').src,'https://pbs.twimg.com/video.jpg');assert.equal(card.querySelector('.media-kind').textContent,'VIDEO');assert.equal(card.querySelector('.record-media-preview').dataset.open,'100');}
    else{w.detail(w.document.body);assert.equal(w.document.querySelector('[data-name="正文内容"] video source').src,'https://video.twimg.com/high.mp4');assert.equal(w.document.querySelector('[data-name="链接摘要"] video'),null);assert.equal(w.document.querySelector('[data-name="链接封面"] img'),null);}
    w.close();
  }
});
