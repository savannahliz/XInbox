import {createApp} from '../src/server.js';

const port=Number(process.env.INBOX_DESKTOP_PORT || 4319);
const app=createApp({port,desktop:true,dataDir:process.env.INBOX_DATA_DIR,clientId:process.env.X_CLIENT_ID,redirectUri:`http://127.0.0.1:${port}/auth/callback`});
app.server.on('error',error=>{console.error(error.code==='EADDRINUSE'?'INbox 端口已被占用，请关闭另一个 INbox 窗口后重试。':'INbox 后台启动失败。');process.exit(1);});
app.server.listen(port,'127.0.0.1',()=>console.log(`INBOX_READY http://127.0.0.1:${app.server.address().port}`));
for (const signal of ['SIGTERM','SIGINT']) process.on(signal,async()=>{
  await app.agents.close();
  app.server.close(()=>{app.store.close();process.exit(0);});
  app.server.closeIdleConnections();setTimeout(()=>process.exit(0),3000).unref();
});
