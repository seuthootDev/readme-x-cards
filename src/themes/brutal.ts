import type { Post, Profile } from '../model.js';
import { escapeXml, formatCount, formatDate, measure, wrapText } from '../render/text.js';
import {
  checkBadge,
  initialOf,
  mediaLine,
  mediaSummary,
  metricItems,
  previewHeight,
  previewImage,
  quoteBox,
  replyLine,
  richText,
} from './shared.js';
import type { RenderOptions, Theme } from './types.js';

const W = 450;
const FONT = "'Helvetica Neue',Helvetica,Arial,sans-serif";
const HEAVY = "'Arial Black','Helvetica Neue',Arial,sans-serif";
const INK = '#111111';
const YELLOW = '#ffe14d';
const PINK = '#ff7ab6';
const LINK = '#1b3bff';
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

/** Room for an 18px heavy name starting at x=80 that must end, badge included, before a tag at `tagX`. */
const nameRoom = (tagX: number, verified: boolean) => Math.min(220, tagX - 80 - (verified ? 36 : 12));

/** A black tag ending at x=420, at least 102px wide and wider for long localized dates. */
function tag(text: string, y: number): { svg: string; x: number } {
  const width = Math.max(102, Math.ceil(measure(text, 11) + text.length + 9));
  const x = 420 - width;
  return {
    x,
    svg: `<rect x="${x}" y="${y}" width="${width}" height="24" fill="${INK}"/>
<text x="${x + width / 2}" y="${y + 16}" text-anchor="middle" font-size="11" font-weight="700" letter-spacing="1" fill="${YELLOW}">${escapeXml(text)}</text>`,
  };
}

function renderPost(post: Post, avatarUri: string | null, opts: RenderOptions = {}, thumbnailUri: string | null = null): string {
  const date = formatDate(post.createdAt, opts.locale).toUpperCase();
  const dateTag = date ? tag(date, 24) : null;
  const name = heavyLine(post.author.name, dateTag ? nameRoom(dateTag.x, post.author.verified) : 320, 18);
  const lines = wrapText(post.text, { maxWidth: 396, fontSize: 16, maxLines: 4 });
  const preview = thumbnailUri ? post.thumbnail : undefined;
  const media = mediaLine(post, Boolean(preview));
  const metrics = metricItems(post);

  const textY = post.replyTo ? 124 : 102;
  let y = lines.length ? textY + (lines.length - 1) * 23 : textY - 36;
  const mediaY = media ? (y += 23) : 0;
  const blocks: string[] = [];
  if (preview) {
    const box = { x: 22, y: y + 16, width: 396, height: previewHeight(preview, 396), rx: 0 };
    blocks.push(
      `<rect x="${box.x + 4}" y="${box.y + 4}" width="${box.width}" height="${box.height}" fill="${INK}"/>`,
      previewImage(thumbnailUri!, preview, box, `stroke="${INK}" stroke-width="3"`),
    );
    y = box.y + box.height + 4;
  }
  if (post.quote) {
    const top = y + 14;
    const quote = quoteBox(post.quote, top, {
      x: 22,
      width: 396,
      fontSize: 13,
      ink: INK,
      muted: INK,
      link: LINK,
      box: `fill="#ffffff" stroke="${INK}" stroke-width="2.5"`,
    });
    blocks.push(`<rect x="25" y="${top + 3}" width="396" height="${quote.bottom - top}" fill="${INK}"/>`, quote.svg);
    y = quote.bottom + 3;
  }
  const boxesY = y + 22;
  const height = metrics.length ? boxesY + 40 + 26 : y + 30;

  const body = [
    avatar(avatarUri, post.author.name, 22, 22, 44),
    `<text x="80" y="42" font-family="${HEAVY}" font-size="18" font-weight="900" fill="${INK}">${escapeXml(name)}</text>`,
    post.author.verified ? checkBadge(80 + measure(name, 18) * HEAVY_SCALE + 13, 36, INK, YELLOW, true) : '',
    `<text x="80" y="62" font-size="13" font-weight="700" fill="${INK}">@${escapeXml(post.author.username)}</text>`,
    dateTag?.svg ?? '',
    ...(post.replyTo ? [replyLine(post.replyTo, 22, 94, 12, INK, LINK, 'REPLYING TO')] : []),
    ...lines.map(
      (line, i) =>
        `<text class="body" x="22" y="${textY + i * 23}" font-size="16" font-weight="600" fill="${INK}">${richText(line, LINK)}</text>`,
    ),
    media ? `<text x="22" y="${mediaY}" font-size="12" font-weight="700" letter-spacing="1" fill="${INK}">+ ${media.toUpperCase()}</text>` : '',
    ...blocks,
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

/** The author once, then each post in its own white slab with a hard shadow. */
function renderFeed(posts: Post[], avatarUri: string | null, opts: RenderOptions = {}): string {
  const author = posts[0].author;
  const latest = tag('LATEST', 24);
  const name = heavyLine(author.name, nameRoom(latest.x, author.verified), 18);
  const parts = [
    avatar(avatarUri, author.name, 22, 22, 44),
    `<text x="80" y="42" font-family="${HEAVY}" font-size="18" font-weight="900" fill="${INK}">${escapeXml(name)}</text>`,
    author.verified ? checkBadge(80 + measure(name, 18) * HEAVY_SCALE + 13, 36, INK, YELLOW, true) : '',
    `<text x="80" y="62" font-size="13" font-weight="700" fill="${INK}">@${escapeXml(author.username)}</text>`,
    latest.svg,
  ];

  let y = 84;
  for (const post of posts) {
    const top = y;
    const content: string[] = [];
    const date = formatDate(post.createdAt, opts.locale).toUpperCase();
    if (date) {
      y += 22;
      content.push(`<text x="36" y="${y}" font-size="10" font-weight="700" letter-spacing="1" fill="${INK}">${escapeXml(date)}</text>`);
    }
    const lines = wrapText(post.text, { maxWidth: 368, fontSize: 15, maxLines: 3 });
    lines.forEach((line, i) => {
      y += i === 0 ? (date ? 22 : 26) : 21;
      content.push(`<text class="body" x="36" y="${y}" font-size="15" font-weight="600" fill="${INK}">${richText(line, LINK)}</text>`);
    });
    const media = mediaSummary(post.media);
    if (media) {
      y += 20;
      content.push(`<text x="36" y="${y}" font-size="11" font-weight="700" letter-spacing="1" fill="${INK}">+ ${media.toUpperCase()}</text>`);
    }
    const metrics = metricItems(post)
      .map(({ key, value }) => `${formatCount(value)} ${key.toUpperCase()}`)
      .join('   ');
    if (metrics) {
      y += 22;
      content.push(`<text x="36" y="${y}" font-size="10" font-weight="700" letter-spacing=".5" fill="${INK}" xml:space="preserve">${metrics}</text>`);
    }
    y = Math.max(y + 14, top + 30);
    parts.push(
      `<rect x="25" y="${top + 3}" width="396" height="${y - top}" fill="${INK}"/>
<rect x="22" y="${top}" width="396" height="${y - top}" fill="#ffffff" stroke="${INK}" stroke-width="2.5"/>`,
      ...content,
    );
    y += 14;
  }

  return frame(y + 16, `Latest posts by @${author.username} on X`, parts.join('\n'));
}

function renderError(message: string): string {
  const body = `<rect x="22" y="22" width="64" height="22" fill="${INK}"/>
<text x="54" y="37" text-anchor="middle" font-size="11" font-weight="700" letter-spacing="1" fill="${YELLOW}">ERROR</text>
<text x="22" y="74" font-family="${HEAVY}" font-size="16" font-weight="900" fill="${INK}">${escapeXml(message)}</text>
<text x="22" y="96" font-size="11" font-weight="700" fill="${INK}">readme-x-cards</text>`;
  return frame(124, message, body);
}

export const brutal: Theme = { name: 'brutal', renderProfile, renderPost, renderFeed, renderError };
