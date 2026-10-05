import { getLatestPost, getPostById, getProfile } from './fetchers/index.js';
import { CardError } from './model.js';
import { parsePostQuery, parseProfileQuery } from './params.js';
import { toDataUri } from './render/avatar.js';
import { getTheme } from './themes/index.js';

export const CACHE = {
  profile: 'public, max-age=3600, s-maxage=21600, stale-while-revalidate=86400',
  postById: 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400',
  latestPost: 'public, max-age=1800, s-maxage=3600, stale-while-revalidate=86400',
  clientError: 'public, max-age=3600, s-maxage=3600',
  upstreamError: 'public, max-age=600, s-maxage=600',
} as const;

export interface CardResponse {
  svg: string;
  cacheControl: string;
}

function errorCard(err: unknown, themeName: string | null): CardResponse {
  const theme = getTheme(themeName);
  if (err instanceof CardError && err.kind !== 'UPSTREAM') {
    return { svg: theme.renderError(err.message), cacheControl: CACHE.clientError };
  }
  if (!(err instanceof CardError)) console.error('[readme-x-cards] unexpected error', err);
  return { svg: theme.renderError('X data temporarily unavailable'), cacheControl: CACHE.upstreamError };
}

export async function profileCard(params: URLSearchParams): Promise<CardResponse> {
  try {
    const query = parseProfileQuery(params);
    const profile = await getProfile(query.username);
    const avatar = await toDataUri(profile.avatarUrl);
    return { svg: getTheme(query.theme).renderProfile(profile, avatar), cacheControl: CACHE.profile };
  } catch (err) {
    return errorCard(err, params.get('theme'));
  }
}

export async function postCard(params: URLSearchParams): Promise<CardResponse> {
  try {
    const query = parsePostQuery(params);
    const post =
      query.kind === 'id' ? await getPostById(query.id) : await getLatestPost(query.username, query.index);
    const avatar = await toDataUri(post.author.avatarUrl);
    return {
      svg: getTheme(query.theme).renderPost(post, avatar),
      cacheControl: query.kind === 'id' ? CACHE.postById : CACHE.latestPost,
    };
  } catch (err) {
    return errorCard(err, params.get('theme'));
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
