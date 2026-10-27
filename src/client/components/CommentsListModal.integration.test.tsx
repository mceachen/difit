import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { HotkeysProvider } from 'react-hotkeys-hook';
import { describe, expect, it, vi } from 'vitest';

import type { CommentThread } from '../../types/diff';
import type { CommentSubmitOptions } from './CommentForm';
import { CommentsListModal } from './CommentsListModal';

const time = '2026-10-24T00:00:00Z';
const threads: CommentThread[] = ['A', 'B', 'C'].map((id) => ({
  id,
  scope: 'review',
  createdAt: time,
  updatedAt: time,
  messages: [{ id, body: `Thread ${id}`, author: 'User', createdAt: time, updatedAt: time }],
}));
const props = {
  isOpen: true,
  onClose: vi.fn(),
  onNavigate: vi.fn(),
  onGenerateThreadPrompt: () => '',
  onReplyToThread: vi.fn(),
  onRemoveMessage: vi.fn(),
  onUpdateMessage: vi.fn(),
  onAddGeneralComment: vi.fn(),
};

function KeyboardHarness() {
  const [comments, setComments] = useState(threads);
  return (
    <HotkeysProvider initiallyActiveScopes={['global']}>
      <CommentsListModal
        {...props}
        comments={comments}
        onRemoveThread={(id) => setComments((items) => items.filter((thread) => thread.id !== id))}
      />
    </HotkeysProvider>
  );
}

const inline: CommentThread = {
  ...threads[0]!,
  scope: 'line',
  file: 'test.ts',
  line: 1,
  side: 'new',
};
function TriggerHarness({
  onNavigate,
  onAddGeneralComment,
}: {
  onNavigate: (thread: CommentThread) => void;
  onAddGeneralComment: (body: string, options: CommentSubmitOptions) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <HotkeysProvider initiallyActiveScopes={['global']}>
      <button onClick={() => setOpen(true)}>Open conversation</button>
      <CommentsListModal
        {...props}
        isOpen={open}
        onClose={() => setOpen(false)}
        comments={[inline]}
        onRemoveThread={vi.fn()}
        onNavigate={onNavigate}
        onAddGeneralComment={onAddGeneralComment}
      />
    </HotkeysProvider>
  );
}

describe('Conversation keyboard navigation', () => {
  it('jumps once from a focused drawer without reactivating its opener', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<TriggerHarness onNavigate={onNavigate} onAddGeneralComment={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Open conversation' }));
    await user.keyboard('{Enter}');
    expect(onNavigate).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('sends from the focused Send button without triggering inline navigation', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    const onAddGeneralComment = vi.fn().mockResolvedValue(undefined);
    render(<TriggerHarness onNavigate={onNavigate} onAddGeneralComment={onAddGeneralComment} />);
    await user.click(screen.getByRole('button', { name: 'Open conversation' }));
    await user.type(screen.getByRole('textbox'), 'Why this approach?');
    await user.tab();
    await user.tab();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Send' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onAddGeneralComment).toHaveBeenCalledWith('Why this approach?', { isQuestion: false });
    expect(onNavigate).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('keeps navigation shortcuts active after clicking a drawer button', async () => {
    const user = userEvent.setup();
    render(<KeyboardHarness />);
    await user.click(screen.getAllByRole('button', { name: 'Copy Prompt' })[0]!);
    await user.keyboard('j');
    expect(screen.getByText('2 of 3 threads')).toBeInTheDocument();
  });

  it('opens with navigation available instead of focusing the composer', async () => {
    const user = userEvent.setup();
    render(<KeyboardHarness />);
    expect(screen.getByRole('textbox')).not.toHaveFocus();
    await user.keyboard('j');
    expect(screen.getByText('2 of 3 threads')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue('');
  });
});

it('confirms deletion of a general thread without removing adjacent discussions', async () => {
  const user = userEvent.setup();
  render(<KeyboardHarness />);
  await user.click(screen.getAllByRole('button', { name: 'Delete thread' })[0]!);
  expect(screen.getByText('Thread A')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Delete' }));
  expect(screen.queryByText('Thread A')).not.toBeInTheDocument();
  expect(screen.getByText('Thread B')).toBeInTheDocument();
  expect(screen.getByText('Thread C')).toBeInTheDocument();
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});

describe('Conversation drafts', () => {
  // Draft loss reproduced with pnpm test -- src/client/components/CommentsListModal.integration.test.tsx.
  it('preserves an unsent comment when visiting inline code and closing the drawer', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<TriggerHarness onNavigate={onNavigate} onAddGeneralComment={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Open conversation' }));
    await user.type(screen.getByRole('textbox'), 'Why this approach?');
    await user.click(screen.getByRole('checkbox', { name: 'Question' }));
    await user.click(screen.getByText('Thread A'));
    expect(onNavigate).toHaveBeenCalledWith(inline);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open conversation' }));
    expect(screen.getByRole('textbox')).toHaveValue('Why this approach?');
    expect(screen.getByRole('checkbox', { name: 'Question' })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Close conversation' }));
    await user.click(screen.getByRole('button', { name: 'Open conversation' }));
    expect(screen.getByRole('textbox')).toHaveValue('Why this approach?');
    expect(screen.getByRole('checkbox', { name: 'Question' })).toBeChecked();
  });

  it.each(['Cancel', 'Escape'])(
    'discards the draft when explicitly cancelling with %s',
    async (action) => {
      const user = userEvent.setup();
      render(<TriggerHarness onNavigate={vi.fn()} onAddGeneralComment={vi.fn()} />);
      await user.click(screen.getByRole('button', { name: 'Open conversation' }));
      await user.type(screen.getByRole('textbox'), 'Never mind');
      await user.click(screen.getByRole('checkbox', { name: 'Question' }));
      if (action === 'Cancel') {
        await user.click(screen.getByRole('button', { name: 'Cancel' }));
      } else {
        await user.keyboard('{Escape}');
      }
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Open conversation' }));
      expect(screen.getByRole('textbox')).toHaveValue('');
      expect(screen.getByRole('checkbox', { name: 'Question' })).not.toBeChecked();
    },
  );

  it('clears the saved draft after sending successfully', async () => {
    const user = userEvent.setup();
    const onAddGeneralComment = vi.fn().mockResolvedValue(undefined);
    render(<TriggerHarness onNavigate={vi.fn()} onAddGeneralComment={onAddGeneralComment} />);
    await user.click(screen.getByRole('button', { name: 'Open conversation' }));
    await user.type(screen.getByRole('textbox'), 'Why this approach?');
    await user.click(screen.getByRole('checkbox', { name: 'Question' }));
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(onAddGeneralComment).toHaveBeenCalledWith('Why this approach?', { isQuestion: true });
    expect(screen.getByRole('textbox')).toHaveValue('');
    expect(screen.getByRole('checkbox', { name: 'Question' })).not.toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Close conversation' }));
    await user.click(screen.getByRole('button', { name: 'Open conversation' }));
    expect(screen.getByRole('textbox')).toHaveValue('');
    expect(screen.getByRole('checkbox', { name: 'Question' })).not.toBeChecked();
  });

  it('keeps a newer draft if an earlier send finishes after reopening', async () => {
    const user = userEvent.setup();
    let finishSend!: () => void;
    const onAddGeneralComment = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishSend = resolve;
        }),
    );
    render(<TriggerHarness onNavigate={vi.fn()} onAddGeneralComment={onAddGeneralComment} />);
    await user.click(screen.getByRole('button', { name: 'Open conversation' }));
    await user.type(screen.getByRole('textbox'), 'First question');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await user.click(screen.getByRole('button', { name: 'Close conversation' }));
    await user.click(screen.getByRole('button', { name: 'Open conversation' }));
    await user.clear(screen.getByRole('textbox'));
    await user.type(screen.getByRole('textbox'), 'Second question');
    await user.click(screen.getByRole('checkbox', { name: 'Question' }));
    await act(async () => finishSend());
    expect(screen.getByRole('textbox')).toHaveValue('Second question');
    expect(screen.getByRole('checkbox', { name: 'Question' })).toBeChecked();
  });

  it('retains a draft after a failed send and reopening the drawer', async () => {
    const user = userEvent.setup();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onAddGeneralComment = vi.fn().mockRejectedValue(new Error('offline'));
    render(<TriggerHarness onNavigate={vi.fn()} onAddGeneralComment={onAddGeneralComment} />);
    await user.click(screen.getByRole('button', { name: 'Open conversation' }));
    await user.type(screen.getByRole('textbox'), 'Why this approach?');
    await user.click(screen.getByRole('checkbox', { name: 'Question' }));
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(error).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Close conversation' }));
    await user.click(screen.getByRole('button', { name: 'Open conversation' }));
    expect(screen.getByRole('textbox')).toHaveValue('Why this approach?');
    expect(screen.getByRole('checkbox', { name: 'Question' })).toBeChecked();
  });
});
