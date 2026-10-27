import { getLatestPost, getLatestPosts, getPostById, getProfile } from './fetchers/index.js';
import { recall, remember } from './last-good.js';
import { CardError, type Post, type Profile } from './model.js';
import { parseFeedQuery, parsePostQuery, parseProfileQuery, type Display, type PostQuery } from './params.js';
import { toDataUri } from './render/avatar.js';
import { getTheme, type RenderOptions } from './themes/index.js';

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
  /** The preview image as a data URI; absent in snapshots saved before previews existed. */
  thumbnail?: string | null;
}

interface FeedSnapshot {
  posts: Post[];
  avatar: string | null;
}

const profileKey = (username: string) => `profile:${username.toLowerCase()}`;

const postKey = (query: PostQuery) =>
  query.kind === 'id' ? `post:${query.id}` : `latest:${query.username.toLowerCase()}:${query.index}`;

const feedKey = (username: string, count: number) => `feed:${username.toLowerCase()}:${count}`;

// Hidden fields are removed from the data, so every theme leaves them out the same way it handles
// data a source did not provide. Snapshots keep the full data; hiding happens at render time.
function shownProfile(profile: Profile, { hide }: Display): Profile {
  return hide.includes('bio') ? { ...profile, bio: '' } : profile;
}

function shownPost(post: Post, { hide }: Display): Post {
  const shown = { ...post };
  if (hide.includes('metrics')) {
    shown.replies = shown.reposts = shown.likes = shown.views = undefined;
  }
  if (hide.includes('views')) shown.views = undefined;
  if (hide.includes('media')) {
    shown.media = { photos: 0, videos: 0 };
    shown.thumbnail = undefined;
  }
  if (hide.includes('date')) shown.createdAt = '';
  return shown;
}

const renderOptions = ({ hide, locale }: Display): RenderOptions => ({ locale, hideBorder: hide.includes('border') });

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
  const opts = renderOptions(query);
  try {
    const profile = await getProfile(query.username);
    const avatar = await toDataUri(profile.avatarUrl);
    await remember(profileKey(query.username), { profile, avatar } satisfies ProfileSnapshot);
    return { svg: theme.renderProfile(shownProfile(profile, query), avatar, opts), cacheControl: CACHE.profile };
  } catch (err) {
    const last = await recall<ProfileSnapshot>(profileKey(query.username));
    if (last) {
      return { svg: theme.renderProfile(shownProfile(last.profile, query), last.avatar, opts), cacheControl: CACHE.lastGood };
    }
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
  const opts = renderOptions(query);
  try {
    const post = query.kind === 'id' ? await getPostById(query.id) : await getLatestPost(query.username, query.index);
    // Skip the preview download when it would be hidden anyway.
    const wantThumbnail = post.thumbnail && !query.hide.includes('media');
    const [avatar, thumbnail] = await Promise.all([
      toDataUri(post.author.avatarUrl),
      wantThumbnail ? toDataUri(post.thumbnail!.url) : null,
    ]);
    await remember(postKey(query), { post, avatar, thumbnail } satisfies PostSnapshot);
    return {
      svg: theme.renderPost(shownPost(post, query), avatar, opts, thumbnail),
      cacheControl: query.kind === 'id' ? CACHE.postById : CACHE.latestPost,
    };
  } catch (err) {
    const last = await recall<PostSnapshot>(postKey(query));
    if (last) {
      const svg = theme.renderPost(shownPost(last.post, query), last.avatar, opts, last.thumbnail ?? null);
      return { svg, cacheControl: CACHE.lastGood };
    }
    return errorCard(err, query.theme);
  }
}

export async function feedCard(params: URLSearchParams): Promise<CardResponse> {
  let query;
  try {
    query = parseFeedQuery(params);
  } catch (err) {
    return errorCard(err, params.get('theme'));
  }
  const theme = getTheme(query.theme);
  const opts = renderOptions(query);
  const render = ({ posts, avatar }: FeedSnapshot) =>
    theme.renderFeed(
      posts.map((post) => shownPost(post, query)),
      avatar,
      opts,
    );
  const key = feedKey(query.username, query.count);
  try {
    const posts = await getLatestPosts(query.username, query.count);
    const avatar = await toDataUri(posts[0].author.avatarUrl);
    await remember(key, { posts, avatar } satisfies FeedSnapshot);
    return { svg: render({ posts, avatar }), cacheControl: CACHE.latestPost };
  } catch (err) {
    const last = await recall<FeedSnapshot>(key);
    if (last) return { svg: render(last), cacheControl: CACHE.lastGood };
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
