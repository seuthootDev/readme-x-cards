import { afterEach, describe, expect, it, vi } from 'vitest';
import { getLatestPost, getPostById, getProfile } from '../src/fetchers/index.js';
import synPost from './fixtures/syn-post.json' with { type: 'json' };
import fxPost from './fixtures/fx-post.json' with { type: 'json' };
import fxProfile from './fixtures/fx-profile.json' with { type: 'json' };
import fxStatuses from './fixtures/fx-statuses.json' with { type: 'json' };
import { htmlResponse, jsonResponse, mockFetch } from './helpers.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

const isSyndication = (url: string) => url.startsWith('https://cdn.syndication.twimg.com/');

describe('getPostById', () => {
  it('uses syndication first', async () => {
    const fetchMock = mockFetch((url) => (isSyndication(url) ? jsonResponse(synPost) : jsonResponse(fxPost)));
    await expect(getPostById('20')).resolves.toMatchObject({ likes: 308841 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to fxtwitter when syndication fails', async () => {
    mockFetch((url) => (isSyndication(url) ? jsonResponse({}, 503) : jsonResponse(fxPost)));
    await expect(getPostById('20')).resolves.toMatchObject({ likes: 309357, reposts: 124685 });
  });

  it('is NOT_FOUND when both sources say not found', async () => {
    mockFetch(() => htmlResponse(404));
    await expect(getPostById('1')).rejects.toMatchObject({ kind: 'NOT_FOUND', message: 'Post not found' });
  });

  it('splits one 5s source budget across the fallback chain', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    mockFetch((url) => (isSyndication(url) ? jsonResponse({}, 503) : jsonResponse(fxPost)));
    await getPostById('20');
    expect(timeout.mock.calls.map(([ms]) => ms)).toEqual([2500, 2500]);
    timeout.mockRestore();
  });

  it('is UPSTREAM when both fail and at least one is an outage', async () => {
    mockFetch((url) => (isSyndication(url) ? htmlResponse(404) : jsonResponse({}, 500)));
    await expect(getPostById('20')).rejects.toMatchObject({ kind: 'UPSTREAM' });
  });
});

describe('getProfile', () => {
  it('retries when fxtwitter spuriously says not found', async () => {
    let calls = 0;
    const fetchMock = mockFetch(() => (calls++ < 2 ? jsonResponse({ code: 404 }, 404) : jsonResponse(fxProfile)));
    await expect(getProfile('Seuthoot')).resolves.toMatchObject({ username: 'Seuthoot' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('is NOT_FOUND when all three attempts say not found', async () => {
    const fetchMock = mockFetch(() => htmlResponse(302));
    await expect(getProfile('nobody_here')).rejects.toMatchObject({ kind: 'NOT_FOUND', message: 'User not found' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('splits one 5s source budget across the attempts', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    mockFetch(() => htmlResponse(302));
    await getProfile('nobody_here').catch(() => {});
    expect(timeout.mock.calls.map(([ms]) => ms)).toEqual([1666, 1666, 1666]);
    timeout.mockRestore();
  });

  it('does not retry an outage', async () => {
    const fetchMock = mockFetch(() => jsonResponse({}, 503));
    await expect(getProfile('Seuthoot')).rejects.toMatchObject({ kind: 'UPSTREAM' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('getLatestPost', () => {
  it('retries when fxtwitter spuriously says not found', async () => {
    let calls = 0;
    const fetchMock = mockFetch(() => (calls++ === 0 ? jsonResponse({ code: 404 }, 404) : jsonResponse(fxStatuses)));
    await expect(getLatestPost('Seuthoot', 1)).resolves.toMatchObject({ id: '2094701798535885304' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
