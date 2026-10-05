import { XMLValidator } from 'fast-xml-parser';
import { describe, expect, it } from 'vitest';
import { aurora } from '../src/themes/aurora.js';
import { mediaSummary, metricItems, initialOf } from '../src/themes/shared.js';
import {
  FAKE_AVATAR,
  sampleLongNameProfile,
  sampleMinimalPost,
  sampleNastyPost,
  samplePost,
  sampleProfile,
  sampleProfileWithBio,
} from './theme-samples.js';

const height = (svg: string) => Number(/<svg[^>]* height="(\d+)"/.exec(svg)?.[1]);

function expectValidSvg(svg: string) {
  expect(XMLValidator.validate(svg)).toBe(true);
  expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
  expect(svg).toContain('width="450"');
  // No external references allowed (GitHub's <img> rendering blocks them).
  expect(svg).not.toMatch(/href="https?:/);
}

describe('theme shared helpers', () => {
  it('initialOf', () => {
    expect(initialOf('seunghoon')).toBe('S');
    expect(initialOf('  ')).toBe('?');
    expect(initialOf('정승훈')).toBe('정');
  });
  it('mediaSummary', () => {
    expect(mediaSummary({ photos: 2, videos: 1 })).toBe('2 photos · 1 video');
    expect(mediaSummary({ photos: 1, videos: 0 })).toBe('1 photo');
    expect(mediaSummary({ photos: 0, videos: 0 })).toBe('');
  });
  it('metricItems keeps order and drops undefined', () => {
    expect(metricItems(samplePost).map((m) => m.key)).toEqual(['replies', 'reposts', 'likes', 'views']);
    expect(metricItems(sampleMinimalPost)).toEqual([{ key: 'likes', value: 0 }]);
  });
});

describe('aurora theme', () => {
  it('renders a profile card', () => {
    const svg = aurora.renderProfile(sampleProfile, FAKE_AVATAR);
    expectValidSvg(svg);
    expect(svg).toContain('Seunghoon Jung');
    expect(svg).toContain('@Seuthoot');
    expect(svg).toContain(FAKE_AVATAR);
    expect(svg).toContain('Followers');
    expect(height(svg)).toBe(170);
    expect(svg).toMatchSnapshot();
  });

  it('renders bio (max 2 lines, escaped), verified badge and big numbers', () => {
    const svg = aurora.renderProfile(sampleProfileWithBio, FAKE_AVATAR);
    expectValidSvg(svg);
    expect(svg).toContain('&amp; &lt;b&gt;tags&lt;/b&gt;');
    expect(svg).toContain('12.5M');
    expect(svg).toContain('31K');
    expect(svg).toContain('#1d9bf0');
    expect(svg).toContain('…');
    expect(height(svg)).toBeGreaterThan(170);
    expect(svg).toMatchSnapshot();
  });

  it('truncates a very long name', () => {
    const svg = aurora.renderProfile(sampleLongNameProfile, null);
    expectValidSvg(svg);
    // The full name may appear in <title>/aria-label, but the visible <text> must be cut.
    expect(svg).not.toContain(`>${'A'.repeat(50)}<`);
    expect(svg).toMatch(/>A+…<\/text>/);
  });

  it('falls back to an initial when there is no avatar', () => {
    const svg = aurora.renderProfile(sampleProfile, null);
    expectValidSvg(svg);
    expect(svg).not.toContain('<image');
    expect(svg).toMatch(/>S<\/text>/);
  });

  it('renders a post card with metrics, media and date', () => {
    const svg = aurora.renderPost(samplePost, FAKE_AVATAR);
    expectValidSvg(svg);
    expect(svg).toContain('just setting up my twttr');
    expect(svg).toContain('Mar 21, 2006');
    expect(svg).toContain('18.1K');
    expect(svg).toContain('124.7K');
    expect(svg).toContain('309.4K');
    expect(svg).toContain('1.2M');
    expect(svg).toContain('2 photos · 1 video');
    expect(svg).toMatchSnapshot();
  });

  it('hides metrics the source did not provide', () => {
    const svg = aurora.renderPost(sampleMinimalPost, null);
    expectValidSvg(svg);
    expect(svg).not.toContain('💬');
    expect(svg).not.toContain('👁');
    expect(svg).toContain('♡');
  });

  it('escapes and wraps hostile text', () => {
    const svg = aurora.renderPost(sampleNastyPost, null);
    expectValidSvg(svg);
    expect(svg).not.toContain('<script>');
    expect(svg).not.toContain('\u0007');
    expect(svg.match(/class="body"/g)).toHaveLength(4);
  });

  it('renders an error card', () => {
    const svg = aurora.renderError('User not found');
    expectValidSvg(svg);
    expect(svg).toContain('User not found');
    expect(svg).toMatchSnapshot();
  });
});
