import { CardError, type Post, type Profile } from '../model.js';
import * as fxtwitter from './fxtwitter.js';
import { SOURCE_TIMEOUT_MS } from './shared.js';
import * as syndication from './syndication.js';

const isNotFound = (err: unknown) => err instanceof CardError && err.kind === 'NOT_FOUND';

// The fallback chain shares one source budget so a double outage still answers within SOURCE_TIMEOUT_MS.
const FALLBACK_STEP_MS = SOURCE_TIMEOUT_MS / 2;

export async function getProfile(username: string): Promise<Profile> {
  try {
    return await fxtwitter.fetchProfile(username, FALLBACK_STEP_MS);
  } catch (err) {
    // From Vercel, fxtwitter intermittently reports existing users as missing; ask once more.
    if (!isNotFound(err)) throw err;
    return fxtwitter.fetchProfile(username, FALLBACK_STEP_MS);
  }
}

export async function getPostById(id: string): Promise<Post> {
  try {
    return await syndication.fetchPost(id, FALLBACK_STEP_MS);
  } catch (first) {
    try {
      return await fxtwitter.fetchPost(id, FALLBACK_STEP_MS);
    } catch (second) {
      if (isNotFound(first) && isNotFound(second)) throw second;
      throw new CardError('UPSTREAM', 'X data temporarily unavailable');
    }
  }
}

export function getLatestPost(username: string, index: number): Promise<Post> {
  return fxtwitter.fetchLatestPost(username, index);
}
