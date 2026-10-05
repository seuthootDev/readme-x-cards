import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPostById } from '../src/fetchers/index.js';
import synPost from './fixtures/syn-post.json' with { type: 'json' };
import fxPost from './fixtures/fx-post.json' with { type: 'json' };
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
