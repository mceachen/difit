import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { ReviewContext as ReviewContextData } from '../../types/diff';
import { ReviewContext } from './ReviewContext';

const context: ReviewContextData = {
  source: 'git',
  repositoryName: 'difit',
  repositoryPath: '/projects/worktrees/conversation-view/difit',
  workingDirectory: '/projects/worktrees/conversation-view/difit/src',
  hostname: 'review-host',
};

describe('ReviewContext', () => {
  it('identifies the review and exposes selectable details on demand', () => {
    const { container } = render(<ReviewContext context={context} />);
    expect(screen.getByText('Repository info')).toBeVisible();
    const details = container.querySelector('details')!;
    expect(details.open).toBe(false);
    fireEvent.click(container.querySelector('summary')!);
    expect(details.open).toBe(true);
    expect(screen.getByText('Repository')).toBeVisible();
    expect(screen.getByText('review-host')).toBeVisible();
    expect(screen.getByText(context.workingDirectory)).toBeVisible();
  });

  it('labels imported diffs without claiming the launch directory is their repository', () => {
    render(
      <ReviewContext
        context={{ source: 'stdin', workingDirectory: '/launcher', hostname: 'host' }}
      />,
    );
    fireEvent.click(screen.getByText('Repository info'));
    expect(screen.getByText('Imported diff')).toBeVisible();
    expect(screen.queryByText('Repository')).not.toBeInTheDocument();
    expect(screen.getByText('Launched from')).toBeInTheDocument();
  });

  it('includes the repository and page address in the tab title and restores it on unmount', () => {
    const previousTitle = document.title;
    const { unmount } = render(<ReviewContext context={context} />);
    expect(document.title).toBe(`difit — difit (${window.location.host})`);
    unmount();
    expect(document.title).toBe(previousTitle);
  });

  it('renders nothing for older servers without context', () => {
    const { container } = render(<ReviewContext />);
    expect(container).toBeEmptyDOMElement();
  });
});
