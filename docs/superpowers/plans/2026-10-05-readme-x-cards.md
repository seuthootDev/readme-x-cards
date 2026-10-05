# readme-x-cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vercel에 배포되는 오픈소스 서비스로, GitHub README에 URL 한 줄로 넣는 X 프로필 카드·포스트 카드 SVG와 미리보기/코드 복사 랜딩 페이지를 만든다.

**Architecture:** `api/*.ts`는 Web 표준 `GET(request: Request): Response` 형태의 얇은 Vercel 함수이고, 모든 로직은 플랫폼 독립적인 `src/`에 있다. `src/fetchers`가 비공식 무료 출처(syndication, fxtwitter)를 공통 `Profile`/`Post` 타입으로 바꾸고, `src/themes`가 그 타입만 보고 SVG 문자열을 그리며, `src/cards.ts`가 검증→조회→아바타 내장→렌더링→캐시 헤더를 조합한다. 랜딩은 빌드 없는 `public/index.html` + `public/parse-input.js`.

**Tech Stack:** TypeScript (ESM, `module: NodeNext`), Node 20+, Vercel Functions, Vitest, fast-xml-parser(테스트용 XML 검증), tsx(스모크 스크립트).

**Spec:** `docs/superpowers/specs/2026-10-05-readme-x-cards-design.md`

## Global Constraints

- 운영 비용 0원: 유료 X API 사용 금지, DB/KV 사용 금지, 환경 변수 없이 동작.
- 데이터 출처는 `https://cdn.syndication.twimg.com/tweet-result`, `https://api.fxtwitter.com` 두 곳뿐.
- 공개 인터페이스: `GET /api/profile?user=&theme=`, `GET /api/post?id=&theme=`, `GET /api/post?user=&index=&theme=`.
- `user`: `^[A-Za-z0-9_]{1,15}$` (앞의 `@` 허용 후 제거). `id`: `^[0-9]{1,25}$`. `index`: 정수 1–10, 기본 1. `id`와 `user`가 모두 있으면 `id` 우선.
- 테마는 `aurora`(기본값), `terminal` 두 개. 알 수 없는 값은 기본값.
- 모든 응답은 HTTP 200 + `Content-Type: image/svg+xml; charset=utf-8`.
- Cache-Control 값 (정확히 이 문자열):
  - 프로필 `public, max-age=3600, s-maxage=21600, stale-while-revalidate=86400`
  - 포스트(id) `public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400`
  - 포스트(user+index) `public, max-age=1800, s-maxage=3600, stale-while-revalidate=86400`
  - 에러(잘못된 입력/없음) `public, max-age=3600, s-maxage=3600`
  - 에러(출처 장애) `public, max-age=600, s-maxage=600`
- 에러 문구: `Invalid username`, `Invalid post id`, `Missing id or user`, `index must be 1-10`, `User not found`, `Post not found`, `Account is private`, `X data temporarily unavailable`.
- 타임아웃: 출처 5000ms, 아바타 3000ms. 아바타 실패는 에러가 아니며 이름 첫 글자 원으로 대체.
- 카드 폭 450px 고정. 소개글 최대 2줄, 포스트 본문 최대 4줄 후 `…`.
- 큰 수 축약: 18072 → `18.1K`, 12467573 → `12.5M`.
- SVG에 넣는 모든 외부 텍스트는 XML 이스케이프. 외부 리소스 참조 금지(아바타는 base64 data URI).
- CI 테스트는 네트워크 호출 금지(`fetch`는 모두 모킹).
- 라이선스 MIT. X 로고 사용 금지.
- 셸은 Windows(PowerShell/Git Bash) 기준이지만 아래 명령은 둘 다에서 동작한다.

## Review Focus

1. **특수문자/제어문자가 든 포스트 본문** (`&`, `<`, `"`, `\u0007` 같은 XML 금지 문자, 이모지) — SVG가 깨지지 않고 유효한 XML이어야 한다. → Task 1 `escapeXml` 테스트, Task 6·7 테마 XML 유효성 테스트.
2. **공백 없는 긴 텍스트와 긴 이름** (한중일 문장, 50자 이름) — 카드 밖으로 넘치지 않고 잘리거나 줄바꿈되어야 한다. → Task 1 `wrapText` CJK 테스트, Task 6·7 긴 이름 테스트.
3. **fxtwitter의 "없음" 응답이 JSON이 아님** (없는 사용자 → 302 HTML, 없는 포스트 → 200 HTML) — 크래시나 장애 카드가 아니라 `NOT_FOUND`여야 한다. → Task 3 테스트.
4. **출처가 느리거나 죽음** (타임아웃, 429, 5xx) — 5초 안에 `UPSTREAM` 카드(10분 캐시)로 끝나야 한다. → Task 3·4·8 테스트.
5. **랜딩 입력의 다양한 링크 형태** (`?s=20` 쿼리, `mobile.twitter.com`, 끝 슬래시, `x.com/home`) — 올바르게 인식하거나 거부해야 한다. → Task 10 테스트.
6. **`theme=constructor` 같은 프로토타입 키** — 기본 테마로 처리되어야 한다(객체 조회 시 `Object.prototype` 누출 방지). → Task 7 테스트.

---

## File Structure

```
package.json, tsconfig.json, .gitignore, LICENSE, README.md
api/
  profile.ts            Vercel 함수 → profileCard
  post.ts               Vercel 함수 → postCard
src/
  model.ts              Profile, Post, CardError
  params.ts             쿼리 검증/정규화
  cards.ts              조합 + CACHE 상수 + svgResponse
  fetchers/
    shared.ts           getJson(타임아웃/상태코드→CardError), largeAvatar
    fxtwitter.ts        fetchProfile, fetchPost, fetchLatestPost
    syndication.ts      fetchPost, syndicationToken
    index.ts            getProfile, getPostById(폴백), getLatestPost
  render/
    text.ts             escapeXml, formatCount, formatDate, measure, wrapText
    avatar.ts           toDataUri
  themes/
    types.ts            Theme 인터페이스
    shared.ts           initialOf, mediaSummary, metricItems
    aurora.ts
    terminal.ts
    index.ts            getTheme, DEFAULT_THEME, themeNames
public/
  index.html            랜딩
  parse-input.js        입력 파싱/URL·스니펫 생성 (테스트 대상)
scripts/
  smoke.ts              실제 출처로 카드 생성 → docs/previews/
tests/
  helpers.ts            fetch 모킹 유틸
  fixtures/*.json       2026-10-05 실제 응답(일부 필드만)
  *.test.ts
```

---

### Task 1: 프로젝트 스캐폴드 + 텍스트 유틸

**Files:**
- Create: `package.json`, `tsconfig.json`
- Modify: `.gitignore`
- Create: `src/render/text.ts`
- Test: `tests/text.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `escapeXml(s: string): string`
  - `formatCount(n: number): string`
  - `formatDate(iso: string): string` — `"Sep 1, 2026"` 형식, UTC
  - `measure(text: string, fontSize: number, mono?: boolean): number`
  - `interface WrapOptions { maxWidth: number; fontSize: number; maxLines: number; mono?: boolean }`
  - `wrapText(text: string, opts: WrapOptions): string[]`

- [ ] **Step 1: package.json, tsconfig.json 작성 및 의존성 설치**

`package.json`:

```json
{
  "name": "readme-x-cards",
  "version": "0.1.0",
  "private": true,
  "description": "X (Twitter) profile and post cards for your GitHub README",
  "license": "MIT",
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "smoke": "tsx scripts/smoke.ts"
  }
}
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "allowJs": true,
    "checkJs": false,
    "types": ["node"]
  },
  "include": ["api", "src", "tests", "scripts", "public/*.js"]
}
```

`.gitignore`를 다음 내용으로 교체:

```
.superpowers/
node_modules/
.vercel/
out/
```

Run: `npm install -D typescript vitest fast-xml-parser tsx @types/node`
Expected: `node_modules/` 생성, `package.json`에 `devDependencies` 추가.

- [ ] **Step 2: 실패하는 테스트 작성**

`tests/text.test.ts`:

```ts
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
```

- [ ] **Step 3: 테스트가 실패하는지 확인**

Run: `npx vitest run tests/text.test.ts`
Expected: FAIL — `Failed to resolve import "../src/render/text.js"`

- [ ] **Step 4: 구현**

`src/render/text.ts`:

```ts
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
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run tests/text.test.ts`
Expected: PASS (모든 테스트)

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 6: 커밋**

```bash
git add package.json package-lock.json tsconfig.json .gitignore src/render/text.ts tests/text.test.ts
git commit -m "feat: scaffold project and add SVG text utilities"
```

---

### Task 2: 공통 모델 + 쿼리 검증

**Files:**
- Create: `src/model.ts`, `src/params.ts`
- Test: `tests/params.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces (`src/model.ts`):
  ```ts
  interface Profile { username: string; name: string; avatarUrl: string; bio: string; verified: boolean; followers: number; following: number; posts: number }
  interface PostAuthor { username: string; name: string; avatarUrl: string; verified: boolean }
  interface Post { id: string; url: string; text: string; createdAt: string; author: PostAuthor; replies?: number; reposts?: number; likes?: number; views?: number; media: { photos: number; videos: number } }
  type CardErrorKind = 'INVALID_PARAMS' | 'NOT_FOUND' | 'UPSTREAM'
  class CardError extends Error { readonly kind: CardErrorKind }
  ```
- Produces (`src/params.ts`):
  ```ts
  type ProfileQuery = { username: string; theme: string }
  type PostQuery = { kind: 'id'; id: string; theme: string } | { kind: 'latest'; username: string; index: number; theme: string }
  parseProfileQuery(params: URLSearchParams): ProfileQuery   // throws CardError('INVALID_PARAMS')
  parsePostQuery(params: URLSearchParams): PostQuery
  ```

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/params.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { CardError } from '../src/model.js';
import { parsePostQuery, parseProfileQuery } from '../src/params.js';

const q = (s: string) => new URLSearchParams(s);

function expectInvalid(fn: () => unknown, message: string) {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(CardError);
    expect((err as CardError).kind).toBe('INVALID_PARAMS');
    expect((err as CardError).message).toBe(message);
    return;
  }
  throw new Error('expected CardError');
}

describe('parseProfileQuery', () => {
  it('accepts a username and theme', () => {
    expect(parseProfileQuery(q('user=Seuthoot&theme=terminal'))).toEqual({ username: 'Seuthoot', theme: 'terminal' });
  });
  it('strips a leading @ and whitespace', () => {
    expect(parseProfileQuery(q('user=%20@Seuthoot%20')).username).toBe('Seuthoot');
  });
  it('defaults theme to empty string', () => {
    expect(parseProfileQuery(q('user=jack')).theme).toBe('');
  });
  it.each(['', 'a-b', 'way_too_long_username', 'bad name', '<script>'])('rejects %j', (user) => {
    expectInvalid(() => parseProfileQuery(q(`user=${encodeURIComponent(user)}`)), 'Invalid username');
  });
  it('rejects a missing user', () => {
    expectInvalid(() => parseProfileQuery(q('')), 'Invalid username');
  });
});

describe('parsePostQuery', () => {
  it('parses an id', () => {
    expect(parsePostQuery(q('id=2094701798535885304&theme=aurora'))).toEqual({
      kind: 'id',
      id: '2094701798535885304',
      theme: 'aurora',
    });
  });
  it('prefers id over user', () => {
    expect(parsePostQuery(q('id=20&user=jack')).kind).toBe('id');
  });
  it.each(['', 'abc', '12a', '1'.repeat(26)])('rejects id %j', (id) => {
    expectInvalid(() => parsePostQuery(q(`id=${id}`)), 'Invalid post id');
  });
  it('parses latest with default index 1', () => {
    expect(parsePostQuery(q('user=Seuthoot'))).toEqual({ kind: 'latest', username: 'Seuthoot', index: 1, theme: '' });
  });
  it('parses an explicit index', () => {
    expect(parsePostQuery(q('user=Seuthoot&index=10'))).toMatchObject({ kind: 'latest', index: 10 });
  });
  it.each(['0', '11', '1.5', '-1', 'abc', ''])('rejects index %j', (index) => {
    expectInvalid(() => parsePostQuery(q(`user=jack&index=${index}`)), 'index must be 1-10');
  });
  it('rejects when neither id nor user is given', () => {
    expectInvalid(() => parsePostQuery(q('theme=aurora')), 'Missing id or user');
  });
  it('rejects an invalid user', () => {
    expectInvalid(() => parsePostQuery(q('user=a-b')), 'Invalid username');
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run tests/params.test.ts`
Expected: FAIL — `Failed to resolve import "../src/model.js"`

- [ ] **Step 3: 구현**

`src/model.ts`:

```ts
export interface Profile {
  username: string;
  name: string;
  avatarUrl: string;
  bio: string;
  verified: boolean;
  followers: number;
  following: number;
  posts: number;
}

export interface PostAuthor {
  username: string;
  name: string;
  avatarUrl: string;
  verified: boolean;
}

export interface Post {
  id: string;
  url: string;
  text: string;
  /** ISO 8601 */
  createdAt: string;
  author: PostAuthor;
  /** Metrics are optional: a source that does not provide one leaves it undefined and the card hides it. */
  replies?: number;
  reposts?: number;
  likes?: number;
  views?: number;
  media: { photos: number; videos: number };
}

export type CardErrorKind = 'INVALID_PARAMS' | 'NOT_FOUND' | 'UPSTREAM';

export class CardError extends Error {
  readonly kind: CardErrorKind;

  constructor(kind: CardErrorKind, message: string) {
    super(message);
    this.name = 'CardError';
    this.kind = kind;
  }
}
```

`src/params.ts`:

```ts
import { CardError } from './model.js';

const USERNAME = /^[A-Za-z0-9_]{1,15}$/;
const POST_ID = /^[0-9]{1,25}$/;

export type ProfileQuery = { username: string; theme: string };

export type PostQuery =
  | { kind: 'id'; id: string; theme: string }
  | { kind: 'latest'; username: string; index: number; theme: string };

function parseUsername(raw: string | null): string {
  const value = (raw ?? '').trim().replace(/^@/, '');
  if (!USERNAME.test(value)) throw new CardError('INVALID_PARAMS', 'Invalid username');
  return value;
}

export function parseProfileQuery(params: URLSearchParams): ProfileQuery {
  return { username: parseUsername(params.get('user')), theme: params.get('theme') ?? '' };
}

export function parsePostQuery(params: URLSearchParams): PostQuery {
  const theme = params.get('theme') ?? '';

  const rawId = params.get('id');
  if (rawId !== null) {
    const id = rawId.trim();
    if (!POST_ID.test(id)) throw new CardError('INVALID_PARAMS', 'Invalid post id');
    return { kind: 'id', id, theme };
  }

  if (params.get('user') === null) throw new CardError('INVALID_PARAMS', 'Missing id or user');
  const username = parseUsername(params.get('user'));

  const rawIndex = params.get('index') ?? '1';
  const index = Number(rawIndex);
  if (!/^\d+$/.test(rawIndex) || index < 1 || index > 10) {
    throw new CardError('INVALID_PARAMS', 'index must be 1-10');
  }
  return { kind: 'latest', username, index, theme };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/params.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/model.ts src/params.ts tests/params.test.ts
git commit -m "feat: add card model and query validation"
```

---

### Task 3: HTTP 헬퍼 + fxtwitter fetcher

**Files:**
- Create: `src/fetchers/shared.ts`, `src/fetchers/fxtwitter.ts`
- Create: `tests/helpers.ts`, `tests/fixtures/fx-profile.json`, `tests/fixtures/fx-statuses.json`, `tests/fixtures/fx-post.json`
- Test: `tests/fxtwitter.test.ts`

**Interfaces:**
- Consumes: `CardError`, `Profile`, `Post` (Task 2)
- Produces:
  - `SOURCE_TIMEOUT_MS = 5000`
  - `getJson(url: string, notFoundMessage: string, timeoutMs?: number): Promise<unknown>` — 네트워크 오류/타임아웃/429/5xx → `CardError('UPSTREAM', 'X data temporarily unavailable')`, 그 외 non-2xx 또는 JSON 아님 → `CardError('NOT_FOUND', notFoundMessage)`
  - `largeAvatar(url: string | null | undefined): string` — `_normal.jpg` → `_200x200.jpg`
  - `fxtwitter.fetchProfile(username: string): Promise<Profile>`
  - `fxtwitter.fetchPost(id: string): Promise<Post>`
  - `fxtwitter.fetchLatestPost(username: string, index: number): Promise<Post>` — 리포스트 제외
  - `tests/helpers.ts`: `jsonResponse(body, status?)`, `htmlResponse(status?)`, `imageResponse(bytes?, type?)`, `mockFetch(handler: (url: string) => Response | Promise<Response>)`

배경: fxtwitter는 없는 사용자에 302 HTML, 없는 포스트에 200 HTML을 돌려준다(2026-10-05 확인). 그래서 `redirect: 'manual'`로 리다이렉트를 따라가지 않고, JSON 파싱 실패를 `NOT_FOUND`로 본다. `/i/status/{id}`는 사용자명 없이 포스트를 조회하는 fxtwitter 경로다.

- [ ] **Step 1: 테스트 헬퍼와 fixture 작성**

`tests/helpers.ts`:

```ts
import { vi } from 'vitest';

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

export function htmlResponse(status = 200): Response {
  return new Response('<!DOCTYPE html><html><body>not json</body></html>', {
    status,
    headers: { 'content-type': 'text/html' },
  });
}

export function imageResponse(bytes: number[] = [1, 2, 3], type = 'image/jpeg'): Response {
  return new Response(new Uint8Array(bytes), { status: 200, headers: { 'content-type': type } });
}

export function mockFetch(handler: (url: string) => Response | Promise<Response>) {
  const fn = vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    return handler(url);
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}
```

`tests/fixtures/fx-profile.json`:

```json
{
  "code": 200,
  "message": "OK",
  "user": {
    "screen_name": "Seuthoot",
    "url": "https://x.com/Seuthoot",
    "id": "1896512501552128000",
    "followers": 0,
    "following": 0,
    "likes": 0,
    "media_count": 0,
    "tweets": 1,
    "name": "Seunghoon Jung",
    "description": "",
    "location": "Seoul",
    "banner_url": "",
    "avatar_url": "https://pbs.twimg.com/profile_images/2094700677599825920/2O5dxII5_normal.jpg",
    "joined": "Mon Mar 03 10:46:41 +0000 2025",
    "protected": false,
    "website": null,
    "verification": { "verified": false, "verified_at": null, "type": null }
  }
}
```

`tests/fixtures/fx-statuses.json`:

```json
{
  "code": 200,
  "results": [
    {
      "type": "status",
      "url": "https://x.com/Seuthoot/status/2094701798535885304",
      "id": "2094701798535885304",
      "text": "Hello! Starting today. 👋",
      "author": {
        "screen_name": "Seuthoot",
        "name": "Seunghoon Jung",
        "avatar_url": "https://pbs.twimg.com/profile_images/2094700677599825920/2O5dxII5_200x200.jpg",
        "verification": { "verified": false, "verified_at": null, "type": null }
      },
      "replies": 0,
      "reposts": 0,
      "likes": 0,
      "bookmarks": 0,
      "quotes": 0,
      "created_at": "Tue Sep 01 08:20:01 +0000 2026",
      "created_timestamp": 1788250801,
      "views": 7,
      "media": {},
      "reposted_by": null
    }
  ],
  "cursor": { "top": null, "bottom": null }
}
```

`tests/fixtures/fx-post.json`:

```json
{
  "code": 200,
  "message": "OK",
  "tweet": {
    "url": "https://x.com/jack/status/20",
    "id": "20",
    "text": "just setting up my twttr",
    "author": {
      "screen_name": "jack",
      "name": "jack",
      "avatar_url": "https://pbs.twimg.com/profile_images/1661201415899951105/azNjKOSH_200x200.jpg",
      "verification": { "verified": true, "verified_at": null, "type": "individual" }
    },
    "replies": 18072,
    "retweets": 124685,
    "likes": 309357,
    "bookmarks": 21946,
    "quotes": 7270,
    "created_at": "Tue Mar 21 20:50:14 +0000 2006",
    "created_timestamp": 1142974214,
    "views": null,
    "reposted_by": null
  }
}
```

- [ ] **Step 2: 실패하는 테스트 작성**

`tests/fxtwitter.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchLatestPost, fetchPost, fetchProfile } from '../src/fetchers/fxtwitter.js';
import { largeAvatar } from '../src/fetchers/shared.js';
import fxProfile from './fixtures/fx-profile.json' with { type: 'json' };
import fxStatuses from './fixtures/fx-statuses.json' with { type: 'json' };
import fxPost from './fixtures/fx-post.json' with { type: 'json' };
import { htmlResponse, jsonResponse, mockFetch } from './helpers.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('largeAvatar', () => {
  it('upgrades _normal avatars to 200x200', () => {
    expect(largeAvatar('https://pbs.twimg.com/profile_images/1/a_normal.jpg')).toBe(
      'https://pbs.twimg.com/profile_images/1/a_200x200.jpg',
    );
  });
  it('leaves other URLs alone and handles missing values', () => {
    expect(largeAvatar('https://pbs.twimg.com/profile_images/1/a_200x200.jpg')).toBe(
      'https://pbs.twimg.com/profile_images/1/a_200x200.jpg',
    );
    expect(largeAvatar(null)).toBe('');
  });
});

describe('fetchProfile', () => {
  it('maps the fxtwitter user to a Profile', async () => {
    const fetchMock = mockFetch(() => jsonResponse(fxProfile));
    await expect(fetchProfile('Seuthoot')).resolves.toEqual({
      username: 'Seuthoot',
      name: 'Seunghoon Jung',
      avatarUrl: 'https://pbs.twimg.com/profile_images/2094700677599825920/2O5dxII5_200x200.jpg',
      bio: '',
      verified: false,
      followers: 0,
      following: 0,
      posts: 1,
    });
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.fxtwitter.com/Seuthoot');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: 'manual' });
  });

  it('treats a redirect (unknown user) as NOT_FOUND', async () => {
    mockFetch(() => htmlResponse(302));
    await expect(fetchProfile('nobody_here')).rejects.toMatchObject({ kind: 'NOT_FOUND', message: 'User not found' });
  });

  it('treats a 200 HTML page as NOT_FOUND', async () => {
    mockFetch(() => htmlResponse(200));
    await expect(fetchProfile('nobody_here')).rejects.toMatchObject({ kind: 'NOT_FOUND' });
  });

  it('treats a JSON error code as NOT_FOUND', async () => {
    mockFetch(() => jsonResponse({ code: 404, message: 'User not found' }));
    await expect(fetchProfile('nobody_here')).rejects.toMatchObject({ kind: 'NOT_FOUND' });
  });

  it('reports private accounts', async () => {
    mockFetch(() => jsonResponse({ ...fxProfile, user: { ...fxProfile.user, protected: true } }));
    await expect(fetchProfile('Seuthoot')).rejects.toMatchObject({ kind: 'NOT_FOUND', message: 'Account is private' });
  });

  it.each([429, 500, 503])('treats HTTP %d as UPSTREAM', async (status) => {
    mockFetch(() => jsonResponse({}, status));
    await expect(fetchProfile('Seuthoot')).rejects.toMatchObject({
      kind: 'UPSTREAM',
      message: 'X data temporarily unavailable',
    });
  });

  it('treats a timeout as UPSTREAM', async () => {
    mockFetch(() => {
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    });
    await expect(fetchProfile('Seuthoot')).rejects.toMatchObject({ kind: 'UPSTREAM' });
  });
});

describe('fetchPost', () => {
  it('maps the fxtwitter tweet to a Post', async () => {
    const fetchMock = mockFetch(() => jsonResponse(fxPost));
    await expect(fetchPost('20')).resolves.toEqual({
      id: '20',
      url: 'https://x.com/jack/status/20',
      text: 'just setting up my twttr',
      createdAt: '2006-03-21T20:50:14.000Z',
      author: {
        username: 'jack',
        name: 'jack',
        avatarUrl: 'https://pbs.twimg.com/profile_images/1661201415899951105/azNjKOSH_200x200.jpg',
        verified: true,
      },
      replies: 18072,
      reposts: 124685,
      likes: 309357,
      views: undefined,
      media: { photos: 0, videos: 0 },
    });
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.fxtwitter.com/i/status/20');
  });

  it('counts photos and videos', async () => {
    const tweet = {
      ...fxPost.tweet,
      media: { all: [{ type: 'photo' }, { type: 'photo' }, { type: 'video' }, { type: 'gif' }] },
    };
    mockFetch(() => jsonResponse({ ...fxPost, tweet }));
    await expect(fetchPost('20')).resolves.toMatchObject({ media: { photos: 2, videos: 2 } });
  });

  it('treats an HTML page (unknown post) as NOT_FOUND', async () => {
    mockFetch(() => htmlResponse(200));
    await expect(fetchPost('1')).rejects.toMatchObject({ kind: 'NOT_FOUND', message: 'Post not found' });
  });
});

describe('fetchLatestPost', () => {
  it('returns the n-th latest post', async () => {
    const fetchMock = mockFetch(() => jsonResponse(fxStatuses));
    await expect(fetchLatestPost('Seuthoot', 1)).resolves.toMatchObject({
      id: '2094701798535885304',
      text: 'Hello! Starting today. 👋',
      createdAt: '2026-09-01T08:20:01.000Z',
      reposts: 0,
      views: 7,
    });
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.fxtwitter.com/2/profile/Seuthoot/statuses');
  });

  it('skips reposts of other accounts', async () => {
    const own = fxStatuses.results[0];
    const repost = { ...own, id: '999', text: 'someone else', reposted_by: { id: '1896512501552128000' } };
    mockFetch(() => jsonResponse({ ...fxStatuses, results: [repost, own] }));
    await expect(fetchLatestPost('Seuthoot', 1)).resolves.toMatchObject({ id: '2094701798535885304' });
  });

  it('is NOT_FOUND when the index is past the end', async () => {
    mockFetch(() => jsonResponse(fxStatuses));
    await expect(fetchLatestPost('Seuthoot', 2)).rejects.toMatchObject({ kind: 'NOT_FOUND', message: 'Post not found' });
  });

  it('is NOT_FOUND for an unknown user (404 JSON)', async () => {
    mockFetch(() => jsonResponse({ code: 404, results: [] }, 404));
    await expect(fetchLatestPost('nobody_here', 1)).rejects.toMatchObject({ kind: 'NOT_FOUND' });
  });
});
```

- [ ] **Step 3: 테스트가 실패하는지 확인**

Run: `npx vitest run tests/fxtwitter.test.ts`
Expected: FAIL — `Failed to resolve import "../src/fetchers/fxtwitter.js"`

- [ ] **Step 4: 구현**

`src/fetchers/shared.ts`:

```ts
import { CardError } from '../model.js';

export const SOURCE_TIMEOUT_MS = 5000;

const UPSTREAM_MESSAGE = 'X data temporarily unavailable';

export async function getJson(url: string, notFoundMessage: string, timeoutMs = SOURCE_TIMEOUT_MS): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, {
      // fxtwitter answers unknown users with a redirect to its homepage; never follow it.
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: 'application/json', 'user-agent': 'readme-x-cards' },
    });
  } catch {
    throw new CardError('UPSTREAM', UPSTREAM_MESSAGE);
  }

  if (res.status === 429 || res.status >= 500) throw new CardError('UPSTREAM', UPSTREAM_MESSAGE);
  if (res.status < 200 || res.status >= 300) throw new CardError('NOT_FOUND', notFoundMessage);

  try {
    return await res.json();
  } catch {
    // Both sources answer some "not found" cases with an HTML page.
    throw new CardError('NOT_FOUND', notFoundMessage);
  }
}

export function largeAvatar(url: string | null | undefined): string {
  return (url ?? '').replace(/_normal(\.\w+)$/, '_200x200$1');
}
```

`src/fetchers/fxtwitter.ts`:

```ts
import { CardError, type Post, type Profile } from '../model.js';
import { getJson, largeAvatar } from './shared.js';

const BASE = 'https://api.fxtwitter.com';

interface FxUser {
  screen_name: string;
  name: string;
  avatar_url?: string | null;
  description?: string | null;
  followers?: number;
  following?: number;
  tweets?: number;
  statuses?: number;
  protected?: boolean;
  verification?: { verified?: boolean } | null;
}

interface FxStatus {
  id: string;
  url: string;
  text: string;
  created_timestamp: number;
  author: FxUser;
  replies?: number;
  retweets?: number;
  reposts?: number;
  likes?: number;
  views?: number | null;
  media?: { all?: { type?: string }[] } | null;
  reposted_by?: unknown;
}

function toProfile(user: FxUser): Profile {
  return {
    username: user.screen_name,
    name: user.name,
    avatarUrl: largeAvatar(user.avatar_url),
    bio: user.description ?? '',
    verified: Boolean(user.verification?.verified),
    followers: user.followers ?? 0,
    following: user.following ?? 0,
    posts: user.tweets ?? user.statuses ?? 0,
  };
}

function toPost(status: FxStatus): Post {
  const media = status.media?.all ?? [];
  return {
    id: status.id,
    url: status.url,
    text: status.text,
    createdAt: new Date(status.created_timestamp * 1000).toISOString(),
    author: {
      username: status.author.screen_name,
      name: status.author.name,
      avatarUrl: largeAvatar(status.author.avatar_url),
      verified: Boolean(status.author.verification?.verified),
    },
    replies: status.replies,
    // v1 endpoints call it "retweets", v2 endpoints "reposts".
    reposts: status.reposts ?? status.retweets,
    likes: status.likes,
    views: status.views ?? undefined,
    media: {
      photos: media.filter((m) => m.type === 'photo').length,
      videos: media.filter((m) => m.type === 'video' || m.type === 'gif').length,
    },
  };
}

export async function fetchProfile(username: string): Promise<Profile> {
  const data = (await getJson(`${BASE}/${encodeURIComponent(username)}`, 'User not found')) as {
    code?: number;
    user?: FxUser;
  };
  if (data?.code !== 200 || !data.user) throw new CardError('NOT_FOUND', 'User not found');
  if (data.user.protected) throw new CardError('NOT_FOUND', 'Account is private');
  return toProfile(data.user);
}

export async function fetchPost(id: string): Promise<Post> {
  const data = (await getJson(`${BASE}/i/status/${id}`, 'Post not found')) as { code?: number; tweet?: FxStatus };
  if (data?.code !== 200 || !data.tweet) throw new CardError('NOT_FOUND', 'Post not found');
  return toPost(data.tweet);
}

export async function fetchLatestPost(username: string, index: number): Promise<Post> {
  const data = (await getJson(`${BASE}/2/profile/${encodeURIComponent(username)}/statuses`, 'Post not found')) as {
    code?: number;
    results?: (FxStatus & { type?: string })[];
  };
  if (data?.code !== 200 || !Array.isArray(data.results)) throw new CardError('NOT_FOUND', 'Post not found');
  const own = data.results.filter((s) => s.type === 'status' && !s.reposted_by);
  const status = own[index - 1];
  if (!status) throw new CardError('NOT_FOUND', 'Post not found');
  return toPost(status);
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run tests/fxtwitter.test.ts`
Expected: PASS

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 6: 커밋**

```bash
git add src/fetchers/shared.ts src/fetchers/fxtwitter.ts tests/helpers.ts tests/fixtures tests/fxtwitter.test.ts
git commit -m "feat: add fxtwitter fetcher with not-found and upstream handling"
```

---

### Task 4: syndication fetcher + 출처 폴백

**Files:**
- Create: `src/fetchers/syndication.ts`, `src/fetchers/index.ts`
- Create: `tests/fixtures/syn-post.json`
- Test: `tests/syndication.test.ts`, `tests/fetchers.test.ts`

**Interfaces:**
- Consumes: `getJson`, `largeAvatar` (Task 3), `fxtwitter.*` (Task 3), `CardError`, `Post`, `Profile` (Task 2)
- Produces:
  - `syndicationToken(id: string): string`
  - `syndication.fetchPost(id: string): Promise<Post>` — `reposts`, `views`는 undefined
  - `getProfile(username: string): Promise<Profile>`
  - `getPostById(id: string): Promise<Post>` — syndication → 실패 시 fxtwitter. 둘 다 `NOT_FOUND`면 `NOT_FOUND`, 그 외 둘 다 실패면 `UPSTREAM`
  - `getLatestPost(username: string, index: number): Promise<Post>`

배경: syndication 응답의 `display_text_range`는 UTF-16 단위다(👋가 2로 계산됨, 2026-10-05 확인). 그래서 `String.prototype.slice`로 자른다. 본문은 v1.1 API처럼 `&amp;`/`&lt;`/`&gt;`가 HTML 엔티티로 올 수 있고, v1.1의 인덱스는 엔티티를 푼 텍스트 기준이므로 **먼저 디코드한 뒤** 자른다(엔티티가 든 실제 포스트로는 확인하지 못함 — Task 11 스모크 때 `&`가 든 포스트 ID로 한 번 확인할 것). 토큰 공식은 Vercel `react-tweet`과 같다.

- [ ] **Step 1: fixture 작성**

`tests/fixtures/syn-post.json`:

```json
{
  "__typename": "Tweet",
  "favorite_count": 308841,
  "lang": "en",
  "created_at": "2006-03-21T20:50:14.000Z",
  "display_text_range": [0, 24],
  "entities": {},
  "id_str": "20",
  "text": "just setting up my twttr",
  "user": {
    "id_str": "12",
    "name": "jack",
    "screen_name": "jack",
    "is_blue_verified": true,
    "verified": false,
    "profile_image_url_https": "https://pbs.twimg.com/profile_images/1661201415899951105/azNjKOSH_normal.jpg"
  },
  "conversation_count": 18072
}
```

- [ ] **Step 2: 실패하는 테스트 작성**

`tests/syndication.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchPost, syndicationToken } from '../src/fetchers/syndication.js';
import synPost from './fixtures/syn-post.json' with { type: 'json' };
import { htmlResponse, jsonResponse, mockFetch } from './helpers.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('syndicationToken', () => {
  it('produces a non-empty base36 token without zeros or dots', () => {
    const token = syndicationToken('2094701798535885304');
    expect(token).toMatch(/^[1-9a-z]+$/);
  });
});

describe('syndication fetchPost', () => {
  it('maps the tweet to a Post', async () => {
    const fetchMock = mockFetch(() => jsonResponse(synPost));
    await expect(fetchPost('20')).resolves.toEqual({
      id: '20',
      url: 'https://x.com/jack/status/20',
      text: 'just setting up my twttr',
      createdAt: '2006-03-21T20:50:14.000Z',
      author: {
        username: 'jack',
        name: 'jack',
        avatarUrl: 'https://pbs.twimg.com/profile_images/1661201415899951105/azNjKOSH_200x200.jpg',
        verified: true,
      },
      replies: 18072,
      reposts: undefined,
      likes: 308841,
      views: undefined,
      media: { photos: 0, videos: 0 },
    });
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url.startsWith('https://cdn.syndication.twimg.com/tweet-result?id=20&lang=en&token=')).toBe(true);
  });

  it('cuts trailing media links using display_text_range (UTF-16) and decodes entities', async () => {
    mockFetch(() =>
      jsonResponse({
        ...synPost,
        // Indices count the decoded text: "Tom & Jerry <3 " is 15 units, 👋 is 2.
        text: 'Tom &amp; Jerry &lt;3 👋 https://t.co/abc',
        display_text_range: [0, 17],
        mediaDetails: [{ type: 'photo' }, { type: 'video' }, { type: 'animated_gif' }],
      }),
    );
    await expect(fetchPost('20')).resolves.toMatchObject({
      text: 'Tom & Jerry <3 👋',
      media: { photos: 1, videos: 2 },
    });
  });

  it('treats tombstones as NOT_FOUND', async () => {
    mockFetch(() => jsonResponse({ __typename: 'TweetTombstone' }));
    await expect(fetchPost('20')).rejects.toMatchObject({ kind: 'NOT_FOUND', message: 'Post not found' });
  });

  it('treats a 404 HTML page as NOT_FOUND', async () => {
    mockFetch(() => htmlResponse(404));
    await expect(fetchPost('1')).rejects.toMatchObject({ kind: 'NOT_FOUND' });
  });
});
```

`tests/fetchers.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPostById } from '../src/fetchers/index.js';
import synPost from './fixtures/syn-post.json' with { type: 'json' };
import fxPost from './fixtures/fx-post.json' with { type: 'json' };
import { htmlResponse, jsonResponse, mockFetch } from './helpers.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

const isSyndication = (url: string) => url.startsWith('https://cdn.syndication.twimg.com/');

describe('getPostById', () => {
  it('uses syndication first', async () => {
    const fetchMock = mockFetch((url) => (isSyndication(url) ? jsonResponse(synPost) : jsonResponse(fxPost)));
    await expect(getPostById('20')).resolves.toMatchObject({ likes: 308841 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to fxtwitter when syndication fails', async () => {
    mockFetch((url) => (isSyndication(url) ? jsonResponse({}, 503) : jsonResponse(fxPost)));
    await expect(getPostById('20')).resolves.toMatchObject({ likes: 309357, reposts: 124685 });
  });

  it('is NOT_FOUND when both sources say not found', async () => {
    mockFetch(() => htmlResponse(404));
    await expect(getPostById('1')).rejects.toMatchObject({ kind: 'NOT_FOUND', message: 'Post not found' });
  });

  it('is UPSTREAM when both fail and at least one is an outage', async () => {
    mockFetch((url) => (isSyndication(url) ? htmlResponse(404) : jsonResponse({}, 500)));
    await expect(getPostById('20')).rejects.toMatchObject({ kind: 'UPSTREAM' });
  });
});
```

- [ ] **Step 3: 테스트가 실패하는지 확인**

Run: `npx vitest run tests/syndication.test.ts tests/fetchers.test.ts`
Expected: FAIL — `Failed to resolve import "../src/fetchers/syndication.js"`

- [ ] **Step 4: 구현**

`src/fetchers/syndication.ts`:

```ts
import { CardError, type Post } from '../model.js';
import { getJson, largeAvatar } from './shared.js';

const BASE = 'https://cdn.syndication.twimg.com/tweet-result';

interface SynTweet {
  __typename?: string;
  id_str?: string;
  text?: string;
  created_at?: string;
  display_text_range?: [number, number];
  favorite_count?: number;
  conversation_count?: number;
  user?: {
    screen_name: string;
    name: string;
    profile_image_url_https?: string;
    is_blue_verified?: boolean;
    verified?: boolean;
  };
  mediaDetails?: { type?: string }[];
}

// Same token formula as Vercel's react-tweet.
export function syndicationToken(id: string): string {
  return ((Number(id) / 1e15) * Math.PI).toString(6 ** 2).replace(/(0+|\.)/g, '');
}

function decodeEntities(s: string): string {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

export async function fetchPost(id: string): Promise<Post> {
  const url = `${BASE}?id=${id}&lang=en&token=${syndicationToken(id)}`;
  const tweet = (await getJson(url, 'Post not found')) as SynTweet;
  if (tweet?.__typename !== 'Tweet' || !tweet.id_str || !tweet.user || typeof tweet.text !== 'string') {
    throw new CardError('NOT_FOUND', 'Post not found');
  }

  // display_text_range excludes trailing t.co media links; indices are UTF-16 units of the decoded text.
  const text = decodeEntities(tweet.text);
  const [start, end] = tweet.display_text_range ?? [0, text.length];
  const media = tweet.mediaDetails ?? [];

  return {
    id: tweet.id_str,
    url: `https://x.com/${tweet.user.screen_name}/status/${tweet.id_str}`,
    text: text.slice(start, end).trim(),
    createdAt: tweet.created_at ?? '',
    author: {
      username: tweet.user.screen_name,
      name: tweet.user.name,
      avatarUrl: largeAvatar(tweet.user.profile_image_url_https),
      verified: Boolean(tweet.user.is_blue_verified || tweet.user.verified),
    },
    replies: tweet.conversation_count,
    reposts: undefined,
    likes: tweet.favorite_count,
    views: undefined,
    media: {
      photos: media.filter((m) => m.type === 'photo').length,
      videos: media.filter((m) => m.type === 'video' || m.type === 'animated_gif').length,
    },
  };
}
```

`src/fetchers/index.ts`:

```ts
import { CardError, type Post, type Profile } from '../model.js';
import * as fxtwitter from './fxtwitter.js';
import * as syndication from './syndication.js';

const isNotFound = (err: unknown) => err instanceof CardError && err.kind === 'NOT_FOUND';

export function getProfile(username: string): Promise<Profile> {
  return fxtwitter.fetchProfile(username);
}

export async function getPostById(id: string): Promise<Post> {
  try {
    return await syndication.fetchPost(id);
  } catch (first) {
    try {
      return await fxtwitter.fetchPost(id);
    } catch (second) {
      if (isNotFound(first) && isNotFound(second)) throw second;
      throw new CardError('UPSTREAM', 'X data temporarily unavailable');
    }
  }
}

export function getLatestPost(username: string, index: number): Promise<Post> {
  return fxtwitter.fetchLatestPost(username, index);
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run tests/syndication.test.ts tests/fetchers.test.ts`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add src/fetchers/syndication.ts src/fetchers/index.ts tests/fixtures/syn-post.json tests/syndication.test.ts tests/fetchers.test.ts
git commit -m "feat: add syndication fetcher and source fallback"
```

---

### Task 5: 아바타 base64 내장

**Files:**
- Create: `src/render/avatar.ts`
- Test: `tests/avatar.test.ts`

**Interfaces:**
- Consumes: 없음 (전역 `fetch`)
- Produces: `AVATAR_TIMEOUT_MS = 3000`, `toDataUri(url: string): Promise<string | null>` — `https://pbs.twimg.com/`만 허용, 실패/비이미지/300KB 초과 시 `null`, 절대 throw 하지 않음

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/avatar.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toDataUri } from '../src/render/avatar.js';
import { htmlResponse, imageResponse, mockFetch } from './helpers.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

const AVATAR = 'https://pbs.twimg.com/profile_images/1/a_200x200.jpg';

describe('toDataUri', () => {
  it('returns a base64 data URI', async () => {
    mockFetch(() => imageResponse([1, 2, 3], 'image/jpeg'));
    await expect(toDataUri(AVATAR)).resolves.toBe('data:image/jpeg;base64,AQID');
  });

  it('strips content-type parameters', async () => {
    mockFetch(() => imageResponse([1, 2, 3], 'image/png; charset=binary'));
    await expect(toDataUri(AVATAR)).resolves.toBe('data:image/png;base64,AQID');
  });

  it('refuses hosts other than pbs.twimg.com without fetching', async () => {
    const fetchMock = mockFetch(() => imageResponse());
    await expect(toDataUri('https://evil.example.com/a.jpg')).resolves.toBeNull();
    await expect(toDataUri('')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns null for non-image responses', async () => {
    mockFetch(() => htmlResponse(200));
    await expect(toDataUri(AVATAR)).resolves.toBeNull();
  });

  it('returns null for HTTP errors', async () => {
    mockFetch(() => new Response('', { status: 404 }));
    await expect(toDataUri(AVATAR)).resolves.toBeNull();
  });

  it('returns null for oversized images', async () => {
    mockFetch(() => imageResponse(new Array(300_001).fill(0)));
    await expect(toDataUri(AVATAR)).resolves.toBeNull();
  });

  it('returns null when fetch throws (timeout)', async () => {
    mockFetch(() => {
      throw new DOMException('timeout', 'TimeoutError');
    });
    await expect(toDataUri(AVATAR)).resolves.toBeNull();
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run tests/avatar.test.ts`
Expected: FAIL — `Failed to resolve import "../src/render/avatar.js"`

- [ ] **Step 3: 구현**

`src/render/avatar.ts`:

```ts
export const AVATAR_TIMEOUT_MS = 3000;

const MAX_BYTES = 300_000;
const ALLOWED_PREFIX = 'https://pbs.twimg.com/';
const IMAGE_TYPE = /^image\/[a-z0-9.+-]+$/;

// SVGs shown through <img> (as GitHub does) cannot load external images,
// so the avatar has to be embedded as a data URI.
export async function toDataUri(url: string): Promise<string | null> {
  if (!url.startsWith(ALLOWED_PREFIX)) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(AVATAR_TIMEOUT_MS) });
    if (!res.ok) return null;
    const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (!IMAGE_TYPE.test(type)) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.byteLength > MAX_BYTES) return null;
    return `data:${type};base64,${bytes.toString('base64')}`;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/avatar.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/render/avatar.ts tests/avatar.test.ts
git commit -m "feat: embed avatars as base64 data URIs"
```

---

### Task 6: Theme 인터페이스 + aurora 테마

**Files:**
- Create: `src/themes/types.ts`, `src/themes/shared.ts`, `src/themes/aurora.ts`
- Create: `tests/theme-samples.ts`
- Test: `tests/aurora.test.ts`

**Interfaces:**
- Consumes: `Profile`, `Post` (Task 2), `escapeXml`, `formatCount`, `formatDate`, `measure`, `wrapText` (Task 1)
- Produces:
  - `interface Theme { name: string; renderProfile(profile: Profile, avatar: string | null): string; renderPost(post: Post, avatar: string | null): string; renderError(message: string): string }`
  - `initialOf(name: string): string`
  - `mediaSummary(media: Post['media']): string` — 예: `"2 photos · 1 video"`, 없으면 `""`
  - `metricItems(post: Post): { key: 'replies' | 'reposts' | 'likes' | 'views'; value: number }[]` — undefined 항목 제외, 이 순서
  - `aurora: Theme`
  - `tests/theme-samples.ts`: `sampleProfile`, `sampleProfileWithBio`, `sampleLongNameProfile`, `samplePost`, `sampleMinimalPost`, `sampleNastyPost`, `FAKE_AVATAR`

디자인: 브레인스토밍 목업 B(Aurora Glass). 짙은 배경(`#0b0b14`)에 보라(`#7c3aed`)·청록(`#06b6d4`)·핑크(`#ec4899`) radial gradient 3개, 안쪽 12px 여백의 반투명 유리 패널, 흰 글자, 프로필 스탯은 알약 모양.

- [ ] **Step 1: 테스트용 샘플 데이터 작성**

`tests/theme-samples.ts`:

```ts
import type { Post, Profile } from '../src/model.js';

export const FAKE_AVATAR = 'data:image/jpeg;base64,AQID';

export const sampleProfile: Profile = {
  username: 'Seuthoot',
  name: 'Seunghoon Jung',
  avatarUrl: 'https://pbs.twimg.com/profile_images/2094700677599825920/2O5dxII5_200x200.jpg',
  bio: '',
  verified: false,
  followers: 0,
  following: 0,
  posts: 1,
};

export const sampleProfileWithBio: Profile = {
  ...sampleProfile,
  username: 'jack',
  name: 'jack',
  bio: 'no state is the best state & <b>tags</b> "quoted" — 그리고 아주 긴 한국어 소개글이 두 줄을 넘어가면 말줄임표로 잘려야 합니다 정말 길게 길게 길게',
  verified: true,
  followers: 12467573,
  following: 3,
  posts: 31008,
};

export const sampleLongNameProfile: Profile = {
  ...sampleProfile,
  name: 'A'.repeat(50),
  verified: true,
};

export const samplePost: Post = {
  id: '20',
  url: 'https://x.com/jack/status/20',
  text: 'just setting up my twttr',
  createdAt: '2006-03-21T20:50:14.000Z',
  author: { username: 'jack', name: 'jack', avatarUrl: '', verified: true },
  replies: 18072,
  reposts: 124685,
  likes: 309357,
  views: 1234567,
  media: { photos: 2, videos: 1 },
};

export const sampleMinimalPost: Post = {
  ...samplePost,
  replies: undefined,
  reposts: undefined,
  views: undefined,
  likes: 0,
  media: { photos: 0, videos: 0 },
};

export const sampleNastyPost: Post = {
  ...samplePost,
  author: { ...samplePost.author, name: '<script>alert(1)</script> & "co"' },
  text: 'a < b && c > d "quoted" \u0007bell 👋\n\n' + '공백없는한국어문장이아주길게이어집니다'.repeat(8),
};
```

- [ ] **Step 2: 실패하는 테스트 작성**

`tests/aurora.test.ts`:

```ts
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
```

- [ ] **Step 3: 테스트가 실패하는지 확인**

Run: `npx vitest run tests/aurora.test.ts`
Expected: FAIL — `Failed to resolve import "../src/themes/aurora.js"`

- [ ] **Step 4: 구현**

`src/themes/types.ts`:

```ts
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
```

`src/themes/shared.ts`:

```ts
import type { Post } from '../model.js';

export function initialOf(name: string): string {
  const first = Array.from(name.trim())[0];
  return first ? first.toUpperCase() : '?';
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function mediaSummary(media: Post['media']): string {
  const parts: string[] = [];
  if (media.photos > 0) parts.push(plural(media.photos, 'photo'));
  if (media.videos > 0) parts.push(plural(media.videos, 'video'));
  return parts.join(' · ');
}

export type MetricKey = 'replies' | 'reposts' | 'likes' | 'views';

export function metricItems(post: Post): { key: MetricKey; value: number }[] {
  const keys: MetricKey[] = ['replies', 'reposts', 'likes', 'views'];
  return keys.flatMap((key) => {
    const value = post[key];
    return value === undefined ? [] : [{ key, value }];
  });
}
```

`src/themes/aurora.ts`:

```ts
import type { Post, Profile } from '../model.js';
import { escapeXml, formatCount, formatDate, measure, wrapText } from '../render/text.js';
import { initialOf, mediaSummary, metricItems, type MetricKey } from './shared.js';
import type { Theme } from './types.js';

const W = 450;
const FONT = "-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";
const ICONS: Record<MetricKey, string> = { replies: '💬', reposts: '🔁', likes: '♡', views: '👁' };

function frame(height: number, label: string, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${height}" viewBox="0 0 ${W} ${height}" role="img" aria-label="${escapeXml(label)}" font-family="${FONT}">
<title>${escapeXml(label)}</title>
<defs>
<clipPath id="card"><rect width="${W}" height="${height}" rx="18"/></clipPath>
<radialGradient id="g1" cx="15%" cy="10%" r="70%"><stop offset="0" stop-color="#7c3aed"/><stop offset="1" stop-color="#7c3aed" stop-opacity="0"/></radialGradient>
<radialGradient id="g2" cx="95%" cy="100%" r="70%"><stop offset="0" stop-color="#06b6d4"/><stop offset="1" stop-color="#06b6d4" stop-opacity="0"/></radialGradient>
<radialGradient id="g3" cx="70%" cy="0%" r="50%"><stop offset="0" stop-color="#ec4899" stop-opacity=".8"/><stop offset="1" stop-color="#ec4899" stop-opacity="0"/></radialGradient>
</defs>
<g clip-path="url(#card)">
<rect width="${W}" height="${height}" fill="#0b0b14"/>
<rect width="${W}" height="${height}" fill="url(#g1)"/>
<rect width="${W}" height="${height}" fill="url(#g2)"/>
<rect width="${W}" height="${height}" fill="url(#g3)"/>
<rect x="12" y="12" width="${W - 24}" height="${height - 24}" rx="14" fill="#ffffff" fill-opacity=".08" stroke="#ffffff" stroke-opacity=".18"/>
</g>
${body}
</svg>`;
}

function avatar(uri: string | null, name: string, cx: number, cy: number, r: number): string {
  if (!uri) {
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#ffffff" fill-opacity=".16"/>
<text x="${cx}" y="${cy}" dy=".35em" text-anchor="middle" font-size="${r}" font-weight="700" fill="#ffffff">${escapeXml(initialOf(name))}</text>`;
  }
  return `<clipPath id="avatar"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>
<image href="${uri}" x="${cx - r}" y="${cy - r}" width="${r * 2}" height="${r * 2}" clip-path="url(#avatar)"/>`;
}

function badge(x: number, y: number): string {
  return `<g transform="translate(${Math.round(x)} ${y})"><circle r="8" fill="#1d9bf0"/><path d="M-3.5 0.2 L-1 2.7 L3.8 -2.4" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></g>`;
}

const oneLine = (text: string, maxWidth: number, fontSize: number) => wrapText(text, { maxWidth, fontSize, maxLines: 1 })[0] ?? '';

function renderProfile(p: Profile, avatarUri: string | null): string {
  const name = oneLine(p.name, 280, 20);
  const bio = p.bio ? wrapText(p.bio, { maxWidth: W - 56, fontSize: 13, maxLines: 2 }) : [];
  const pillsY = bio.length ? 116 + (bio.length - 1) * 18 + 16 : 114;
  const height = pillsY + 56;

  const pills: [number, string, number][] = [
    [p.posts, 'Posts', 110],
    [p.followers, 'Followers', 130],
    [p.following, 'Following', 130],
  ];
  let x = 28;
  const pillSvg = pills
    .map(([value, label, w]) => {
      const out = `<rect x="${x}" y="${pillsY}" width="${w}" height="30" rx="15" fill="#ffffff" fill-opacity=".12"/>
<text x="${x + w / 2}" y="${pillsY + 20}" text-anchor="middle" font-size="13" fill="#ffffff"><tspan font-weight="700">${formatCount(value)}</tspan> <tspan fill-opacity=".7">${label}</tspan></text>`;
      x += w + 10;
      return out;
    })
    .join('\n');

  const body = [
    `<circle cx="58" cy="58" r="36" fill="none" stroke="#ffffff" stroke-opacity=".5" stroke-width="2"/>`,
    avatar(avatarUri, p.name, 58, 58, 34),
    `<text x="110" y="52" font-size="20" font-weight="700" fill="#ffffff">${escapeXml(name)}</text>`,
    p.verified ? badge(110 + measure(name, 20) + 14, 45) : '',
    `<text x="110" y="75" font-size="14" fill="#ffffff" fill-opacity=".65">@${escapeXml(p.username)}</text>`,
    ...bio.map(
      (line, i) =>
        `<text x="28" y="${116 + i * 18}" font-size="13" fill="#ffffff" fill-opacity=".85">${escapeXml(line)}</text>`,
    ),
    pillSvg,
  ].join('\n');

  return frame(height, `${p.name} (@${p.username}) on X`, body);
}

function renderPost(post: Post, avatarUri: string | null): string {
  const name = oneLine(post.author.name, 220, 15);
  const lines = wrapText(post.text, { maxWidth: W - 56, fontSize: 17, maxLines: 4 });
  const date = formatDate(post.createdAt);
  const media = mediaSummary(post.media);

  let y = lines.length ? 102 + (lines.length - 1) * 24 : 78;
  const mediaY = media ? (y += 24) : 0;
  const metricsY = y + 36;
  const height = metricsY + 34;

  let mx = 28;
  const metrics = metricItems(post)
    .map(({ key, value }) => {
      const text = `${ICONS[key]} ${formatCount(value)}`;
      const out = `<text x="${mx}" y="${metricsY}" font-size="13" fill="#ffffff" fill-opacity=".75">${text}</text>`;
      mx += Math.round(measure(text, 13)) + 22;
      return out;
    })
    .join('\n');

  const body = [
    avatar(avatarUri, post.author.name, 46, 46, 20),
    `<text x="78" y="42" font-size="15" font-weight="700" fill="#ffffff">${escapeXml(name)}</text>`,
    post.author.verified ? badge(78 + measure(name, 15) + 12, 37) : '',
    `<text x="78" y="61" font-size="13" fill="#ffffff" fill-opacity=".6">@${escapeXml(post.author.username)}${date ? ` · ${date}` : ''}</text>`,
    ...lines.map(
      (line, i) =>
        `<text class="body" x="28" y="${102 + i * 24}" font-size="17" fill="#ffffff">${escapeXml(line)}</text>`,
    ),
    media ? `<text x="28" y="${mediaY}" font-size="12" fill="#ffffff" fill-opacity=".6">📎 ${media}</text>` : '',
    metrics,
  ].join('\n');

  return frame(height, `Post by @${post.author.username} on X`, body);
}

function renderError(message: string): string {
  const body = `<text x="${W / 2}" y="58" text-anchor="middle" font-size="16" font-weight="600" fill="#ffffff">⚠ ${escapeXml(message)}</text>
<text x="${W / 2}" y="82" text-anchor="middle" font-size="12" fill="#ffffff" fill-opacity=".5">readme-x-cards</text>`;
  return frame(110, message, body);
}

export const aurora: Theme = { name: 'aurora', renderProfile, renderPost, renderError };
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run tests/aurora.test.ts`
Expected: PASS, `tests/__snapshots__/aurora.test.ts.snap` 생성

- [ ] **Step 6: 눈으로 확인**

임시 스크립트 없이 확인하려면 Vitest 스냅샷 파일에서 프로필 SVG 하나를 복사해 `out/aurora-profile.svg`로 저장하고 브라우저로 연다. 브레인스토밍 목업 B와 비교해 배경·유리 패널·알약 배치가 같은지 확인한다. 다르면 좌표를 고치고 `npx vitest run tests/aurora.test.ts -u`로 스냅샷을 갱신한다.

- [ ] **Step 7: 커밋**

```bash
git add src/themes/types.ts src/themes/shared.ts src/themes/aurora.ts tests/theme-samples.ts tests/aurora.test.ts tests/__snapshots__
git commit -m "feat: add theme interface and aurora theme"
```

---

### Task 7: terminal 테마 + 테마 레지스트리

**Files:**
- Create: `src/themes/terminal.ts`, `src/themes/index.ts`
- Test: `tests/terminal.test.ts`, `tests/themes.test.ts`

**Interfaces:**
- Consumes: `Theme`, `initialOf`, `mediaSummary`, `metricItems` (Task 6), 텍스트 유틸 (Task 1), 샘플 (Task 6)
- Produces:
  - `terminal: Theme`
  - `DEFAULT_THEME = 'aurora'`
  - `themeNames: string[]` — `['aurora', 'terminal']`
  - `getTheme(name: string | null | undefined): Theme` — 대소문자 무시, 모르는 값/프로토타입 키는 aurora

디자인: 목업 C. 배경 `#0d1117`, 테두리 `#30363d`, 상단 30px 제목 표시줄(`#161b22`, 빨/노/초 점), 모노스페이스, 프롬프트 `#7ee787`, 핸들 `#79c0ff`, 숫자 `#ffa657`, 본문 `#a5d6ff`. 연속 공백이 보이도록 스탯 줄은 `xml:space="preserve"`.

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/terminal.test.ts`:

```ts
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
```

`tests/themes.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_THEME, getTheme, themeNames } from '../src/themes/index.js';

describe('theme registry', () => {
  it('lists the built-in themes', () => {
    expect(themeNames).toEqual(['aurora', 'terminal']);
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
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run tests/terminal.test.ts tests/themes.test.ts`
Expected: FAIL — `Failed to resolve import "../src/themes/terminal.js"`

- [ ] **Step 3: 구현**

`src/themes/terminal.ts`:

```ts
import type { Post, Profile } from '../model.js';
import { escapeXml, formatCount, wrapText } from '../render/text.js';
import { initialOf, mediaSummary, metricItems } from './shared.js';
import type { Theme } from './types.js';

const W = 450;
const MONO = "'JetBrains Mono','SF Mono',Consolas,Menlo,monospace";

function frame(height: number, title: string, label: string, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${height}" viewBox="0 0 ${W} ${height}" role="img" aria-label="${escapeXml(label)}" font-family="${MONO}">
<title>${escapeXml(label)}</title>
<rect x="0.5" y="0.5" width="${W - 1}" height="${height - 1}" rx="10" fill="#0d1117" stroke="#30363d"/>
<path d="M0.5 30.5 V10.5 a10 10 0 0 1 10 -10 H${W - 10.5} a10 10 0 0 1 10 10 V30.5 Z" fill="#161b22"/>
<line x1="0.5" y1="30.5" x2="${W - 0.5}" y2="30.5" stroke="#30363d"/>
<circle cx="18" cy="16" r="5" fill="#ff5f57"/><circle cx="34" cy="16" r="5" fill="#febc2e"/><circle cx="50" cy="16" r="5" fill="#28c840"/>
<text x="${W / 2}" y="20" font-size="11" fill="#8b949e" text-anchor="middle">${escapeXml(title)}</text>
${body}
</svg>`;
}

function avatar(uri: string | null, name: string, x: number, y: number, size: number, rx: number): string {
  if (!uri) {
    return `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${rx}" fill="#21262d"/>
<text x="${x + size / 2}" y="${y + size / 2}" dy=".35em" text-anchor="middle" font-size="${Math.round(size / 2)}" font-weight="700" fill="#79c0ff">${escapeXml(initialOf(name))}</text>`;
  }
  return `<clipPath id="avatar"><rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${rx}"/></clipPath>
<image href="${uri}" x="${x}" y="${y}" width="${size}" height="${size}" clip-path="url(#avatar)"/>`;
}

const oneLine = (text: string, maxWidth: number, fontSize: number) =>
  wrapText(text, { maxWidth, fontSize, maxLines: 1, mono: true })[0] ?? '';

const num = (value: number) => `<tspan fill="#ffa657" font-weight="700">${formatCount(value)}</tspan>`;

function renderProfile(p: Profile, avatarUri: string | null): string {
  const name = oneLine(p.name, p.verified ? 300 : 330, 16);
  const bio = p.bio ? wrapText(p.bio, { maxWidth: W - 48 - 20, fontSize: 12, maxLines: 2, mono: true }) : [];
  const statsY = bio.length ? 134 + (bio.length - 1) * 17 + 26 : 146;
  const height = statsY + 24;

  const body = [
    avatar(avatarUri, p.name, 24, 52, 56, 8),
    `<text x="96" y="62" font-size="12" fill="#7ee787">$ <tspan fill="#c9d1d9">x whoami</tspan></text>`,
    `<text x="96" y="84" font-size="16" font-weight="700" fill="#e6edf3">${escapeXml(name)}${p.verified ? '<tspan fill="#3fb950"> ✓</tspan>' : ''}</text>`,
    `<text x="96" y="104" font-size="13" fill="#79c0ff">@${escapeXml(p.username)}</text>`,
    ...bio.map(
      (line, i) => `<text x="24" y="${134 + i * 17}" font-size="12" fill="#8b949e"># ${escapeXml(line)}</text>`,
    ),
    `<text x="24" y="${statsY}" font-size="13" fill="#8b949e" xml:space="preserve">posts ${num(p.posts)}   followers ${num(p.followers)}   following ${num(p.following)}<tspan fill="#7ee787"> ▌</tspan></text>`,
  ].join('\n');

  return frame(height, `~/x/${p.username}`, `${p.name} (@${p.username}) on X`, body);
}

function renderPost(post: Post, avatarUri: string | null): string {
  const name = oneLine(post.author.name, 200, 13);
  const lines = wrapText(`"${post.text}"`, { maxWidth: W - 48, fontSize: 14, maxLines: 4, mono: true });
  const media = mediaSummary(post.media);
  const day = post.createdAt.slice(0, 10);

  let y = 112 + (lines.length - 1) * 20;
  const mediaY = media ? (y += 22) : 0;
  const statsY = y + 34;
  const height = statsY + 26;

  const stats = metricItems(post)
    .map(({ key, value }) => `${key} <tspan fill="#ffa657">${formatCount(value)}</tspan>`)
    .join('  ');

  const body = [
    avatar(avatarUri, post.author.name, 24, 48, 32, 6),
    `<text x="68" y="61" font-size="13" font-weight="700" fill="#e6edf3">${escapeXml(name)}${post.author.verified ? '<tspan fill="#3fb950"> ✓</tspan>' : ''} <tspan font-weight="400" fill="#79c0ff">@${escapeXml(post.author.username)}</tspan></text>`,
    day ? `<text x="68" y="78" font-size="11" fill="#8b949e">// ${escapeXml(day)}</text>` : '',
    ...lines.map(
      (line, i) =>
        `<text class="body" x="24" y="${112 + i * 20}" font-size="14" fill="#a5d6ff">${escapeXml(line)}</text>`,
    ),
    media ? `<text x="24" y="${mediaY}" font-size="12" fill="#8b949e">[${media}]</text>` : '',
    `<text x="24" y="${statsY}" font-size="12" fill="#8b949e" xml:space="preserve">${stats}</text>`,
  ].join('\n');

  return frame(height, `post/${post.id}`, `Post by @${post.author.username} on X`, body);
}

function renderError(message: string): string {
  const body = `<text x="24" y="62" font-size="13" fill="#7ee787">$ <tspan fill="#c9d1d9">x card</tspan></text>
<text x="24" y="86" font-size="13" fill="#ff7b72">error: ${escapeXml(message)}</text>`;
  return frame(110, 'error', message, body);
}

export const terminal: Theme = { name: 'terminal', renderProfile, renderPost, renderError };
```

`src/themes/index.ts`:

```ts
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
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/terminal.test.ts tests/themes.test.ts`
Expected: PASS

- [ ] **Step 5: 눈으로 확인**

Task 6 Step 6과 같은 방법으로 terminal 프로필/포스트 SVG를 `out/`에 저장해 브라우저로 열고 목업 C와 비교한다. 수정했다면 `npx vitest run tests/terminal.test.ts -u`.

- [ ] **Step 6: 커밋**

```bash
git add src/themes/terminal.ts src/themes/index.ts tests/terminal.test.ts tests/themes.test.ts tests/__snapshots__
git commit -m "feat: add terminal theme and theme registry"
```

---

### Task 8: 카드 조합 + 캐시 정책

**Files:**
- Create: `src/cards.ts`
- Test: `tests/cards.test.ts`

**Interfaces:**
- Consumes: `parseProfileQuery`, `parsePostQuery` (Task 2), `getProfile`, `getPostById`, `getLatestPost` (Task 4), `toDataUri` (Task 5), `getTheme` (Task 7), `CardError` (Task 2)
- Produces:
  - `CACHE: { profile; postById; latestPost; clientError; upstreamError }` — Global Constraints의 문자열 그대로
  - `interface CardResponse { svg: string; cacheControl: string }`
  - `profileCard(params: URLSearchParams): Promise<CardResponse>` — 절대 throw 하지 않음
  - `postCard(params: URLSearchParams): Promise<CardResponse>` — 절대 throw 하지 않음
  - `svgResponse(card: CardResponse): Response`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/cards.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CACHE, postCard, profileCard, svgResponse } from '../src/cards.js';
import fxProfile from './fixtures/fx-profile.json' with { type: 'json' };
import fxStatuses from './fixtures/fx-statuses.json' with { type: 'json' };
import synPost from './fixtures/syn-post.json' with { type: 'json' };
import { htmlResponse, imageResponse, jsonResponse, mockFetch } from './helpers.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const q = (s: string) => new URLSearchParams(s);

function happyRoutes(url: string): Response {
  if (url.startsWith('https://pbs.twimg.com/')) return imageResponse([1, 2, 3]);
  if (url === 'https://api.fxtwitter.com/Seuthoot') return jsonResponse(fxProfile);
  if (url === 'https://api.fxtwitter.com/2/profile/Seuthoot/statuses') return jsonResponse(fxStatuses);
  if (url.startsWith('https://cdn.syndication.twimg.com/')) return jsonResponse(synPost);
  return htmlResponse(404);
}

describe('profileCard', () => {
  it('renders the profile with an embedded avatar and profile cache', async () => {
    mockFetch(happyRoutes);
    const card = await profileCard(q('user=Seuthoot'));
    expect(card.svg).toContain('Seunghoon Jung');
    expect(card.svg).toContain('data:image/jpeg;base64,AQID');
    expect(card.svg).toContain('#7c3aed');
    expect(card.cacheControl).toBe(CACHE.profile);
  });

  it('uses the requested theme', async () => {
    mockFetch(happyRoutes);
    const card = await profileCard(q('user=Seuthoot&theme=terminal'));
    expect(card.svg).toContain('#0d1117');
  });

  it('still renders when the avatar fails', async () => {
    mockFetch((url) => (url.startsWith('https://pbs.twimg.com/') ? new Response('', { status: 500 }) : happyRoutes(url)));
    const card = await profileCard(q('user=Seuthoot'));
    expect(card.svg).not.toContain('<image');
    expect(card.cacheControl).toBe(CACHE.profile);
  });

  it('returns an invalid-input error card without calling fetch', async () => {
    const fetchMock = mockFetch(happyRoutes);
    const card = await profileCard(q('user=a-b&theme=terminal'));
    expect(card.svg).toContain('Invalid username');
    expect(card.svg).toContain('#0d1117');
    expect(card.cacheControl).toBe(CACHE.clientError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns a not-found card', async () => {
    mockFetch(() => htmlResponse(302));
    const card = await profileCard(q('user=nobody_here'));
    expect(card.svg).toContain('User not found');
    expect(card.cacheControl).toBe(CACHE.clientError);
  });

  it('returns an upstream card with a short cache', async () => {
    mockFetch(() => {
      throw new DOMException('timeout', 'TimeoutError');
    });
    const card = await profileCard(q('user=Seuthoot'));
    expect(card.svg).toContain('X data temporarily unavailable');
    expect(card.cacheControl).toBe(CACHE.upstreamError);
  });

  it('turns unexpected errors into an upstream card', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFetch(() => jsonResponse({ code: 200, user: null }));
    const broken = await profileCard(q('user=Seuthoot'));
    expect(broken.svg).toContain('User not found');

    mockFetch(() => jsonResponse({ code: 200, user: { screen_name: 'x', name: null } }));
    const card = await profileCard(q('user=Seuthoot'));
    expect(card.cacheControl).toBe(CACHE.upstreamError);
    expect(card.svg).toContain('X data temporarily unavailable');
  });
});

describe('postCard', () => {
  it('renders a post by id with the post cache', async () => {
    mockFetch(happyRoutes);
    const card = await postCard(q('id=20'));
    expect(card.svg).toContain('just setting up my twttr');
    expect(card.cacheControl).toBe(CACHE.postById);
  });

  it('renders the latest post with the latest cache', async () => {
    mockFetch(happyRoutes);
    const card = await postCard(q('user=Seuthoot&index=1&theme=terminal'));
    expect(card.svg).toContain('Hello! Starting today.');
    expect(card.svg).toContain('#0d1117');
    expect(card.cacheControl).toBe(CACHE.latestPost);
  });

  it('returns a not-found card for an index past the end', async () => {
    mockFetch(happyRoutes);
    const card = await postCard(q('user=Seuthoot&index=5'));
    expect(card.svg).toContain('Post not found');
    expect(card.cacheControl).toBe(CACHE.clientError);
  });

  it('returns an invalid-input card', async () => {
    mockFetch(happyRoutes);
    const card = await postCard(q(''));
    expect(card.svg).toContain('Missing id or user');
    expect(card.cacheControl).toBe(CACHE.clientError);
  });
});

describe('svgResponse', () => {
  it('builds a 200 SVG response with cache and security headers', async () => {
    const res = svgResponse({ svg: '<svg xmlns="http://www.w3.org/2000/svg"/>', cacheControl: CACHE.profile });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/svg+xml; charset=utf-8');
    expect(res.headers.get('cache-control')).toBe(CACHE.profile);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('content-security-policy')).toBe(
      "default-src 'none'; img-src data:; style-src 'unsafe-inline'",
    );
    expect(await res.text()).toBe('<svg xmlns="http://www.w3.org/2000/svg"/>');
  });
});
```

참고: "unexpected errors" 테스트의 두 번째 응답은 `name: null`이라 테마의 `wrapText`가 `TypeError`를 던진다. 이것이 CardError가 아닌 예외도 `UPSTREAM` 카드로 바뀌는지 확인하는 장치다.

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run tests/cards.test.ts`
Expected: FAIL — `Failed to resolve import "../src/cards.js"`

- [ ] **Step 3: 구현**

`src/cards.ts`:

```ts
import { getLatestPost, getPostById, getProfile } from './fetchers/index.js';
import { CardError } from './model.js';
import { parsePostQuery, parseProfileQuery } from './params.js';
import { toDataUri } from './render/avatar.js';
import { getTheme } from './themes/index.js';

export const CACHE = {
  profile: 'public, max-age=3600, s-maxage=21600, stale-while-revalidate=86400',
  postById: 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400',
  latestPost: 'public, max-age=1800, s-maxage=3600, stale-while-revalidate=86400',
  clientError: 'public, max-age=3600, s-maxage=3600',
  upstreamError: 'public, max-age=600, s-maxage=600',
} as const;

export interface CardResponse {
  svg: string;
  cacheControl: string;
}

function errorCard(err: unknown, themeName: string | null): CardResponse {
  const theme = getTheme(themeName);
  if (err instanceof CardError && err.kind !== 'UPSTREAM') {
    return { svg: theme.renderError(err.message), cacheControl: CACHE.clientError };
  }
  if (!(err instanceof CardError)) console.error('[readme-x-cards] unexpected error', err);
  return { svg: theme.renderError('X data temporarily unavailable'), cacheControl: CACHE.upstreamError };
}

export async function profileCard(params: URLSearchParams): Promise<CardResponse> {
  try {
    const query = parseProfileQuery(params);
    const profile = await getProfile(query.username);
    const avatar = await toDataUri(profile.avatarUrl);
    return { svg: getTheme(query.theme).renderProfile(profile, avatar), cacheControl: CACHE.profile };
  } catch (err) {
    return errorCard(err, params.get('theme'));
  }
}

export async function postCard(params: URLSearchParams): Promise<CardResponse> {
  try {
    const query = parsePostQuery(params);
    const post =
      query.kind === 'id' ? await getPostById(query.id) : await getLatestPost(query.username, query.index);
    const avatar = await toDataUri(post.author.avatarUrl);
    return {
      svg: getTheme(query.theme).renderPost(post, avatar),
      cacheControl: query.kind === 'id' ? CACHE.postById : CACHE.latestPost,
    };
  } catch (err) {
    return errorCard(err, params.get('theme'));
  }
}

export function svgResponse(card: CardResponse): Response {
  return new Response(card.svg, {
    status: 200,
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': card.cacheControl,
      'x-content-type-options': 'nosniff',
      // The SVG may be opened directly in a browser: forbid scripts and remote loads.
      'content-security-policy': "default-src 'none'; img-src data:; style-src 'unsafe-inline'",
    },
  });
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/cards.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/cards.ts tests/cards.test.ts
git commit -m "feat: compose cards with cache policy and error cards"
```

---

### Task 9: Vercel API 함수

**Files:**
- Create: `api/profile.ts`, `api/post.ts`
- Test: `tests/api.test.ts`

**Interfaces:**
- Consumes: `profileCard`, `postCard`, `svgResponse`, `CACHE` (Task 8)
- Produces: `GET(request: Request): Promise<Response>` in each file (Vercel Functions Web 시그니처)

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/api.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET as getPost } from '../api/post.js';
import { GET as getProfile } from '../api/profile.js';
import { CACHE } from '../src/cards.js';
import fxProfile from './fixtures/fx-profile.json' with { type: 'json' };
import synPost from './fixtures/syn-post.json' with { type: 'json' };
import { htmlResponse, imageResponse, jsonResponse, mockFetch } from './helpers.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

function routes(url: string): Response {
  if (url.startsWith('https://pbs.twimg.com/')) return imageResponse();
  if (url === 'https://api.fxtwitter.com/Seuthoot') return jsonResponse(fxProfile);
  if (url.startsWith('https://cdn.syndication.twimg.com/')) return jsonResponse(synPost);
  return htmlResponse(404);
}

describe('GET /api/profile', () => {
  it('returns an SVG card', async () => {
    mockFetch(routes);
    const res = await getProfile(new Request('https://cards.example.com/api/profile?user=Seuthoot&theme=terminal'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/svg+xml; charset=utf-8');
    expect(res.headers.get('cache-control')).toBe(CACHE.profile);
    expect(await res.text()).toContain('~/x/Seuthoot');
  });

  it('returns 200 with an error card for bad input', async () => {
    mockFetch(routes);
    const res = await getProfile(new Request('https://cards.example.com/api/profile'));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('Invalid username');
  });
});

describe('GET /api/post', () => {
  it('returns an SVG card', async () => {
    mockFetch(routes);
    const res = await getPost(new Request('https://cards.example.com/api/post?id=20'));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe(CACHE.postById);
    expect(await res.text()).toContain('just setting up my twttr');
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run tests/api.test.ts`
Expected: FAIL — `Failed to resolve import "../api/post.js"`

- [ ] **Step 3: 구현**

`api/profile.ts`:

```ts
import { profileCard, svgResponse } from '../src/cards.js';

export async function GET(request: Request): Promise<Response> {
  return svgResponse(await profileCard(new URL(request.url).searchParams));
}
```

`api/post.ts`:

```ts
import { postCard, svgResponse } from '../src/cards.js';

export async function GET(request: Request): Promise<Response> {
  return svgResponse(await postCard(new URL(request.url).searchParams));
}
```

- [ ] **Step 4: 테스트 통과 + 전체 검사**

Run: `npx vitest run`
Expected: 모든 테스트 PASS

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 5: 로컬 Vercel 실행 확인 (Vercel 계정 필요, 없으면 건너뛰고 Task 11 스모크로 대체)**

Run: `npx vercel dev`
브라우저에서 `http://localhost:3000/api/profile?user=Seuthoot`와 `http://localhost:3000/api/post?user=Seuthoot&theme=terminal`을 연다.
Expected: 카드 SVG가 보이고 아바타가 표시된다. 응답 헤더에 `cache-control`이 있다.

- [ ] **Step 6: 커밋**

```bash
git add api/profile.ts api/post.ts tests/api.test.ts
git commit -m "feat: expose profile and post cards as Vercel functions"
```

---

### Task 10: 랜딩 페이지

**Files:**
- Create: `public/parse-input.js`, `public/index.html`
- Test: `tests/landing.test.ts`

**Interfaces:**
- Consumes: 공개 API URL 형식 (Global Constraints)
- Produces (`public/parse-input.js`, ES module, 브라우저와 Vitest 양쪽에서 사용):
  - `parseInput(raw: string): { type: 'user'; username: string } | { type: 'post'; username: string; id: string } | null`
  - `buildCardUrl(origin: string, sel: { kind: 'profile'; username: string; theme: string } | { kind: 'latest'; username: string; index: number; theme: string } | { kind: 'post'; id: string; theme: string }): string`
  - `linkFor(sel): string` — 카드를 클릭했을 때 갈 X 주소
  - `buildSnippets(cardUrl: string, linkUrl: string, alt: string): { markdown: string; html: string }`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/landing.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildCardUrl, buildSnippets, linkFor, parseInput } from '../public/parse-input.js';

describe('parseInput', () => {
  it.each([
    ['Seuthoot', { type: 'user', username: 'Seuthoot' }],
    ['@Seuthoot', { type: 'user', username: 'Seuthoot' }],
    ['  Seuthoot  ', { type: 'user', username: 'Seuthoot' }],
    ['https://x.com/Seuthoot', { type: 'user', username: 'Seuthoot' }],
    ['x.com/Seuthoot/', { type: 'user', username: 'Seuthoot' }],
    ['https://twitter.com/Seuthoot?lang=ko', { type: 'user', username: 'Seuthoot' }],
    ['https://mobile.twitter.com/Seuthoot', { type: 'user', username: 'Seuthoot' }],
    ['https://www.x.com/Seuthoot', { type: 'user', username: 'Seuthoot' }],
    [
      'https://x.com/Seuthoot/status/2094701798535885304',
      { type: 'post', username: 'Seuthoot', id: '2094701798535885304' },
    ],
    ['https://x.com/jack/status/20?s=20&t=abc', { type: 'post', username: 'jack', id: '20' }],
    ['https://twitter.com/jack/statuses/20', { type: 'post', username: 'jack', id: '20' }],
    ['https://x.com/jack/status/20/photo/1', { type: 'post', username: 'jack', id: '20' }],
  ])('parses %j', (input, expected) => {
    expect(parseInput(input)).toEqual(expected);
  });

  it.each(['', '   ', 'a-b', 'https://x.com/home', 'https://x.com/i/bookmarks', 'https://example.com/jack', 'way_too_long_username'])(
    'rejects %j',
    (input) => {
      expect(parseInput(input)).toBeNull();
    },
  );
});

describe('buildCardUrl', () => {
  const origin = 'https://cards.example.com';
  it('builds profile, latest and post URLs', () => {
    expect(buildCardUrl(origin, { kind: 'profile', username: 'Seuthoot', theme: 'aurora' })).toBe(
      'https://cards.example.com/api/profile?user=Seuthoot&theme=aurora',
    );
    expect(buildCardUrl(origin, { kind: 'latest', username: 'Seuthoot', index: 2, theme: 'terminal' })).toBe(
      'https://cards.example.com/api/post?user=Seuthoot&index=2&theme=terminal',
    );
    expect(buildCardUrl(origin, { kind: 'post', id: '20', theme: 'aurora' })).toBe(
      'https://cards.example.com/api/post?id=20&theme=aurora',
    );
  });
});

describe('linkFor', () => {
  it('links profiles and latest posts to the profile, posts to the post', () => {
    expect(linkFor({ kind: 'profile', username: 'Seuthoot', theme: 'aurora' })).toBe('https://x.com/Seuthoot');
    expect(linkFor({ kind: 'latest', username: 'Seuthoot', index: 1, theme: 'aurora' })).toBe('https://x.com/Seuthoot');
    expect(linkFor({ kind: 'post', id: '20', username: 'jack', theme: 'aurora' })).toBe('https://x.com/jack/status/20');
    expect(linkFor({ kind: 'post', id: '20', theme: 'aurora' })).toBe('https://x.com/i/status/20');
  });
});

describe('buildSnippets', () => {
  it('builds markdown and html that link the card to X', () => {
    const s = buildSnippets('https://cards.example.com/api/profile?user=Seuthoot&theme=aurora', 'https://x.com/Seuthoot', 'X profile');
    expect(s.markdown).toBe(
      '[![X profile](https://cards.example.com/api/profile?user=Seuthoot&theme=aurora)](https://x.com/Seuthoot)',
    );
    expect(s.html).toBe(
      '<a href="https://x.com/Seuthoot"><img src="https://cards.example.com/api/profile?user=Seuthoot&amp;theme=aurora" alt="X profile" width="450"></a>',
    );
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run tests/landing.test.ts`
Expected: FAIL — `Failed to resolve import "../public/parse-input.js"`

- [ ] **Step 3: parse-input.js 구현**

`public/parse-input.js`:

```js
// Shared by index.html (browser) and tests (Vitest). Plain ES module, no build step.

const USERNAME = /^[A-Za-z0-9_]{1,15}$/;
const X_URL =
  /^(?:https?:\/\/)?(?:www\.|mobile\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})(?:\/status(?:es)?\/(\d{1,25}))?(?:\/[^?#]*)?\/?(?:[?#].*)?$/i;
// x.com paths that look like usernames but are app pages.
const RESERVED = new Set(['home', 'explore', 'i', 'search', 'settings', 'notifications', 'messages', 'compose', 'login', 'signup', 'tos', 'privacy']);

/** @returns {{type:'user', username:string} | {type:'post', username:string, id:string} | null} */
export function parseInput(raw) {
  const value = String(raw ?? '').trim();
  if (!value) return null;

  const match = X_URL.exec(value);
  if (match) {
    const [, username, id] = match;
    if (RESERVED.has(username.toLowerCase())) return null;
    return id ? { type: 'post', username, id } : { type: 'user', username };
  }
  if (/[/.]/.test(value)) return null;

  const handle = value.replace(/^@/, '');
  return USERNAME.test(handle) ? { type: 'user', username: handle } : null;
}

export function buildCardUrl(origin, sel) {
  const params = new URLSearchParams();
  if (sel.kind === 'profile') {
    params.set('user', sel.username);
  } else if (sel.kind === 'latest') {
    params.set('user', sel.username);
    params.set('index', String(sel.index));
  } else {
    params.set('id', sel.id);
  }
  params.set('theme', sel.theme);
  const path = sel.kind === 'profile' ? 'profile' : 'post';
  return `${origin}/api/${path}?${params}`;
}

export function linkFor(sel) {
  if (sel.kind === 'post') return `https://x.com/${sel.username ?? 'i'}/status/${sel.id}`;
  return `https://x.com/${sel.username}`;
}

const escapeAttr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export function buildSnippets(cardUrl, linkUrl, alt) {
  return {
    markdown: `[![${alt}](${cardUrl})](${linkUrl})`,
    html: `<a href="${escapeAttr(linkUrl)}"><img src="${escapeAttr(cardUrl)}" alt="${escapeAttr(alt)}" width="450"></a>`,
  };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/landing.test.ts`
Expected: PASS

- [ ] **Step 5: index.html 작성**

`public/index.html`:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>readme-x-cards</title>
  <meta name="description" content="X profile and post cards for your GitHub README. Free, no sign-up.">
  <style>
    :root { color-scheme: dark; --bg: #07070d; --panel: rgba(255,255,255,.06); --line: rgba(255,255,255,.14); --text: #f4f4f8; --muted: #a1a1b5; --accent: #8b5cf6; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; font-family: -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif; color: var(--text); background:
      radial-gradient(60% 50% at 10% 0%, rgba(124,58,237,.35), transparent 70%),
      radial-gradient(50% 50% at 100% 100%, rgba(6,182,212,.25), transparent 70%),
      radial-gradient(40% 40% at 70% 0%, rgba(236,72,153,.2), transparent 70%), var(--bg); }
    main { max-width: 720px; margin: 0 auto; padding: 56px 16px 80px; }
    h1 { font-size: clamp(28px, 6vw, 40px); margin: 0 0 8px; letter-spacing: -.02em; }
    .lead { color: var(--muted); margin: 0 0 32px; }
    .panel { background: var(--panel); border: 1px solid var(--line); border-radius: 16px; padding: 20px; backdrop-filter: blur(12px); }
    label.field { display: block; font-size: 13px; color: var(--muted); margin-bottom: 8px; }
    input[type=text] { width: 100%; padding: 12px 14px; border-radius: 10px; border: 1px solid var(--line); background: rgba(0,0,0,.35); color: var(--text); font-size: 16px; }
    input[type=text]:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
    .row { display: flex; flex-wrap: wrap; gap: 16px; margin-top: 16px; align-items: center; }
    .seg { display: inline-flex; border: 1px solid var(--line); border-radius: 999px; overflow: hidden; }
    .seg input { position: absolute; opacity: 0; pointer-events: none; }
    .seg label { padding: 7px 14px; font-size: 14px; cursor: pointer; color: var(--muted); }
    .seg input:checked + label { background: rgba(255,255,255,.14); color: var(--text); }
    .seg input:focus-visible + label { outline: 2px solid var(--accent); }
    select { padding: 7px 10px; border-radius: 8px; background: rgba(0,0,0,.35); color: var(--text); border: 1px solid var(--line); }
    .error { color: #ff8a8a; font-size: 14px; min-height: 20px; margin-top: 10px; }
    .preview { margin: 24px 0; min-height: 170px; display: flex; align-items: center; justify-content: center; }
    .preview img { max-width: 100%; height: auto; }
    .snippet { position: relative; margin-top: 12px; }
    .snippet pre { margin: 0; padding: 14px 84px 14px 14px; border-radius: 10px; background: rgba(0,0,0,.45); border: 1px solid var(--line); overflow-x: auto; font-size: 13px; white-space: pre-wrap; word-break: break-all; }
    .snippet button { position: absolute; top: 8px; right: 8px; padding: 6px 12px; border-radius: 8px; border: 1px solid var(--line); background: rgba(255,255,255,.1); color: var(--text); cursor: pointer; }
    .hidden { display: none; }
    footer { margin-top: 40px; font-size: 13px; color: var(--muted); }
    footer a { color: var(--text); }
  </style>
</head>
<body>
<main>
  <h1>readme-x-cards</h1>
  <p class="lead">Put your X profile or posts on your GitHub README. Free, no sign-up, auto-updating.</p>

  <section class="panel">
    <label class="field" for="input">X username, profile link, or post link</label>
    <input id="input" type="text" placeholder="@Seuthoot or https://x.com/Seuthoot/status/…" autocomplete="off" spellcheck="false">
    <div class="error" id="error" role="status"></div>

    <div class="row" id="kind-row">
      <div class="seg" role="radiogroup" aria-label="Card type">
        <input type="radio" name="kind" id="kind-profile" value="profile" checked><label for="kind-profile">Profile</label>
        <input type="radio" name="kind" id="kind-latest" value="latest"><label for="kind-latest">Latest post</label>
      </div>
      <label id="index-wrap" class="hidden">#
        <select id="index">
          <option>1</option><option>2</option><option>3</option><option>4</option><option>5</option>
        </select>
      </label>
    </div>

    <div class="row">
      <div class="seg" role="radiogroup" aria-label="Theme">
        <input type="radio" name="theme" id="theme-aurora" value="aurora" checked><label for="theme-aurora">Aurora</label>
        <input type="radio" name="theme" id="theme-terminal" value="terminal"><label for="theme-terminal">Terminal</label>
      </div>
    </div>
  </section>

  <div class="preview" id="preview"></div>

  <section id="output" class="hidden">
    <div class="snippet"><pre id="markdown"></pre><button type="button" data-copy="markdown">Copy</button></div>
    <div class="snippet"><pre id="html"></pre><button type="button" data-copy="html">Copy</button></div>
  </section>

  <footer>
    Open source (MIT) · <a href="https://github.com/">GitHub</a> · Data comes from unofficial public sources and may stop working at any time.
  </footer>
</main>

<script type="module">
  import { buildCardUrl, buildSnippets, linkFor, parseInput } from './parse-input.js';

  const $ = (id) => document.getElementById(id);
  const input = $('input');
  let timer;

  function selection() {
    const parsed = parseInput(input.value);
    if (!parsed) return null;
    const theme = document.querySelector('input[name=theme]:checked').value;
    if (parsed.type === 'post') return { kind: 'post', id: parsed.id, username: parsed.username, theme };
    const kind = document.querySelector('input[name=kind]:checked').value;
    return kind === 'latest'
      ? { kind, username: parsed.username, index: Number($('index').value), theme }
      : { kind: 'profile', username: parsed.username, theme };
  }

  function render() {
    const raw = input.value.trim();
    const sel = selection();
    const isPost = sel?.kind === 'post';
    $('kind-row').classList.toggle('hidden', isPost);
    $('index-wrap').classList.toggle('hidden', sel?.kind !== 'latest');
    $('error').textContent = raw && !sel ? 'Enter a valid X username or x.com link.' : '';

    if (!sel) {
      $('preview').replaceChildren();
      $('output').classList.add('hidden');
      return;
    }

    const cardUrl = buildCardUrl(location.origin, sel);
    const alt = sel.kind === 'profile' ? 'X profile' : 'X post';
    const img = new Image();
    img.src = cardUrl;
    img.alt = alt;
    img.width = 450;
    $('preview').replaceChildren(img);

    const { markdown, html } = buildSnippets(cardUrl, linkFor(sel), alt);
    $('markdown').textContent = markdown;
    $('html').textContent = html;
    $('output').classList.remove('hidden');
  }

  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(render, 400);
  });
  document.querySelectorAll('input[type=radio], select').forEach((el) => el.addEventListener('change', render));
  document.querySelectorAll('[data-copy]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText($(button.dataset.copy).textContent);
        button.textContent = 'Copied';
      } catch {
        button.textContent = 'Select & copy';
      }
      setTimeout(() => (button.textContent = 'Copy'), 1500);
    });
  });

  const fromQuery = new URLSearchParams(location.search).get('user');
  input.value = fromQuery ?? 'Seuthoot';
  render();
</script>
</body>
</html>
```

- [ ] **Step 6: 브라우저로 동작 확인**

Run: `npx vercel dev` (Vercel 계정이 없다면 `npx serve public`로 띄워 입력 파싱·스니펫 표시만 확인한다. 이 경우 미리보기 이미지는 깨지는 것이 정상)
`http://localhost:3000/`에서 확인할 것:
- 처음 열면 `Seuthoot` 프로필 카드 미리보기가 보인다.
- `https://x.com/jack/status/20` 입력 → 카드 종류 선택이 숨겨지고 포스트 카드가 보인다.
- Latest post 선택 시 `#` 드롭다운이 나타나고 index 변경이 URL에 반영된다.
- Terminal 선택 시 미리보기가 바뀐다.
- `a-b` 입력 시 에러 문구가 보인다.
- Copy 버튼이 클립보드에 Markdown/HTML을 복사한다.
- 폭 375px(모바일)에서 가로 스크롤이 없다.

- [ ] **Step 7: 커밋**

```bash
git add public/parse-input.js public/index.html tests/landing.test.ts
git commit -m "feat: add landing page with live preview and snippet copy"
```

---

### Task 11: 스모크 스크립트 + README + LICENSE

**Files:**
- Create: `scripts/smoke.ts`, `README.md`, `LICENSE`
- Create (스크립트 출력, 커밋함): `docs/previews/*.svg`

**Interfaces:**
- Consumes: `profileCard`, `postCard` (Task 8), `themeNames` (Task 7)
- Produces: `npm run smoke` — 실제 출처를 호출해 테마별 프로필/포스트 카드를 `docs/previews/`에 저장하고, 에러 카드가 하나라도 나오면 exit code 1

- [ ] **Step 1: 스모크 스크립트 작성**

`scripts/smoke.ts`:

```ts
// Calls the real (unofficial) sources. Not part of CI: run manually to check the sources still work
// and to refresh the README preview images.
import { mkdir, writeFile } from 'node:fs/promises';
import { CACHE, postCard, profileCard } from '../src/cards.js';
import { themeNames } from '../src/themes/index.js';

const USER = process.argv[2] ?? 'Seuthoot';
const OUT = 'docs/previews';

await mkdir(OUT, { recursive: true });
let failed = false;

for (const theme of themeNames) {
  const cards = {
    profile: await profileCard(new URLSearchParams({ user: USER, theme })),
    post: await postCard(new URLSearchParams({ user: USER, index: '1', theme })),
    famous: await postCard(new URLSearchParams({ id: '20', theme })),
  };
  for (const [kind, card] of Object.entries(cards)) {
    const file = `${OUT}/${theme}-${kind}.svg`;
    await writeFile(file, card.svg);
    const isError = card.cacheControl === CACHE.clientError || card.cacheControl === CACHE.upstreamError;
    if (isError) failed = true;
    console.log(`${isError ? 'FAIL' : 'ok  '} ${file}`);
  }
}

process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: 스모크 실행 (네트워크 필요)**

Run: `npm run smoke`
Expected: 6줄 모두 `ok`, `docs/previews/`에 SVG 6개 생성. 브라우저로 열어 아바타와 실제 숫자가 보이는지 확인.
`FAIL`이 나오면 해당 SVG의 에러 문구를 보고 출처가 바뀌었는지 `curl https://api.fxtwitter.com/Seuthoot`로 확인한다.

- [ ] **Step 3: LICENSE 작성**

`LICENSE`:

```
MIT License

Copyright (c) 2026 readme-x-cards contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 4: README 작성**

먼저 저장소 주인을 확인한다: `git remote get-url origin`. remote가 없으면 사용자에게 GitHub 계정명을 물어본다. 아래 README에서 `OWNER`를 그 계정명으로, `YOUR-DEPLOYMENT`를 공용 인스턴스 도메인(아직 없으면 `readme-x-cards.vercel.app`)으로 바꾼다.

`README.md`:

~~~~markdown
# readme-x-cards

X (Twitter) profile and post cards for your GitHub README. Free, no sign-up, no API key — just paste a URL.

| Aurora | Terminal |
|---|---|
| ![aurora profile](docs/previews/aurora-profile.svg) | ![terminal profile](docs/previews/terminal-profile.svg) |
| ![aurora post](docs/previews/aurora-famous.svg) | ![terminal post](docs/previews/terminal-famous.svg) |

**Try it:** https://YOUR-DEPLOYMENT/ — type your username, pick a theme, copy the snippet.

## Usage

### Profile card

```md
[![X profile](https://YOUR-DEPLOYMENT/api/profile?user=Seuthoot)](https://x.com/Seuthoot)
```

### Latest post (auto-updates)

```md
[![X post](https://YOUR-DEPLOYMENT/api/post?user=Seuthoot)](https://x.com/Seuthoot)
```

Want your three latest posts? Add three lines with `index=1`, `index=2`, `index=3`.

### A specific post

```md
[![X post](https://YOUR-DEPLOYMENT/api/post?id=20)](https://x.com/jack/status/20)
```

## Options

| Endpoint | Parameter | Values | Default |
|---|---|---|---|
| `/api/profile` | `user` | X username (letters, digits, `_`, max 15) | required |
| `/api/post` | `id` | Post ID (the number in the post URL) | — |
| `/api/post` | `user` | X username — shows their latest post | — |
| `/api/post` | `index` | `1`–`10`, n-th latest post (with `user`) | `1` |
| both | `theme` | `aurora`, `terminal` | `aurora` |

`/api/post` needs either `id` or `user`; `id` wins if both are given.

## How fresh is the data?

Cards are cached: profiles for 6 hours, latest posts for 1 hour, specific posts for 24 hours. GitHub also caches README images, so changes can take a little longer to show up.

## Deploy your own

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FOWNER%2Freadme-x-cards)

No environment variables needed. Running your own instance keeps your cards working even if the public one is rate-limited.

## Adding a theme

1. Create `src/themes/<name>.ts` exporting an object that implements `Theme` (`src/themes/types.ts`): `renderProfile`, `renderPost`, `renderError`, each returning a complete SVG string.
2. Register it in `src/themes/index.ts`.
3. Add tests next to `tests/aurora.test.ts` and run `npm test`, then `npm run smoke` to render previews.

Rules: card width 450px, escape every external string with `escapeXml`, never reference external URLs (GitHub blocks them inside SVG images — avatars arrive as data URIs).

## Development

```bash
npm install
npm test          # unit tests, no network
npm run typecheck
npm run smoke     # renders real cards into docs/previews (uses the network)
npx vercel dev    # local server at http://localhost:3000
```

## Disclaimer

This project does not use the official X API. Data comes from unofficial public endpoints (X's embed syndication service and [FxEmbed/fxtwitter](https://github.com/FxEmbed/FxEmbed)), which may change or stop working at any time. Not affiliated with or endorsed by X Corp.

## License

MIT
~~~~

- [ ] **Step 5: 최종 검증**

Run: `npm test`
Expected: 모든 테스트 PASS

Run: `npm run typecheck`
Expected: 에러 없음

Run: `npm run smoke`
Expected: 6줄 모두 `ok`

- [ ] **Step 6: 커밋**

```bash
git add scripts/smoke.ts README.md LICENSE docs/previews
git commit -m "docs: add README, license, smoke script and theme previews"
```

---

## 배포 (구현 후, 사용자 확인 필요)

GitHub 저장소 생성/푸시와 Vercel 배포는 외부에 공개되는 작업이므로 실행 전에 사용자에게 확인받는다.

1. GitHub에 `readme-x-cards` 저장소 생성 후 push.
2. Vercel에서 저장소 import (Framework Preset: Other, 환경 변수 없음).
3. 배포 URL로 README의 `YOUR-DEPLOYMENT`를 바꾸고, 랜딩 footer의 GitHub 링크(`https://github.com/`)를 저장소 주소로 바꿔 커밋.
4. 자기 GitHub 프로필 README에 카드를 넣어 실제 렌더링(아바타 포함) 확인.
