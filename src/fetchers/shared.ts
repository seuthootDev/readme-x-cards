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

  // Only 404 and redirects mean "does not exist"; any other non-2xx (403 blocks, 429, 5xx) is an outage.
  if (res.status === 404 || (res.status >= 300 && res.status < 400)) throw new CardError('NOT_FOUND', notFoundMessage);
  if (res.status < 200 || res.status >= 300) throw new CardError('UPSTREAM', UPSTREAM_MESSAGE);

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

/**
 * A pbs.twimg.com image at its "small" size (fits within 680px, aspect kept) as JPEG, so a preview stays
 * a few dozen KB once embedded. Anything else is left alone and later refused by the embedder.
 */
export function smallImage(url: string): string {
  const match = /^(https:\/\/pbs\.twimg\.com\/[^?#]+?)(?:\.(?:jpe?g|png|webp|gif))?(?:[?#].*)?$/i.exec(url);
  return match ? `${match[1]}?format=jpg&name=small` : url;
}

/** Replaces each link with its display form and removes the others (media links), all matched by text. */
export function displayText(
  text: string,
  links: { from: string; to: string }[],
  remove: string[],
): string {
  let out = text;
  for (const { from, to } of links) out = out.split(from).join(to);
  for (const url of remove) out = out.split(url).join('');
  return out.replace(/[ \t]+$/gm, '').trim();
}
