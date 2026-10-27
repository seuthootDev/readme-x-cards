import { XMLValidator } from 'fast-xml-parser';
import { describe, expect, it } from 'vitest';
import { formatDate } from '../src/render/text.js';
import { aurora } from '../src/themes/aurora.js';
import { brutal } from '../src/themes/brutal.js';
import { paper } from '../src/themes/paper.js';
import { receipt } from '../src/themes/receipt.js';
import { sunset } from '../src/themes/sunset.js';
import { terminal } from '../src/themes/terminal.js';
import { FAKE_AVATAR, sampleMinimalPost, sampleNastyPost, samplePost } from './theme-samples.js';

const height = (svg: string) => Number(/<svg[^>]* height="(\d+)"/.exec(svg)?.[1]);

function expectValidSvg(svg: string) {
  expect(XMLValidator.validate(svg)).toBe(true);
  expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
  expect(svg).toContain('width="450"');
  expect(svg).not.toMatch(/href="https?:/);
  for (const m of svg.matchAll(/<text x="(-?[\d.]+)"/g)) {
    expect(Number(m[1])).toBeGreaterThanOrEqual(0);
    expect(Number(m[1])).toBeLessThanOrEqual(450);
  }
}

const feed = [
  { ...samplePost, id: '3', text: 'third and newest post' },
  { ...sampleMinimalPost, id: '2', text: 'second post', createdAt: '2026-10-01T12:00:00.000Z' },
  { ...samplePost, id: '1', text: '', likes: undefined, replies: undefined, reposts: undefined, views: undefined },
];

describe.each([aurora, terminal, paper, brutal, receipt, sunset])('$name feed', (theme) => {
  it('renders every post once under one author header', () => {
    const svg = theme.renderFeed(feed, FAKE_AVATAR);
    expectValidSvg(svg);
    expect(svg).toContain('third and newest post');
    expect(svg).toContain('second post');
    expect(svg.match(/@jack/g)?.length).toBeGreaterThanOrEqual(1);
    expect(svg).toContain('Latest posts by @jack on X');
    expect(svg).toMatchSnapshot();
  });

  it('grows with each post', () => {
    expect(height(theme.renderFeed(feed.slice(0, 2), null))).toBeGreaterThan(height(theme.renderFeed(feed.slice(0, 1), null)));
    expect(height(theme.renderFeed(feed, null))).toBeGreaterThan(height(theme.renderFeed(feed.slice(0, 2), null)));
  });

  it('escapes hostile text and caps each post at three lines', () => {
    const svg = theme.renderFeed([sampleNastyPost, sampleNastyPost], null);
    expectValidSvg(svg);
    expect(svg).not.toContain('<script>');
    expect(svg.match(/class="body"/g)).toHaveLength(6);
  });

  it('formats dates in the given locale (terminal keeps ISO dates)', () => {
    const svg = theme.renderFeed([samplePost], null, { locale: 'ko' });
    if (theme === terminal) expect(svg).toContain('2006-03-21');
    else expect(svg.toUpperCase()).toContain(formatDate(samplePost.createdAt, 'ko').toUpperCase());
  });
});

describe('render options on single cards', () => {
  it.each([aurora, paper, brutal, receipt, sunset])('$name formats the post date in the given locale', (theme) => {
    const svg = theme.renderPost(samplePost, null, { locale: 'ko' });
    expectValidSvg(svg);
    expect(svg).toContain('2006년 3월 21일');
  });

  it('brutal widens the date tag for long localized dates and keeps it inside the card', () => {
    const svg = brutal.renderPost(samplePost, null, { locale: 'ko' });
    const tag = /<rect x="(\d+)" y="24" width="(\d+)" height="24"/.exec(svg)!;
    expect(Number(tag[2])).toBeGreaterThan(102);
    expect(Number(tag[1]) + Number(tag[2])).toBe(420);
  });

  it.each([
    [aurora, 'stroke="#ffffff" stroke-opacity=".18"'],
    [terminal, 'fill="#0d1117" stroke="#30363d"'],
    [paper, 'fill="#ffffff" stroke="#d0d7de"'],
  ] as const)('$name drops its outline with hideBorder', (theme, outline) => {
    expect(theme.renderPost(samplePost, null)).toContain(outline);
    expect(theme.renderProfile({ ...samplePost.author, bio: '', followers: 1, following: 1, posts: 1 }, null)).toContain(outline);
    expect(theme.renderPost(samplePost, null, { hideBorder: true })).not.toContain(outline);
    expect(theme.renderFeed([samplePost], null, { hideBorder: true })).not.toContain(outline);
  });
});
