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

export type MetricKey = 'replies' | 'reposts' | 'likes' | 'views';

export function metricItems(post: Post): { key: MetricKey; value: number }[] {
  const keys: MetricKey[] = ['replies', 'reposts', 'likes', 'views'];
  return keys.flatMap((key) => {
    const value = post[key];
    return value === undefined ? [] : [{ key, value }];
  });
}
