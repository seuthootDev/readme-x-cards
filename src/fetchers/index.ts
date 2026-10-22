import { CardError, type Post, type Profile } from '../model.js';
import * as fxtwitter from './fxtwitter.js';
import { SOURCE_TIMEOUT_MS } from './shared.js';
import * as syndication from './syndication.js';

const isNotFound = (err: unknown) => err instanceof CardError && err.kind === 'NOT_FOUND';

// The fallback chain shares one source budget so a double outage still answers within SOURCE_TIMEOUT_MS.
const FALLBACK_STEP_MS = SOURCE_TIMEOUT_MS / 2;

// From Vercel, fxtwitter intermittently reports existing users as missing, so a "not found" is asked
// again; all attempts share one source budget.
const NOT_FOUND_ATTEMPTS = 3;
const RETRY_STEP_MS = Math.floor(SOURCE_TIMEOUT_MS / NOT_FOUND_ATTEMPTS);

async function retryNotFound<T>(fetchOnce: (timeoutMs: number) => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetchOnce(RETRY_STEP_MS);
    } catch (err) {
      if (!isNotFound(err) || attempt === NOT_FOUND_ATTEMPTS) throw err;
    }
  }
}

export function getProfile(username: string): Promise<Profile> {
  return retryNotFound((timeoutMs) => fxtwitter.fetchProfile(username, timeoutMs));
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
  return retryNotFound((timeoutMs) => fxtwitter.fetchLatestPost(username, index, timeoutMs));
}
