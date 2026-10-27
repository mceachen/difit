import { createHash, randomUUID } from 'node:crypto';

import type { Express } from 'express';

import type {
  ConversationBatch,
  ConversationEvent,
  ConversationSnapshot,
} from '../types/conversation.js';
import type { DiffCommentThread, DiffSelection } from '../types/diff.js';
import { getDiffSelectionKey } from '../utils/diffSelection.js';

interface Review {
  id: string;
  selection: DiffSelection;
  threads: DiffCommentThread[];
}

/** A bounded, process-local journal. Cursors cannot be reused after server restart. */
export class Conversation {
  private readonly streamId = randomUUID();
  private sequence = 0;
  private readonly events: ConversationEvent[] = [];
  private readonly reviews = new Map<string, Review>();
  private readonly listeners = new Set<() => void>();

  constructor(private readonly capacity = 256) {}

  update(
    selection: DiffSelection,
    previous: DiffCommentThread[],
    next: DiffCommentThread[],
    origin: ConversationEvent['origin'],
  ): void {
    const key = getDiffSelectionKey(selection);
    const review = this.reviews.get(key) ?? {
      id: randomUUID(),
      selection: { ...selection },
      threads: [],
    };
    review.threads = next;
    this.reviews.set(key, review);
    for (const thread of next) {
      const oldThread = previous.find((candidate) => candidate.id === thread.id);
      for (const message of thread.messages) {
        const oldMessage = oldThread?.messages.find((candidate) => candidate.id === message.id);
        if (oldMessage?.body === message.body && oldMessage.intent === message.intent) continue;
        this.sequence += 1;
        this.events.push({
          type: oldMessage ? 'comment.updated' : 'comment.created',
          cursor: this.cursor,
          origin: message.origin ?? origin,
          reviewId: review.id,
          selection: { ...selection },
          threadId: thread.id,
          messageId: message.id,
          scope: thread.scope,
          intent: message.intent,
          file: thread.filePath,
          side: thread.position?.side,
          line: thread.position ? structuredClone(thread.position.line) : undefined,
          body: message.body,
          author: message.author,
          codeSnapshot: thread.codeSnapshot ? { ...thread.codeSnapshot } : undefined,
          timestamp: new Date().toISOString(),
        });
        if (this.events.length > this.capacity) this.events.shift();
      }
    }
    for (const listener of this.listeners) listener();
  }

  get cursor(): string {
    return `${this.streamId}:${this.sequence}`;
  }

  findReview(id: string): Review | undefined {
    return [...this.reviews.values()].find((review) => review.id === id);
  }

  snapshot(): ConversationSnapshot {
    return { cursor: this.cursor, reviews: structuredClone([...this.reviews.values()]) };
  }

  read(after?: string): ConversationBatch {
    let sequence = 0;
    if (after !== undefined) {
      const [streamId, number, extra] = after.split(':');
      sequence = Number(number);
      if (
        streamId !== this.streamId ||
        extra !== undefined ||
        !number ||
        !/^\d+$/.test(number) ||
        !Number.isSafeInteger(sequence) ||
        sequence > this.sequence
      ) {
        throw new Error(
          'Invalid conversation cursor or server restarted; run comment snapshot and resume with its cursor',
        );
      }
    }
    if (sequence < this.sequence - this.events.length) {
      throw new Error(
        'Conversation cursor expired; run comment snapshot and resume with its cursor',
      );
    }
    return {
      events: this.events.slice(sequence - (this.sequence - this.events.length)),
      cursor: this.cursor,
    };
  }

  async wait(after: string, milliseconds: number, signal: AbortSignal): Promise<ConversationBatch> {
    const batch = this.read(after);
    if (batch.events.length > 0 || milliseconds === 0 || signal.aborted) return batch;
    await new Promise<void>((resolve) => {
      const finish = () => {
        clearTimeout(timer);
        this.listeners.delete(finish);
        signal.removeEventListener('abort', finish);
        resolve();
      };
      const timer = setTimeout(finish, milliseconds);
      this.listeners.add(finish);
      signal.addEventListener('abort', finish, { once: true });
    });
    return this.read(after);
  }
}

export function registerConversationRoutes(
  app: Express,
  conversation: Conversation,
  update: (selection: DiffSelection, threads: DiffCommentThread[]) => void,
): void {
  app.get('/api/conversation/snapshot', (_req, res) => {
    res.json(conversation.snapshot());
  });

  app.get('/api/conversation/events', async (req, res) => {
    const after = req.query.after;
    const wait = req.query.wait ?? '25000';
    if (
      (after !== undefined && typeof after !== 'string') ||
      typeof wait !== 'string' ||
      !/^\d+$/.test(wait) ||
      Number(wait) > 25000
    ) {
      res
        .status(400)
        .json({ error: 'Expected a cursor and wait between 0 and 25000 milliseconds' });
      return;
    }
    const abort = new AbortController();
    const disconnect = () => abort.abort();
    res.on('close', disconnect);
    try {
      const batch = conversation.read(after === 'latest' ? conversation.cursor : after);
      const result =
        batch.events.length > 0
          ? batch
          : await conversation.wait(batch.cursor, Number(wait), abort.signal);
      if (!abort.signal.aborted) res.json(result);
    } catch (error) {
      if (!abort.signal.aborted) {
        res.status(409).json({ error: error instanceof Error ? error.message : 'Invalid cursor' });
      }
    } finally {
      res.off('close', disconnect);
    }
  });

  app.post('/api/conversation/reply', (req, res) => {
    if (!req.is('application/json')) {
      res.status(415).json({ error: 'Replies require application/json' });
      return;
    }
    const input = req.body as Record<string, unknown> | null;
    if (
      !input ||
      typeof input !== 'object' ||
      typeof input.reviewId !== 'string' ||
      typeof input.threadId !== 'string' ||
      typeof input.inReplyTo !== 'string' ||
      typeof input.body !== 'string' ||
      !input.body.trim() ||
      (input.author !== undefined && (typeof input.author !== 'string' || !input.author.trim()))
    ) {
      res
        .status(400)
        .json({ error: 'Expected reviewId, threadId, inReplyTo, body, and optional author' });
      return;
    }
    const review = conversation.findReview(input.reviewId);
    const thread = review?.threads.find((candidate) => candidate.id === input.threadId);
    if (!review || !thread || !thread.messages.some((message) => message.id === input.inReplyTo)) {
      res.status(404).json({ error: 'Review, thread, or parent message no longer exists' });
      return;
    }
    // Retrying a reply after a lost HTTP response must not duplicate the answer.
    const author = typeof input.author === 'string' ? input.author.trim() : 'Agent';
    const id = createHash('sha256')
      .update(JSON.stringify([review.id, thread.id, input.inReplyTo, input.body, author]))
      .digest('hex');
    if (!thread.messages.some((message) => message.id === id)) {
      const now = new Date().toISOString();
      const message = {
        id,
        body: input.body,
        origin: 'agent' as const,
        author,
        createdAt: now,
        updatedAt: now,
      };
      update(
        review.selection,
        review.threads.map((candidate) =>
          candidate.id === thread.id
            ? { ...candidate, updatedAt: now, messages: [...candidate.messages, message] }
            : candidate,
        ),
      );
    }
    res.json({ success: true, reviewId: review.id, threadId: thread.id, messageId: id });
  });
}
