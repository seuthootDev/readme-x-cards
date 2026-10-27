import type { Post, QuotedPost, Thumbnail } from '../model.js';
import { escapeXml, measure, wrapText } from '../render/text.js';

export function initialOf(name: string): string {
  const first = Array.from(name.trim())[0];
  return first ? first.toUpperCase() : '?';
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function mediaSummary(media: Post['media']): string {
  const parts: string[] = [];
  if (media.photos > 0) parts.push(plural(media.photos, 'photo'));
  if (media.videos > 0) parts.push(plural(media.videos, 'video'));
  return parts.join(' · ');
}

/** A verified check mark centered at (x, y): a circle by default, a square for blockier themes. */
export function checkBadge(x: number, y: number, bg: string, fg: string, square = false): string {
  const shape = square ? `<rect x="-8" y="-8" width="16" height="16" fill="${bg}"/>` : `<circle r="8" fill="${bg}"/>`;
  return `<g transform="translate(${Math.round(x)} ${y})">${shape}<path d="M-3.5 0.2 L-1 2.7 L3.8 -2.4" fill="none" stroke="${fg}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></g>`;
}

export type MetricKey = 'replies' | 'reposts' | 'likes' | 'views';

export function metricItems(post: Post): { key: MetricKey; value: number }[] {
  const keys: MetricKey[] = ['replies', 'reposts', 'likes', 'views'];
  return keys.flatMap((key) => {
    const value = post[key];
    return value === undefined ? [] : [{ key, value }];
  });
}

// Bare domains count as links only with a common TLD, so "Node.js" or "e.g." stay plain text.
const TOKEN =
  /(?<![\w@#])@[A-Za-z0-9_]{1,15}|(?<![\w&#])#[\p{L}\p{N}_]*\p{L}[\p{L}\p{N}_]*|(?<![\w@.])(?:https?:\/\/)?(?:[a-z0-9-]+\.)+(?:com|org|net|io|dev|app|ai|co|xyz|me|gg|so|sh|ly|tv|fm|to|be|link|page|site|blog|news|kr|jp|uk|de|fr|ca|edu|gov)(?![\w-])(?:\/[^\s]*)?/giu;

/** An escaped line of post text with @mentions, #hashtags and links wrapped in tspans of `color`. */
export function richText(line: string, color: string, extra = ''): string {
  let out = '';
  let last = 0;
  for (const m of line.matchAll(TOKEN)) {
    out += escapeXml(line.slice(last, m.index)) + `<tspan fill="${color}"${extra}>${escapeXml(m[0])}</tspan>`;
    last = m.index! + m[0].length;
  }
  return out + escapeXml(line.slice(last));
}

/** Preview height for a `width`-wide slot: the image's own aspect ratio, kept between 120 and 220px. */
export function previewHeight(thumbnail: Thumbnail, width: number): number {
  return Math.round(Math.min(220, Math.max(120, (width * thumbnail.height) / thumbnail.width)));
}

/** The preview image cropped to fill the box, with a play button over video poster frames. */
export function previewImage(
  uri: string,
  thumbnail: Thumbnail,
  box: { x: number; y: number; width: number; height: number; rx: number },
  outline = '',
): string {
  const { x, y, width, height, rx } = box;
  const cx = x + width / 2;
  const cy = y + height / 2;
  const play = thumbnail.video
    ? `\n<circle cx="${cx}" cy="${cy}" r="22" fill="#000000" fill-opacity=".6"/><path d="M${cx - 7} ${cy - 11} L${cx + 11} ${cy} L${cx - 7} ${cy + 11} Z" fill="#ffffff"/>`
    : '';
  return `<clipPath id="preview"><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${rx}"/></clipPath>
<image href="${uri}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" clip-path="url(#preview)"/>${outline ? `\n<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${rx}" fill="none" ${outline}/>` : ''}${play}`;
}

/** The media line is redundant when the preview already shows the post's only photo or video. */
export function mediaLine(post: Post, previewShown: boolean): string {
  return previewShown && post.media.photos + post.media.videos <= 1 ? '' : mediaSummary(post.media);
}

export interface QuoteStyle {
  x: number;
  width: number;
  fontSize: number;
  mono?: boolean;
  ink: string;
  muted: string;
  link: string;
  /** Attributes for the box outline, e.g. `fill="none" stroke="#d0d7de" rx="8"`. */
  box: string;
}

/** A boxed quoted post (author line plus up to two lines of text) starting at `top`; returns its bottom. */
export function quoteBox(quote: QuotedPost, top: number, style: QuoteStyle): { svg: string; bottom: number } {
  const { x, width, fontSize, mono = false, ink, muted, link, box } = style;
  const lineHeight = Math.round(fontSize * 1.4);
  const inner = width - 28;
  const handle = `@${quote.author.username}`;
  const name = wrapText(quote.author.name, { maxWidth: inner - measure(handle, fontSize, mono) - 12, fontSize, maxLines: 1, mono })[0] ?? '';
  const lines = wrapText(quote.text, { maxWidth: inner, fontSize, maxLines: 2, mono });
  const parts = [
    `<text x="${x + 14}" y="${top + 12 + lineHeight}" font-size="${fontSize}" font-weight="700" fill="${ink}">${escapeXml(name)} <tspan font-weight="400" fill="${muted}">${escapeXml(handle)}</tspan></text>`,
    ...lines.map(
      (line, i) =>
        `<text class="quote" x="${x + 14}" y="${top + 12 + lineHeight * (i + 2)}" font-size="${fontSize}" fill="${ink}">${richText(line, link)}</text>`,
    ),
  ];
  const bottom = top + 12 + lineHeight * (lines.length + 1) + Math.round(lineHeight * 0.6);
  return { svg: `<rect x="${x}" y="${top}" width="${width}" height="${bottom - top}" ${box}/>\n${parts.join('\n')}`, bottom };
}

/** "Replying to @name" with the handle in the link color. */
export function replyLine(replyTo: string, x: number, y: number, fontSize: number, muted: string, link: string, label = 'Replying to'): string {
  return `<text x="${x}" y="${y}" font-size="${fontSize}" fill="${muted}">${escapeXml(label)} <tspan fill="${link}">@${escapeXml(replyTo)}</tspan></text>`;
}
