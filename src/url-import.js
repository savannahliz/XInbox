import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { gunzipSync, inflateSync, brotliDecompressSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { classify } from './catalog.js';

const HTML_LIMIT = 8 * 1024 * 1024;
const IMAGE_LIMIT = 6 * 1024 * 1024;
const hash = value => createHash('sha256').update(value).digest('hex');
const clean = value => (value || '').replace(/[\t\r ]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim();
const needsHtml = message => Object.assign(new Error(message), { requiresHtml: true });

export function publicAddress(address) {
  if (isIP(address) === 4) {
    const [a,b,c] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
      (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113));
  }
  if (isIP(address) === 6) {
    const [a,b] = address.split(':').map(v => parseInt(v || '0',16));
    return a >= 0x2000 && a <= 0x3fff && a !== 0x2002 && !(a === 0x2001 && (b <= 0x1ff || b === 0xdb8));
  }
  return false;
}

export function publicUrl(raw, base) {
  let url;
  try { url = new URL(raw, base); } catch { throw new Error('请输入完整的 HTTP 或 HTTPS 链接。'); }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!['http:','https:'].includes(url.protocol) || url.username || url.password ||
    /(^|\.)(localhost|local|internal)$/.test(host) || (isIP(host) && !publicAddress(host))) {
    throw new Error('只支持公开网页链接，不支持本机或内网地址。');
  }
  url.hash = '';
  if (url.hostname === 'mp.weixin.qq.com') url.protocol = 'https:';
  return url;
}

// Pin the validated DNS address to the socket; redirects are validated separately.
async function publicRequest(url, options) {
  const host = new URL(url).hostname.replace(/^\[|\]$/g, '');
  let addresses = isIP(host) ? [{address:host,family:isIP(host)}] : await lookup(host, { all:true });
  // VPN fake-IP mode uses 198.18/15. Obtain public records instead of allowing that private range.
  if (!isIP(host) && addresses.length && addresses.every(a=>/^198\.(18|19)\./.test(a.address))) {
    const response=await publicRequest('https://1.1.1.1/dns-query?name='+encodeURIComponent(host)+'&type=A',{headers:{Accept:'application/dns-json'},maxBytes:65536});
    if (!response.ok) throw new Error('无法解析公开网页地址。');
    const dns=await response.json();addresses=(dns.Answer || []).filter(a=>a.type===1).map(a=>({address:a.data,family:4}));
  }
  if (!addresses.length || addresses.some(a => !publicAddress(a.address))) throw new Error('网页地址解析到了本机或内网，无法导入。');
  const address = addresses.find(a=>a.family===4) || addresses[0];
  return new Promise((resolve,reject) => {
    const request = (url.startsWith('https:') ? httpsRequest : httpRequest)(url, {
      headers:options.headers, signal:AbortSignal.timeout(20000),
      lookup:(_host,opts,callback) => callback(null,opts.all ? [address] : address.address,address.family),
    }, response => {
      const chunks = [];let length = 0;
      response.on('data',chunk => {length += chunk.length;if(length > options.maxBytes) response.destroy(new Error('网页或图片过大，未保存截断内容。'));else chunks.push(chunk);});
      response.on('error',reject);
      response.on('end',() => {
        try {
          let bytes=Buffer.concat(chunks);
          const decompress={gzip:gunzipSync,deflate:inflateSync,br:brotliDecompressSync}[response.headers['content-encoding']];
          if (decompress) bytes=decompress(bytes,{maxOutputLength:options.maxBytes});
          delete response.headers['content-encoding'];delete response.headers['content-length'];
          resolve(new Response([204,304].includes(response.statusCode) ? null : bytes,{status:response.statusCode,headers:response.headers}));
        } catch(error) {reject(error);}
      });
    });
    request.on('error',reject);request.end();
  });
}

async function resource(raw, limit, fetcher = publicRequest, referer) {
  let url = publicUrl(raw);
  for (let redirects=0;redirects<=5;redirects++) {
    if (url.pathname.includes('wappoc_appmsgcaptcha')) throw needsHtml('微信要求验证。请在浏览器打开文章完成验证，再导入保存的网页 HTML。');
    const response = await fetcher(url.href, {redirect:'manual',maxBytes:limit,signal:AbortSignal.timeout(20000),headers:{
      'User-Agent':'INbox/0.1 (local article reader)',
      'Accept-Language':'zh-CN,zh;q=0.9,en;q=0.7','Accept-Encoding':'identity', ...(referer ? {Referer:referer} : {}),
    }});
    if ([301,302,303,307,308].includes(response.status)) {url=publicUrl(response.headers.get('location'),url);continue;}
    if (!response.ok) throw needsHtml(`原网页返回 ${response.status}，未导入。可以导入浏览器保存的网页 HTML。`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > limit) throw new Error('网页或图片过大，未保存截断内容。');
    return {bytes,url:url.href,type:response.headers.get('content-type') || ''};
  }
  throw new Error('网页重定向过多，无法导入。');
}

export function parseArticle(html, rawUrl, contentType = '') {
  const url = publicUrl(rawUrl).href;
  const sample = Buffer.isBuffer(html) ? html.subarray(0,2048).toString('latin1') : html.slice(0,2048);
  const encoding = (contentType+';'+sample).match(/charset\s*=\s*["']?([^\s;"'/>]+)/i)?.[1] || 'utf-8';
  const dom = new JSDOM(html,{url,contentType:'text/html; charset='+encoding});
  try {
    const doc = dom.window.document;
    const meta = key => doc.querySelector(`meta[property="${key}"],meta[name="${key}"]`)?.getAttribute('content') || '';
    const wechat = new URL(url).hostname === 'mp.weixin.qq.com';
    const content = doc.querySelector('#js_content');
    if (wechat && !content) throw needsHtml('没有获取到公众号正文；可能需要微信验证或文章已失效。可导入浏览器保存的网页 HTML。');
    const title = clean((wechat ? doc.querySelector('#activity-name')?.textContent : '') || meta('og:title') || doc.title || doc.querySelector('article h1,main h1,h1')?.textContent);
    if (/环境异常|安全验证|人机验证|access denied|just a moment|verify you are human/i.test(title)) throw needsHtml('原网页要求访问验证，未按文章导入。请导入浏览器保存的网页 HTML。');
    const author = clean((wechat ? doc.querySelector('#js_name')?.textContent : '') || meta('author') || meta('og:site_name'));
    const published = (wechat ? doc.querySelector('#publish_time')?.textContent : '') || meta('article:published_time');
    const absolute = value => {if(!value?.trim())return '';try{return publicUrl(value,url).href;}catch{return '';}};
    const imageSource = value => /^data:image\/(png|jpeg|gif|webp|avif);base64,[a-zA-Z0-9+/=\s]+$/.test(value || '') ? value : absolute(value);
    for (const image of doc.querySelectorAll('img')) {
      const src = image.getAttribute('data-src') || image.getAttribute('data-original') || image.getAttribute('data-lazy-src') || image.getAttribute('src') || image.getAttribute('srcset')?.split(',').at(-1)?.trim().split(/\s+/)[0];
      if (src) image.setAttribute('src',imageSource(src));
    }
    const declared = [...doc.querySelectorAll('article,[itemprop="articleBody"],#article-body,#article-content,.article-content,.entry-content,.post-content,.markdown-body')].sort((a,b)=>b.textContent.length-a.textContent.length)[0];
    const reader = wechat ? null : new Readability(doc.cloneNode(true),{charThreshold:100,maxElemsToParse:100000,serializer:el=>el}).parse();
    const root = wechat ? content : declared?.textContent.trim().length>=40 ? declared : reader?.content;
    if (!root) throw needsHtml('没有提取到文章正文。请导入浏览器保存的网页 HTML，页面摘要不会作为全文保存。');
    root.querySelectorAll('script,style,noscript,iframe,form,button,input,nav,footer,svg,canvas').forEach(n=>n.remove());
    const links = [...root.querySelectorAll('a[href]')].map(a=>({url:absolute(a.getAttribute('href')),title:clean(a.textContent)})).filter(l=>l.url);
    const blocks = [];let pending = '';
    const flush = (type='paragraph') => {const text=clean(pending);if(text)blocks.push({type,text});pending='';};
    const blockTags = /^(P|DIV|SECTION|ARTICLE|H[1-6]|BLOCKQUOTE|PRE|LI|TR|FIGCAPTION)$/;
    function walk(node, type='paragraph') {
      if (node.nodeType === 3) {pending += node.textContent;return;}
      if (node.nodeType !== 1) return;
      const tag=node.tagName;
      if (tag==='BR') {pending+='\n';return;}
      if (tag==='IMG') {flush(type);const src=imageSource(node.getAttribute('src'));if(src)blocks.push({type:'image',originalUrl:src,alt:clean(node.getAttribute('alt'))});return;}
      const boundary=blockTags.test(tag),next=/^H[1-6]$/.test(tag)?'heading':tag==='BLOCKQUOTE'?'quote':tag==='PRE'?'code':type;
      if (boundary) flush(type);
      for (const child of node.childNodes) walk(child,next);
      if (boundary) flush(next);
      if (tag==='TD' || tag==='TH') pending+='\t';
    }
    walk(root);flush();
    const text=blocks.filter(b=>b.text).map(b=>b.text).join('\n\n');
    if (text.length < 40) throw needsHtml('正文内容不足，可能是登录或验证页；未按全文保存。');
    const createdAt=published && Number.isFinite(Date.parse(published)) ? new Date(published).toISOString() : null;
    const heading=reader?.title || title || new URL(url).hostname;
    return {id:'web-'+hash(url),title:heading,text,author:author || reader?.byline || new URL(url).hostname,username:new URL(url).hostname,
      url,source:wechat?'wechat':'web',sourceName:wechat?'微信公众号':new URL(url).hostname,createdAt,importedAt:new Date().toISOString(),
      blocks,links:[{url,title:heading},...links],coverUrl:imageSource(meta('og:image')),media:[],metrics:{},...classify(heading+'\n'+text),demo:false};
  } finally {dom.window.close();}
}

function imageFormat(bytes) {
  if (bytes[0]===0xff && bytes[1]===0xd8 && bytes[2]===0xff) return ['jpg','image/jpeg'];
  if (bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return ['png','image/png'];
  if (/^GIF8[79]a/.test(bytes.subarray(0,6).toString())) return ['gif','image/gif'];
  if (bytes.subarray(0,4).toString()==='RIFF' && bytes.subarray(8,12).toString()==='WEBP') return ['webp','image/webp'];
  if (bytes.subarray(4,8).toString()==='ftyp' && /avif|avis/.test(bytes.subarray(8,32).toString())) return ['avif','image/avif'];
  return null;
}

export async function importArticle(rawUrl, directory, {html,fetcher} = {}) {
  const page = html ? {bytes:html,url:publicUrl(rawUrl).href} : await resource(rawUrl,HTML_LIMIT,fetcher);
  if (page.type && !/html|xhtml/i.test(page.type)) throw new Error('链接不是网页文章，请提供文章页面 URL。');
  const article=parseArticle(page.bytes,page.url,page.type);
  const urls=[...new Set([...article.blocks.filter(b=>b.type==='image').map(b=>b.originalUrl),article.coverUrl].filter(Boolean))];
  const saved=new Map();let index=0;const imageDeadline=Date.now()+60000;
  await mkdir(directory,{recursive:true,mode:0o700});
  async function worker() {
    while (index<Math.min(urls.length,80) && Date.now()<imageDeadline) {
      const url=urls[index++];
      try {
        const {bytes}=url.startsWith('data:')?{bytes:Buffer.from(url.split(',')[1],'base64')}:await resource(url,IMAGE_LIMIT,fetcher,article.url),format=imageFormat(bytes);
        if (bytes.length>IMAGE_LIMIT) continue;
        if (!format) continue;
        const filename=hash(bytes)+'.'+format[0];await writeFile(join(directory,filename),bytes,{mode:0o600});saved.set(url,'/media/'+filename);
      } catch { /* Image failure never discards the complete text. */ }
    }
  }
  await Promise.all([worker(),worker(),worker()]);
  for (const block of article.blocks.filter(b=>b.type==='image')) {
    block.url=saved.get(block.originalUrl) || '';
    if (block.url) article.media.push({type:'photo',url:block.url,alt:block.alt});
  }
  article.cover=saved.get(article.coverUrl) || article.media[0]?.url || '';
  article.imageImport={total:urls.length,saved:saved.size,failed:urls.length-saved.size};
  return article;
}
