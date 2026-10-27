import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchLatestPost, fetchLatestPosts, fetchPost, fetchProfile } from '../src/fetchers/fxtwitter.js';
import { largeAvatar } from '../src/fetchers/shared.js';
import fxProfile from './fixtures/fx-profile.json' with { type: 'json' };
import fxStatuses from './fixtures/fx-statuses.json' with { type: 'json' };
import fxPost from './fixtures/fx-post.json' with { type: 'json' };
import { htmlResponse, jsonResponse, mockFetch } from './helpers.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('largeAvatar', () => {
  it('upgrades _normal avatars to 200x200', () => {
    expect(largeAvatar('https://pbs.twimg.com/profile_images/1/a_normal.jpg')).toBe(
      'https://pbs.twimg.com/profile_images/1/a_200x200.jpg',
    );
  });
  it('leaves other URLs alone and handles missing values', () => {
    expect(largeAvatar('https://pbs.twimg.com/profile_images/1/a_200x200.jpg')).toBe(
      'https://pbs.twimg.com/profile_images/1/a_200x200.jpg',
    );
    expect(largeAvatar(null)).toBe('');
  });
});

describe('fetchProfile', () => {
  it('maps the fxtwitter user to a Profile', async () => {
    const fetchMock = mockFetch(() => jsonResponse(fxProfile));
    await expect(fetchProfile('Seuthoot')).resolves.toEqual({
      username: 'Seuthoot',
      name: 'Seunghoon Jung',
      avatarUrl: 'https://pbs.twimg.com/profile_images/2094700677599825920/2O5dxII5_200x200.jpg',
      bio: '',
      verified: false,
      followers: 0,
      following: 0,
      posts: 1,
    });
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.fxtwitter.com/Seuthoot');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: 'manual' });
  });

  it('treats a redirect (unknown user) as NOT_FOUND', async () => {
    mockFetch(() => htmlResponse(302));
    await expect(fetchProfile('nobody_here')).rejects.toMatchObject({ kind: 'NOT_FOUND', message: 'User not found' });
  });

  it('treats a 200 HTML page as NOT_FOUND', async () => {
    mockFetch(() => htmlResponse(200));
    await expect(fetchProfile('nobody_here')).rejects.toMatchObject({ kind: 'NOT_FOUND' });
  });

  it('treats a JSON error code as NOT_FOUND', async () => {
    mockFetch(() => jsonResponse({ code: 404, message: 'User not found' }));
    await expect(fetchProfile('nobody_here')).rejects.toMatchObject({ kind: 'NOT_FOUND' });
  });

  it('reports private accounts', async () => {
    mockFetch(() => jsonResponse({ ...fxProfile, user: { ...fxProfile.user, protected: true } }));
    await expect(fetchProfile('Seuthoot')).rejects.toMatchObject({ kind: 'NOT_FOUND', message: 'Account is private' });
  });

  it.each([400, 401, 403, 429, 500, 503])('treats HTTP %d as UPSTREAM', async (status) => {
    mockFetch(() => jsonResponse({}, status));
    await expect(fetchProfile('Seuthoot')).rejects.toMatchObject({
      kind: 'UPSTREAM',
      message: 'X data temporarily unavailable',
    });
  });

  it('treats a timeout as UPSTREAM', async () => {
    mockFetch(() => {
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    });
    await expect(fetchProfile('Seuthoot')).rejects.toMatchObject({ kind: 'UPSTREAM' });
  });
});

describe('fetchPost', () => {
  it('maps the fxtwitter tweet to a Post', async () => {
    const fetchMock = mockFetch(() => jsonResponse(fxPost));
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
      reposts: 124685,
      likes: 309357,
      views: undefined,
      media: { photos: 0, videos: 0 },
    });
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.fxtwitter.com/i/status/20');
  });

  it('counts photos and videos', async () => {
    const tweet = {
      ...fxPost.tweet,
      media: { all: [{ type: 'photo' }, { type: 'photo' }, { type: 'video' }, { type: 'gif' }] },
    };
    mockFetch(() => jsonResponse({ ...fxPost, tweet }));
    await expect(fetchPost('20')).resolves.toMatchObject({ media: { photos: 2, videos: 2 } });
  });

  it('treats an HTML page (unknown post) as NOT_FOUND', async () => {
    mockFetch(() => htmlResponse(200));
    await expect(fetchPost('1')).rejects.toMatchObject({ kind: 'NOT_FOUND', message: 'Post not found' });
  });
});

describe('fetchLatestPost', () => {
  it('returns the n-th latest post', async () => {
    const fetchMock = mockFetch(() => jsonResponse(fxStatuses));
    await expect(fetchLatestPost('Seuthoot', 1)).resolves.toMatchObject({
      id: '2094701798535885304',
      text: 'Hello! Starting today. 👋',
      createdAt: '2026-09-01T08:20:01.000Z',
      reposts: 0,
      views: 7,
    });
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.fxtwitter.com/2/profile/Seuthoot/statuses');
  });

  it('skips reposts of other accounts', async () => {
    const own = fxStatuses.results[0];
    const repost = { ...own, id: '999', text: 'someone else', reposted_by: { id: '1896512501552128000' } };
    mockFetch(() => jsonResponse({ ...fxStatuses, results: [repost, own] }));
    await expect(fetchLatestPost('Seuthoot', 1)).resolves.toMatchObject({ id: '2094701798535885304' });
  });

  it('is NOT_FOUND when the index is past the end', async () => {
    mockFetch(() => jsonResponse(fxStatuses));
    await expect(fetchLatestPost('Seuthoot', 2)).rejects.toMatchObject({ kind: 'NOT_FOUND', message: 'Post not found' });
  });

  it('is NOT_FOUND for an unknown user (404 JSON)', async () => {
    mockFetch(() => jsonResponse({ code: 404, results: [] }, 404));
    await expect(fetchLatestPost('nobody_here', 1)).rejects.toMatchObject({ kind: 'NOT_FOUND' });
  });
});

describe('fetchLatestPosts', () => {
  it('returns own posts newest first, skipping reposts and non-status entries', async () => {
    const own = fxStatuses.results[0];
    const results = [
      { ...own, id: '3', text: 'third' },
      { ...own, id: '9', reposted_by: { screen_name: 'someone' } },
      { ...own, id: '2', text: 'second', type: 'thread' },
      { ...own, id: '1', text: 'first' },
    ];
    mockFetch(() => jsonResponse({ ...fxStatuses, results }));
    const posts = await fetchLatestPosts('Seuthoot');
    expect(posts.map((p) => p.id)).toEqual(['3', '1']);
    expect(posts[0].text).toBe('third');
  });

  it('returns an empty list for an account without posts', async () => {
    mockFetch(() => jsonResponse({ ...fxStatuses, results: [] }));
    await expect(fetchLatestPosts('Seuthoot')).resolves.toEqual([]);
  });
});

describe('rich post details', () => {
  const author = fxPost.tweet.author;
  const rich = {
    ...fxPost.tweet,
    text: 'Save your #GitHubUniverse seat ⬇️\nhttps://githubuniverse.com/pricing?utm_source=Twitter',
    raw_text: {
      text: 'Save your #GitHubUniverse seat ⬇️\nhttps://t.co/ppLyZeK2b8 https://t.co/Y5IVxc2m4O',
      facets: [
        { type: 'hashtag', original: 'GitHubUniverse' },
        { type: 'url', original: 'https://t.co/ppLyZeK2b8', display: 'githubuniverse.com/pricing?utm_so…' },
        { type: 'media', original: 'https://t.co/Y5IVxc2m4O', display: 'pic.x.com/Y5IVxc2m4O' },
      ],
    },
    media: {
      all: [
        { type: 'video', url: 'https://video.twimg.com/v.mp4', thumbnail_url: 'https://pbs.twimg.com/media/HVlz.jpg', width: 1920, height: 3414 },
        { type: 'photo', url: 'https://pbs.twimg.com/media/Other.png?name=orig', width: 10, height: 10 },
      ],
    },
    quote: { ...fxPost.tweet, id: '1', author: { ...author, screen_name: 'shanvasion', name: 'shann wells' }, text: 'quoted words' },
    replying_to: { screen_name: 'someone' },
  };

  it('shows links in their display form, drops media links and keeps the first preview', async () => {
    mockFetch(() => jsonResponse({ ...fxPost, tweet: rich }));
    const post = await fetchPost('20');
    expect(post.text).toBe('Save your #GitHubUniverse seat ⬇️\ngithubuniverse.com/pricing?utm_so…');
    expect(post.thumbnail).toEqual({
      url: 'https://pbs.twimg.com/media/HVlz?format=jpg&name=small',
      width: 1920,
      height: 3414,
      video: true,
    });
    expect(post.media).toEqual({ photos: 1, videos: 1 });
  });

  it('maps quotes and replies to other accounts', async () => {
    mockFetch(() => jsonResponse({ ...fxPost, tweet: rich }));
    const post = await fetchPost('20');
    expect(post.replyTo).toBe('someone');
    expect(post.quote).toMatchObject({ author: { username: 'shanvasion', name: 'shann wells' }, text: 'quoted words' });
  });

  it('treats a reply to oneself as a thread, not a reply', async () => {
    mockFetch(() => jsonResponse({ ...fxPost, tweet: { ...rich, replying_to: { screen_name: author.screen_name.toUpperCase() } } }));
    expect((await fetchPost('20')).replyTo).toBeUndefined();
  });

  it('falls back to the plain text without raw_text', async () => {
    mockFetch(() => jsonResponse(fxPost));
    const post = await fetchPost('20');
    expect(post.text).toBe('just setting up my twttr');
    expect(post.thumbnail).toBeUndefined();
    expect(post.quote).toBeUndefined();
  });
});
