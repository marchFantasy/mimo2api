import { ChatMessage } from '../mimo/serialize.js';

export class OpenAIRequestError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'OpenAIRequestError';
    this.status = status;
  }
}

export interface NormalizedOpenAIRequest {
  messages: ChatMessage[];
  sessionKey: string | null;
}

type AnyRecord = Record<string, any>;

function normalizeRole(role: unknown): ChatMessage['role'] {
  if (role === 'developer' || role === 'system') return 'system';
  if (role === 'assistant') return 'assistant';
  if (role === 'tool' || role === 'function') return 'tool';
  return 'user';
}

function textFromContentParts(parts: unknown[]): string {
  return parts
    .map((part) => {
      if (typeof part === 'string') return part;
      if (!part || typeof part !== 'object') return '';
      const p = part as AnyRecord;
      if (typeof p.text === 'string') return p.text;
      if (typeof p.output_text === 'string') return p.output_text;
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

function normalizeChatContent(content: unknown, role: ChatMessage['role']): string | null {
  if (content == null) return null;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return role === 'system' ? textFromContentParts(content) : content as any;
  }
  return JSON.stringify(content);
}

function normalizeResponseContent(content: unknown): string {
  if (content == null) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return textFromContentParts(content);
  return JSON.stringify(content);
}

function normalizeMessages(messages: unknown): ChatMessage[] {
  if (!Array.isArray(messages)) {
    throw new OpenAIRequestError('messages must be an array');
  }

  return messages.map((message) => {
    const m = (message ?? {}) as AnyRecord;
    const role = normalizeRole(m.role);
    return {
      ...m,
      role,
      content: normalizeChatContent(m.content, role),
    } as ChatMessage;
  });
}

function normalizeInput(input: unknown): ChatMessage[] {
  if (typeof input === 'string') {
    return [{ role: 'user', content: input }];
  }

  if (!Array.isArray(input)) {
    throw new OpenAIRequestError('input must be a string or an array');
  }

  const messages: ChatMessage[] = [];
  for (const item of input) {
    if (typeof item === 'string') {
      messages.push({ role: 'user', content: item });
      continue;
    }

    if (!item || typeof item !== 'object') continue;
    const i = item as AnyRecord;

    if (i.type === 'function_call_output') {
      messages.push({
        role: 'tool',
        content: normalizeResponseContent(i.output),
        tool_call_id: i.call_id,
      });
      continue;
    }

    if (i.type === 'function_call') {
      messages.push({
        role: 'assistant',
        content: null,
        tool_calls: [{
          id: i.call_id ?? i.id ?? '',
          type: 'function',
          function: {
            name: i.name ?? 'unknown',
            arguments: typeof i.arguments === 'string' ? i.arguments : JSON.stringify(i.arguments ?? {}),
          },
        }],
      });
      continue;
    }

    messages.push({
      role: normalizeRole(i.role),
      content: normalizeResponseContent(i.content ?? i.text),
    });
  }

  return messages;
}

function normalizeSystemInstructions(instructions: unknown): ChatMessage[] {
  const content = normalizeResponseContent(instructions);
  return content ? [{ role: 'system', content }] : [];
}

function extractSessionKey(body: AnyRecord): string | null {
  const conversation = body.conversation;
  if (typeof conversation === 'string' && conversation) return `conversation:${conversation}`;
  if (conversation && typeof conversation === 'object' && typeof conversation.id === 'string') {
    return `conversation:${conversation.id}`;
  }
  if (typeof body.previous_response_id === 'string' && body.previous_response_id) {
    return `previous_response:${body.previous_response_id}`;
  }
  return null;
}

export function normalizeOpenAIRequestBody(body: unknown): NormalizedOpenAIRequest {
  if (!body || typeof body !== 'object') {
    throw new OpenAIRequestError('Request body must be a JSON object');
  }

  const b = body as AnyRecord;
  const baseMessages = b.messages !== undefined
    ? normalizeMessages(b.messages)
    : b.input !== undefined
      ? [...normalizeSystemInstructions(b.instructions), ...normalizeInput(b.input)]
      : null;

  if (!baseMessages) {
    throw new OpenAIRequestError('Request body must include messages or input');
  }

  if (baseMessages.length === 0) {
    throw new OpenAIRequestError('Request body must include at least one message');
  }

  return {
    messages: baseMessages,
    sessionKey: extractSessionKey(b),
  };
}
