import { useCallback, useEffect, useRef, useState } from 'react';

import type { ReviewSummary } from '../../types/conversation';

type Draft = Pick<ReviewSummary, 'commitMessage' | 'rationale'>;
interface SummaryState {
  url: string;
  saved: ReviewSummary;
  draft: Draft;
  latest?: ReviewSummary;
}

const EMPTY_DRAFT: Draft = { commitMessage: '', rationale: '' };
const toDraft = (summary: ReviewSummary): Draft => ({
  commitMessage: summary.commitMessage,
  rationale: summary.rationale,
});
const sameText = (a: Draft, b: Draft) =>
  a.commitMessage === b.commitMessage && a.rationale === b.rationale;
const isSummary = (value: unknown): value is ReviewSummary => {
  if (!value || typeof value !== 'object') return false;
  const input = value as Partial<ReviewSummary>;
  return (
    typeof input.commitMessage === 'string' &&
    typeof input.rationale === 'string' &&
    Number.isSafeInteger(input.version) &&
    (input.version ?? -1) >= 0
  );
};

/** Keep unsaved edits intact when another browser or agent updates the summary. */
export function useReviewSummary(url: string | null) {
  const [state, setState] = useState<SummaryState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingUrl, setSavingUrl] = useState<string | null>(null);
  const activeUrl = useRef(url);
  const generation = useRef(0);
  if (activeUrl.current !== url) generation.current += 1;
  activeUrl.current = url;
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    if (!url || activeUrl.current !== url) return;
    const id = ++requestId.current;
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) throw new Error('Could not load change summary');
      const summary: unknown = await response.json();
      if (!isSummary(summary)) throw new Error('Invalid change summary');
      if (id !== requestId.current || activeUrl.current !== url) return;
      setState((previous) => {
        if (previous?.url === url) {
          if (summary.version < previous.saved.version) return previous;
          if (!sameText(previous.draft, previous.saved)) {
            return {
              ...previous,
              latest: summary.version > previous.saved.version ? summary : undefined,
            };
          }
        }
        return { url, saved: summary, draft: toDraft(summary) };
      });
      setError(null);
    } catch {
      if (id === requestId.current && activeUrl.current === url) {
        setError('Could not load the change summary. Try again.');
      }
    }
  }, [url]);

  useEffect(() => {
    setState(null);
    setError(null);
    setSavingUrl(null);
    void refresh();
    return () => {
      requestId.current += 1;
    };
  }, [refresh]);

  const updateDraft = useCallback(
    (draft: Partial<Draft>) => {
      setState((previous) =>
        previous?.url === url ? { ...previous, draft: { ...previous.draft, ...draft } } : previous,
      );
    },
    [url],
  );

  const save = useCallback(async () => {
    if (!url || state?.url !== url || savingUrl === url) return false;
    const startedGeneration = generation.current;
    const isCurrent = () => activeUrl.current === url && generation.current === startedGeneration;
    requestId.current += 1;
    setSavingUrl(url);
    setError(null);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...state.draft, baseVersion: state.saved.version }),
      });
      const payload: unknown = await response.json();
      if (!isCurrent()) return false;
      if (response.status === 409) {
        const latest = (payload as { summary?: unknown } | null)?.summary;
        if (isSummary(latest)) {
          setState((previous) => (previous?.url === url ? { ...previous, latest } : previous));
        }
        setError('A newer summary was saved. Your draft is still here.');
        return false;
      }
      if (!response.ok || !isSummary(payload)) throw new Error('Could not save change summary');
      setState((previous) => {
        const latest = previous?.url === url ? (previous.latest ?? previous.saved) : payload;
        const saved = latest.version > payload.version ? latest : payload;
        return { url, saved, draft: toDraft(saved) };
      });
      return true;
    } catch {
      if (isCurrent()) setError('Could not save the change summary. Try again.');
      return false;
    } finally {
      if (isCurrent()) setSavingUrl(null);
    }
  }, [url, state, savingUrl]);

  const discard = useCallback(() => {
    setState((previous) => {
      if (previous?.url !== url) return previous;
      const summary = previous.latest ?? previous.saved;
      return { url: previous.url, saved: summary, draft: toDraft(summary) };
    });
    setError(null);
  }, [url]);

  const current = state?.url === url ? state : null;
  return {
    draft: current?.draft ?? EMPTY_DRAFT,
    version: current?.saved.version ?? 0,
    dirty: current !== null && !sameText(current.draft, current.saved),
    ready: current !== null,
    saving: savingUrl !== null && savingUrl === url,
    conflict: current?.latest !== undefined,
    error,
    refresh,
    updateDraft,
    save,
    discard,
  };
}
