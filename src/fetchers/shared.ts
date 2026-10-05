import { CardError } from '../model.js';

export const SOURCE_TIMEOUT_MS = 5000;

const UPSTREAM_MESSAGE = 'X data temporarily unavailable';

export async function getJson(url: string, notFoundMessage: string, timeoutMs = SOURCE_TIMEOUT_MS): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, {
      // fxtwitter answers unknown users with a redirect to its homepage; never follow it.
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: 'application/json', 'user-agent': 'readme-x-cards' },
    });
  } catch {
    throw new CardError('UPSTREAM', UPSTREAM_MESSAGE);
  }

  if (res.status === 429 || res.status >= 500) throw new CardError('UPSTREAM', UPSTREAM_MESSAGE);
  if (res.status < 200 || res.status >= 300) throw new CardError('NOT_FOUND', notFoundMessage);

  try {
    return await res.json();
  } catch {
    // Both sources answer some "not found" cases with an HTML page.
    throw new CardError('NOT_FOUND', notFoundMessage);
  }
}

export function largeAvatar(url: string | null | undefined): string {
  return (url ?? '').replace(/_normal(\.\w+)$/, '_200x200$1');
}
