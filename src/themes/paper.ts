import type { Post, Profile } from '../model.js';
import { escapeXml, formatCount, formatDate, measure, wrapText } from '../render/text.js';
import { checkBadge, initialOf, mediaSummary, metricItems } from './shared.js';
import type { RenderOptions, Theme } from './types.js';

const W = 450;
const FONT = "-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";
const INK = '#1f2328';
const MUTED = '#59636e';

function frame(height: number, label: string, body: string, opts: RenderOptions = {}): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${height}" viewBox="0 0 ${W} ${height}" role="img" aria-label="${escapeXml(label)}" font-family="${FONT}">
<title>${escapeXml(label)}</title>
<rect x="0.5" y="0.5" width="${W - 1}" height="${height - 1}" rx="12" fill="#ffffff"${opts.hideBorder ? '' : ' stroke="#d0d7de"'}/>
${body}
</svg>`;
}

function avatar(uri: string | null, name: string, cx: number, cy: number, r: number): string {
  if (!uri) {
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#ddf4ff"/>
<text x="${cx}" y="${cy}" dy=".35em" text-anchor="middle" font-size="${Math.round(r * 0.8)}" font-weight="600" fill="#0969da">${escapeXml(initialOf(name))}</text>`;
  }
  return `<clipPath id="avatar"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>
<image href="${uri}" x="${cx - r}" y="${cy - r}" width="${r * 2}" height="${r * 2}" clip-path="url(#avatar)"/>
<circle cx="${cx}" cy="${cy}" r="${r - 0.5}" fill="none" stroke="#1f2328" stroke-opacity=".1"/>`;
}

const oneLine = (text: string, maxWidth: number, fontSize: number) => wrapText(text, { maxWidth, fontSize, maxLines: 1 })[0] ?? '';

/** "1.2K followers  412 following" laid out left to right with the number in bold; gaps shrink to fit. */
function statRow(items: [number, string][], y: number): string {
  const cells = items.map(([value, label]) => {
    const count = formatCount(value);
    return { count, label, width: measure(`${count} ${label}`, 13) };
  });
  const used = cells.reduce((sum, c) => sum + c.width, 0);
  const gap = cells.length > 1 ? Math.max(10, Math.min(24, (W - 48 - used) / (cells.length - 1))) : 0;
  let x = 24;
  return cells
    .map(({ count, label, width }) => {
      const out = `<text x="${Math.round(x)}" y="${y}" font-size="13" fill="${MUTED}"><tspan font-weight="600" fill="${INK}">${count}</tspan> ${label}</text>`;
      x += width + gap;
      return out;
    })
    .join('\n');
}

function renderProfile(p: Profile, avatarUri: string | null, opts: RenderOptions = {}): string {
  const name = oneLine(p.name, p.verified ? 280 : 310, 18);
  const bio = p.bio ? wrapText(p.bio, { maxWidth: W - 48, fontSize: 14, maxLines: 2 }) : [];
  const dividerY = bio.length ? 114 + (bio.length - 1) * 19 + 22 : 100;
  const statsY = dividerY + 25;
  const height = statsY + 17;

  const body = [
    avatar(avatarUri, p.name, 56, 56, 30),
    `<text x="102" y="50" font-size="18" font-weight="600" fill="${INK}">${escapeXml(name)}</text>`,
    p.verified ? checkBadge(102 + measure(name, 18) + 12, 44, '#1d9bf0', '#ffffff') : '',
    `<text x="102" y="72" font-size="14" fill="${MUTED}">@${escapeXml(p.username)}</text>`,
    ...bio.map((line, i) => `<text x="24" y="${114 + i * 19}" font-size="14" fill="${INK}">${escapeXml(line)}</text>`),
    `<line x1="24" x2="${W - 24}" y1="${dividerY + 0.5}" y2="${dividerY + 0.5}" stroke="#d8dee4"/>`,
    statRow(
      [
        [p.posts, 'posts'],
        [p.followers, 'followers'],
        [p.following, 'following'],
      ],
      statsY,
    ),
  ].join('\n');

  return frame(height, `${p.name} (@${p.username}) on X`, body, opts);
}

function renderPost(post: Post, avatarUri: string | null, opts: RenderOptions = {}): string {
  const name = oneLine(post.author.name, 240, 15);
  const lines = wrapText(post.text, { maxWidth: W - 48, fontSize: 16, maxLines: 4 });
  const date = formatDate(post.createdAt, opts.locale);
  const media = mediaSummary(post.media);
  const metrics = metricItems(post);

  let y = lines.length ? 100 + (lines.length - 1) * 24 : 70;
  const mediaY = media ? (y += 24) : 0;
  const dividerY = y + 20;
  const metricsY = dividerY + 25;
  const height = metrics.length ? metricsY + 17 : y + 26;

  const body = [
    avatar(avatarUri, post.author.name, 44, 44, 20),
    `<text x="74" y="40" font-size="15" font-weight="600" fill="${INK}">${escapeXml(name)}</text>`,
    post.author.verified ? checkBadge(74 + measure(name, 15) + 11, 35, '#1d9bf0', '#ffffff') : '',
    `<text x="74" y="59" font-size="13" fill="${MUTED}">@${escapeXml(post.author.username)}${date ? ` · ${date}` : ''}</text>`,
    ...lines.map(
      (line, i) => `<text class="body" x="24" y="${100 + i * 24}" font-size="16" fill="${INK}">${escapeXml(line)}</text>`,
    ),
    media ? `<text x="24" y="${mediaY}" font-size="13" fill="${MUTED}">${media} attached</text>` : '',
    metrics.length
      ? `<line x1="24" x2="${W - 24}" y1="${dividerY + 0.5}" y2="${dividerY + 0.5}" stroke="#d8dee4"/>\n` +
        statRow(
          metrics.map(({ key, value }) => [value, key]),
          metricsY,
        )
      : '',
  ].join('\n');

  return frame(height, `Post by @${post.author.username} on X`, body, opts);
}

/** The author once, then each post as date, text, media and its stat row, separated by hairlines. */
function renderFeed(posts: Post[], avatarUri: string | null, opts: RenderOptions = {}): string {
  const author = posts[0].author;
  const name = oneLine(author.name, 240, 15);
  const parts = [
    avatar(avatarUri, author.name, 44, 44, 20),
    `<text x="74" y="40" font-size="15" font-weight="600" fill="${INK}">${escapeXml(name)}</text>`,
    author.verified ? checkBadge(74 + measure(name, 15) + 11, 35, '#1d9bf0', '#ffffff') : '',
    `<text x="74" y="59" font-size="13" fill="${MUTED}">@${escapeXml(author.username)} · Latest posts</text>`,
  ];

  let y = 78;
  posts.forEach((post) => {
    parts.push(`<line x1="24" x2="${W - 24}" y1="${y + 0.5}" y2="${y + 0.5}" stroke="#d8dee4"/>`);
    const date = formatDate(post.createdAt, opts.locale);
    if (date) {
      y += 24;
      parts.push(`<text x="24" y="${y}" font-size="12" fill="${MUTED}">${escapeXml(date)}</text>`);
    }
    const lines = wrapText(post.text, { maxWidth: W - 48, fontSize: 15, maxLines: 3 });
    lines.forEach((line, i) => {
      y += i === 0 && !date ? 26 : 22;
      parts.push(`<text class="body" x="24" y="${y}" font-size="15" fill="${INK}">${escapeXml(line)}</text>`);
    });
    const media = mediaSummary(post.media);
    if (media) {
      y += 21;
      parts.push(`<text x="24" y="${y}" font-size="13" fill="${MUTED}">${media} attached</text>`);
    }
    const metrics = metricItems(post);
    if (metrics.length) {
      y += 24;
      parts.push(
        statRow(
          metrics.map(({ key, value }) => [value, key]),
          y,
        ),
      );
    }
    y += 18;
  });

  return frame(y + 6, `Latest posts by @${author.username} on X`, parts.join('\n'), opts);
}

function renderError(message: string): string {
  const body = `<text x="${W / 2}" y="54" text-anchor="middle" font-size="15" font-weight="600" fill="${INK}">${escapeXml(message)}</text>
<text x="${W / 2}" y="78" text-anchor="middle" font-size="12" fill="${MUTED}">readme-x-cards</text>`;
  return frame(110, message, body);
}

export const paper: Theme = { name: 'paper', renderProfile, renderPost, renderFeed, renderError };
