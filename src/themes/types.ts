import type { Post, Profile } from '../model.js';

/** Presentation choices that need the theme itself; hiding fields is done on the data before rendering. */
export interface RenderOptions {
  /** BCP 47 locale for dates, already validated. Defaults to en-US. */
  locale?: string;
  /** Drop the outline on themes that draw one (aurora, terminal, paper); other themes ignore it. */
  hideBorder?: boolean;
}

/**
 * A theme turns the shared data model into a complete SVG document.
 * To add a theme: create src/themes/<name>.ts exporting a Theme and register it in src/themes/index.ts.
 * Avatars arrive as a data URI (or null when unavailable); never reference external URLs.
 */
export interface Theme {
  name: string;
  renderProfile(profile: Profile, avatar: string | null, opts?: RenderOptions): string;
  renderPost(post: Post, avatar: string | null, opts?: RenderOptions): string;
  /** One author's latest posts stacked in one card; `posts` is non-empty and `avatar` is the author's. */
  renderFeed(posts: Post[], avatar: string | null, opts?: RenderOptions): string;
  renderError(message: string): string;
}
