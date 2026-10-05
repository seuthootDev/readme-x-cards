import { describe, expect, it } from 'vitest';
import { escapeXml, formatCount, formatDate, measure, wrapText } from '../src/render/text.js';

describe('escapeXml', () => {
  it('escapes XML special characters', () => {
    expect(escapeXml(`a & b < c > d "e" 'f'`)).toBe('a &amp; b &lt; c &gt; d &quot;e&quot; &apos;f&apos;');
  });
  it('removes characters that are illegal in XML', () => {
    expect(escapeXml('bell\u0007 nul\u0000 ok\ttab\nnl')).toBe('bell nul ok\ttab\nnl');
  });
  it('keeps emoji and Korean', () => {
    expect(escapeXml('안녕 👋')).toBe('안녕 👋');
  });
});

describe('formatCount', () => {
  it.each([
    [0, '0'],
    [999, '999'],
    [1000, '1K'],
    [18072, '18.1K'],
    [309357, '309.4K'],
    [999950, '1M'],
    [12467573, '12.5M'],
    [1500000000, '1.5B'],
    [Number.NaN, '0'],
  ])('%d -> %s', (n, expected) => {
    expect(formatCount(n)).toBe(expected);
  });
});

describe('formatDate', () => {
  it('formats ISO dates in UTC', () => {
    expect(formatDate('2026-09-01T08:20:01.000Z')).toBe('Sep 1, 2026');
    expect(formatDate('2006-03-21T20:50:14.000Z')).toBe('Mar 21, 2006');
  });
  it('returns empty string for invalid dates', () => {
    expect(formatDate('nope')).toBe('');
  });
});

describe('measure', () => {
  it('treats CJK and emoji as full width', () => {
    expect(measure('가', 10)).toBe(10);
    expect(measure('👋', 10)).toBe(10);
    expect(measure('a', 10)).toBeCloseTo(5.6);
    expect(measure('a', 10, true)).toBeCloseTo(6);
  });
});

describe('wrapText', () => {
  const opts = { maxWidth: 100, fontSize: 10, maxLines: 4 };

  it('keeps short text on one line', () => {
    expect(wrapText('hello world', opts)).toEqual(['hello world']);
  });

  it('wraps on spaces', () => {
    const lines = wrapText('one two three four five six seven', opts);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(measure(line, 10)).toBeLessThanOrEqual(100);
    expect(lines.join(' ')).toBe('one two three four five six seven');
  });

  it('hard-breaks long text without spaces (CJK)', () => {
    const lines = wrapText('가나다라마바사아자차카타파하가나다라마바사', opts);
    expect(lines).toEqual(['가나다라마바사아자차', '카타파하가나다라마바', '사']);
  });

  it('respects newlines and drops empty lines', () => {
    expect(wrapText('first\n\nsecond', opts)).toEqual(['first', 'second']);
  });

  it('truncates to maxLines with an ellipsis that fits', () => {
    const lines = wrapText('가'.repeat(100), { ...opts, maxLines: 2 });
    expect(lines).toHaveLength(2);
    expect(lines[1].endsWith('…')).toBe(true);
    expect(measure(lines[1], 10)).toBeLessThanOrEqual(100);
  });

  it('returns an empty array for blank text', () => {
    expect(wrapText('   ', opts)).toEqual([]);
  });
});
