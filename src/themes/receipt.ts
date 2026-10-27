import type { Post, Profile } from '../model.js';
import { escapeXml, formatCount, formatDate, measure, wrapText } from '../render/text.js';
import { mediaSummary, metricItems, quoteBox, richText } from './shared.js';
import type { RenderOptions, Theme } from './types.js';

const W = 450;
const MONO = "ui-monospace,SFMono-Regular,Consolas,'Liberation Mono','Courier New',monospace";
const INK = '#222222';
const FADED = '#6b6b6b';
const LEFT = 32;
const RIGHT = W - 32;

/** Thermal paper with a torn zigzag bottom edge. */
function frame(height: number, label: string, body: string): string {
  let edge = `M0 0 H${W} V${height - 8}`;
  for (let x = W; x > 0; x -= 10) edge += ` L${x - 5} ${height} L${x - 10} ${height - 8}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${height}" viewBox="0 0 ${W} ${height}" role="img" aria-label="${escapeXml(label)}" font-family="${MONO}">
<title>${escapeXml(label)}</title>
<path d="${edge} Z" fill="#fbf8f0"/>
${body}
</svg>`;
}

/** Receipts print exact amounts: 12467573 → "12,467,573". */
const exact = (n: number) => Math.max(0, Math.trunc(Number.isFinite(n) ? n : 0)).toLocaleString('en-US');

const rule = (y: number, double = false) =>
  `<line x1="28" x2="${W - 28}" y1="${y}" y2="${y}" stroke="${INK}" stroke-dasharray="4 4"/>` +
  (double ? `\n<line x1="28" x2="${W - 28}" y1="${y + 4}" y2="${y + 4}" stroke="${INK}" stroke-dasharray="4 4"/>` : '');

/** "LABEL ........ value" with a dotted leader filling the gap. */
function row(y: number, label: string, value: string, total = false): string {
  const size = total ? 15 : 13;
  const weight = total ? 700 : 400;
  const from = LEFT + measure(label, size, true) + 8;
  const to = RIGHT - measure(value, size, true) - 8;
  const leader =
    to - from > 8 ? `\n<line x1="${Math.round(from)}" x2="${Math.round(to)}" y1="${y}" y2="${y}" stroke="${FADED}" stroke-dasharray="1 4"/>` : '';
  return `<text x="${LEFT}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${INK}">${escapeXml(label)}</text>
<text x="${RIGHT}" y="${y}" text-anchor="end" font-size="${size}" font-weight="${weight}" fill="${INK}">${escapeXml(value)}</text>${leader}`;
}

/** Decorative bars seeded from the given text, so the same account always prints the same barcode. */
function barcode(y: number, seedText: string): string {
  let seed = 2166136261;
  for (const ch of seedText) seed = Math.imul(seed ^ ch.codePointAt(0)!, 16777619) >>> 0;
  const bars: string[] = [];
  let x = 125;
  while (x < 325) {
    // Use the generator's high bits; its low bits cycle with a short period.
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    const w = 1 + ((seed >>> 24) % 4);
    bars.push(`<rect x="${x}" y="${y}" width="${w}" height="34" fill="${INK}"/>`);
    x += w + 1 + ((seed >>> 16) % 3);
  }
  return bars.join('');
}

const fit = (text: string, maxWidth: number, fontSize: number) =>
  wrapText(text, { maxWidth, fontSize, maxLines: 1, mono: true })[0] ?? '';

const header = (title: string, subtitle: string) =>
  `<text x="${W / 2}" y="40" text-anchor="middle" font-size="14" font-weight="700" letter-spacing="2" fill="${INK}">${title}</text>
<text x="${W / 2}" y="60" text-anchor="middle" font-size="11" fill="${FADED}">${escapeXml(fit(subtitle, W - 64, 11))}</text>
${rule(78)}`;

function footer(y: number, seedText: string, message: string): { svg: string; height: number } {
  return {
    svg: `${rule(y, true)}
${barcode(y + 18, seedText)}
<text x="${W / 2}" y="${y + 70}" text-anchor="middle" font-size="11" letter-spacing="2" fill="${INK}">${message}</text>`,
    height: y + 88,
  };
}

// Receipts print no photos, so the avatar is ignored.
function renderProfile(p: Profile, _avatar: string | null): string {
  const name = fit(p.name, 230, 13);
  const bio = p.bio ? wrapText(`"${p.bio}"`, { maxWidth: RIGHT - LEFT, fontSize: 12, maxLines: 2, mono: true }) : [];

  const parts = [
    header('X PROFILE RECEIPT', `x.com/${p.username}`),
    row(104, 'CUSTOMER', `@${p.username}`),
    row(124, 'NAME', p.verified ? `${name} [✓]` : name),
  ];
  let y = 124;
  bio.forEach((line, i) => {
    y += i === 0 ? 28 : 18;
    parts.push(`<text x="${LEFT}" y="${y}" font-size="12" fill="${FADED}">${escapeXml(line)}</text>`);
  });
  y += 18;
  parts.push(rule(y), row(y + 24, 'POSTS', exact(p.posts)), row(y + 44, 'FOLLOWING', exact(p.following)), rule(y + 62));
  parts.push(row(y + 88, 'TOTAL FOLLOWERS', exact(p.followers), true));

  const end = footer(y + 104, p.username, 'THANK YOU FOR FOLLOWING');
  parts.push(end.svg);
  return frame(end.height, `${p.name} (@${p.username}) on X`, parts.join('\n'));
}

const METRIC_LABELS = { replies: 'REPLIES', reposts: 'REPOSTS', likes: 'LIKES', views: 'VIEWS' } as const;

// Receipts print no photos, so the preview image is ignored like the avatar.
function renderPost(post: Post, _avatar: string | null, opts: RenderOptions = {}): string {
  const date = formatDate(post.createdAt, opts.locale);
  const lines = wrapText(post.text, { maxWidth: RIGHT - LEFT, fontSize: 13, maxLines: 4, mono: true });
  const media = mediaSummary(post.media);
  const metrics = metricItems(post);
  const items = metrics.filter((m) => m.key !== 'views');
  const views = metrics.find((m) => m.key === 'views');

  const parts = [
    header('X POST RECEIPT', `ORDER #${post.id}${date ? ` · ${date}` : ''}`),
    row(104, 'AUTHOR', `@${post.author.username}${post.author.verified ? ' [✓]' : ''}`),
  ];
  let y = 104;
  if (post.replyTo) {
    y += 20;
    parts.push(row(y, 'REPLY TO', `@${post.replyTo}`));
  }
  lines.forEach((line, i) => {
    y += i === 0 ? 30 : 20;
    parts.push(`<text class="body" x="${LEFT}" y="${y}" font-size="13" fill="${INK}">${richText(line, INK, ' text-decoration="underline"')}</text>`);
  });
  if (media) {
    y += 22;
    parts.push(`<text x="${LEFT}" y="${y}" font-size="12" fill="${FADED}">+ ${media}</text>`);
  }
  if (post.quote) {
    const quote = quoteBox(post.quote, y + 14, {
      x: LEFT - 4,
      width: RIGHT - LEFT + 8,
      fontSize: 12,
      mono: true,
      ink: INK,
      muted: FADED,
      link: INK,
      box: `fill="none" stroke="${INK}" stroke-dasharray="4 4"`,
    });
    parts.push(quote.svg);
    y = quote.bottom - 4;
  }
  y += 20;

  if (metrics.length) {
    parts.push(rule(y));
    items.forEach(({ key, value }) => {
      y += 20;
      parts.push(row(y + 4, METRIC_LABELS[key], exact(value)));
    });
    if (views) {
      y += items.length ? 22 : 0;
      if (items.length) parts.push(rule(y));
      y += 26;
      parts.push(row(y, 'TOTAL VIEWS', exact(views.value), true));
    } else {
      y += 4;
    }
    y += 16;
  }

  const end = footer(y, post.id, 'PLEASE COME AGAIN');
  parts.push(end.svg);
  return frame(end.height, `Post by @${post.author.username} on X`, parts.join('\n'));
}

/** One line item per post (number, date, text, short metrics), then totals summed over the posts. */
function renderFeed(posts: Post[], _avatar: string | null, opts: RenderOptions = {}): string {
  const author = posts[0].author;
  const parts = [header('X FEED RECEIPT', `@${author.username} · LATEST ${posts.length}`)];

  let y = 78;
  posts.forEach((post, i) => {
    if (i > 0) parts.push(rule(y));
    y += 26;
    parts.push(row(y, `ITEM ${i + 1}`, formatDate(post.createdAt, opts.locale)));
    const lines = wrapText(post.text, { maxWidth: RIGHT - LEFT, fontSize: 13, maxLines: 3, mono: true });
    lines.forEach((line) => {
      y += 20;
      parts.push(`<text class="body" x="${LEFT}" y="${y}" font-size="13" fill="${INK}">${richText(line, INK, ' text-decoration="underline"')}</text>`);
    });
    const media = mediaSummary(post.media);
    if (media) {
      y += 20;
      parts.push(`<text x="${LEFT}" y="${y}" font-size="12" fill="${FADED}">+ ${media}</text>`);
    }
    const metrics = metricItems(post)
      .filter((m) => m.key !== 'views')
      .map(({ key, value }) => `${formatCount(value)} ${METRIC_LABELS[key]}`)
      .join('  ');
    if (metrics) {
      y += 20;
      parts.push(`<text x="${LEFT}" y="${y}" font-size="11" fill="${FADED}" xml:space="preserve">${metrics}</text>`);
    }
    y += 14;
  });

  const total = (key: 'likes' | 'views') => {
    const values = posts.map((p) => p[key]).filter((v): v is number => v !== undefined);
    return values.length ? values.reduce((a, b) => a + b, 0) : undefined;
  };
  const totals = [
    ['TOTAL LIKES', total('likes')],
    ['TOTAL VIEWS', total('views')],
  ].filter((t): t is [string, number] => t[1] !== undefined);
  if (totals.length) {
    parts.push(rule(y, true));
    y += 8;
    for (const [label, value] of totals) {
      y += 26;
      parts.push(row(y, label, exact(value), true));
    }
    y += 16;
  }

  const end = footer(y, author.username, 'PLEASE COME AGAIN');
  parts.push(end.svg);
  return frame(end.height, `Latest posts by @${author.username} on X`, parts.join('\n'));
}

function renderError(message: string): string {
  const body = `${header('TRANSACTION DECLINED', 'readme-x-cards')}
<text x="${W / 2}" y="106" text-anchor="middle" font-size="13" fill="${INK}">${escapeXml(fit(message.toUpperCase(), W - 64, 13))}</text>`;
  return frame(132, message, body);
}

export const receipt: Theme = { name: 'receipt', renderProfile, renderPost, renderFeed, renderError };
