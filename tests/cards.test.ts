import { afterEach, describe, expect, it, vi } from 'vitest';
import { CACHE, feedCard, postCard, profileCard, svgResponse } from '../src/cards.js';
import fxProfile from './fixtures/fx-profile.json' with { type: 'json' };
import fxStatuses from './fixtures/fx-statuses.json' with { type: 'json' };
import synPost from './fixtures/syn-post.json' with { type: 'json' };
import { htmlResponse, imageResponse, jsonResponse, mockFetch } from './helpers.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const q = (s: string) => new URLSearchParams(s);

function happyRoutes(url: string): Response {
  if (url.startsWith('https://pbs.twimg.com/')) return imageResponse([1, 2, 3]);
  if (url === 'https://api.fxtwitter.com/Seuthoot') return jsonResponse(fxProfile);
  if (url === 'https://api.fxtwitter.com/2/profile/Seuthoot/statuses') return jsonResponse(fxStatuses);
  if (url.startsWith('https://cdn.syndication.twimg.com/')) return jsonResponse(synPost);
  return htmlResponse(404);
}

describe('profileCard', () => {
  it('renders the profile with an embedded avatar and profile cache', async () => {
    mockFetch(happyRoutes);
    const card = await profileCard(q('user=Seuthoot'));
    expect(card.svg).toContain('Seunghoon Jung');
    expect(card.svg).toContain('data:image/jpeg;base64,AQID');
    expect(card.svg).toContain('#7c3aed');
    expect(card.cacheControl).toBe(CACHE.profile);
  });

  it('uses the requested theme', async () => {
    mockFetch(happyRoutes);
    const card = await profileCard(q('user=Seuthoot&theme=terminal'));
    expect(card.svg).toContain('#0d1117');
  });

  it('still renders when the avatar fails', async () => {
    mockFetch((url) => (url.startsWith('https://pbs.twimg.com/') ? new Response('', { status: 500 }) : happyRoutes(url)));
    const card = await profileCard(q('user=Seuthoot'));
    expect(card.svg).not.toContain('<image');
    expect(card.cacheControl).toBe(CACHE.profile);
  });

  it('returns an invalid-input error card without calling fetch', async () => {
    const fetchMock = mockFetch(happyRoutes);
    const card = await profileCard(q('user=a-b&theme=terminal'));
    expect(card.svg).toContain('Invalid username');
    expect(card.svg).toContain('#0d1117');
    expect(card.cacheControl).toBe(CACHE.clientError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns a not-found card', async () => {
    mockFetch(() => htmlResponse(302));
    const card = await profileCard(q('user=nobody_here'));
    expect(card.svg).toContain('User not found');
    expect(card.cacheControl).toBe(CACHE.notFound);
  });

  it('returns an upstream card with a short cache', async () => {
    mockFetch(() => {
      throw new DOMException('timeout', 'TimeoutError');
    });
    const card = await profileCard(q('user=Seuthoot'));
    expect(card.svg).toContain('X data temporarily unavailable');
    expect(card.cacheControl).toBe(CACHE.upstreamError);
  });

  it('turns unexpected errors into an upstream card', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFetch(() => jsonResponse({ code: 200, user: null }));
    const broken = await profileCard(q('user=Seuthoot'));
    expect(broken.svg).toContain('User not found');

    mockFetch(() => jsonResponse({ code: 200, user: { screen_name: 'x', name: null } }));
    const card = await profileCard(q('user=Seuthoot'));
    expect(card.cacheControl).toBe(CACHE.upstreamError);
    expect(card.svg).toContain('X data temporarily unavailable');
  });
});

describe('postCard', () => {
  it('renders a post by id with the post cache', async () => {
    mockFetch(happyRoutes);
    const card = await postCard(q('id=20'));
    expect(card.svg).toContain('just setting up my twttr');
    expect(card.cacheControl).toBe(CACHE.postById);
  });

  it('renders the latest post with the latest cache', async () => {
    mockFetch(happyRoutes);
    const card = await postCard(q('user=Seuthoot&index=1&theme=terminal'));
    expect(card.svg).toContain('Hello! Starting today.');
    expect(card.svg).toContain('#0d1117');
    expect(card.cacheControl).toBe(CACHE.latestPost);
  });

  it('returns a not-found card for an index past the end', async () => {
    mockFetch(happyRoutes);
    const card = await postCard(q('user=Seuthoot&index=5'));
    expect(card.svg).toContain('Post not found');
    expect(card.cacheControl).toBe(CACHE.notFound);
  });

  it('returns an invalid-input card', async () => {
    mockFetch(happyRoutes);
    const card = await postCard(q(''));
    expect(card.svg).toContain('Missing id or user');
    expect(card.cacheControl).toBe(CACHE.clientError);
  });
});

describe('display options', () => {
  it('hides the bio and the border on a profile', async () => {
    const bio = 'Building things in public';
    mockFetch((url) =>
      url === 'https://api.fxtwitter.com/Seuthoot'
        ? jsonResponse({ ...fxProfile, user: { ...fxProfile.user, description: bio } })
        : happyRoutes(url),
    );
    expect((await profileCard(q('user=Seuthoot&theme=paper'))).svg).toContain(bio);
    const card = await profileCard(q('user=Seuthoot&theme=paper&hide=bio,border'));
    expect(card.svg).not.toContain(bio);
    expect(card.svg).not.toContain('stroke="#d0d7de"');
    expect(card.cacheControl).toBe(CACHE.profile);
  });

  it('hides metrics and the date on a post', async () => {
    mockFetch(happyRoutes);
    const full = await postCard(q('id=20&theme=terminal'));
    expect(full.svg).toMatch(/likes/);
    expect(full.svg).toContain('// 2006-03-21');
    const card = await postCard(q('id=20&theme=terminal&hide=metrics,date'));
    expect(card.svg).not.toMatch(/likes|replies|reposts|views/);
    expect(card.svg).not.toContain('// 2006');
    expect(card.svg).toContain('just setting up my twttr');
  });

  it('formats dates in the requested locale', async () => {
    mockFetch(happyRoutes);
    const card = await postCard(q('id=20&theme=paper&locale=ko'));
    expect(card.svg).toContain('2006년 3월 21일');
  });

  it('rejects a bad option with an error card in the requested theme, without fetching', async () => {
    const fetchMock = mockFetch(happyRoutes);
    const card = await postCard(q('id=20&theme=terminal&hide=nope'));
    expect(card.svg).toContain('hide accepts');
    expect(card.svg).toContain('#0d1117');
    expect(card.cacheControl).toBe(CACHE.clientError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('feedCard', () => {
  const own = fxStatuses.results[0];
  const timeline = {
    ...fxStatuses,
    results: ['first post', 'second post', 'third post', 'fourth post'].map((text, i) => ({ ...own, id: String(10 - i), text })),
  };
  const routes = (url: string) =>
    url === 'https://api.fxtwitter.com/2/profile/Seuthoot/statuses' ? jsonResponse(timeline) : happyRoutes(url);

  it('renders the latest three posts in one card from one timeline fetch', async () => {
    const fetchMock = mockFetch(routes);
    const card = await feedCard(q('user=Seuthoot'));
    expect(card.svg).toContain('first post');
    expect(card.svg).toContain('third post');
    expect(card.svg).not.toContain('fourth post');
    expect(card.svg).toContain('data:image/jpeg;base64,AQID');
    expect(card.cacheControl).toBe(CACHE.latestPost);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/statuses'))).toHaveLength(1);
  });

  it('honours count, theme and hide', async () => {
    mockFetch(routes);
    const card = await feedCard(q('user=Seuthoot&count=1&theme=terminal&hide=metrics'));
    expect(card.svg).toContain('first post');
    expect(card.svg).not.toContain('second post');
    expect(card.svg).toContain('#0d1117');
    expect(card.svg).not.toMatch(/likes/);
  });

  it('returns a not-found card for an account without posts', async () => {
    mockFetch((url) => (url.includes('/statuses') ? jsonResponse({ ...fxStatuses, results: [] }) : happyRoutes(url)));
    const card = await feedCard(q('user=Seuthoot'));
    expect(card.svg).toContain('No posts yet');
    expect(card.cacheControl).toBe(CACHE.notFound);
  });

  it('returns an invalid-input card', async () => {
    const card = await feedCard(q('user=Seuthoot&count=9'));
    expect(card.svg).toContain('count must be 1-5');
    expect(card.cacheControl).toBe(CACHE.clientError);
  });
});

describe('svgResponse', () => {
  it('builds a 200 SVG response with cache and security headers', async () => {
    const res = svgResponse({ svg: '<svg xmlns="http://www.w3.org/2000/svg"/>', cacheControl: CACHE.profile });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/svg+xml; charset=utf-8');
    expect(res.headers.get('cache-control')).toBe(CACHE.profile);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('content-security-policy')).toBe(
      "default-src 'none'; img-src data:; style-src 'unsafe-inline'",
    );
    expect(await res.text()).toBe('<svg xmlns="http://www.w3.org/2000/svg"/>');
  });
});
