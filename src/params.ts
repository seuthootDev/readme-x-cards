import { CardError } from './model.js';

const USERNAME = /^[A-Za-z0-9_]{1,15}$/;
const POST_ID = /^[0-9]{1,25}$/;

export type ProfileQuery = { username: string; theme: string };

export type PostQuery =
  | { kind: 'id'; id: string; theme: string }
  | { kind: 'latest'; username: string; index: number; theme: string };

function parseUsername(raw: string | null): string {
  const value = (raw ?? '').trim().replace(/^@/, '');
  if (!USERNAME.test(value)) throw new CardError('INVALID_PARAMS', 'Invalid username');
  return value;
}

export function parseProfileQuery(params: URLSearchParams): ProfileQuery {
  return { username: parseUsername(params.get('user')), theme: params.get('theme') ?? '' };
}

export function parsePostQuery(params: URLSearchParams): PostQuery {
  const theme = params.get('theme') ?? '';

  const rawId = params.get('id');
  if (rawId !== null) {
    const id = rawId.trim();
    if (!POST_ID.test(id)) throw new CardError('INVALID_PARAMS', 'Invalid post id');
    return { kind: 'id', id, theme };
  }

  if (params.get('user') === null) throw new CardError('INVALID_PARAMS', 'Missing id or user');
  const username = parseUsername(params.get('user'));

  const rawIndex = params.get('index') ?? '1';
  const index = Number(rawIndex);
  if (!/^\d+$/.test(rawIndex) || index < 1 || index > 10) {
    throw new CardError('INVALID_PARAMS', 'index must be 1-10');
  }
  return { kind: 'latest', username, index, theme };
}
