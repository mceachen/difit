import { type Command, InvalidArgumentError } from 'commander';

import type { ConversationBatch } from '../types/conversation.js';

import { detectStdinSource, readStdin } from './utils.js';

function integerInRange(value: string, min: number, max: number): number {
  const number = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(number) || number < min || number > max) {
    throw new InvalidArgumentError(`Expected an integer from ${min} to ${max}`);
  }
  return number;
}

async function checkResponse(response: Response): Promise<void> {
  if (response.ok) return;
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  if (body?.error) throw new Error(body.error);
  if (response.status === 404) {
    throw new Error(
      'Conversation endpoint or thread not found; start difit with --conversation and use IDs from its events',
    );
  }
  throw new Error(`Conversation request failed (${response.status})`);
}

function reportError(error: unknown, port: number): void {
  const message =
    error instanceof TypeError && error.message.includes('fetch failed')
      ? `Cannot connect to difit server on port ${port}. Is the server running?`
      : error instanceof Error
        ? error.message
        : 'Conversation request failed';
  console.error(`Error: ${message}`);
  // Let buffered JSON Lines drain before exiting.
  process.exitCode = 1;
}

export function addConversationCommands(comment: Command): void {
  comment
    .command('watch')
    .description('Stream live comment events as JSON Lines; stderr carries errors')
    .requiredOption('--port <port>', 'port of a difit --conversation server', (value: string) =>
      integerInRange(value, 1, 65535),
    )
    .option('--after <cursor>', 'resume after a cursor, or latest to skip existing events')
    .option('--once', 'wait for one batch, print events and a cursor, then exit')
    .option(
      '--wait <milliseconds>',
      'maximum wait per request (0-25000)',
      (value: string) => integerInRange(value, 0, 25000),
      25000,
    )
    .action(async (options: { port: number; after?: string; once?: boolean; wait: number }) => {
      try {
        if (options.wait === 0 && !options.once) {
          throw new Error('--wait 0 requires --once to avoid a busy polling loop');
        }
        let cursor = options.after;
        do {
          const query = new URLSearchParams({ wait: String(options.wait) });
          if (cursor !== undefined) query.set('after', cursor);
          const response = await fetch(
            `http://localhost:${options.port}/api/conversation/events?${query}`,
            {
              signal: AbortSignal.timeout(30000),
            },
          );
          await checkResponse(response);
          const batch = (await response.json()) as ConversationBatch;
          for (const event of batch.events) {
            if (event.origin === 'user') {
              const receipt = await fetch(
                `http://localhost:${options.port}/api/conversation/status`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    reviewId: event.reviewId,
                    threadId: event.threadId,
                    messageId: event.messageId,
                    cursor: event.cursor,
                    status: 'delivered',
                  }),
                  signal: AbortSignal.timeout(30000),
                },
              );
              // A replay can include a deleted comment or wording superseded by a later event.
              if (receipt.status !== 404 && receipt.status !== 409) await checkResponse(receipt);
            }
            console.log(JSON.stringify(event));
          }
          cursor = batch.cursor;
          console.log(JSON.stringify({ type: 'conversation.cursor', cursor }));
        } while (!options.once);
      } catch (error) {
        reportError(error, options.port);
      }
    });

  comment
    .command('snapshot')
    .description('Recover all conversation reviews and a cursor for gap-free resumption')
    .requiredOption('--port <port>', 'port of a difit --conversation server', (value: string) =>
      integerInRange(value, 1, 65535),
    )
    .action(async (options: { port: number }) => {
      try {
        const response = await fetch(`http://localhost:${options.port}/api/conversation/snapshot`, {
          signal: AbortSignal.timeout(30000),
        });
        await checkResponse(response);
        console.log(JSON.stringify(await response.json()));
      } catch (error) {
        reportError(error, options.port);
      }
    });

  comment
    .command('status')
    .description(
      'Report read, thinking, replying, or noted for an exact comment revision; accepts JSON via stdin',
    )
    .argument('[json]', 'JSON with reviewId, threadId, messageId, cursor, and status')
    .requiredOption('--port <port>', 'port of a difit --conversation server', (value: string) =>
      integerInRange(value, 1, 65535),
    )
    .action(async (json: string | undefined, options: { port: number }) => {
      try {
        if (json === undefined && detectStdinSource() === 'tty') {
          throw new Error('Provide status JSON as an argument or via stdin');
        }
        const body: unknown = JSON.parse(json ?? (await readStdin()));
        const response = await fetch(`http://localhost:${options.port}/api/conversation/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(30000),
        });
        await checkResponse(response);
        console.log(JSON.stringify(await response.json()));
      } catch (error) {
        reportError(error, options.port);
      }
    });

  comment
    .command('reply')
    .description('Reply to an exact review/thread/message using event IDs; accepts JSON via stdin')
    .argument('[json]', 'JSON with reviewId, threadId, inReplyTo, body, and optional cursor/author')
    .requiredOption('--port <port>', 'port of a difit --conversation server', (value: string) =>
      integerInRange(value, 1, 65535),
    )
    .action(async (json: string | undefined, options: { port: number }) => {
      try {
        if (json === undefined && detectStdinSource() === 'tty') {
          throw new Error('Provide reply JSON as an argument or via stdin');
        }
        const body: unknown = JSON.parse(json ?? (await readStdin()));
        const response = await fetch(`http://localhost:${options.port}/api/conversation/reply`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(30000),
        });
        await checkResponse(response);
        console.log(JSON.stringify(await response.json()));
      } catch (error) {
        reportError(error, options.port);
      }
    });
}
