import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createCommentCommand } from './comment.js';
import { readStdin, detectStdinSource } from './utils.js';

vi.mock('./utils.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./utils.js')>()),
  readStdin: vi.fn(),
  detectStdinSource: vi.fn(),
}));

describe('conversation commands', () => {
  const fetchMock = vi.fn<typeof fetch>();
  const log = vi.fn();
  const error = vi.fn();
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'log').mockImplementation(log);
    vi.spyOn(console, 'error').mockImplementation(error);
  });
  afterEach(() => {
    process.exitCode = 0;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it('writes one JSON value per line and exposes a resumable checkpoint', async () => {
    const event = { type: 'comment.created', body: 'Question\nwith a newline', cursor: 'stream:1' };
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ events: [event], cursor: 'stream:1' })),
    );
    await createCommentCommand().parseAsync([
      'node',
      'difit',
      'watch',
      '--port',
      '4966',
      '--once',
      '--after',
      'stream:0',
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4966/api/conversation/events?wait=25000&after=stream%3A0',
      expect.anything(),
    );
    expect(log.mock.calls.map((call) => JSON.parse(String(call[0])) as unknown)).toEqual([
      event,
      { type: 'conversation.cursor', cursor: 'stream:1' },
    ]);
    expect(error).not.toHaveBeenCalled();
  });

  it('acknowledges received user events before printing the checkpoint', async () => {
    const event = { origin: 'user', reviewId: 'r', threadId: 't', messageId: 'm', cursor: 's:1' };
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ events: [event], cursor: 's:1' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true })));
    await createCommentCommand().parseAsync(['node', 'difit', 'watch', '--port', '4966', '--once']);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:4966/api/conversation/status',
      expect.objectContaining({
        body: JSON.stringify({
          reviewId: 'r',
          threadId: 't',
          messageId: 'm',
          cursor: 's:1',
          status: 'delivered',
        }),
      }),
    );
    expect(log).toHaveBeenLastCalledWith(
      JSON.stringify({ type: 'conversation.cursor', cursor: 's:1' }),
    );
  });

  it('sends an explicit thinking status from stdin', async () => {
    const status = {
      reviewId: 'r',
      threadId: 't',
      messageId: 'm',
      cursor: 's:1',
      status: 'thinking',
    };
    vi.mocked(detectStdinSource).mockReturnValue('pipe');
    vi.mocked(readStdin).mockResolvedValue(JSON.stringify(status));
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ success: true })));
    await createCommentCommand().parseAsync(['node', 'difit', 'status', '--port', '4966']);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4966/api/conversation/status',
      expect.objectContaining({ method: 'POST', body: JSON.stringify(status) }),
    );
    expect(error).not.toHaveBeenCalled();
  });

  it('prints approval and revocation events without sending comment receipts', async () => {
    const events = [true, false].map((approved, index) => ({
      type: 'review.approval',
      origin: 'user',
      reviewId: 'r',
      approved,
      cursor: `s:${index + 1}`,
    }));
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ events, cursor: 's:2' })));
    await createCommentCommand().parseAsync(['node', 'difit', 'watch', '--port', '4966', '--once']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(
      log.mock.calls.slice(0, 2).map((call) => JSON.parse(String(call[0])) as unknown),
    ).toEqual(events);
  });

  it('sends a review summary from stdin using the exact review and version', async () => {
    const input = {
      reviewId: 'review-a',
      commitMessage: 'fix: preserve intent',
      rationale: 'Review why.',
      baseVersion: 3,
    };
    vi.mocked(detectStdinSource).mockReturnValue('pipe');
    vi.mocked(readStdin).mockResolvedValue(JSON.stringify(input));
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ...input, version: 4 })));
    await createCommentCommand().parseAsync(['node', 'difit', 'summary', '--port', '4966']);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4966/api/conversation/summary',
      expect.objectContaining({ method: 'POST', body: JSON.stringify(input) }),
    );
    expect(error).not.toHaveBeenCalled();
  });

  it('prints user summary events without sending comment receipts', async () => {
    const event = {
      type: 'review.summary',
      origin: 'user',
      reviewId: 'r',
      cursor: 's:1',
      summary: { commitMessage: 'fix: preserve intent', rationale: '', version: 1 },
    };
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ events: [event], cursor: 's:1' })));
    await createCommentCommand().parseAsync(['node', 'difit', 'watch', '--port', '4966', '--once']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(JSON.stringify(event));
  });

  it.each([404, 409])('keeps replaying when a receipt returns %s', async (status) => {
    const event = { origin: 'user', reviewId: 'r', threadId: 't', messageId: 'm', cursor: 's:1' };
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ events: [event], cursor: 's:1' })))
      .mockResolvedValueOnce(new Response('{}', { status }));
    await createCommentCommand().parseAsync(['node', 'difit', 'watch', '--port', '4966', '--once']);
    expect(log.mock.calls.map((call) => JSON.parse(String(call[0])) as unknown)).toEqual([
      event,
      { type: 'conversation.cursor', cursor: 's:1' },
    ]);
    expect(error).not.toHaveBeenCalled();
    expect(process.exitCode ?? 0).toBe(0);
  });

  it('keeps cursor errors on stderr and exits unsuccessfully', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Conversation cursor expired' }), { status: 409 }),
    );
    await createCommentCommand().parseAsync(['node', 'difit', 'watch', '--port', '4966', '--once']);
    expect(log).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith('Error: Conversation cursor expired');
    expect(process.exitCode).toBe(1);
  });

  it('rejects continuous zero-delay polling', async () => {
    await createCommentCommand().parseAsync([
      'node',
      'difit',
      'watch',
      '--port',
      '4966',
      '--wait',
      '0',
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('prints a reconciliation snapshot with its resume cursor', async () => {
    const snapshot = { reviews: [{ id: 'review-a', threads: [] }], cursor: 'stream:8' };
    fetchMock.mockResolvedValue(new Response(JSON.stringify(snapshot)));
    await createCommentCommand().parseAsync(['node', 'difit', 'snapshot', '--port', '4966']);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4966/api/conversation/snapshot',
      expect.anything(),
    );
    expect(log).toHaveBeenCalledWith(JSON.stringify(snapshot));
  });

  it('sends exact reply identities and a multiline body as JSON', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ success: true })));
    const reply = {
      reviewId: 'review-a',
      threadId: 'thread-a',
      inReplyTo: 'question-a',
      body: 'Answer\nwith context',
      author: 'Codex',
    };
    await createCommentCommand().parseAsync([
      'node',
      'difit',
      'reply',
      '--port',
      '4966',
      JSON.stringify(reply),
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4966/api/conversation/reply',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reply),
      }),
    );
    expect(log).toHaveBeenCalledWith('{"success":true}');
  });
  it('preserves a precise server error for a deleted reply target', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ error: 'Review, thread, or parent message no longer exists' }),
        { status: 404 },
      ),
    );
    await createCommentCommand().parseAsync(['node', 'difit', 'reply', '--port', '4966', '{}']);
    expect(error).toHaveBeenCalledWith('Error: Review, thread, or parent message no longer exists');
    expect(process.exitCode).toBe(1);
  });

  it.each(['watch', 'snapshot', 'reply'])(
    'identifies the unreachable server for %s',
    async (command) => {
      fetchMock.mockRejectedValue(new TypeError('fetch failed'));
      await createCommentCommand().parseAsync([
        'node',
        'difit',
        command,
        '--port',
        '4966',
        ...(command === 'watch' ? ['--once'] : command === 'reply' ? ['{}'] : []),
      ]);
      expect(error).toHaveBeenCalledWith(
        'Error: Cannot connect to difit server on port 4966. Is the server running?',
      );
      expect(process.exitCode).toBe(1);
    },
  );

  it('resumes continuous watch from each returned cursor', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ events: [], cursor: 'stream:1' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ events: [], cursor: 'stream:2' })))
      .mockRejectedValueOnce(new TypeError('fetch failed'));
    await createCommentCommand().parseAsync(['node', 'difit', 'watch', '--port', '4966']);
    expect(fetchMock.mock.calls[1]?.[0]).toContain('after=stream%3A1');
    expect(fetchMock.mock.calls[2]?.[0]).toContain('after=stream%3A2');
    expect(log.mock.calls.map((c) => JSON.parse(String(c[0])) as unknown)).toEqual([
      { type: 'conversation.cursor', cursor: 'stream:1' },
      { type: 'conversation.cursor', cursor: 'stream:2' },
    ]);
  });

  it('sends reply JSON read from stdin', async () => {
    const reply = {
      reviewId: 'review',
      threadId: 'thread',
      inReplyTo: 'question',
      body: 'Answer\nfrom stdin',
    };
    vi.mocked(detectStdinSource).mockReturnValue('pipe');
    vi.mocked(readStdin).mockResolvedValue(JSON.stringify(reply));
    fetchMock.mockResolvedValue(new Response('{}'));
    await createCommentCommand().parseAsync(['node', 'difit', 'reply', '--port', '4966']);
    expect(readStdin).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4966/api/conversation/reply',
      expect.objectContaining({ body: JSON.stringify(reply) }),
    );
  });
});
