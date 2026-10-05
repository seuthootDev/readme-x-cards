import { aurora } from './aurora.js';
import { terminal } from './terminal.js';
import type { Theme } from './types.js';

export type { Theme } from './types.js';

// Register new themes here. A Map (not an object literal) so names like "constructor" never resolve.
const THEMES = new Map<string, Theme>([
  [aurora.name, aurora],
  [terminal.name, terminal],
]);

export const DEFAULT_THEME = 'aurora';

export const themeNames: string[] = [...THEMES.keys()];

export function getTheme(name: string | null | undefined): Theme {
  return THEMES.get((name ?? '').trim().toLowerCase()) ?? THEMES.get(DEFAULT_THEME)!;
}
