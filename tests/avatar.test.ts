import { afterEach, describe, expect, it, vi } from 'vitest';
import { toDataUri } from '../src/render/avatar.js';
import { htmlResponse, imageResponse, mockFetch } from './helpers.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

const AVATAR = 'https://pbs.twimg.com/profile_images/1/a_200x200.jpg';

describe('toDataUri', () => {
  it('returns a base64 data URI', async () => {
    mockFetch(() => imageResponse([1, 2, 3], 'image/jpeg'));
    await expect(toDataUri(AVATAR)).resolves.toBe('data:image/jpeg;base64,AQID');
  });

  it('strips content-type parameters', async () => {
    mockFetch(() => imageResponse([1, 2, 3], 'image/png; charset=binary'));
    await expect(toDataUri(AVATAR)).resolves.toBe('data:image/png;base64,AQID');
  });

  it('refuses hosts other than pbs.twimg.com without fetching', async () => {
    const fetchMock = mockFetch(() => imageResponse());
    await expect(toDataUri('https://evil.example.com/a.jpg')).resolves.toBeNull();
    await expect(toDataUri('')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns null for non-image responses', async () => {
    mockFetch(() => htmlResponse(200));
    await expect(toDataUri(AVATAR)).resolves.toBeNull();
  });

  it('returns null for HTTP errors', async () => {
    mockFetch(() => new Response('', { status: 404 }));
    await expect(toDataUri(AVATAR)).resolves.toBeNull();
  });

  it('returns null for oversized images', async () => {
    mockFetch(() => imageResponse(new Array(300_001).fill(0)));
    await expect(toDataUri(AVATAR)).resolves.toBeNull();
  });

  it('returns null when fetch throws (timeout)', async () => {
    mockFetch(() => {
      throw new DOMException('timeout', 'TimeoutError');
    });
    await expect(toDataUri(AVATAR)).resolves.toBeNull();
  });
});
