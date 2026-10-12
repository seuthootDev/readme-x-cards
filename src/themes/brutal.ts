import type { Post, Profile } from '../model.js';
import { escapeXml, formatCount, formatDate, measure, wrapText } from '../render/text.js';
import { checkBadge, initialOf, mediaSummary, metricItems } from './shared.js';
import type { Theme } from './types.js';

const W = 450;
const FONT = "'Helvetica Neue',Helvetica,Arial,sans-serif";
const HEAVY = "'Arial Black','Helvetica Neue',Arial,sans-serif";
const INK = '#111111';
const YELLOW = '#ffe14d';
const PINK = '#ff7ab6';
// Arial Black runs about 15% wider than the sans widths measure() assumes.
const HEAVY_SCALE = 1.15;

/** The card is a 438px yellow slab with a hard black shadow offset 6px down-right; it ends at height - 10. */
function frame(height: number, label: string, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${height}" viewBox="0 0 ${W} ${height}" role="img" aria-label="${escapeXml(label)}" font-family="${FONT}">
<title>${escapeXml(label)}</title>
<rect x="8" y="8" width="438" height="${height - 12}" fill="${INK}"/>
<rect x="2" y="2" width="438" height="${height - 12}" fill="${YELLOW}" stroke="${INK}" stroke-width="3"/>
${body}
</svg>`;
}

function avatar(uri: string | null, name: string, x: number, y: number, size: number): string {
  const border = `<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="none" stroke="${INK}" stroke-width="3"/>`;
  if (!uri) {
    return `<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="${PINK}"/>
<text x="${x + size / 2}" y="${y + size / 2}" dy=".36em" text-anchor="middle" font-family="${HEAVY}" font-size="${Math.round(size / 2)}" font-weight="900" fill="${INK}">${escapeXml(initialOf(name))}</text>
${border}`;
  }
  return `<clipPath id="avatar"><rect x="${x}" y="${y}" width="${size}" height="${size}"/></clipPath>
<image href="${uri}" x="${x}" y="${y}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid slice" clip-path="url(#avatar)"/>
${border}`;
}

const heavyLine = (text: string, maxWidth: number, fontSize: number) =>
  wrapText(text.toUpperCase(), { maxWidth: maxWidth / HEAVY_SCALE, fontSize, maxLines: 1 })[0] ?? '';

/** A row of white boxes with their own hard shadows: number on top, label underneath. */
function boxes(items: { value: number; label: string }[], y: number, width: number, height: number, highlight: number) {
  const numberSize = height >= 44 ? 16 : 14;
  return items
    .map(({ value, label }, i) => {
      const x = 20 + i * (width + 10);
      return `<rect x="${x + 3}" y="${y + 3}" width="${width}" height="${height}" fill="${INK}"/>
<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${i === highlight ? PINK : '#ffffff'}" stroke="${INK}" stroke-width="2.5"/>
<text x="${x + 10}" y="${y + height / 2}" font-family="${HEAVY}" font-size="${numberSize}" font-weight="900" fill="${INK}">${formatCount(value)}</text>
<text x="${x + 10}" y="${y + height - 9}" font-size="9" font-weight="700" letter-spacing="1" fill="${INK}">${label}</text>`;
    })
    .join('\n');
}

function renderProfile(p: Profile, avatarUri: string | null): string {
  const name = heavyLine(p.name, p.verified ? 280 : 310, 23);
  const bio = p.bio ? wrapText(p.bio, { maxWidth: 396, fontSize: 14, maxLines: 2 }) : [];
  const boxesY = bio.length ? 114 + (bio.length - 1) * 19 + 18 : 104;
  const height = boxesY + 44 + 26;

  const body = [
    avatar(avatarUri, p.name, 22, 22, 64),
    `<text x="102" y="52" font-family="${HEAVY}" font-size="23" font-weight="900" fill="${INK}">${escapeXml(name)}</text>`,
    p.verified ? checkBadge(102 + measure(name, 23) * HEAVY_SCALE + 14, 44, INK, YELLOW, true) : '',
    `<text x="102" y="76" font-size="15" font-weight="700" fill="${INK}">@${escapeXml(p.username)}</text>`,
    ...bio.map(
      (line, i) => `<text x="22" y="${114 + i * 19}" font-size="14" font-weight="500" fill="${INK}">${escapeXml(line)}</text>`,
    ),
    boxes(
      [
        { value: p.posts, label: 'POSTS' },
        { value: p.followers, label: 'FOLLOWERS' },
        { value: p.following, label: 'FOLLOWING' },
      ],
      boxesY,
      128,
      44,
      1,
    ),
  ].join('\n');

  return frame(height, `${p.name} (@${p.username}) on X`, body);
}

function renderPost(post: Post, avatarUri: string | null): string {
  const date = formatDate(post.createdAt).toUpperCase();
  const name = heavyLine(post.author.name, date ? 220 : 320, 18);
  const lines = wrapText(post.text, { maxWidth: 396, fontSize: 16, maxLines: 4 });
  const media = mediaSummary(post.media);
  const metrics = metricItems(post);

  let y = lines.length ? 102 + (lines.length - 1) * 23 : 66;
  const mediaY = media ? (y += 23) : 0;
  const boxesY = y + 22;
  const height = metrics.length ? boxesY + 40 + 26 : y + 30;

  const body = [
    avatar(avatarUri, post.author.name, 22, 22, 44),
    `<text x="80" y="42" font-family="${HEAVY}" font-size="18" font-weight="900" fill="${INK}">${escapeXml(name)}</text>`,
    post.author.verified ? checkBadge(80 + measure(name, 18) * HEAVY_SCALE + 13, 36, INK, YELLOW, true) : '',
    `<text x="80" y="62" font-size="13" font-weight="700" fill="${INK}">@${escapeXml(post.author.username)}</text>`,
    date
      ? `<rect x="318" y="24" width="102" height="24" fill="${INK}"/>
<text x="369" y="40" text-anchor="middle" font-size="11" font-weight="700" letter-spacing="1" fill="${YELLOW}">${escapeXml(date)}</text>`
      : '',
    ...lines.map(
      (line, i) =>
        `<text class="body" x="22" y="${102 + i * 23}" font-size="16" font-weight="600" fill="${INK}">${escapeXml(line)}</text>`,
    ),
    media ? `<text x="22" y="${mediaY}" font-size="12" font-weight="700" letter-spacing="1" fill="${INK}">+ ${media.toUpperCase()}</text>` : '',
    boxes(
      metrics.map(({ key, value }) => ({ value, label: key.toUpperCase() })),
      boxesY,
      94,
      40,
      metrics.findIndex((m) => m.key === 'likes'),
    ),
  ].join('\n');

  return frame(height, `Post by @${post.author.username} on X`, body);
}

function renderError(message: string): string {
  const body = `<rect x="22" y="22" width="64" height="22" fill="${INK}"/>
<text x="54" y="37" text-anchor="middle" font-size="11" font-weight="700" letter-spacing="1" fill="${YELLOW}">ERROR</text>
<text x="22" y="74" font-family="${HEAVY}" font-size="16" font-weight="900" fill="${INK}">${escapeXml(message)}</text>
<text x="22" y="96" font-size="11" font-weight="700" fill="${INK}">readme-x-cards</text>`;
  return frame(124, message, body);
}

export const brutal: Theme = { name: 'brutal', renderProfile, renderPost, renderError };
