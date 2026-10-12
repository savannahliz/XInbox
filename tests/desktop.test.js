import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtempSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

test('桌面后台独立启动、使用独立数据目录，退出后释放端口', {timeout:10000}, async t=>{
  const root=fileURLToPath(new URL('../',import.meta.url)),data=mkdtempSync(join(tmpdir(),'inbox-desktop-'));
  const bundle=join(root,'dist/INbox.app/Contents/Resources');
  const packaged=existsSync(join(bundle,'runtime/node'));
  const child=spawn(packaged?join(bundle,'runtime/node'):process.execPath,[packaged?join(bundle,'app/desktop/server.js'):join(root,'desktop/server.js')],{env:{...process.env,INBOX_DATA_DIR:data,INBOX_DESKTOP_PORT:'0'},stdio:['ignore','pipe','pipe']});
  t.after(async()=>{if(child.exitCode===null){const exit=once(child,'exit');child.kill('SIGTERM');await exit;}rmSync(data,{recursive:true,force:true});});
  const origin=await new Promise((resolve,reject)=>{
    let text='';child.stdout.on('data',part=>{text+=part.toString();const m=text.match(/INBOX_READY (http:\/\/127\.0\.0\.1:\d+)/);if(m)resolve(m[1]);});child.once('error',reject);child.once('exit',code=>reject(Error('后台提前退出 '+code)));
  });
  const page=await fetch(origin),cookie=page.headers.get('set-cookie').split(';')[0];
  assert.match(await page.text(),/INbox/);
  const icons=await fetch(origin+'/panel-icons.js');assert.equal(icons.status,200);assert.match(icons.headers.get('content-type'),/javascript/);
  const media=await fetch(origin+'/media.js');assert.equal(media.status,200);assert.match(await media.text(),/renderRecordMedia/);assert.match(page.headers.get('content-security-policy'),/media-src 'self' https:\/\/video\.twimg\.com/);
  const canvasScript=await(await fetch(origin+'/research-canvas.js')).text();assert.match(canvasScript,/canvas-edge-editor/);
  const books=await (await fetch(origin+'/api/bookmarks',{headers:{Cookie:cookie}})).json();
  assert.equal(books.total,12);assert.equal(books.demo,true);
  assert.ok(existsSync(join(data,'local.key')));
  const exit=once(child,'exit');child.kill('SIGTERM');assert.equal((await exit)[0],0);
  await assert.rejects(fetch(origin),/fetch failed/);
});
