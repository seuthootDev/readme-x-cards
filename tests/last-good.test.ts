import { afterEach, describe, expect, it, vi } from 'vitest';
import { CACHE, postCard, profileCard } from '../src/cards.js';
import fxProfile from './fixtures/fx-profile.json' with { type: 'json' };
import fxStatuses from './fixtures/fx-statuses.json' with { type: 'json' };
import { htmlResponse, imageResponse, jsonResponse, mockFetch } from './helpers.js';

const STORE_URL = 'https://store.example.upstash.io';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const q = (s: string) => new URLSearchParams(s);

// An in-memory stand-in for the Upstash REST API.
function fakeStore() {
  const data = new Map<string, string>();
  const handle = async (init: RequestInit | undefined) => {
    const [cmd, key, value] = JSON.parse(String(init?.body)) as string[];
    if (cmd === 'SET') data.set(key, value);
    return jsonResponse({ result: cmd === 'SET' ? 'OK' : (data.get(key) ?? null) });
  };
  return { data, handle };
}

function withStore(upstream: (url: string) => Response) {
  vi.stubEnv('KV_REST_API_URL', STORE_URL);
  vi.stubEnv('KV_REST_API_TOKEN', 'token');
  const store = fakeStore();
  let current = upstream;
  const fn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    return url === STORE_URL ? store.handle(init) : current(url);
  });
  vi.stubGlobal('fetch', fn);
  return { store, fn, setUpstream: (next: (url: string) => Response) => (current = next) };
}

function happyRoutes(url: string): Response {
  if (url.startsWith('https://pbs.twimg.com/')) return imageResponse([1, 2, 3]);
  if (url === 'https://api.fxtwitter.com/Seuthoot') return jsonResponse(fxProfile);
  if (url === 'https://api.fxtwitter.com/2/profile/Seuthoot/statuses') return jsonResponse(fxStatuses);
  return htmlResponse(404);
}

const outage = () => {
  throw new DOMException('timeout', 'TimeoutError');
};

describe('last good card', () => {
  it('serves the remembered profile in the requested theme when upstream fails', async () => {
    const env = withStore(happyRoutes);
    await profileCard(q('user=Seuthoot'));
    expect(env.store.data.has('profile:seuthoot')).toBe(true);

    env.setUpstream(outage);
    const card = await profileCard(q('user=seuthoot&theme=terminal'));
    expect(card.svg).toContain('Seunghoon Jung');
    expect(card.svg).toContain('data:image/jpeg;base64,AQID');
    expect(card.svg).toContain('#0d1117');
    expect(card.cacheControl).toBe(CACHE.lastGood);
  });

  it('serves the remembered profile over a spurious not-found', async () => {
    const env = withStore(happyRoutes);
    await profileCard(q('user=Seuthoot'));

    env.setUpstream(() => htmlResponse(302));
    const card = await profileCard(q('user=Seuthoot'));
    expect(card.svg).toContain('Seunghoon Jung');
    expect(card.cacheControl).toBe(CACHE.lastGood);
  });

  it('serves the remembered latest post when upstream fails', async () => {
    const env = withStore(happyRoutes);
    await postCard(q('user=Seuthoot&index=1'));

    env.setUpstream(outage);
    const card = await postCard(q('user=Seuthoot&index=1'));
    expect(card.svg).toContain('Hello! Starting today.');
    expect(card.cacheControl).toBe(CACHE.lastGood);
  });

  it('falls back to the error card when nothing is remembered', async () => {
    withStore(outage);
    const card = await profileCard(q('user=Seuthoot'));
    expect(card.svg).toContain('X data temporarily unavailable');
    expect(card.cacheControl).toBe(CACHE.upstreamError);
  });

  it('never consults the store for invalid input', async () => {
    const env = withStore(happyRoutes);
    const card = await profileCard(q('user=a-b'));
    expect(card.cacheControl).toBe(CACHE.clientError);
    expect(env.fn).not.toHaveBeenCalled();
  });

  it('still renders when the store is down', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubEnv('KV_REST_API_URL', STORE_URL);
    vi.stubEnv('KV_REST_API_TOKEN', 'token');
    mockFetch((url) => (url === STORE_URL ? new Response('', { status: 500 }) : happyRoutes(url)));
    const card = await profileCard(q('user=Seuthoot'));
    expect(card.svg).toContain('Seunghoon Jung');
    expect(card.cacheControl).toBe(CACHE.profile);
  });
});
