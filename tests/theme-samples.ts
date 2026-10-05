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
