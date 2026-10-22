import { CardError, type Post, type Profile } from '../model.js';
import { getJson, largeAvatar } from './shared.js';

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

interface FxStatus {
  id: string;
  url: string;
  text: string;
  created_timestamp: number;
  author: FxUser;
  replies?: number;
  retweets?: number;
  reposts?: number;
  likes?: number;
  views?: number | null;
  media?: { all?: { type?: string }[] } | null;
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

function toPost(status: FxStatus): Post {
  const media = status.media?.all ?? [];
  return {
    id: status.id,
    url: status.url,
    text: status.text,
    createdAt: new Date(status.created_timestamp * 1000).toISOString(),
    author: {
      username: status.author.screen_name,
      name: status.author.name,
      avatarUrl: largeAvatar(status.author.avatar_url),
      verified: Boolean(status.author.verification?.verified),
    },
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

export async function fetchLatestPost(username: string, index: number): Promise<Post> {
  const data = (await getJson(`${BASE}/2/profile/${encodeURIComponent(username)}/statuses`, 'Post not found')) as {
    code?: number;
    results?: (FxStatus & { type?: string })[];
  };
  if (data?.code !== 200 || !Array.isArray(data.results)) throw new CardError('NOT_FOUND', 'Post not found');
  const own = data.results.filter((s) => s.type === 'status' && !s.reposted_by);
  const status = own[index - 1];
  if (!status) throw new CardError('NOT_FOUND', 'Post not found');
  return toPost(status);
}
