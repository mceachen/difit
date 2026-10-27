import type {
  DiffCommentCodeSnapshot,
  DiffCommentPosition,
  DiffSelection,
  DiffCommentThread,
  CommentIntent,
} from './diff.js';

export interface ConversationEvent {
  type: 'comment.created' | 'comment.updated';
  cursor: string;
  origin: 'user' | 'agent';
  reviewId: string;
  selection: DiffSelection;
  threadId: string;
  messageId: string;
  scope?: 'line' | 'review';
  file?: string;
  side?: DiffCommentPosition['side'];
  line?: DiffCommentPosition['line'];
  intent?: CommentIntent;
  body: string;
  author?: string;
  codeSnapshot?: DiffCommentCodeSnapshot;
  timestamp: string;
}

export interface ConversationBatch {
  events: (ConversationEvent | ReviewApprovalEvent)[];
  cursor: string;
}

export interface ReviewApproval {
  approved: boolean;
  updatedAt?: string;
  cursor?: string;
}

interface ReviewApprovalEvent {
  type: 'review.approval';
  origin: 'user';
  cursor: string;
  reviewId: string;
  selection: DiffSelection;
  approved: boolean;
  timestamp: string;
}

export interface ConversationSnapshot {
  cursor: string;
  reviews: {
    id: string;
    selection: DiffSelection;
    threads: DiffCommentThread[];
    approval: ReviewApproval;
  }[];
}
