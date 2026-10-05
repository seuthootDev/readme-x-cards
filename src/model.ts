export interface Profile {
  username: string;
  name: string;
  avatarUrl: string;
  bio: string;
  verified: boolean;
  followers: number;
  following: number;
  posts: number;
}

export interface PostAuthor {
  username: string;
  name: string;
  avatarUrl: string;
  verified: boolean;
}

export interface Post {
  id: string;
  url: string;
  text: string;
  /** ISO 8601 */
  createdAt: string;
  author: PostAuthor;
  /** Metrics are optional: a source that does not provide one leaves it undefined and the card hides it. */
  replies?: number;
  reposts?: number;
  likes?: number;
  views?: number;
  media: { photos: number; videos: number };
}

export type CardErrorKind = 'INVALID_PARAMS' | 'NOT_FOUND' | 'UPSTREAM';

export class CardError extends Error {
  readonly kind: CardErrorKind;

  constructor(kind: CardErrorKind, message: string) {
    super(message);
    this.name = 'CardError';
    this.kind = kind;
  }
}
