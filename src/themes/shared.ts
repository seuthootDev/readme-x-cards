import type { Post } from '../model.js';

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
