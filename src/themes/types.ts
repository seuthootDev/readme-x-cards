import type { Post, Profile } from '../model.js';

/**
 * A theme turns the shared data model into a complete SVG document.
 * To add a theme: create src/themes/<name>.ts exporting a Theme and register it in src/themes/index.ts.
 * Avatars arrive as a data URI (or null when unavailable); never reference external URLs.
 */
export interface Theme {
  name: string;
  renderProfile(profile: Profile, avatar: string | null): string;
  renderPost(post: Post, avatar: string | null): string;
  renderError(message: string): string;
}
