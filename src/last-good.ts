// Remembers the last successfully fetched card data so an upstream hiccup (fxtwitter outages, spurious
// "not found" answers) shows the previous card instead of an error. Backed by Upstash Redis over REST;
// without credentials every call is a no-op and errors render as before.

const STORE_TIMEOUT_MS = 1000;
const TTL_SECONDS = 7 * 24 * 60 * 60;

interface StoreConfig {
  url: string;
  token: string;
}

function config(): StoreConfig | null {
  // Upstash's Vercel integration sets KV_* (legacy Vercel KV) or UPSTASH_REDIS_* depending on how it was added.
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

async function command(store: StoreConfig, args: (string | number)[]): Promise<unknown> {
  const res = await fetch(store.url, {
    method: 'POST',
    signal: AbortSignal.timeout(STORE_TIMEOUT_MS),
    headers: { authorization: `Bearer ${store.token}`, 'content-type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`store responded ${res.status}`);
  return ((await res.json()) as { result?: unknown }).result;
}

export async function remember(key: string, value: unknown): Promise<void> {
  const store = config();
  if (!store) return;
  try {
    await command(store, ['SET', key, JSON.stringify(value), 'EX', TTL_SECONDS]);
  } catch (err) {
    console.error('[readme-x-cards] could not save last good card', err);
  }
}

export async function recall<T>(key: string): Promise<T | null> {
  const store = config();
  if (!store) return null;
  try {
    const raw = await command(store, ['GET', key]);
    return typeof raw === 'string' ? (JSON.parse(raw) as T) : null;
  } catch (err) {
    console.error('[readme-x-cards] could not read last good card', err);
    return null;
  }
}
