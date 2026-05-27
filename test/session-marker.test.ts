import test from 'node:test';
import assert from 'node:assert/strict';
import { generateClientSessionId } from '../src/mimo/session-marker.ts';

function fakeContext(headers: Record<string, string | undefined>) {
  return {
    req: {
      header(name: string) {
        return headers[name.toLowerCase()] ?? headers[name] ?? undefined;
      },
    },
  } as any;
}

test('uses explicit request session key before header or isolation fallback', () => {
  const id = generateClientSessionId(
    fakeContext({ 'x-session-id': 'header-session' }),
    'acct1',
    'conversation:conv_123',
    'auto'
  );
  assert.equal(id, 'explicit_acct1_conversation:conv_123');
});

test('manual isolation uses x-session-id when supplied', () => {
  const id = generateClientSessionId(fakeContext({ 'x-session-id': 'manual-1' }), 'acct1', null, 'manual');
  assert.equal(id, 'explicit_acct1_manual-1');
});

test('per-request isolation generates a different session id each time', () => {
  const c = fakeContext({});
  const first = generateClientSessionId(c, 'acct1', null, 'per-request');
  const second = generateClientSessionId(c, 'acct1', null, 'per-request');
  assert.notEqual(first, second);
  assert.match(first, /^request_acct1_/);
  assert.match(second, /^request_acct1_/);
});

test('auto isolation includes client network and user agent hints', () => {
  const first = generateClientSessionId(
    fakeContext({ 'x-forwarded-for': '203.0.113.8', 'user-agent': 'client-a' }),
    'acct1',
    null,
    'auto'
  );
  const second = generateClientSessionId(
    fakeContext({ 'x-forwarded-for': '203.0.113.9', 'user-agent': 'client-a' }),
    'acct1',
    null,
    'auto'
  );
  assert.notEqual(first, second);
  assert.match(first, /^auto_acct1_/);
});
