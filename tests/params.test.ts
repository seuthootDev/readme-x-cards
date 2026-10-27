import { describe, expect, it } from 'vitest';
import { CardError } from '../src/model.js';
import { parseFeedQuery, parsePostQuery, parseProfileQuery } from '../src/params.js';

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
    expect(parseProfileQuery(q('user=Seuthoot&theme=terminal'))).toEqual({
      username: 'Seuthoot',
      theme: 'terminal',
      hide: [],
      locale: 'en-US',
    });
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
      hide: [],
      locale: 'en-US',
    });
  });
  it('prefers id over user', () => {
    expect(parsePostQuery(q('id=20&user=jack')).kind).toBe('id');
  });
  it.each(['', 'abc', '12a', '1'.repeat(26)])('rejects id %j', (id) => {
    expectInvalid(() => parsePostQuery(q(`id=${id}`)), 'Invalid post id');
  });
  it('parses latest with default index 1', () => {
    expect(parsePostQuery(q('user=Seuthoot'))).toEqual({
      kind: 'latest',
      username: 'Seuthoot',
      index: 1,
      theme: '',
      hide: [],
      locale: 'en-US',
    });
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

describe('parseFeedQuery', () => {
  it('defaults count to 3', () => {
    expect(parseFeedQuery(q('user=Seuthoot&theme=paper'))).toEqual({
      username: 'Seuthoot',
      count: 3,
      theme: 'paper',
      hide: [],
      locale: 'en-US',
    });
  });
  it('parses an explicit count', () => {
    expect(parseFeedQuery(q('user=jack&count=5')).count).toBe(5);
  });
  it.each(['0', '6', '2.5', 'x', ''])('rejects count %j', (count) => {
    expectInvalid(() => parseFeedQuery(q(`user=jack&count=${count}`)), 'count must be 1-5');
  });
  it('rejects an invalid user', () => {
    expectInvalid(() => parseFeedQuery(q('id=20')), 'Invalid username');
  });
});

describe('display options', () => {
  it('parses a comma-separated hide list, ignoring case, blanks and repeats', () => {
    expect(parseProfileQuery(q('user=jack&hide=Bio,%20border,,bio')).hide).toEqual(['bio', 'border']);
    expect(parsePostQuery(q('id=20&hide=metrics,views,media,date')).hide).toEqual(['metrics', 'views', 'media', 'date']);
  });
  it('rejects unknown hide keys', () => {
    expectInvalid(
      () => parsePostQuery(q('id=20&hide=likes')),
      'hide accepts bio, metrics, views, media, date, border',
    );
  });
  it('accepts supported locales', () => {
    expect(parseProfileQuery(q('user=jack&locale=ko')).locale).toBe('ko');
    expect(parseFeedQuery(q('user=jack&locale=pt-BR')).locale).toBe('pt-BR');
    expect(parsePostQuery(q('id=20&locale=')).locale).toBe('en-US');
  });
  it.each(['not a locale', '../../etc', 'x-'])('rejects locale %j', (locale) => {
    expectInvalid(() => parsePostQuery(q(`id=20&locale=${encodeURIComponent(locale)}`)), 'Unsupported locale');
  });
});
