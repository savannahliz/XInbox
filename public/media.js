const safeMediaUrl = value => typeof value === 'string' && (/^https:\/\//.test(value) || /^\/(?:media\/[a-f0-9]{64}\.(?:jpg|png|gif|webp|avif)|assets\/[a-zA-Z0-9-]+\.(?:jpg|png|gif|webp|avif))$/.test(value)) ? value : '';
export function isDynamicMedia(media) { return ['video','animated_gif'].includes(media?.type); }
export function mediaPreview(media) {
  return safeMediaUrl(media?.preview_image_url || (media?.url && !/\.(mp4|m3u8)(?:[?#]|$)/i.test(media.url) ? media.url : ''));
}
export function playbackVariants(media) {
  const variants = (media.variants || []).filter(v => safeMediaUrl(v.url) && ['video/mp4','application/x-mpegURL','application/vnd.apple.mpegurl'].includes(v.content_type));
  if (!variants.length && /\.(mp4|m3u8)(?:[?#]|$)/i.test(media.url || '') && safeMediaUrl(media.url)) variants.push({url:media.url,content_type:/\.mp4(?:[?#]|$)/i.test(media.url)?'video/mp4':'application/x-mpegURL'});
  return [...variants].sort((a,b) => Number(b.content_type==='video/mp4')-Number(a.content_type==='video/mp4') || (b.bit_rate || 0)-(a.bit_rate || 0));
}
export function renderRecordMedia(record, esc) {
  if (record.blocks) return '';
  const items = (record.media || []).map((media,i) => {
    const preview = mediaPreview(media), dynamic = isDynamicMedia(media), variants = dynamic ? playbackVariants(media) : [];
    if (!preview && !variants.length) return '';
    const label = media.type==='animated_gif'?'GIF':dynamic?'VIDEO':'';
    const visual = variants.length ? `<video controls playsinline preload="metadata" ${preview?`poster="${esc(preview)}"`:''} ${media.type==='animated_gif'?'autoplay loop muted':''} aria-label="${label} 附件 ${i+1}">${variants.map(v=>`<source src="${esc(v.url)}" type="${esc(v.content_type)}">`).join('')}</video>` : `<img src="${esc(preview)}" alt="${esc(media.alt || '收藏配图')}" loading="lazy">`;
    return `<figure class="record-media" data-media-key="${esc(media.media_key || '')}">${visual}${label?`<span class="media-kind">${label}</span><p class="media-unavailable" ${variants.length?'hidden':''}>${variants.length?'媒体暂时无法播放':'暂未获取播放地址'} · <a href="${esc(record.url)}" target="_blank" rel="noreferrer">在 X 查看 ↗</a></p>`:''}${media.alt?`<figcaption>${esc(media.alt)}</figcaption>`:''}</figure>`;
  }).join('');
  return items ? `<section class="record-media-gallery" aria-label="媒体附件">${items}</section>` : '';
}

export function enableImageZoom(root) {
  root.querySelectorAll('img').forEach(image => {
    const url = safeMediaUrl(image.getAttribute('src'));
    if (!url || image.closest('.image-zoom')) return;
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'image-zoom'; button.dataset.imageUrl = url;
    button.setAttribute('aria-label', '放大查看图片');
    image.replaceWith(button); button.append(image);
  });
}

function openImageViewer(button) {
  const url = safeMediaUrl(button.dataset.imageUrl);
  if (!url) return;
  const dialog = document.createElement('dialog'); dialog.className = 'image-viewer';
  dialog.setAttribute('aria-label', '图片查看器');
  dialog.innerHTML = '<header><strong>IMAGE / 图片</strong><div><button type="button" class="button" data-zoom="fit">适应窗口</button><button type="button" class="button" data-zoom="1">100%</button><button type="button" class="button" data-zoom="out" aria-label="缩小图片">−</button><button type="button" class="button" data-zoom="in" aria-label="放大图片">+</button><button type="button" class="button" data-close aria-label="关闭图片查看器">×</button></div></header><div class="image-viewer-viewport"><div class="image-viewer-stage"><img></div></div>';
  const image = dialog.querySelector('img'), viewport = dialog.querySelector('.image-viewer-viewport');
  let zoom = 'fit';
  const resize = () => {
    if (!image.naturalWidth) return;
    const scale = zoom === 'fit' ? Math.min(1, (viewport.clientWidth - 32) / image.naturalWidth, (viewport.clientHeight - 32) / image.naturalHeight) : zoom;
    image.style.width = Math.max(1, image.naturalWidth * scale) + 'px';
    dialog.querySelector('[data-zoom="fit"]').setAttribute('aria-pressed', String(zoom === 'fit'));
    dialog.querySelector('[data-zoom="1"]').setAttribute('aria-pressed', String(zoom === 1));
  };
  image.alt = button.querySelector('img')?.alt || '文章配图';
  image.onload = resize; image.src = url;
  dialog.addEventListener('click', event => {
    const control = event.target.closest('button');
    if (control?.hasAttribute('data-close') || event.target === dialog) { dialog.close(); return; }
    if (!control?.dataset.zoom) return;
    const value = control.dataset.zoom;
    zoom = value === 'fit' ? 'fit' : value === '1' ? 1 : Math.max(0.25, Math.min(4, (zoom === 'fit' ? image.clientWidth / image.naturalWidth : zoom) + (value === 'in' ? 0.25 : -0.25)));
    resize();
  });
  dialog.addEventListener('keydown', event => event.stopPropagation());
  dialog.addEventListener('close', () => { window.removeEventListener('resize', resize); dialog.remove(); if (button.isConnected) button.focus(); }, {once:true});
  window.addEventListener('resize', resize);
  document.body.append(dialog); dialog.showModal(); resize();
}

if (typeof document !== 'undefined') {
  document.addEventListener('click', event => { const button = event.target.closest('.image-zoom'); if (button) { event.preventDefault(); openImageViewer(button); } });
  document.addEventListener('error',event=>{if(event.target.tagName==='VIDEO'){const hint=event.target.closest('.record-media')?.querySelector('.media-unavailable');if(hint)hint.hidden=false;}},true);
}
