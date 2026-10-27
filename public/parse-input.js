// Shared by index.html (browser) and tests (Vitest). Plain ES module, no build step.

const USERNAME = /^[A-Za-z0-9_]{1,15}$/;
const X_URL =
  /^(?:https?:\/\/)?(?:www\.|mobile\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})(?:\/status(?:es)?\/(\d{1,25}))?(?:\/[^?#]*)?\/?(?:[?#].*)?$/i;
// x.com paths that look like usernames but are app pages.
const RESERVED = new Set(['home', 'explore', 'i', 'search', 'settings', 'notifications', 'messages', 'compose', 'login', 'signup', 'tos', 'privacy']);

/** @returns {{type:'user', username:string} | {type:'post', username:string, id:string} | null} */
export function parseInput(raw) {
  const value = String(raw ?? '').trim();
  if (!value) return null;

  const match = X_URL.exec(value);
  if (match) {
    const [, username, id] = match;
    if (RESERVED.has(username.toLowerCase())) return null;
    return id ? { type: 'post', username, id } : { type: 'user', username };
  }
  if (/[/.]/.test(value)) return null;

  const handle = value.replace(/^@/, '');
  return USERNAME.test(handle) ? { type: 'user', username: handle } : null;
}

export const DEFAULT_LOCALE = 'en-US';

/**
 * @param {string} origin
 * @param {{kind:'profile'|'latest'|'feed'|'post', username?:string, id?:string, index?:number, count?:number,
 *          theme:string, hide?:string[], locale?:string}} sel
 */
export function buildCardUrl(origin, sel) {
  const params = new URLSearchParams();
  if (sel.kind === 'post') {
    params.set('id', sel.id);
  } else {
    params.set('user', sel.username);
    if (sel.kind === 'latest') params.set('index', String(sel.index));
    if (sel.kind === 'feed') params.set('count', String(sel.count));
  }
  params.set('theme', sel.theme);
  if (sel.hide?.length) params.set('hide', sel.hide.join(','));
  if (sel.locale && sel.locale !== DEFAULT_LOCALE) params.set('locale', sel.locale);
  const path = { profile: 'profile', feed: 'feed' }[sel.kind] ?? 'post';
  // Commas in "hide" read better unescaped and are valid in a query string.
  return `${origin}/api/${path}?${params.toString().replace(/%2C/g, ',')}`;
}

export function linkFor(sel) {
  if (sel.kind === 'post') return `https://x.com/${sel.username ?? 'i'}/status/${sel.id}`;
  return `https://x.com/${sel.username}`;
}

const escapeAttr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/**
 * Markdown and HTML snippets. With `lightUrl`, the HTML switches to that card when the viewer's GitHub
 * theme is light; Markdown cannot express that, so `markdown` is null.
 */
export function buildSnippets(cardUrl, linkUrl, alt, lightUrl) {
  const img = `<img src="${escapeAttr(cardUrl)}" alt="${escapeAttr(alt)}" width="450">`;
  if (lightUrl) {
    return {
      markdown: null,
      html: `<a href="${escapeAttr(linkUrl)}">
  <picture>
    <source media="(prefers-color-scheme: light)" srcset="${escapeAttr(lightUrl)}">
    ${img}
  </picture>
</a>`,
    };
  }
  return {
    markdown: `[![${alt}](${cardUrl})](${linkUrl})`,
    html: `<a href="${escapeAttr(linkUrl)}">${img}</a>`,
  };
}
