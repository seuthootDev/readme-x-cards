import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchPost, syndicationToken } from '../src/fetchers/syndication.js';
import synPost from './fixtures/syn-post.json' with { type: 'json' };
import { htmlResponse, jsonResponse, mockFetch } from './helpers.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('syndicationToken', () => {
  it('produces a non-empty base36 token without zeros or dots', () => {
    const token = syndicationToken('2094701798535885304');
    expect(token).toMatch(/^[1-9a-z]+$/);
  });
});

describe('syndication fetchPost', () => {
  it('maps the tweet to a Post', async () => {
    const fetchMock = mockFetch(() => jsonResponse(synPost));
    await expect(fetchPost('20')).resolves.toEqual({
      id: '20',
      url: 'https://x.com/jack/status/20',
      text: 'just setting up my twttr',
      createdAt: '2006-03-21T20:50:14.000Z',
      author: {
        username: 'jack',
        name: 'jack',
        avatarUrl: 'https://pbs.twimg.com/profile_images/1661201415899951105/azNjKOSH_200x200.jpg',
        verified: true,
      },
      replies: 18072,
      reposts: undefined,
      likes: 308841,
      views: undefined,
      media: { photos: 0, videos: 0 },
    });
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url.startsWith('https://cdn.syndication.twimg.com/tweet-result?id=20&lang=en&token=')).toBe(true);
  });

  it('cuts trailing media links using display_text_range (UTF-16) and decodes entities', async () => {
    mockFetch(() =>
      jsonResponse({
        ...synPost,
        // Indices count the decoded text: "Tom & Jerry <3 " is 15 units, 👋 is 2.
        text: 'Tom &amp; Jerry &lt;3 👋 https://t.co/abc',
        display_text_range: [0, 17],
        mediaDetails: [{ type: 'photo' }, { type: 'video' }, { type: 'animated_gif' }],
      }),
    );
    await expect(fetchPost('20')).resolves.toMatchObject({
      text: 'Tom & Jerry <3 👋',
      media: { photos: 1, videos: 2 },
    });
  });

  it('treats tombstones as NOT_FOUND', async () => {
    mockFetch(() => jsonResponse({ __typename: 'TweetTombstone' }));
    await expect(fetchPost('20')).rejects.toMatchObject({ kind: 'NOT_FOUND', message: 'Post not found' });
  });

  it('treats a 404 HTML page as NOT_FOUND', async () => {
    mockFetch(() => htmlResponse(404));
    await expect(fetchPost('1')).rejects.toMatchObject({ kind: 'NOT_FOUND' });
  });
});
