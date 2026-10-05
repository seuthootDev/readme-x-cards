# readme-x-cards 설계

- 작성일: 2026-10-05
- 상태: 리뷰 대기

## 1. 목적

GitHub 프로필/레포 README에 URL 한 줄로 넣을 수 있는 **X 프로필 카드**와 **X 포스트 카드**(SVG)를 제공한다.
github-readme-stats와 같은 사용 경험(가입·토큰 없이 username만으로 사용, 자동 갱신)을 목표로 하며, 디자인으로 차별화한다.

### 성공 기준

- 사용자는 README에 이미지 링크 한 줄만 추가하면 카드가 표시되고, 데이터가 주기적으로 갱신된다.
- 운영 비용 0원 (Vercel 무료 플랜, 유료 API 미사용).
- 누구나 "Deploy with Vercel" 버튼으로 자기 인스턴스를 환경 변수 없이 띄울 수 있다.
- 새 테마는 파일 하나 추가 + 등록 한 줄로 기여할 수 있다.

### 범위 밖 (MVP 이후 후보)

- 배너 이미지, 포스트 첨부 이미지/영상 썸네일, 인용 포스트 표시
- 여러 포스트를 한 장에 담는 목록 카드
- 커스텀 색상 파라미터, 테마 색상 변형
- "마지막 성공 데이터" 영구 보관(KV), 폰트 내장
- Cloudflare Workers 진입점

## 2. 배경과 제약

- 공식 X API는 2026년 2월부터 종량제이며 무료 티어가 없다(사용자 조회 약 $0.01/건). 공개 무료 서비스에는 쓸 수 없다.
- 무료 데이터 출처 (모두 비공식, 언제든 변경·차단될 수 있음):
  - **syndication** — `https://cdn.syndication.twimg.com/tweet-result?id={id}&token={token}`. X의 임베드 위젯용 엔드포인트. 포스트 ID로 본문·작성자·좋아요 수 조회 가능. 조회수 없음.
  - **fxtwitter** — `https://api.fxtwitter.com/{user}` (프로필), `https://api.fxtwitter.com/2/profile/{user}/statuses` (최신 포스트 목록), `https://api.fxtwitter.com/{user}/status/{id}` (포스트). 오픈소스 FxEmbed 프로젝트가 X 내부 API를 통해 제공. 조회수 포함.
- 2026-10-05에 위 엔드포인트로 @Seuthoot 프로필/포스트, @jack/status/20 조회를 실제로 확인함. X 공식 타임라인 syndication(`syndication.twitter.com/srv/timeline-profile/...`)은 429로 막혀 있어 사용하지 않는다.
- GitHub README는 이미지를 `<img>`로 렌더링하므로, SVG 내부의 외부 리소스(이미지, 웹폰트)는 로드되지 않는다 → 아바타는 base64 data URI로 내장해야 한다.
- 상표: 프로젝트명/로고에 X 로고를 쓰지 않는다. 디자인은 xprofilecards.com(독점 라이선스)을 복제하지 않고 독자적으로 만든다.

## 3. 사용법 (공개 인터페이스)

```
GET /api/profile?user={username}[&theme={theme}]
GET /api/post?id={postId}[&theme={theme}]
GET /api/post?user={username}[&index={1-10}][&theme={theme}]
```

| 파라미터 | 규칙 | 기본값 |
|---|---|---|
| `user` | `^[A-Za-z0-9_]{1,15}$`, 앞의 `@`는 허용 후 제거 | — |
| `id` | 숫자만 (`^[0-9]{1,25}$`) | — |
| `index` | 정수 1–10, 최신 포스트 중 n번째 | 1 |
| `theme` | `aurora` \| `terminal`, 알 수 없는 값은 기본값 처리 | `aurora` |

- `/api/post`에 `id`와 `user`가 모두 있으면 `id`가 우선한다. 둘 다 없으면 잘못된 파라미터 에러 카드.
- 여러 포스트를 보여주려면 README에 이미지 링크를 여러 줄 넣는다(`index=1`, `index=2`, ...).

README 사용 예:

```md
[![X profile](https://<domain>/api/profile?user=Seuthoot&theme=aurora)](https://x.com/Seuthoot)
[![X post](https://<domain>/api/post?user=Seuthoot&index=1&theme=terminal)](https://x.com/Seuthoot)
```

## 4. 카드 내용

### 프로필 카드
아바타, 이름, 핸들, 인증 배지(인증 계정일 때), 소개글(있을 때, 최대 2줄), 포스트 수, 팔로워, 팔로잉.

### 포스트 카드
작성자(아바타, 이름, 핸들), 작성일, 본문(최대 4줄 후 `…`), 반응 수(답글, 리포스트, 좋아요, 조회수). 출처에 없는 값(예: syndication의 조회수)은 항목 자체를 숨긴다. 첨부 미디어가 있으면 "📷 사진 N장" / "🎬 영상" 같은 표시만 한다.

### 공통
- 큰 수는 축약: 18,072 → `18.1K`, 309,348 → `309.3K`, 12,467,573 → `12.5M`.
- 카드 폭 450px 고정, 높이는 내용(소개글/본문 줄 수)에 따라 늘어난다.
- 폰트는 시스템 폰트 스택(aurora: sans-serif, terminal: monospace). 이모지는 보는 사람의 OS 폰트로 그려진다.

## 5. 테마

브레인스토밍 목업(`card-style.html`)의 B, C 방향을 채택한다.

- **aurora** (기본값) — 짙은 배경 위 보라·청록·핑크 radial gradient, 반투명 유리 패널, 흰 글자, 스탯은 알약(pill) 모양.
- **terminal** — GitHub 다크 색상(`#0d1117`), 상단에 창 제목 표시줄(신호등 점 3개), 모노스페이스, `$ x whoami` 같은 프롬프트 연출, 숫자는 주황색 강조.

테마는 색상 변형 없이 두 개로 시작한다. 테마 인터페이스:

```ts
interface Theme {
  name: string;
  renderProfile(profile: Profile, avatar: DataUri | null): string; // SVG 문자열
  renderPost(post: Post, avatar: DataUri | null): string;
  renderError(message: string): string;
}
```

새 테마 = `src/themes/<name>.ts` 추가 + `src/themes/index.ts` 레지스트리에 한 줄 등록.

## 6. 구조

```
api/
  profile.ts          Vercel 함수: 쿼리 파싱 → src 호출 → 헤더/응답
  post.ts
src/
  model.ts            Profile, Post 공통 타입
  params.ts           입력 검증/정규화
  fetchers/
    fxtwitter.ts      프로필, 최신 포스트 목록, 포스트 → 공통 타입
    syndication.ts    포스트 ID → 공통 타입
    index.ts          출처 우선순위와 폴백
  render/
    avatar.ts         이미지 URL → base64 data URI (실패 시 null)
    text.ts           XML 이스케이프, 줄바꿈/말줄임, 숫자 축약
  themes/
    aurora.ts
    terminal.ts
    index.ts          레지스트리, 기본 테마
  cards.ts            fetch → avatar → theme 렌더링 → {svg, cacheSeconds} 조합
public/
  index.html          랜딩 페이지 (바닐라 JS, 빌드 없음)
tests/
  fixtures/           실제 응답을 저장한 JSON
scripts/
  smoke.ts            실제 출처 호출 → 카드 SVG 파일 저장 (수동 확인용)
```

원칙:
- `src/`는 Vercel API에 의존하지 않는다. `api/*.ts`는 얇은 어댑터다.
- fetcher는 외부 응답을 `Profile`/`Post`로만 변환하고, 테마는 그 타입만 안다.

### 공통 타입

```ts
interface Profile {
  username: string; name: string; avatarUrl: string;
  bio: string; verified: boolean;
  followers: number; following: number; posts: number;
}

interface Post {
  id: string; url: string; text: string; createdAt: string; // ISO 8601
  author: { username: string; name: string; avatarUrl: string; verified: boolean };
  replies?: number; reposts?: number; likes?: number; views?: number;
  media: { photos: number; videos: number };
}
```

### 데이터 흐름

- 프로필: fxtwitter 프로필 조회.
- 포스트(`id`): syndication → 실패 시 fxtwitter 포스트 조회.
- 포스트(`user`+`index`): fxtwitter 최신 포스트 목록에서 `index`번째. 목록이 그보다 짧으면 "Post not found".
- 아바타는 고해상도 URL(`_normal` → `_200x200`)로 받아 base64로 내장한다.

## 7. 캐시

DB 없이 Vercel CDN 캐시만 사용한다.

| 응답 | Cache-Control |
|---|---|
| 프로필 | `public, max-age=3600, s-maxage=21600, stale-while-revalidate=86400` |
| 포스트 (`id`) | `public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400` |
| 포스트 (`user`+`index`) | `public, max-age=1800, s-maxage=3600, stale-while-revalidate=86400` |
| 에러: 잘못된 입력 / 없음 | `public, max-age=3600, s-maxage=3600` |
| 에러: 출처 장애 | `public, max-age=600, s-maxage=600` |

한계: 캐시가 만료된 뒤 재조회가 실패하면 에러 카드가 나간다(최근 성공 데이터 보장 없음). 출처 장애 에러는 10분 캐시로 빠르게 복구를 재시도한다.

## 8. 에러 처리

- 모든 응답은 **HTTP 200 + `Content-Type: image/svg+xml`**. README에서 깨진 이미지 대신 에러 카드가 보이도록 한다.
- 에러 종류: `INVALID_PARAMS`("Invalid username" 등), `NOT_FOUND`("User not found" / "Post not found", 비공개 계정 포함), `UPSTREAM`("X data temporarily unavailable").
- 외부 호출 타임아웃: 출처 5초, 아바타 3초. 아바타 실패는 에러가 아니며, 이름 첫 글자를 넣은 원으로 대체한다.
- 모든 외부 텍스트는 SVG에 넣기 전에 XML 이스케이프한다.

## 9. 랜딩 페이지

`public/index.html` 하나 (HTML + CSS + 바닐라 JS).

- 입력 하나로 `Seuthoot`, `@Seuthoot`, `x.com/Seuthoot`, `twitter.com/...`, `x.com/{user}/status/{id}`를 인식.
- 사용자 입력 시: 카드 종류(프로필 / 최신 포스트), 최신 포스트면 index(1–5) 선택.
- 테마 선택(Aurora / Terminal), 변경 즉시 미리보기 갱신.
- 미리보기는 실제 API URL을 `<img>`로 표시.
- 복사 버튼: Markdown(카드를 X 링크로 감쌈)과 HTML(`<a><img></a>`) 두 형식.
- 페이지 스타일은 어두운 배경 + 은은한 오로라 톤.

## 10. 테스트

Vitest, CI에서는 네트워크 호출 없음.

- 단위: 텍스트 유틸(이스케이프, 줄바꿈/말줄임, 숫자 축약), 파라미터 검증, 랜딩 입력 파싱 로직.
- fetcher: 2026-10-05에 받은 실제 응답을 fixture로 저장해 공통 타입 변환 검증.
- 폴백: syndication 실패 → fxtwitter, 둘 다 실패 → `UPSTREAM` 에러 카드.
- 테마: 스냅샷 + XML 유효성 검사. 특수문자(`<`, `&`, `"`), 긴 본문, 이모지, 소개글 없음, 아바타 없음 케이스 포함.
- API 핸들러: fetch 모킹으로 상태 코드 200, Content-Type, Cache-Control, 에러 카드 확인.
- `scripts/smoke.ts`: 실제 출처로 @Seuthoot 카드 생성, 출처 생존 확인용(수동).

## 11. 배포

- Vercel, TypeScript, 환경 변수 없음.
- README: 사용법, 파라미터 표, 테마 예시 이미지, "Deploy with Vercel" 버튼, 데이터 출처가 비공식이라는 고지.
- 라이선스: MIT (오픈소스 기여 장려).
