import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOpenAIRequestBody } from '../src/adapters/openai-normalize.ts';

test('keeps chat completion messages and converts developer role to system', () => {
  const normalized = normalizeOpenAIRequestBody({
    model: 'mimo-v2-pro',
    messages: [
      { role: 'developer', content: 'answer briefly' },
      { role: 'user', content: 'hello' },
    ],
  });

  assert.deepEqual(normalized.messages, [
    { role: 'system', content: 'answer briefly' },
    { role: 'user', content: 'hello' },
  ]);
  assert.equal(normalized.sessionKey, null);
});

test('converts Responses string input into a user message', () => {
  const normalized = normalizeOpenAIRequestBody({
    model: 'mimo-v2-pro',
    instructions: 'be concise',
    input: 'hello',
    conversation: 'conv_123',
  });

  assert.deepEqual(normalized.messages, [
    { role: 'system', content: 'be concise' },
    { role: 'user', content: 'hello' },
  ]);
  assert.equal(normalized.sessionKey, 'conversation:conv_123');
});

test('keeps chat completion multimodal content arrays for image extraction', () => {
  const content = [
    { type: 'text', text: 'look' },
    { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } },
  ];

  const normalized = normalizeOpenAIRequestBody({
    messages: [{ role: 'user', content }],
  });

  assert.equal(normalized.messages[0].content, content);
});

test('converts Responses message input items and text content parts', () => {
  const normalized = normalizeOpenAIRequestBody({
    input: [
      {
        type: 'message',
        role: 'user',
        content: [
          { type: 'input_text', text: 'first' },
          { type: 'input_text', text: 'second' },
        ],
      },
      {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: 'answer' }],
      },
    ],
    previous_response_id: 'resp_123',
  });

  assert.deepEqual(normalized.messages, [
    { role: 'user', content: 'first\nsecond' },
    { role: 'assistant', content: 'answer' },
  ]);
  assert.equal(normalized.sessionKey, 'previous_response:resp_123');
});

test('rejects request bodies without messages or input', () => {
  assert.throws(
    () => normalizeOpenAIRequestBody({ model: 'mimo-v2-pro' }),
    /messages or input/
  );
});
