import { describe, expect, it } from 'vitest';
import { DEFAULT_THEME, getTheme, themeNames } from '../src/themes/index.js';

describe('theme registry', () => {
  it('lists the built-in themes', () => {
    expect(themeNames).toEqual(['aurora', 'terminal', 'paper', 'brutal', 'receipt', 'sunset']);
    expect(DEFAULT_THEME).toBe('aurora');
  });

  it('finds themes case-insensitively', () => {
    expect(getTheme('terminal').name).toBe('terminal');
    expect(getTheme('TERMINAL').name).toBe('terminal');
  });

  it.each([undefined, null, '', 'nope', 'constructor', '__proto__', 'toString', 'hasOwnProperty'])(
    'falls back to aurora for %j',
    (name) => {
      expect(getTheme(name).name).toBe('aurora');
    },
  );
});
