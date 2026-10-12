import { demoBookmarks } from './demo.js';

export function createLibrary(store) {
  function library(mode = '') {
    const account = store.get('account'), local = store.list('local');
    const demo = mode === 'demo' || (!account && !local.length);
    const owner = demo ? 'demo' : account?.id || 'local';
    const overrides = { ...(store.get('bookmarkState:' + owner) || {}), ...(demo ? {} : store.get('bookmarkState:local') || {}) };
    const demoCategories = store.get('demoCategories') || {};
    const collections = store.get('collections:' + owner) || [];
    const all = (demo ? demoBookmarks.map(b => ({ ...b, category: demoCategories[b.id] || b.category, manual: Boolean(demoCategories[b.id]) })) : [...(account ? store.list(account.id) : []), ...local]).map(b => ({ read: false, queue: false, favorite: false, priority: null, ...b, ...overrides[b.id], category: b.manual ? b.category : overrides[b.id]?.autoCategory || b.category, collections: collections.filter(c => c.recordIds.includes(b.id)).map(c => c.id) }));
    const tagColors = { ...(demo ? {} : store.get('tagColors:local') || {}), ...(store.get('tagColors:' + owner) || {}) };
    return { demo, owner, all, overrides, tagColors, collections };
  }
  function saveState(owner, id, patch) {
    if (id.startsWith('web-')) owner = 'local';
    store.change('bookmarkState:' + owner, overrides => ({ ...overrides, [id]: { ...overrides?.[id], ...patch } }));
  }
  return { library, saveState };
}
