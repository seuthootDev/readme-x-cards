import { CardError } from './model.js';

const USERNAME = /^[A-Za-z0-9_]{1,15}$/;
const POST_ID = /^[0-9]{1,25}$/;

export const HIDE_KEYS = ['bio', 'metrics', 'views', 'media', 'date', 'border'] as const;
export type HideKey = (typeof HIDE_KEYS)[number];

export const DEFAULT_LOCALE = 'en-US';
export const FEED_COUNT = { min: 1, max: 5, default: 3 } as const;

/** Options shared by every card: fields to leave out and the locale for dates. */
export interface Display {
  hide: HideKey[];
  locale: string;
}

export type ProfileQuery = { username: string; theme: string } & Display;

export type PostQuery =
  | ({ kind: 'id'; id: string; theme: string } & Display)
  | ({ kind: 'latest'; username: string; index: number; theme: string } & Display);

export type FeedQuery = { username: string; count: number; theme: string } & Display;

function parseUsername(raw: string | null): string {
  const value = (raw ?? '').trim().replace(/^@/, '');
  if (!USERNAME.test(value)) throw new CardError('INVALID_PARAMS', 'Invalid username');
  return value;
}

/** A whole number in [min, max], or `fallback` when the parameter is absent. */
function parseRange(raw: string | null, min: number, max: number, fallback: number, message: string): number {
  const value = raw ?? String(fallback);
  const n = Number(value);
  if (!/^\d+$/.test(value) || n < min || n > max) throw new CardError('INVALID_PARAMS', message);
  return n;
}

function parseHide(raw: string | null): HideKey[] {
  if (raw === null) return [];
  const keys = raw
    .split(',')
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);
  for (const key of keys) {
    if (!(HIDE_KEYS as readonly string[]).includes(key)) {
      throw new CardError('INVALID_PARAMS', `hide accepts ${HIDE_KEYS.join(', ')}`);
    }
  }
  return [...new Set(keys)] as HideKey[];
}

function parseLocale(raw: string | null): string {
  const value = (raw ?? '').trim();
  if (!value) return DEFAULT_LOCALE;
  try {
    const [supported] = Intl.DateTimeFormat.supportedLocalesOf(value);
    if (supported) return supported;
  } catch {
    // Malformed tags throw a RangeError; report them like unsupported ones.
  }
  throw new CardError('INVALID_PARAMS', 'Unsupported locale');
}

function parseDisplay(params: URLSearchParams): Display {
  return { hide: parseHide(params.get('hide')), locale: parseLocale(params.get('locale')) };
}

export function parseProfileQuery(params: URLSearchParams): ProfileQuery {
  return { username: parseUsername(params.get('user')), theme: params.get('theme') ?? '', ...parseDisplay(params) };
}

export function parsePostQuery(params: URLSearchParams): PostQuery {
  const theme = params.get('theme') ?? '';

  const rawId = params.get('id');
  if (rawId !== null) {
    const id = rawId.trim();
    if (!POST_ID.test(id)) throw new CardError('INVALID_PARAMS', 'Invalid post id');
    return { kind: 'id', id, theme, ...parseDisplay(params) };
  }

  if (params.get('user') === null) throw new CardError('INVALID_PARAMS', 'Missing id or user');
  const username = parseUsername(params.get('user'));
  const index = parseRange(params.get('index'), 1, 10, 1, 'index must be 1-10');
  return { kind: 'latest', username, index, theme, ...parseDisplay(params) };
}

export function parseFeedQuery(params: URLSearchParams): FeedQuery {
  const username = parseUsername(params.get('user'));
  const { min, max } = FEED_COUNT;
  const count = parseRange(params.get('count'), min, max, FEED_COUNT.default, `count must be ${min}-${max}`);
  return { username, count, theme: params.get('theme') ?? '', ...parseDisplay(params) };
}
