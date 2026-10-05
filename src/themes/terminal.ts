import type { Post, Profile } from '../model.js';
import { escapeXml, formatCount, wrapText } from '../render/text.js';
import { initialOf, mediaSummary, metricItems } from './shared.js';
import type { Theme } from './types.js';

const W = 450;
const MONO = "'JetBrains Mono','SF Mono',Consolas,Menlo,monospace";

function frame(height: number, title: string, label: string, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${height}" viewBox="0 0 ${W} ${height}" role="img" aria-label="${escapeXml(label)}" font-family="${MONO}">
<title>${escapeXml(label)}</title>
<rect x="0.5" y="0.5" width="${W - 1}" height="${height - 1}" rx="10" fill="#0d1117" stroke="#30363d"/>
<path d="M0.5 30.5 V10.5 a10 10 0 0 1 10 -10 H${W - 10.5} a10 10 0 0 1 10 10 V30.5 Z" fill="#161b22"/>
<line x1="0.5" y1="30.5" x2="${W - 0.5}" y2="30.5" stroke="#30363d"/>
<circle cx="18" cy="16" r="5" fill="#ff5f57"/><circle cx="34" cy="16" r="5" fill="#febc2e"/><circle cx="50" cy="16" r="5" fill="#28c840"/>
<text x="${W / 2}" y="20" font-size="11" fill="#8b949e" text-anchor="middle">${escapeXml(title)}</text>
${body}
</svg>`;
}

function avatar(uri: string | null, name: string, x: number, y: number, size: number, rx: number): string {
  if (!uri) {
    return `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${rx}" fill="#21262d"/>
<text x="${x + size / 2}" y="${y + size / 2}" dy=".35em" text-anchor="middle" font-size="${Math.round(size / 2)}" font-weight="700" fill="#79c0ff">${escapeXml(initialOf(name))}</text>`;
  }
  return `<clipPath id="avatar"><rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${rx}"/></clipPath>
<image href="${uri}" x="${x}" y="${y}" width="${size}" height="${size}" clip-path="url(#avatar)"/>`;
}

const oneLine = (text: string, maxWidth: number, fontSize: number) =>
  wrapText(text, { maxWidth, fontSize, maxLines: 1, mono: true })[0] ?? '';

const num = (value: number) => `<tspan fill="#ffa657" font-weight="700">${formatCount(value)}</tspan>`;

function renderProfile(p: Profile, avatarUri: string | null): string {
  const name = oneLine(p.name, p.verified ? 300 : 330, 16);
  const bio = p.bio ? wrapText(p.bio, { maxWidth: W - 48 - 20, fontSize: 12, maxLines: 2, mono: true }) : [];
  const statsY = bio.length ? 134 + (bio.length - 1) * 17 + 26 : 146;
  const height = statsY + 24;

  const body = [
    avatar(avatarUri, p.name, 24, 52, 56, 8),
    `<text x="96" y="62" font-size="12" fill="#7ee787">$ <tspan fill="#c9d1d9">x whoami</tspan></text>`,
    `<text x="96" y="84" font-size="16" font-weight="700" fill="#e6edf3">${escapeXml(name)}${p.verified ? '<tspan fill="#3fb950"> ✓</tspan>' : ''}</text>`,
    `<text x="96" y="104" font-size="13" fill="#79c0ff">@${escapeXml(p.username)}</text>`,
    ...bio.map(
      (line, i) => `<text x="24" y="${134 + i * 17}" font-size="12" fill="#8b949e"># ${escapeXml(line)}</text>`,
    ),
    `<text x="24" y="${statsY}" font-size="13" fill="#8b949e" xml:space="preserve">posts ${num(p.posts)}   followers ${num(p.followers)}   following ${num(p.following)}<tspan fill="#7ee787"> ▌</tspan></text>`,
  ].join('\n');

  return frame(height, `~/x/${p.username}`, `${p.name} (@${p.username}) on X`, body);
}

function renderPost(post: Post, avatarUri: string | null): string {
  const name = oneLine(post.author.name, 200, 13);
  // Media-only posts have no text: skip the quoted line instead of rendering "".
  const lines = post.text.trim()
    ? wrapText(`"${post.text}"`, { maxWidth: W - 48, fontSize: 14, maxLines: 4, mono: true })
    : [];
  const media = mediaSummary(post.media);
  const day = post.createdAt.slice(0, 10);

  let y = lines.length ? 112 + (lines.length - 1) * 20 : 88;
  const mediaY = media ? (y += 22) : 0;
  const statsY = y + 34;
  const height = statsY + 26;

  const stats = metricItems(post)
    .map(({ key, value }) => `${key} <tspan fill="#ffa657">${formatCount(value)}</tspan>`)
    .join('  ');

  const body = [
    avatar(avatarUri, post.author.name, 24, 48, 32, 6),
    `<text x="68" y="61" font-size="13" font-weight="700" fill="#e6edf3">${escapeXml(name)}${post.author.verified ? '<tspan fill="#3fb950"> ✓</tspan>' : ''} <tspan font-weight="400" fill="#79c0ff">@${escapeXml(post.author.username)}</tspan></text>`,
    day ? `<text x="68" y="78" font-size="11" fill="#8b949e">// ${escapeXml(day)}</text>` : '',
    ...lines.map(
      (line, i) =>
        `<text class="body" x="24" y="${112 + i * 20}" font-size="14" fill="#a5d6ff">${escapeXml(line)}</text>`,
    ),
    media ? `<text x="24" y="${mediaY}" font-size="12" fill="#8b949e">[${media}]</text>` : '',
    `<text x="24" y="${statsY}" font-size="12" fill="#8b949e" xml:space="preserve">${stats}</text>`,
  ].join('\n');

  return frame(height, `post/${post.id}`, `Post by @${post.author.username} on X`, body);
}

function renderError(message: string): string {
  const body = `<text x="24" y="62" font-size="13" fill="#7ee787">$ <tspan fill="#c9d1d9">x card</tspan></text>
<text x="24" y="86" font-size="13" fill="#ff7b72">error: ${escapeXml(message)}</text>`;
  return frame(110, 'error', message, body);
}

export const terminal: Theme = { name: 'terminal', renderProfile, renderPost, renderError };
