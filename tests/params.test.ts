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
