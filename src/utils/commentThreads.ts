import type { CommentThread, DiffCommentThread } from '../types/diff.js';

export function toCommentThread(thread: DiffCommentThread): CommentThread {
  const common = {
    id: thread.id,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    codeContent: thread.codeSnapshot?.content,
    isQuestion: thread.isQuestion,
    messages: thread.messages,
  };
  if (thread.scope === 'review') return { ...common, scope: 'review' };
  return {
    ...common,
    file: thread.filePath,
    line:
      typeof thread.position.line === 'number'
        ? thread.position.line
        : [thread.position.line.start, thread.position.line.end],
    side: thread.position.side,
  };
}
