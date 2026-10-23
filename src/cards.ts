import { getLatestPost, getPostById, getProfile } from './fetchers/index.js';
import { recall, remember } from './last-good.js';
import { CardError, type Post, type Profile } from './model.js';
import { parsePostQuery, parseProfileQuery, type PostQuery } from './params.js';
import { toDataUri } from './render/avatar.js';
import { getTheme } from './themes/index.js';

export const CACHE = {
  profile: 'public, max-age=3600, s-maxage=21600, stale-while-revalidate=86400',
  postById: 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400',
  latestPost: 'public, max-age=1800, s-maxage=3600, stale-while-revalidate=86400',
  // A remembered card stands in for a failed fetch, so ask again soon.
  lastGood: 'public, max-age=600, s-maxage=600',
  clientError: 'public, max-age=3600, s-maxage=3600',
  // Short, because upstream sometimes reports existing accounts as missing.
  notFound: 'public, max-age=300, s-maxage=300',
  upstreamError: 'public, max-age=600, s-maxage=600',
} as const;

export interface CardResponse {
  svg: string;
  cacheControl: string;
}

interface ProfileSnapshot {
  profile: Profile;
  avatar: string | null;
}

interface PostSnapshot {
  post: Post;
  avatar: string | null;
}

const profileKey = (username: string) => `profile:${username.toLowerCase()}`;

const postKey = (query: PostQuery) =>
  query.kind === 'id' ? `post:${query.id}` : `latest:${query.username.toLowerCase()}:${query.index}`;

function errorCard(err: unknown, themeName: string | null): CardResponse {
  const theme = getTheme(themeName);
  if (err instanceof CardError && err.kind !== 'UPSTREAM') {
    const cacheControl = err.kind === 'NOT_FOUND' ? CACHE.notFound : CACHE.clientError;
    return { svg: theme.renderError(err.message), cacheControl };
  }
  if (!(err instanceof CardError)) console.error('[readme-x-cards] unexpected error', err);
  return { svg: theme.renderError('X data temporarily unavailable'), cacheControl: CACHE.upstreamError };
}

export async function profileCard(params: URLSearchParams): Promise<CardResponse> {
  let query;
  try {
    query = parseProfileQuery(params);
  } catch (err) {
    return errorCard(err, params.get('theme'));
  }
  const theme = getTheme(query.theme);
  try {
    const profile = await getProfile(query.username);
    const avatar = await toDataUri(profile.avatarUrl);
    await remember(profileKey(query.username), { profile, avatar } satisfies ProfileSnapshot);
    return { svg: theme.renderProfile(profile, avatar), cacheControl: CACHE.profile };
  } catch (err) {
    const last = await recall<ProfileSnapshot>(profileKey(query.username));
    if (last) return { svg: theme.renderProfile(last.profile, last.avatar), cacheControl: CACHE.lastGood };
    return errorCard(err, query.theme);
  }
}

export async function postCard(params: URLSearchParams): Promise<CardResponse> {
  let query;
  try {
    query = parsePostQuery(params);
  } catch (err) {
    return errorCard(err, params.get('theme'));
  }
  const theme = getTheme(query.theme);
  try {
    const post = query.kind === 'id' ? await getPostById(query.id) : await getLatestPost(query.username, query.index);
    const avatar = await toDataUri(post.author.avatarUrl);
    await remember(postKey(query), { post, avatar } satisfies PostSnapshot);
    return {
      svg: theme.renderPost(post, avatar),
      cacheControl: query.kind === 'id' ? CACHE.postById : CACHE.latestPost,
    };
  } catch (err) {
    const last = await recall<PostSnapshot>(postKey(query));
    if (last) return { svg: theme.renderPost(last.post, last.avatar), cacheControl: CACHE.lastGood };
    return errorCard(err, query.theme);
  }
}

export function svgResponse(card: CardResponse): Response {
  return new Response(card.svg, {
    status: 200,
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': card.cacheControl,
      'x-content-type-options': 'nosniff',
      // The SVG may be opened directly in a browser: forbid scripts and remote loads.
      'content-security-policy': "default-src 'none'; img-src data:; style-src 'unsafe-inline'",
    },
  });
}
