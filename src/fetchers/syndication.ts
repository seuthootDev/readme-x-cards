import { CardError, type Post } from '../model.js';
import { getJson, largeAvatar } from './shared.js';

const BASE = 'https://cdn.syndication.twimg.com/tweet-result';

interface SynTweet {
  __typename?: string;
  id_str?: string;
  text?: string;
  created_at?: string;
  display_text_range?: [number, number];
  favorite_count?: number;
  conversation_count?: number;
  user?: {
    screen_name: string;
    name: string;
    profile_image_url_https?: string;
    is_blue_verified?: boolean;
    verified?: boolean;
  };
  mediaDetails?: { type?: string }[];
}

// Same token formula as Vercel's react-tweet.
export function syndicationToken(id: string): string {
  return ((Number(id) / 1e15) * Math.PI).toString(6 ** 2).replace(/(0+|\.)/g, '');
}

function decodeEntities(s: string): string {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

export async function fetchPost(id: string, timeoutMs?: number): Promise<Post> {
  const url = `${BASE}?id=${id}&lang=en&token=${syndicationToken(id)}`;
  const tweet = (await getJson(url, 'Post not found', timeoutMs)) as SynTweet;
  if (tweet?.__typename !== 'Tweet' || !tweet.id_str || !tweet.user || typeof tweet.text !== 'string') {
    throw new CardError('NOT_FOUND', 'Post not found');
  }

  // display_text_range excludes trailing t.co media links; indices are UTF-16 units of the decoded text.
  const text = decodeEntities(tweet.text);
  const [start, end] = tweet.display_text_range ?? [0, text.length];
  const media = tweet.mediaDetails ?? [];

  return {
    id: tweet.id_str,
    url: `https://x.com/${tweet.user.screen_name}/status/${tweet.id_str}`,
    text: text.slice(start, end).trim(),
    createdAt: tweet.created_at ?? '',
    author: {
      username: tweet.user.screen_name,
      name: tweet.user.name,
      avatarUrl: largeAvatar(tweet.user.profile_image_url_https),
      verified: Boolean(tweet.user.is_blue_verified || tweet.user.verified),
    },
    replies: tweet.conversation_count,
    reposts: undefined,
    likes: tweet.favorite_count,
    views: undefined,
    media: {
      photos: media.filter((m) => m.type === 'photo').length,
      videos: media.filter((m) => m.type === 'video' || m.type === 'animated_gif').length,
    },
  };
}
