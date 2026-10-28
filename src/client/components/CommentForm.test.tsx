import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CommentForm } from './CommentForm';

describe('CommentForm', () => {
  it.each([
    ['Comment', 'comment', false],
    ['Change request', 'change', false],
    ['Question', 'question', true],
  ] as const)('submits %s from the single intent group', async (label, intent, isQuestion) => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<CommentForm onSubmit={onSubmit} onCancel={vi.fn()} />);
    expect(screen.getByRole('radiogroup', { name: 'Comment intent' })).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: label }));
    await user.type(screen.getByRole('textbox'), 'Review feedback');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(onSubmit).toHaveBeenCalledWith('Review feedback', { isQuestion, intent });
  });

  it('supports arrow-key intent selection', async () => {
    const user = userEvent.setup();
    render(<CommentForm onSubmit={vi.fn()} onCancel={vi.fn()} />);
    await user.click(screen.getByRole('radio', { name: 'Comment' }));
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Change request' })).toBeChecked();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Question' })).toBeChecked();
  });

  it('keeps selections independent between composers', async () => {
    const user = userEvent.setup();
    render(
      <>
        <CommentForm onSubmit={vi.fn()} onCancel={vi.fn()} />
        <CommentForm onSubmit={vi.fn()} onCancel={vi.fn()} />
      </>,
    );
    await user.click(screen.getAllByRole('radio', { name: 'Question' })[0]!);
    expect(screen.getAllByRole('radio', { name: 'Comment' })[1]).toBeChecked();
  });

  it('allows empty-form dismissal without a Cancel button', () => {
    const onCancel = vi.fn();
    const { container } = render(<CommentForm onSubmit={vi.fn()} onCancel={onCancel} />);
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    fireEvent.reset(container.querySelector('form')!);
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('preserves intent after a failed send', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('offline'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<CommentForm onSubmit={onSubmit} onCancel={vi.fn()} initialIntent="question" />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Why?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(error).toHaveBeenCalled());
    expect(screen.getByRole('radio', { name: 'Question' })).toBeChecked();
    expect(screen.getByRole('textbox')).toHaveValue('Why?');
  });
});
