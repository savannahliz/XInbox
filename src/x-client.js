import { createHash, randomBytes } from 'node:crypto';
import { normalizePosts } from './catalog.js';

export function authorization(config) {
  const state = randomBytes(24).toString('base64url'), verifier = randomBytes(48).toString('base64url');
  const url = new URL('https://x.com/i/oauth2/authorize');
  url.search = new URLSearchParams({ response_type: 'code', client_id: config.clientId, redirect_uri: config.redirectUri,
    scope: 'tweet.read users.read bookmark.read offline.access', state,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' });
  return { state, verifier, url: url.toString() };
}

export function createXClient(config, fetcher = fetch) {
  async function request(path, options) {
    let response;
    try { response = await fetcher(`https://api.x.com${path}`, { ...options, signal: AbortSignal.timeout(25000) }); }
    catch (cause) {
      const code = /^[A-Z0-9_]+$/.test(cause.cause?.code || '') ? `（${cause.cause.code}）` : '';
      throw new Error(`无法连接 X API${code}，请检查网络连接后重试。`);
    }
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      const messages = { 401: 'X 授权已失效，请重新连接。', 402: 'X API 余额或访问方案不足，请检查开发者控制台。', 403: 'X 拒绝了请求，请检查应用权限和 API 访问资格。', 429: 'X 请求达到频率限制，请稍后重试。' };
      const oauthMessages = { invalid_client: 'X 拒绝了公开客户端认证，请将 INbox_X 的应用类型设为 Native App，并核对 Client ID。无需填写 Client Secret。', unauthorized_client: 'X 不允许此应用使用公开客户端授权，请检查 INbox_X 的 Native App 和 OAuth 2.0 配置。', invalid_grant: 'X 授权码已过期或无效，请重新连接。', invalid_request: 'X 授权请求无效，请核对应用 Client ID 和回调地址。' };
      const error = new Error(oauthMessages[payload.error] || messages[response.status] || `X 返回 ${response.status}，本次操作未完成。`);
      error.status = response.status; throw error;
    }
    return response.json();
  }
  async function token(params) {
    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    if (config.clientSecret) headers.Authorization = `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`;
    else params.client_id = config.clientId;
    const data = await request('/2/oauth2/token', { method: 'POST', headers, body: new URLSearchParams(params) });
    return { ...data, expiresAt: Date.now() + data.expires_in * 1000 };
  }
  const read = (path, accessToken) => request(path, { headers: { Authorization: `Bearer ${accessToken}` } });
  return {
    exchange: (code, verifier) => token({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: config.redirectUri }),
    refresh: refreshToken => token({ grant_type: 'refresh_token', refresh_token: refreshToken }),
    user: async accessToken => (await read('/2/users/me', accessToken)).data,
    async sync(owner, accessToken, onPage, startCursor = null) {
      let cursor = startCursor, fetched = 0, unavailable = 0;
      const importedAt = new Date().toISOString();
      const seen = new Set();
      do {
        const q = new URLSearchParams({ max_results: '100', 'post.fields': 'created_at,author_id,attachments,entities,note_post,public_metrics',
          expansions: 'author_id,attachments.media_keys', 'user.fields': 'name,username', 'media.fields': 'media_key,type,url,preview_image_url,variants,duration_ms,width,height,alt_text' });
        if (cursor) q.set('pagination_token', cursor);
        let payload;
        try { payload = await read(`/2/users/${owner}/bookmarks?${q}`, accessToken); }
        catch (error) { error.cursor = cursor; throw error; }
        const bookmarks = normalizePosts(payload, importedAt);
        fetched += bookmarks.length; unavailable += payload.errors?.length || 0;
        const next = payload.meta?.next_token || null;
        await onPage(bookmarks, { fetched, unavailable, cursor: next });
        if (next && (seen.has(next) || next === cursor)) throw new Error('X 返回了重复分页标记，已停止同步以避免重复请求。');
        if (next) seen.add(next);
        cursor = next;
      } while (cursor);
      return { fetched, unavailable };
    },
  };
}
