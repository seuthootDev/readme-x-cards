import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET as getPost } from '../api/post.js';
import { GET as getProfile } from '../api/profile.js';
import { CACHE } from '../src/cards.js';
import fxProfile from './fixtures/fx-profile.json' with { type: 'json' };
import synPost from './fixtures/syn-post.json' with { type: 'json' };
import { htmlResponse, imageResponse, jsonResponse, mockFetch } from './helpers.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

function routes(url: string): Response {
  if (url.startsWith('https://pbs.twimg.com/')) return imageResponse();
  if (url === 'https://api.fxtwitter.com/Seuthoot') return jsonResponse(fxProfile);
  if (url.startsWith('https://cdn.syndication.twimg.com/')) return jsonResponse(synPost);
  return htmlResponse(404);
}

describe('GET /api/profile', () => {
  it('returns an SVG card', async () => {
    mockFetch(routes);
    const res = await getProfile(new Request('https://cards.example.com/api/profile?user=Seuthoot&theme=terminal'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/svg+xml; charset=utf-8');
    expect(res.headers.get('cache-control')).toBe(CACHE.profile);
    expect(await res.text()).toContain('~/x/Seuthoot');
  });

  it('returns 200 with an error card for bad input', async () => {
    mockFetch(routes);
    const res = await getProfile(new Request('https://cards.example.com/api/profile'));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('Invalid username');
  });
});

describe('GET /api/post', () => {
  it('returns an SVG card', async () => {
    mockFetch(routes);
    const res = await getPost(new Request('https://cards.example.com/api/post?id=20'));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe(CACHE.postById);
    expect(await res.text()).toContain('just setting up my twttr');
  });
});
