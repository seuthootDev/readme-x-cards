const XML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

// Characters XML 1.0 forbids even when escaped.
const ILLEGAL_XML_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

export function escapeXml(s: string): string {
  return s.replace(ILLEGAL_XML_CHARS, '').replace(/[&<>"']/g, (c) => XML_ESCAPES[c]);
}

const UNITS: ReadonlyArray<readonly [string, number]> = [
  ['B', 1e9],
  ['M', 1e6],
  ['K', 1e3],
];

export function formatCount(n: number): string {
  if (!Number.isFinite(n) || n < 1000) return String(Math.max(0, Math.trunc(n || 0)));
  for (let i = 0; i < UNITS.length; i++) {
    const [suffix, size] = UNITS[i];
    if (n < size) continue;
    const rounded = Math.round((n / size) * 10) / 10;
    if (rounded >= 1000 && i > 0) {
      const [biggerSuffix, biggerSize] = UNITS[i - 1];
      return `${Math.round((n / biggerSize) * 10) / 10}${biggerSuffix}`;
    }
    return `${rounded}${suffix}`;
  }
  return String(n);
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function isWide(cp: number): boolean {
  return (
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe4f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    cp >= 0x1f300
  );
}

// No font metrics in a serverless SVG renderer, so widths are estimated:
// full-width glyphs = fontSize, everything else = 0.56em (sans) / 0.6em (mono).
export function measure(text: string, fontSize: number, mono = false): number {
  let width = 0;
  for (const ch of text) {
    width += isWide(ch.codePointAt(0)!) ? fontSize : fontSize * (mono ? 0.6 : 0.56);
  }
  return width;
}

export interface WrapOptions {
  maxWidth: number;
  fontSize: number;
  maxLines: number;
  mono?: boolean;
}

export function wrapText(text: string, opts: WrapOptions): string[] {
  const { maxWidth, fontSize, maxLines, mono = false } = opts;
  const fits = (s: string) => measure(s, fontSize, mono) <= maxWidth;
  const lines: string[] = [];

  for (const paragraph of text.split(/\r?\n/)) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (fits(candidate)) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      // A word wider than the line is broken by characters.
      let chunk = '';
      for (const ch of word) {
        if (fits(chunk + ch)) {
          chunk += ch;
        } else {
          lines.push(chunk);
          chunk = ch;
        }
      }
      line = chunk;
    }
    if (line) lines.push(line);
  }

  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1];
  while (last && !fits(`${last}…`)) last = Array.from(last).slice(0, -1).join('');
  kept[maxLines - 1] = `${last.trimEnd()}…`;
  return kept;
}
