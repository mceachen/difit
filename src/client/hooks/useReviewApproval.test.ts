import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useReviewApproval } from './useReviewApproval';

const response = (approved: boolean) => new Response(JSON.stringify({ approved }));

afterEach(() => vi.unstubAllGlobals());

describe('review approval', () => {
  it('restores server approval and preserves it when revocation fails', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response(true));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useReviewApproval('/api/approval?target=a'));
    await waitFor(() => expect(result.current.approved).toBe(true));
    fetchMock.mockResolvedValue(new Response('{}', { status: 500 }));
    await act(async () => {
      await expect(result.current.setApproved(false)).rejects.toThrow('Could not update approval');
    });
    expect(result.current.approved).toBe(true);
  });

  it('does not apply a late approval response to a different selection', async () => {
    let finishApproval: ((response: Response) => void) | undefined;
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
      if (init?.method === 'POST')
        return new Promise((resolve) => {
          finishApproval = resolve;
        });
      return response(String(url).endsWith('b'));
    });
    vi.stubGlobal('fetch', fetchMock);
    const { result, rerender } = renderHook(({ url }) => useReviewApproval(url), {
      initialProps: { url: '/api/approval?target=a' },
    });
    await waitFor(() => expect(result.current.ready).toBe(true));
    let pending: Promise<void>;
    act(() => {
      pending = result.current.setApproved(true);
    });
    rerender({ url: '/api/approval?target=b' });
    await waitFor(() => expect(result.current.approved).toBe(true));
    await act(async () => {
      finishApproval?.(response(true));
      await pending;
    });
    expect(result.current.ready).toBe(true);
    expect(result.current.approved).toBe(true);
    expect(
      fetchMock.mock.calls.filter(([url, init]) => String(url).endsWith('a') && !init?.method),
    ).toHaveLength(1);
  });

  it('disables approval when an older server lacks the reversible endpoint', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 404 })),
    );
    const { result } = renderHook(() => useReviewApproval('/api/approval'));
    await waitFor(() => expect(result.current.error).toContain('Could not load approval'));
    expect(result.current.ready).toBe(false);
    expect(result.current.approved).toBe(false);
  });
});
