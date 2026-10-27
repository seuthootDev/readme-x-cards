import { CardError, type Post, type Thumbnail } from '../model.js';
import { displayText, getJson, largeAvatar, smallImage } from './shared.js';

const BASE = 'https://cdn.syndication.twimg.com/tweet-result';

interface SynUser {
  screen_name: string;
  name: string;
  profile_image_url_https?: string;
  is_blue_verified?: boolean;
  verified?: boolean;
}

interface SynTweet {
  __typename?: string;
  in_reply_to_screen_name?: string;
  entities?: { urls?: { url?: string; display_url?: string }[]; media?: { url?: string }[] };
  quoted_tweet?: { text?: string; user?: SynUser; entities?: SynTweet['entities'] };
  id_str?: string;
  text?: string;
  created_at?: string;
  display_text_range?: [number, number];
  favorite_count?: number;
  conversation_count?: number;
  user?: SynUser;
  mediaDetails?: { type?: string; media_url_https?: string; original_info?: { width?: number; height?: number } }[];
}

// Same token formula as Vercel's react-tweet.
export function syndicationToken(id: string): string {
  return ((Number(id) / 1e15) * Math.PI).toString(6 ** 2).replace(/(0+|\.)/g, '');
}

function decodeEntities(s: string): string {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

/** `text` must already be entity-decoded. */
function textOf(text: string, entities: SynTweet['entities']): string {
  const links = (entities?.urls ?? []).flatMap((u) => (u.url && u.display_url ? [{ from: u.url, to: u.display_url }] : []));
  const media = (entities?.media ?? []).flatMap((m) => (m.url ? [m.url] : []));
  return displayText(text, links, media);
}

const author = (user: SynUser) => ({
  username: user.screen_name,
  name: user.name,
  avatarUrl: largeAvatar(user.profile_image_url_https),
  verified: Boolean(user.is_blue_verified || user.verified),
});

function thumbnailOf(media: NonNullable<SynTweet['mediaDetails']>): Thumbnail | undefined {
  const first = media.find((m) => m.media_url_https && m.original_info?.width && m.original_info.height);
  if (!first) return undefined;
  return {
    url: smallImage(first.media_url_https!),
    width: first.original_info!.width!,
    height: first.original_info!.height!,
    video: first.type !== 'photo',
  };
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

  const replyTo = tweet.in_reply_to_screen_name;
  const quoted = tweet.quoted_tweet;

  return {
    id: tweet.id_str,
    url: `https://x.com/${tweet.user.screen_name}/status/${tweet.id_str}`,
    // Range first (it is measured on the decoded text), then swap t.co links for their display form.
    text: textOf(text.slice(start, end), tweet.entities),
    replyTo: replyTo && replyTo.toLowerCase() !== tweet.user.screen_name.toLowerCase() ? replyTo : undefined,
    quote: quoted?.user && typeof quoted.text === 'string' ? { author: author(quoted.user), text: textOf(decodeEntities(quoted.text), quoted.entities) } : undefined,
    thumbnail: thumbnailOf(media),
    createdAt: tweet.created_at ?? '',
    author: author(tweet.user),
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
