import { describe, expect, it } from 'vitest';
import { buildCardUrl, buildSnippets, linkFor, parseInput } from '../public/parse-input.js';

describe('parseInput', () => {
  it.each([
    ['Seuthoot', { type: 'user', username: 'Seuthoot' }],
    ['@Seuthoot', { type: 'user', username: 'Seuthoot' }],
    ['  Seuthoot  ', { type: 'user', username: 'Seuthoot' }],
    ['https://x.com/Seuthoot', { type: 'user', username: 'Seuthoot' }],
    ['x.com/Seuthoot/', { type: 'user', username: 'Seuthoot' }],
    ['https://twitter.com/Seuthoot?lang=ko', { type: 'user', username: 'Seuthoot' }],
    ['https://mobile.twitter.com/Seuthoot', { type: 'user', username: 'Seuthoot' }],
    ['https://www.x.com/Seuthoot', { type: 'user', username: 'Seuthoot' }],
    [
      'https://x.com/Seuthoot/status/2094701798535885304',
      { type: 'post', username: 'Seuthoot', id: '2094701798535885304' },
    ],
    ['https://x.com/jack/status/20?s=20&t=abc', { type: 'post', username: 'jack', id: '20' }],
    ['https://twitter.com/jack/statuses/20', { type: 'post', username: 'jack', id: '20' }],
    ['https://x.com/jack/status/20/photo/1', { type: 'post', username: 'jack', id: '20' }],
  ])('parses %j', (input, expected) => {
    expect(parseInput(input)).toEqual(expected);
  });

  it.each(['', '   ', 'a-b', 'https://x.com/home', 'https://x.com/i/bookmarks', 'https://example.com/jack', 'way_too_long_username'])(
    'rejects %j',
    (input) => {
      expect(parseInput(input)).toBeNull();
    },
  );
});

describe('buildCardUrl', () => {
  const origin = 'https://cards.example.com';
  it('builds profile, latest and post URLs', () => {
    expect(buildCardUrl(origin, { kind: 'profile', username: 'Seuthoot', theme: 'aurora' })).toBe(
      'https://cards.example.com/api/profile?user=Seuthoot&theme=aurora',
    );
    expect(buildCardUrl(origin, { kind: 'latest', username: 'Seuthoot', index: 2, theme: 'terminal' })).toBe(
      'https://cards.example.com/api/post?user=Seuthoot&index=2&theme=terminal',
    );
    expect(buildCardUrl(origin, { kind: 'post', id: '20', theme: 'aurora' })).toBe(
      'https://cards.example.com/api/post?id=20&theme=aurora',
    );
  });
});

describe('linkFor', () => {
  it('links profiles and latest posts to the profile, posts to the post', () => {
    expect(linkFor({ kind: 'profile', username: 'Seuthoot', theme: 'aurora' })).toBe('https://x.com/Seuthoot');
    expect(linkFor({ kind: 'latest', username: 'Seuthoot', index: 1, theme: 'aurora' })).toBe('https://x.com/Seuthoot');
    expect(linkFor({ kind: 'post', id: '20', username: 'jack', theme: 'aurora' })).toBe('https://x.com/jack/status/20');
    expect(linkFor({ kind: 'post', id: '20', theme: 'aurora' })).toBe('https://x.com/i/status/20');
  });
});

describe('buildSnippets', () => {
  it('builds markdown and html that link the card to X', () => {
    const s = buildSnippets('https://cards.example.com/api/profile?user=Seuthoot&theme=aurora', 'https://x.com/Seuthoot', 'X profile');
    expect(s.markdown).toBe(
      '[![X profile](https://cards.example.com/api/profile?user=Seuthoot&theme=aurora)](https://x.com/Seuthoot)',
    );
    expect(s.html).toBe(
      '<a href="https://x.com/Seuthoot"><img src="https://cards.example.com/api/profile?user=Seuthoot&amp;theme=aurora" alt="X profile" width="450"></a>',
    );
  });
});
