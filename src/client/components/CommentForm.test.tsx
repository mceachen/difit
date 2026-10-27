import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CommentForm } from './CommentForm';

describe('CommentForm', () => {
  it('sends a question with explicit intent through the same Send button', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<CommentForm onSubmit={onSubmit} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Comment intent'), { target: { value: 'question' } });
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Why this approach?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(onSubmit).toHaveBeenCalledWith('Why this approach?', {
      isQuestion: false,
      intent: 'question',
    });
  });
  it('allows empty-form dismissal without a Cancel button', () => {
    const onCancel = vi.fn();
    const { container } = render(
      <CommentForm onSubmit={vi.fn()} onCancel={onCancel} selectedCode="const value = 1;" />,
    );

    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();

    fireEvent.reset(container.querySelector('form')!);
    expect(onCancel).toHaveBeenCalledOnce();
    expect(screen.getByRole('textbox')).toHaveValue('');
  });

  it('hides the question toggle unless enabled', () => {
    render(<CommentForm onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.queryByRole('checkbox', { name: 'Question' })).not.toBeInTheDocument();
  });

  it('submits the question flag when the toggle is checked', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<CommentForm onSubmit={onSubmit} onCancel={vi.fn()} showQuestionToggle={true} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Why is this cached?' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Question' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith('Why is this cached?', { isQuestion: true }),
    );
  });
});
