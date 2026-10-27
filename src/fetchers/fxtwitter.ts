import { CardError, type Post, type PostAuthor, type Profile, type Thumbnail } from '../model.js';
import { displayText, getJson, largeAvatar, smallImage } from './shared.js';

const BASE = 'https://api.fxtwitter.com';

interface FxUser {
  screen_name: string;
  name: string;
  avatar_url?: string | null;
  description?: string | null;
  followers?: number;
  following?: number;
  tweets?: number;
  statuses?: number;
  protected?: boolean;
  verification?: { verified?: boolean } | null;
}

interface FxFacet {
  type?: string;
  original?: string;
  display?: string;
}

interface FxMedia {
  type?: string;
  url?: string;
  thumbnail_url?: string;
  width?: number;
  height?: number;
}

interface FxStatus {
  id: string;
  url: string;
  text: string;
  raw_text?: { text?: string; facets?: FxFacet[] } | null;
  replying_to?: { screen_name?: string } | null;
  quote?: FxStatus | null;
  created_timestamp: number;
  author: FxUser;
  replies?: number;
  retweets?: number;
  reposts?: number;
  likes?: number;
  views?: number | null;
  media?: { all?: FxMedia[] } | null;
  reposted_by?: unknown;
}

function toProfile(user: FxUser): Profile {
  return {
    username: user.screen_name,
    name: user.name,
    avatarUrl: largeAvatar(user.avatar_url),
    bio: user.description ?? '',
    verified: Boolean(user.verification?.verified),
    followers: user.followers ?? 0,
    following: user.following ?? 0,
    posts: user.tweets ?? user.statuses ?? 0,
  };
}

function toAuthor(user: FxUser): PostAuthor {
  return {
    username: user.screen_name,
    name: user.name,
    avatarUrl: largeAvatar(user.avatar_url),
    verified: Boolean(user.verification?.verified),
  };
}

// `text` spells links out in full; raw_text keeps the t.co links plus facets saying how X displays them.
function statusText(status: FxStatus): string {
  const raw = status.raw_text;
  if (typeof raw?.text !== 'string') return status.text;
  const facets = raw.facets ?? [];
  const links = facets.flatMap((f) => (f.type === 'url' && f.original && f.display ? [{ from: f.original, to: f.display }] : []));
  const media = facets.flatMap((f) => (f.type === 'media' && f.original ? [f.original] : []));
  return displayText(raw.text, links, media);
}

function thumbnailOf(media: FxMedia[]): Thumbnail | undefined {
  for (const m of media) {
    const video = m.type === 'video' || m.type === 'gif';
    const url = video ? m.thumbnail_url : m.type === 'photo' ? m.url : undefined;
    if (url && m.width && m.height) return { url: smallImage(url), width: m.width, height: m.height, video };
  }
  return undefined;
}

function toPost(status: FxStatus): Post {
  const media = status.media?.all ?? [];
  const replyTo = status.replying_to?.screen_name;
  return {
    id: status.id,
    url: status.url,
    text: statusText(status),
    // A reply to oneself continues a thread; only replies to others get the "Replying to" line.
    replyTo: replyTo && replyTo.toLowerCase() !== status.author.screen_name.toLowerCase() ? replyTo : undefined,
    quote: status.quote?.author ? { author: toAuthor(status.quote.author), text: statusText(status.quote) } : undefined,
    thumbnail: thumbnailOf(media),
    createdAt: new Date(status.created_timestamp * 1000).toISOString(),
    author: toAuthor(status.author),
    replies: status.replies,
    // v1 endpoints call it "retweets", v2 endpoints "reposts".
    reposts: status.reposts ?? status.retweets,
    likes: status.likes,
    views: status.views ?? undefined,
    media: {
      photos: media.filter((m) => m.type === 'photo').length,
      videos: media.filter((m) => m.type === 'video' || m.type === 'gif').length,
    },
  };
}

export async function fetchProfile(username: string, timeoutMs?: number): Promise<Profile> {
  const data = (await getJson(`${BASE}/${encodeURIComponent(username)}`, 'User not found', timeoutMs)) as {
    code?: number;
    user?: FxUser;
  };
  if (data?.code !== 200 || !data.user) throw new CardError('NOT_FOUND', 'User not found');
  if (data.user.protected) throw new CardError('NOT_FOUND', 'Account is private');
  return toProfile(data.user);
}

export async function fetchPost(id: string, timeoutMs?: number): Promise<Post> {
  const data = (await getJson(`${BASE}/i/status/${id}`, 'Post not found', timeoutMs)) as { code?: number; tweet?: FxStatus };
  if (data?.code !== 200 || !data.tweet) throw new CardError('NOT_FOUND', 'Post not found');
  return toPost(data.tweet);
}

/** The user's own posts, newest first (reposts left out). */
export async function fetchLatestPosts(username: string, timeoutMs?: number): Promise<Post[]> {
  const url = `${BASE}/2/profile/${encodeURIComponent(username)}/statuses`;
  const data = (await getJson(url, 'Post not found', timeoutMs)) as {
    code?: number;
    results?: (FxStatus & { type?: string })[];
  };
  if (data?.code !== 200 || !Array.isArray(data.results)) throw new CardError('NOT_FOUND', 'Post not found');
  return data.results.filter((s) => s.type === 'status' && !s.reposted_by).map(toPost);
}

export async function fetchLatestPost(username: string, index: number, timeoutMs?: number): Promise<Post> {
  const post = (await fetchLatestPosts(username, timeoutMs))[index - 1];
  if (!post) throw new CardError('NOT_FOUND', 'Post not found');
  return post;
}
