import { afterEach, describe, expect, it, vi } from 'vitest';
import { CACHE, postCard, profileCard, svgResponse } from '../src/cards.js';
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
