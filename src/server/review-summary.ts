import type { ReviewSummary } from '../types/conversation.js';

export interface ReviewSummaryInput {
  commitMessage: string;
  rationale: string;
  baseVersion: number;
}

export function parseReviewSummaryInput(input: unknown): ReviewSummaryInput | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const { commitMessage, rationale, baseVersion } = input as Record<string, unknown>;
  if (
    typeof commitMessage !== 'string' ||
    commitMessage.length > 16000 ||
    typeof rationale !== 'string' ||
    rationale.length > 4000 ||
    typeof baseVersion !== 'number' ||
    !Number.isSafeInteger(baseVersion) ||
    baseVersion < 0
  ) {
    return undefined;
  }
  return { commitMessage, rationale, baseVersion };
}

export function emptyReviewSummary(): ReviewSummary {
  return { commitMessage: '', rationale: '', version: 0 };
}
