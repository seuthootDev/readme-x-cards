import { XMLValidator } from 'fast-xml-parser';
import { describe, expect, it } from 'vitest';
import { measure } from '../src/render/text.js';
import { brutal } from '../src/themes/brutal.js';
import { paper } from '../src/themes/paper.js';
import { receipt } from '../src/themes/receipt.js';
import { sunset } from '../src/themes/sunset.js';
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

// Every number drawn at an x position must stay inside the 450px card.
function expectInsideCard(svg: string) {
  for (const m of svg.matchAll(/<text x="(-?[\d.]+)"/g)) {
    expect(Number(m[1])).toBeGreaterThanOrEqual(0);
    expect(Number(m[1])).toBeLessThanOrEqual(450);
  }
}

describe.each([paper, brutal, receipt, sunset])('$name theme', (theme) => {
  it('renders a profile card', () => {
    const svg = theme.renderProfile(sampleProfile, FAKE_AVATAR);
    expectValidSvg(svg);
    expectInsideCard(svg);
    expect(svg).toContain('@Seuthoot');
    expect(svg).toMatch(/Seunghoon Jung|SEUNGHOON JUNG/);
    expect(svg).toMatchSnapshot();
  });

  it('renders an escaped two-line bio and grows taller for it', () => {
    const plain = theme.renderProfile({ ...sampleProfileWithBio, bio: '' }, FAKE_AVATAR);
    const svg = theme.renderProfile(sampleProfileWithBio, FAKE_AVATAR);
    expectValidSvg(svg);
    expectInsideCard(svg);
    expect(svg).toContain('no state is the best state &amp;');
    expect(svg).not.toContain('<b>');
    expect(svg).toContain('…');
    expect(height(svg)).toBeGreaterThan(height(plain));
    expect(svg).toMatchSnapshot();
  });

  it('truncates a very long name', () => {
    const svg = theme.renderProfile(sampleLongNameProfile, null);
    expectValidSvg(svg);
    expect(svg).not.toContain(`>${'A'.repeat(50)}<`);
    expect(svg).toMatch(/A+…/);
  });

  it('renders a post card with metrics and media', () => {
    const svg = theme.renderPost(samplePost, FAKE_AVATAR);
    expectValidSvg(svg);
    expectInsideCard(svg);
    expect(svg).toContain('just setting up my twttr');
    expect(svg).toMatch(/2 photos · 1 video/i);
    expect(svg).toMatch(/124[.,]/);
    expect(svg).toMatchSnapshot();
  });

  it('hides metrics the source did not provide', () => {
    const svg = theme.renderPost(sampleMinimalPost, null);
    expectValidSvg(svg);
    expect(svg).not.toMatch(/replies|REPLIES/);
    expect(svg).not.toMatch(/views|VIEWS/);
    expect(svg).toMatch(/likes|LIKES/);
  });

  it('handles a media-only post without metrics', () => {
    const svg = theme.renderPost({ ...samplePost, text: '', likes: undefined, replies: undefined, reposts: undefined, views: undefined }, null);
    expectValidSvg(svg);
    expect(svg).not.toContain('class="body"');
  });

  it('escapes and wraps hostile text to four lines', () => {
    const svg = theme.renderPost(sampleNastyPost, null);
    expectValidSvg(svg);
    expectInsideCard(svg);
    expect(svg).not.toContain('<script>');
    expect(svg).not.toContain('\u0007');
    expect(svg.match(/class="body"/g)).toHaveLength(4);
  });

  it('renders an error card', () => {
    const svg = theme.renderError('User not found');
    expectValidSvg(svg);
    expect(svg).toMatch(/User not found|USER NOT FOUND/);
    expect(svg).toMatchSnapshot();
  });
});

describe('theme-specific details', () => {
  it('paper is a white card with a blue verified badge', () => {
    const svg = paper.renderProfile(sampleProfileWithBio, null);
    expect(svg).toContain('fill="#ffffff" stroke="#d0d7de"');
    expect(svg).toContain('#1d9bf0');
  });

  it('brutal upper-cases names and draws hard shadows', () => {
    const svg = brutal.renderProfile(sampleProfile, null);
    expect(svg).toContain('>SEUNGHOON JUNG<');
    expect(svg).toContain('<rect x="8" y="8"');
  });

  it('receipt prints exact counts and the same barcode for the same account', () => {
    const svg = receipt.renderProfile(sampleProfileWithBio, FAKE_AVATAR);
    expect(svg).toContain('12,467,573');
    expect(svg).toContain('TOTAL FOLLOWERS');
    expect(svg).not.toContain('<image');
    const bars = (s: string) => [...s.matchAll(/<rect x="(\d+)" y="\d+" width="(\d)" height="34"/g)].map((m) => `${m[1]}:${m[2]}`).join(' ');
    expect(bars(svg)).toBe(bars(receipt.renderProfile({ ...sampleProfileWithBio, bio: '' }, null)));
    expect(bars(svg)).not.toBe(bars(receipt.renderProfile(sampleProfile, null)));
  });

  it('receipt totals views separately from the other metrics', () => {
    const svg = receipt.renderPost(samplePost, null);
    expect(svg).toContain('TOTAL VIEWS');
    expect(svg).toContain('1,234,567');
    expect(svg).toContain('ORDER #20');
  });

  it('sunset keeps the post body clear of the sun', () => {
    const svg = sunset.renderPost(sampleNastyPost, null);
    expect(svg).toContain('mask="url(#stripes)"');
    // Body lines are capped at 320px from x=24, so they end left of the sun (center 392, radius 46).
    const unescape = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
    const lines = [...svg.matchAll(/class="body"[^>]*>([^<]*)</g)].map((m) => unescape(m[1]));
    expect(lines).toHaveLength(4);
    for (const line of lines) expect(measure(line, 16)).toBeLessThanOrEqual(320);
  });
});
