import { vi } from 'vitest';

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

export function htmlResponse(status = 200): Response {
  return new Response('<!DOCTYPE html><html><body>not json</body></html>', {
    status,
    headers: { 'content-type': 'text/html' },
  });
}

export function imageResponse(bytes: number[] = [1, 2, 3], type = 'image/jpeg'): Response {
  return new Response(new Uint8Array(bytes), { status: 200, headers: { 'content-type': type } });
}

export function mockFetch(handler: (url: string) => Response | Promise<Response>) {
  const fn = vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    return handler(url);
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}
