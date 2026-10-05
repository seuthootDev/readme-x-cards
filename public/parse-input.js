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

export function buildCardUrl(origin, sel) {
  const params = new URLSearchParams();
  if (sel.kind === 'profile') {
    params.set('user', sel.username);
  } else if (sel.kind === 'latest') {
    params.set('user', sel.username);
    params.set('index', String(sel.index));
  } else {
    params.set('id', sel.id);
  }
  params.set('theme', sel.theme);
  const path = sel.kind === 'profile' ? 'profile' : 'post';
  return `${origin}/api/${path}?${params}`;
}

export function linkFor(sel) {
  if (sel.kind === 'post') return `https://x.com/${sel.username ?? 'i'}/status/${sel.id}`;
  return `https://x.com/${sel.username}`;
}

const escapeAttr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export function buildSnippets(cardUrl, linkUrl, alt) {
  return {
    markdown: `[![${alt}](${cardUrl})](${linkUrl})`,
    html: `<a href="${escapeAttr(linkUrl)}"><img src="${escapeAttr(cardUrl)}" alt="${escapeAttr(alt)}" width="450"></a>`,
  };
}
