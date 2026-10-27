import type { Post, Profile } from '../model.js';
import { escapeXml, formatCount, formatDate, measure, wrapText } from '../render/text.js';
import { checkBadge, initialOf, mediaSummary, metricItems } from './shared.js';
import type { RenderOptions, Theme } from './types.js';

const W = 450;
const FONT = "'Trebuchet MS','Segoe UI',Helvetica,Arial,sans-serif";
const NIGHT = '#140a2e';
const CYAN = '#5ef2ff';
const PINK = '#ffb3d1';

/**
 * A synthwave sky: a striped sun of radius `sunR` sitting on the horizon at `horizon`, centered at `sunX`,
 * and a perspective grid on the ground below it. Text above the horizon must stay clear of the sun.
 */
function frame(height: number, horizon: number, sunX: number, sunR: number, label: string, body: string): string {
  const grid: string[] = [];
  for (let i = 1; ; i++) {
    const y = horizon + Math.pow(i, 1.7) * 4;
    if (y >= height) break;
    grid.push(`<line x1="0" x2="${W}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}"/>`);
  }
  for (let k = -9; k <= 9; k++) {
    grid.push(`<line x1="${W / 2 + k * 22}" y1="${horizon}" x2="${W / 2 + k * 110}" y2="${height}"/>`);
  }
  const stripes: string[] = [];
  for (let i = 0; i < 6; i++) {
    const y = horizon - sunR * 0.55 + i * (sunR * 0.1 + i * 1.2);
    stripes.push(`<rect x="0" y="${y.toFixed(1)}" width="${W}" height="${(1.5 + i * 1.1).toFixed(1)}" fill="#000000"/>`);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${height}" viewBox="0 0 ${W} ${height}" role="img" aria-label="${escapeXml(label)}" font-family="${FONT}">
<title>${escapeXml(label)}</title>
<defs>
<clipPath id="card"><rect width="${W}" height="${height}" rx="16"/></clipPath>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${NIGHT}"/><stop offset="1" stop-color="#4b1260"/></linearGradient>
<linearGradient id="sun" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd36e"/><stop offset="1" stop-color="#ff4f8b"/></linearGradient>
<mask id="stripes"><rect width="${W}" height="${height}" fill="#ffffff"/>${stripes.join('')}</mask>
</defs>
<g clip-path="url(#card)">
<rect width="${W}" height="${height}" fill="url(#sky)"/>
<circle cx="${sunX}" cy="${horizon}" r="${sunR}" fill="url(#sun)" mask="url(#stripes)"/>
<rect y="${horizon}" width="${W}" height="${height - horizon}" fill="#12061f"/>
<g stroke="#ff4f8b" stroke-opacity=".4" stroke-width="1">${grid.join('')}</g>
<line x1="0" x2="${W}" y1="${horizon}" y2="${horizon}" stroke="#ff8fb8" stroke-width="1.5"/>
</g>
${body}
</svg>`;
}

function avatar(uri: string | null, name: string, cx: number, cy: number, r: number): string {
  const ring = `<circle cx="${cx}" cy="${cy}" r="${r + 3}" fill="none" stroke="${CYAN}" stroke-width="2"/>`;
  if (!uri) {
    return `${ring}
<circle cx="${cx}" cy="${cy}" r="${r}" fill="#2a0f45"/>
<text x="${cx}" y="${cy}" dy=".35em" text-anchor="middle" font-size="${Math.round(r * 0.85)}" font-weight="700" fill="${CYAN}">${escapeXml(initialOf(name))}</text>`;
  }
  return `${ring}
<clipPath id="avatar"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>
<image href="${uri}" x="${cx - r}" y="${cy - r}" width="${r * 2}" height="${r * 2}" clip-path="url(#avatar)"/>`;
}

const oneLine = (text: string, maxWidth: number, fontSize: number) => wrapText(text, { maxWidth, fontSize, maxLines: 1 })[0] ?? '';

/** "1.2K POSTS  3.2K FOLLOWERS" on the grid floor: cyan numbers, small pink labels. Gaps shrink to fit. */
function statRow(items: { value: number; label: string }[], y: number, size: number): string {
  const labelSize = size - 4;
  const cells = items.map(({ value, label }) => {
    const count = formatCount(value);
    return { count, label, width: measure(count, size) + 5 + measure(label, labelSize) + label.length };
  });
  const used = cells.reduce((sum, c) => sum + c.width, 0);
  const gap = cells.length > 1 ? Math.max(10, Math.min(26, (W - 48 - used) / (cells.length - 1))) : 0;
  let x = 24;
  return cells
    .map(({ count, label, width }) => {
      const out = `<text x="${Math.round(x)}" y="${y}" font-size="${labelSize}" letter-spacing="1" fill="${PINK}"><tspan font-size="${size}" font-weight="700" letter-spacing="0" fill="${CYAN}">${count}</tspan> ${label}</text>`;
      x += width + gap;
      return out;
    })
    .join('\n');
}

function renderProfile(p: Profile, avatarUri: string | null): string {
  const name = oneLine(p.name, p.verified ? 170 : 190, 21);
  // The sun sits right of x≈290, so the bio stays in the left 265px.
  const bio = p.bio ? wrapText(p.bio, { maxWidth: 265, fontSize: 13, maxLines: 2 }) : [];
  const lastY = bio.length ? 110 + (bio.length - 1) * 18 : 73;
  const horizon = lastY + 24;
  const statsY = horizon + 34;
  const height = statsY + 18;

  const body = [
    avatar(avatarUri, p.name, 54, 54, 29),
    `<text x="100" y="50" font-size="21" font-weight="700" font-style="italic" fill="#ffffff">${escapeXml(name)}</text>`,
    p.verified ? checkBadge(100 + measure(name, 21) + 14, 43, CYAN, NIGHT) : '',
    `<text x="100" y="73" font-size="14" fill="${PINK}">@${escapeXml(p.username)}</text>`,
    ...bio.map(
      (line, i) =>
        `<text x="24" y="${110 + i * 18}" font-size="13" fill="#f3e8ff" fill-opacity=".88">${escapeXml(line)}</text>`,
    ),
    statRow(
      [
        { value: p.posts, label: 'POSTS' },
        { value: p.followers, label: 'FOLLOWERS' },
        { value: p.following, label: 'FOLLOWING' },
      ],
      statsY,
      15,
    ),
  ].join('\n');

  return frame(height, horizon, 358, 66, `${p.name} (@${p.username}) on X`, body);
}

function renderPost(post: Post, avatarUri: string | null, opts: RenderOptions = {}): string {
  const name = oneLine(post.author.name, 220, 15);
  // Lines stop at x≈344 so the last one clears the sun at the right edge.
  const lines = wrapText(post.text, { maxWidth: 320, fontSize: 16, maxLines: 4 });
  const date = formatDate(post.createdAt, opts.locale);
  const media = mediaSummary(post.media);
  const metrics = metricItems(post);

  let y = lines.length ? 100 + (lines.length - 1) * 23 : 59;
  const mediaY = media ? (y += 22) : 0;
  const horizon = y + 32;
  const metricsY = horizon + 32;
  const height = metrics.length ? metricsY + 18 : horizon + 30;

  const body = [
    avatar(avatarUri, post.author.name, 44, 44, 18),
    `<text x="74" y="40" font-size="15" font-weight="700" font-style="italic" fill="#ffffff">${escapeXml(name)}</text>`,
    post.author.verified ? checkBadge(74 + measure(name, 15) + 11, 35, CYAN, NIGHT) : '',
    `<text x="74" y="59" font-size="13" fill="${PINK}">@${escapeXml(post.author.username)}${date ? ` · ${date}` : ''}</text>`,
    ...lines.map(
      (line, i) => `<text class="body" x="24" y="${100 + i * 23}" font-size="16" fill="#ffffff">${escapeXml(line)}</text>`,
    ),
    media ? `<text x="24" y="${mediaY}" font-size="12" fill="${PINK}">+ ${media}</text>` : '',
    statRow(
      metrics.map(({ key, value }) => ({ value, label: key.toUpperCase() })),
      metricsY,
      14,
    ),
  ].join('\n');

  return frame(height, horizon, 392, 46, `Post by @${post.author.username} on X`, body);
}

/** Posts stacked in the sky, then a strip of grid floor; every line stays left of the sun on the right. */
function renderFeed(posts: Post[], avatarUri: string | null, opts: RenderOptions = {}): string {
  const author = posts[0].author;
  const name = oneLine(author.name, 220, 15);
  const parts = [
    avatar(avatarUri, author.name, 44, 44, 18),
    `<text x="74" y="40" font-size="15" font-weight="700" font-style="italic" fill="#ffffff">${escapeXml(name)}</text>`,
    author.verified ? checkBadge(74 + measure(name, 15) + 11, 35, CYAN, NIGHT) : '',
    `<text x="74" y="59" font-size="13" fill="${PINK}">@${escapeXml(author.username)} · LATEST POSTS</text>`,
  ];

  let y = 76;
  posts.forEach((post, i) => {
    if (i > 0) parts.push(`<line x1="24" x2="330" y1="${y + 0.5}" y2="${y + 0.5}" stroke="${PINK}" stroke-opacity=".3"/>`);
    const lines = wrapText(post.text, { maxWidth: 320, fontSize: 15, maxLines: 3 });
    lines.forEach((line, j) => {
      y += j === 0 ? 24 : 21;
      parts.push(`<text class="body" x="24" y="${y}" font-size="15" fill="#ffffff">${escapeXml(line)}</text>`);
    });
    const media = mediaSummary(post.media);
    if (media) {
      y += lines.length ? 20 : 24;
      parts.push(`<text x="24" y="${y}" font-size="12" fill="${PINK}">+ ${media}</text>`);
    }
    const date = formatDate(post.createdAt, opts.locale);
    const metrics = metricItems(post)
      .map(({ key, value }) => `<tspan fill="${CYAN}" font-weight="700">${formatCount(value)}</tspan> ${key.toUpperCase()}`)
      .join('  ');
    const meta = [date ? escapeXml(date) : '', metrics].filter(Boolean).join('   ');
    if (meta) {
      y += lines.length || media ? 21 : 24;
      parts.push(`<text x="24" y="${y}" font-size="11" letter-spacing=".5" fill="${PINK}" xml:space="preserve">${meta}</text>`);
    }
    y += 16;
  });

  const horizon = y + 10;
  return frame(horizon + 44, horizon, 392, 40, `Latest posts by @${author.username} on X`, parts.join('\n'));
}

function renderError(message: string): string {
  const text = oneLine(message, 300, 15);
  const body = `<text x="24" y="42" font-size="15" font-weight="700" font-style="italic" fill="#ffffff">${escapeXml(text)}</text>
<text x="24" y="64" font-size="12" fill="${PINK}">readme-x-cards</text>`;
  return frame(120, 86, 380, 40, message, body);
}

export const sunset: Theme = { name: 'sunset', renderProfile, renderPost, renderFeed, renderError };
