import { describe, expect, it } from 'vitest';

import type { DiffCommentThread } from '../types/diff.js';

import { Conversation } from './conversation.js';

const selection = { baseCommitish: 'base-sha', targetCommitish: 'target-sha' };
const thread: DiffCommentThread = {
  id: 'thread-a',
  filePath: 'src/a.ts',
  position: { side: 'new', line: { start: 4, end: 6 } },
  codeSnapshot: { content: 'const answer = 42;' },
  createdAt: '2026-10-24T00:00:00Z',
  updatedAt: '2026-10-24T00:00:00Z',
  messages: [
    {
      id: 'question-a',
      body: 'Why 42?\nPlease explain.',
      author: 'User',
      createdAt: '2026-10-24T00:00:00Z',
      updatedAt: '2026-10-24T00:00:00Z',
    },
  ],
};

describe('Conversation journal', () => {
  it('captures review summaries and wakes a waiting consumer', async () => {
    const journal = new Conversation();
    expect(journal.getSummary(selection)).toEqual({ commitMessage: '', rationale: '', version: 0 });
    const waiting = journal.wait(journal.cursor, 25000, new AbortController().signal);
    const summary = { commitMessage: 'fix: preserve intent', rationale: 'Review why.', version: 1 };
    journal.setSummary(selection, summary, 'agent');
    expect((await waiting).events).toEqual([
      expect.objectContaining({ type: 'review.summary', origin: 'agent', summary }),
    ]);
    summary.rationale = 'Changed outside the journal';
    expect(journal.snapshot().reviews[0]?.summary.rationale).toBe('Review why.');
  });

  it('journals approval changes, wakes watchers, and treats repeated state as idempotent', async () => {
    const journal = new Conversation();
    const waiting = journal.wait(journal.cursor, 25000, new AbortController().signal);
    const approval = journal.setApproval(selection, true);
    expect((await waiting).events).toEqual([
      expect.objectContaining({ type: 'review.approval', approved: true }),
    ]);
    journal.setApproval(selection, true);
    expect(journal.read(approval.cursor).events).toEqual([]);
    journal.setApproval(selection, false);
    expect(journal.snapshot().reviews[0]?.approval.approved).toBe(false);
    expect(journal.read(approval.cursor).events).toEqual([
      expect.objectContaining({ type: 'review.approval', approved: false }),
    ]);
    expect(new Conversation().getApproval(selection).approved).toBe(false);
  });

  it('captures review context, emits edits, and does not repeat unchanged messages', () => {
    const journal = new Conversation();
    journal.update(selection, [], [thread], 'user');
    const first = journal.read();
    expect(first.events).toHaveLength(1);
    expect(first.events[0]).toMatchObject({
      type: 'comment.created',
      origin: 'user',
      selection,
      threadId: 'thread-a',
      messageId: 'question-a',
      file: 'src/a.ts',
      side: 'new',
      line: { start: 4, end: 6 },
      body: 'Why 42?\nPlease explain.',
      codeSnapshot: thread.codeSnapshot,
    });
    journal.update(selection, [thread], [thread], 'user');
    expect(journal.read(first.cursor).events).toEqual([]);
    const edited = structuredClone(thread);
    edited.messages[0]!.body = 'Why not 43?';
    journal.update(selection, [thread], [edited], 'user');
    expect(journal.read(first.cursor).events).toEqual([
      expect.objectContaining({
        type: 'comment.updated',
        body: 'Why not 43?',
        reviewId: first.events[0]!.reviewId,
      }),
    ]);
    expect(first.events[0]).toMatchObject({ body: 'Why 42?\nPlease explain.' });
  });

  it('tracks progress per revision without emitting comment events or regressing on replay', () => {
    const journal = new Conversation();
    journal.update(selection, [], [thread], 'user');
    const event = journal.read().events[0]!;
    if (!('threadId' in event)) throw new Error('Expected comment event');
    const set = (status: 'delivered' | 'thinking' | 'read' | 'replied') =>
      journal.setProgress(event.reviewId, event.threadId, event.messageId, event.cursor, status);
    const progress = () => journal.snapshot().reviews[0]!.threads[0]!.messages[0]!.progress;
    expect(progress()?.status).toBe('queued');
    set('delivered');
    set('thinking');
    set('read');
    expect(progress()?.status).toBe('thinking');
    expect(journal.read(event.cursor).events).toEqual([]);
    set('replied');
    set('delivered');
    expect(progress()?.status).toBe('replied');
    const edited = structuredClone(thread);
    edited.messages[0]!.body = 'Different question';
    journal.update(selection, [thread], [edited], 'user');
    expect(progress()?.status).toBe('queued');
    expect(() => set('thinking')).toThrow('Comment changed');
    journal.update(selection, [edited], [], 'user');
    expect(() => set('thinking')).toThrow('no longer exists');
  });

  it('delivers a submitted comment to an already waiting consumer', async () => {
    const journal = new Conversation();
    const waiting = journal.wait(journal.cursor, 25000, new AbortController().signal);
    journal.update(selection, [], [thread], 'user');
    expect((await waiting).events[0]).toMatchObject({ body: 'Why 42?\nPlease explain.' });
  });

  it('releases a cancelled wait without consuming another client’s events', async () => {
    const journal = new Conversation();
    const abort = new AbortController();
    const waiting = journal.wait(journal.cursor, 25000, abort.signal);
    abort.abort();
    expect((await waiting).events).toEqual([]);
    journal.update(selection, [], [thread], 'user');
    expect(journal.read().events).toHaveLength(1);
  });

  it('separates reviews and labels agent responses', () => {
    const journal = new Conversation();
    journal.update(selection, [], [thread], 'user');
    journal.update({ ...selection, targetCommitish: 'another-sha' }, [], [thread], 'agent');
    const events = journal.read().events;
    expect(events[0]!.reviewId).not.toBe(events[1]!.reviewId);
    expect(events[1]!.origin).toBe('agent');
    expect(journal.findReview(events[0]!.reviewId)?.selection).toEqual(selection);
  });

  it('rejects expired, future, and restarted-server cursors instead of losing messages silently', () => {
    const journal = new Conversation(1);
    const initial = journal.cursor;
    journal.update(selection, [], [thread], 'user');
    const cursor = journal.cursor;
    journal.update(selection, [], [thread], 'agent');
    expect(() => journal.read(initial)).toThrow('expired');
    expect(journal.read(cursor).events).toHaveLength(1);
    expect(() => journal.read(cursor.replace(/:\d+$/, ':999'))).toThrow('Invalid');
    expect(() => new Conversation().read(cursor)).toThrow('restarted');
  });
});
