export const AVATAR_TIMEOUT_MS = 3000;

const MAX_BYTES = 300_000;
const ALLOWED_PREFIX = 'https://pbs.twimg.com/';
const IMAGE_TYPE = /^image\/[a-z0-9.+-]+$/;

// SVGs shown through <img> (as GitHub does) cannot load external images,
// so the avatar has to be embedded as a data URI.
export async function toDataUri(url: string): Promise<string | null> {
  if (!url.startsWith(ALLOWED_PREFIX)) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(AVATAR_TIMEOUT_MS) });
    if (!res.ok) return null;
    const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (!IMAGE_TYPE.test(type)) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.byteLength > MAX_BYTES) return null;
    return `data:${type};base64,${bytes.toString('base64')}`;
  } catch {
    return null;
  }
}
