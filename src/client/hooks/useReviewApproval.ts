import { useCallback, useEffect, useRef, useState } from 'react';

import type { ReviewApproval } from '../../types/conversation';

/** Server-owned approval, scoped to the displayed diff selection. */
export function useReviewApproval(url: string | null) {
  const [state, setState] = useState<{ url: string; approved: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const activeUrl = useRef(url);
  activeUrl.current = url;

  const refresh = useCallback(async () => {
    if (activeUrl.current !== url) return;
    const id = ++requestId.current;
    if (!url) return;
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) throw new Error('Could not load approval');
      const approval = (await response.json()) as ReviewApproval;
      if (typeof approval.approved !== 'boolean') throw new Error('Invalid approval response');
      if (id === requestId.current && activeUrl.current === url) {
        setState({ url, approved: approval.approved });
        setError(null);
      }
    } catch {
      if (id === requestId.current && activeUrl.current === url) {
        setState(null);
        setError('Could not load approval. Refresh the review to retry.');
      }
    }
  }, [url]);

  useEffect(() => {
    setState(null);
    setError(null);
    void refresh();
    return () => {
      requestId.current += 1;
    };
  }, [refresh]);

  const setApproved = useCallback(
    async (approved: boolean, summaryVersion = 0) => {
      if (!url) throw new Error('Approval is unavailable');
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved, ...(approved ? { summaryVersion } : {}) }),
      });
      if (!response.ok) throw new Error('Could not update approval');
      // Fetch current state, including changes from another browser tab.
      await refresh();
    },
    [url, refresh],
  );

  return {
    approved: state?.url === url && state.approved,
    ready: state !== null && state.url === url,
    error,
    refresh,
    setApproved,
  };
}
