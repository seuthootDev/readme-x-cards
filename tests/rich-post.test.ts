import { XMLValidator } from 'fast-xml-parser';
import { describe, expect, it } from 'vitest';
import type { Post } from '../src/model.js';
import { measure } from '../src/render/text.js';
import { aurora } from '../src/themes/aurora.js';
import { brutal } from '../src/themes/brutal.js';
import { paper } from '../src/themes/paper.js';
import { receipt } from '../src/themes/receipt.js';
import { previewHeight, quoteBox, richText } from '../src/themes/shared.js';
import { sunset } from '../src/themes/sunset.js';
import { terminal } from '../src/themes/terminal.js';
import { FAKE_AVATAR, samplePost } from './theme-samples.js';

const PREVIEW = 'data:image/jpeg;base64,BBBB';
const height = (svg: string) => Number(/<svg[^>]* height="(\d+)"/.exec(svg)?.[1]);

const richPost: Post = {
  ...samplePost,
  text: 'Shipping with @vercel today #buildinpublic vercel.com/docs',
  replyTo: 'someone',
  quote: { author: { username: 'tj', name: 'TJ <Holo>', avatarUrl: '', verified: false }, text: 'quoted & "escaped" @mention' },
  thumbnail: { url: 'https://pbs.twimg.com/media/x?format=jpg&name=small', width: 1600, height: 900, video: true },
  media: { photos: 0, videos: 1 },
};

describe('richText', () => {
  const marked = (s: string) => richText(s, 'C').replace(/<tspan fill="C">/g, '[').replace(/<\/tspan>/g, ']');

  it('marks mentions, hashtags and links', () => {
    expect(marked('hi @vercel, see #한국어 and https://github.com/x or vercel.com/docs')).toBe(
      'hi [@vercel], see [#한국어] and [https://github.com/x] or [vercel.com/docs]',
    );
  });

  it('leaves look-alikes plain and escapes everything', () => {
    expect(marked('Node.js e.g. 8.4% a@b.com C# #1 x#y')).toBe('Node.js e.g. 8.4% a@b.com C# #1 x#y');
    expect(marked('<b>@a&b</b>')).toBe('&lt;b&gt;[@a]&amp;b&lt;/b&gt;');
  });
});

describe('previewHeight', () => {
  it('keeps the aspect ratio between 120 and 220px', () => {
    expect(previewHeight({ url: '', width: 1600, height: 900, video: false }, 400)).toBe(220);
    expect(previewHeight({ url: '', width: 1000, height: 400, video: false }, 400)).toBe(160);
    expect(previewHeight({ url: '', width: 4000, height: 400, video: false }, 400)).toBe(120);
  });
});

describe('quoteBox', () => {
  it('caps the quote at two lines and reports its bottom', () => {
    const one = quoteBox({ author: richPost.quote!.author, text: 'short' }, 100, { x: 24, width: 400, fontSize: 13, ink: '#000', muted: '#666', link: '#00f', box: 'fill="none"' });
    const long = quoteBox({ author: richPost.quote!.author, text: 'word '.repeat(80) }, 100, { x: 24, width: 400, fontSize: 13, ink: '#000', muted: '#666', link: '#00f', box: 'fill="none"' });
    expect(long.svg.match(/class="quote"/g)).toHaveLength(2);
    expect(long.bottom).toBeGreaterThan(one.bottom);
    expect(one.svg).toContain('TJ &lt;Holo&gt;');
  });
});

describe.each([aurora, terminal, paper, brutal, receipt, sunset])('$name rich post', (theme) => {
  const svg = theme.renderPost(richPost, FAKE_AVATAR, {}, PREVIEW);

  it('stays a valid, self-contained SVG', () => {
    expect(XMLValidator.validate(svg)).toBe(true);
    expect(svg).not.toMatch(/href="https?:/);
    expect(svg).not.toContain('<Holo>');
    expect(svg).toMatchSnapshot();
  });

  it('highlights entities in the body', () => {
    expect(svg).toMatch(/<tspan fill="[^"]+"[^>]*>@vercel<\/tspan>/);
    expect(svg).toMatch(/<tspan fill="[^"]+"[^>]*>#buildinpublic<\/tspan>/);
  });

  it('shows the reply target and the quote', () => {
    expect(svg).toMatch(/@someone/);
    expect(svg).toContain('quoted &amp; &quot;escaped&quot;');
    expect(height(svg)).toBeGreaterThan(height(theme.renderPost({ ...richPost, replyTo: undefined, quote: undefined }, FAKE_AVATAR, {}, PREVIEW)));
  });

  it('draws the preview only when its image arrived', () => {
    const withImage = svg.includes(PREVIEW);
    expect(withImage).toBe(theme !== receipt);
    const without = theme.renderPost(richPost, FAKE_AVATAR, {}, null);
    expect(without).not.toContain(PREVIEW);
    if (withImage) {
      expect(height(svg)).toBeGreaterThan(height(without));
      expect(svg).toContain('<circle'); // play button for a video
      // With the preview showing the post's only video, the "1 video" line is dropped.
      expect(svg).not.toMatch(/1 video/i);
      expect(without).toMatch(/1 video/i);
    }
  });
});

it('sunset keeps previews and quotes left of the sun', () => {
  const svg = sunset.renderPost(richPost, null, {}, PREVIEW);
  for (const m of svg.matchAll(/<(?:rect|image) x="(\d+)" y="[\d.]+" width="(\d+)"[^>]*(?:preview|rx="10")/g)) {
    expect(Number(m[1]) + Number(m[2])).toBeLessThanOrEqual(346);
  }
  const quoteLines = [...svg.matchAll(/class="quote"[^>]*>(.*?)<\/text>/g)].map((m) =>
    m[1]
      .replace(/<[^>]+>/g, '')
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&'),
  );
  for (const line of quoteLines) expect(measure(line, 13)).toBeLessThanOrEqual(320 - 28);
});
