import type { Post, Profile } from '../model.js';
import { escapeXml, formatCount, formatDate, measure, wrapText } from '../render/text.js';
import { initialOf, mediaSummary, metricItems, type MetricKey } from './shared.js';
import type { Theme } from './types.js';

const W = 450;
const FONT = "-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";
const ICONS: Record<MetricKey, string> = { replies: '💬', reposts: '🔁', likes: '♡', views: '👁' };

function frame(height: number, label: string, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${height}" viewBox="0 0 ${W} ${height}" role="img" aria-label="${escapeXml(label)}" font-family="${FONT}">
<title>${escapeXml(label)}</title>
<defs>
<clipPath id="card"><rect width="${W}" height="${height}" rx="18"/></clipPath>
<radialGradient id="g1" cx="15%" cy="10%" r="70%"><stop offset="0" stop-color="#7c3aed"/><stop offset="1" stop-color="#7c3aed" stop-opacity="0"/></radialGradient>
<radialGradient id="g2" cx="95%" cy="100%" r="70%"><stop offset="0" stop-color="#06b6d4"/><stop offset="1" stop-color="#06b6d4" stop-opacity="0"/></radialGradient>
<radialGradient id="g3" cx="70%" cy="0%" r="50%"><stop offset="0" stop-color="#ec4899" stop-opacity=".8"/><stop offset="1" stop-color="#ec4899" stop-opacity="0"/></radialGradient>
</defs>
<g clip-path="url(#card)">
<rect width="${W}" height="${height}" fill="#0b0b14"/>
<rect width="${W}" height="${height}" fill="url(#g1)"/>
<rect width="${W}" height="${height}" fill="url(#g2)"/>
<rect width="${W}" height="${height}" fill="url(#g3)"/>
<rect x="12" y="12" width="${W - 24}" height="${height - 24}" rx="14" fill="#ffffff" fill-opacity=".08" stroke="#ffffff" stroke-opacity=".18"/>
</g>
${body}
</svg>`;
}

function avatar(uri: string | null, name: string, cx: number, cy: number, r: number): string {
  if (!uri) {
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#ffffff" fill-opacity=".16"/>
<text x="${cx}" y="${cy}" dy=".35em" text-anchor="middle" font-size="${r}" font-weight="700" fill="#ffffff">${escapeXml(initialOf(name))}</text>`;
  }
  return `<clipPath id="avatar"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>
<image href="${uri}" x="${cx - r}" y="${cy - r}" width="${r * 2}" height="${r * 2}" clip-path="url(#avatar)"/>`;
}

function badge(x: number, y: number): string {
  return `<g transform="translate(${Math.round(x)} ${y})"><circle r="8" fill="#1d9bf0"/><path d="M-3.5 0.2 L-1 2.7 L3.8 -2.4" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></g>`;
}

const oneLine = (text: string, maxWidth: number, fontSize: number) => wrapText(text, { maxWidth, fontSize, maxLines: 1 })[0] ?? '';

function renderProfile(p: Profile, avatarUri: string | null): string {
  const name = oneLine(p.name, 280, 20);
  const bio = p.bio ? wrapText(p.bio, { maxWidth: W - 56, fontSize: 13, maxLines: 2 }) : [];
  const pillsY = bio.length ? 116 + (bio.length - 1) * 18 + 16 : 114;
  const height = pillsY + 56;

  const pills: [number, string, number][] = [
    [p.posts, 'Posts', 110],
    [p.followers, 'Followers', 130],
    [p.following, 'Following', 130],
  ];
  let x = 28;
  const pillSvg = pills
    .map(([value, label, w]) => {
      const out = `<rect x="${x}" y="${pillsY}" width="${w}" height="30" rx="15" fill="#ffffff" fill-opacity=".12"/>
<text x="${x + w / 2}" y="${pillsY + 20}" text-anchor="middle" font-size="13" fill="#ffffff"><tspan font-weight="700">${formatCount(value)}</tspan> <tspan fill-opacity=".7">${label}</tspan></text>`;
      x += w + 10;
      return out;
    })
    .join('\n');

  const body = [
    `<circle cx="58" cy="58" r="36" fill="none" stroke="#ffffff" stroke-opacity=".5" stroke-width="2"/>`,
    avatar(avatarUri, p.name, 58, 58, 34),
    `<text x="110" y="52" font-size="20" font-weight="700" fill="#ffffff">${escapeXml(name)}</text>`,
    p.verified ? badge(110 + measure(name, 20) + 14, 45) : '',
    `<text x="110" y="75" font-size="14" fill="#ffffff" fill-opacity=".65">@${escapeXml(p.username)}</text>`,
    ...bio.map(
      (line, i) =>
        `<text x="28" y="${116 + i * 18}" font-size="13" fill="#ffffff" fill-opacity=".85">${escapeXml(line)}</text>`,
    ),
    pillSvg,
  ].join('\n');

  return frame(height, `${p.name} (@${p.username}) on X`, body);
}

function renderPost(post: Post, avatarUri: string | null): string {
  const name = oneLine(post.author.name, 220, 15);
  const lines = wrapText(post.text, { maxWidth: W - 56, fontSize: 17, maxLines: 4 });
  const date = formatDate(post.createdAt);
  const media = mediaSummary(post.media);

  let y = lines.length ? 102 + (lines.length - 1) * 24 : 78;
  const mediaY = media ? (y += 24) : 0;
  const metricsY = y + 36;
  const height = metricsY + 34;

  let mx = 28;
  const metrics = metricItems(post)
    .map(({ key, value }) => {
      const text = `${ICONS[key]} ${formatCount(value)}`;
      const out = `<text x="${mx}" y="${metricsY}" font-size="13" fill="#ffffff" fill-opacity=".75">${text}</text>`;
      mx += Math.round(measure(text, 13)) + 22;
      return out;
    })
    .join('\n');

  const body = [
    avatar(avatarUri, post.author.name, 46, 46, 20),
    `<text x="78" y="42" font-size="15" font-weight="700" fill="#ffffff">${escapeXml(name)}</text>`,
    post.author.verified ? badge(78 + measure(name, 15) + 12, 37) : '',
    `<text x="78" y="61" font-size="13" fill="#ffffff" fill-opacity=".6">@${escapeXml(post.author.username)}${date ? ` · ${date}` : ''}</text>`,
    ...lines.map(
      (line, i) =>
        `<text class="body" x="28" y="${102 + i * 24}" font-size="17" fill="#ffffff">${escapeXml(line)}</text>`,
    ),
    media ? `<text x="28" y="${mediaY}" font-size="12" fill="#ffffff" fill-opacity=".6">📎 ${media}</text>` : '',
    metrics,
  ].join('\n');

  return frame(height, `Post by @${post.author.username} on X`, body);
}

function renderError(message: string): string {
  const body = `<text x="${W / 2}" y="58" text-anchor="middle" font-size="16" font-weight="600" fill="#ffffff">⚠ ${escapeXml(message)}</text>
<text x="${W / 2}" y="82" text-anchor="middle" font-size="12" fill="#ffffff" fill-opacity=".5">readme-x-cards</text>`;
  return frame(110, message, body);
}

export const aurora: Theme = { name: 'aurora', renderProfile, renderPost, renderError };
