import { XMLValidator } from 'fast-xml-parser';
import { describe, expect, it } from 'vitest';
import { terminal } from '../src/themes/terminal.js';
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
  expect(svg).not.toMatch(/href="https?:/);
}

describe('terminal theme', () => {
  it('renders a profile card', () => {
    const svg = terminal.renderProfile(sampleProfile, FAKE_AVATAR);
    expectValidSvg(svg);
    expect(svg).toContain('#0d1117');
    expect(svg).toContain('~/x/Seuthoot');
    expect(svg).toContain('x whoami');
    expect(svg).toContain('Seunghoon Jung');
    expect(svg).toContain('followers');
    expect(height(svg)).toBe(170);
    expect(svg).toMatchSnapshot();
  });

  it('renders bio as comments, verified mark and big numbers', () => {
    const svg = terminal.renderProfile(sampleProfileWithBio, FAKE_AVATAR);
    expectValidSvg(svg);
    expect(svg).toContain('# no state is the best state &amp;');
    expect(svg).toContain('✓');
    expect(svg).toContain('12.5M');
    expect(height(svg)).toBeGreaterThan(170);
    expect(svg).toMatchSnapshot();
  });

  it('truncates a very long name and falls back to an initial', () => {
    const svg = terminal.renderProfile(sampleLongNameProfile, null);
    expectValidSvg(svg);
    // The full name may appear in <title>/aria-label, but the visible <text> must be cut.
    expect(svg).not.toContain(`>${'A'.repeat(50)}<`);
    expect(svg).toMatch(/>A+…<tspan/);
    expect(svg).not.toContain('<image');
  });

  it('renders a post card', () => {
    const svg = terminal.renderPost(samplePost, FAKE_AVATAR);
    expectValidSvg(svg);
    expect(svg).toContain('post/20');
    expect(svg).toContain('// 2006-03-21');
    expect(svg).toContain('&quot;just setting up my twttr&quot;');
    expect(svg).toContain('[2 photos · 1 video]');
    expect(svg).toContain('reposts');
    expect(svg).toContain('124.7K');
    expect(svg).toMatchSnapshot();
  });

  it('hides metrics the source did not provide', () => {
    const svg = terminal.renderPost(sampleMinimalPost, null);
    expectValidSvg(svg);
    expect(svg).not.toContain('replies');
    expect(svg).not.toContain('views');
    expect(svg).toContain('likes');
  });

  it('escapes and wraps hostile text', () => {
    const svg = terminal.renderPost(sampleNastyPost, null);
    expectValidSvg(svg);
    expect(svg).not.toContain('<script>');
    expect(svg.match(/class="body"/g)).toHaveLength(4);
  });

  it('renders an error card', () => {
    const svg = terminal.renderError('X data temporarily unavailable');
    expectValidSvg(svg);
    expect(svg).toContain('error: X data temporarily unavailable');
    expect(svg).toMatchSnapshot();
  });
});
