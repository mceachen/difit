import { ChevronRight, Info } from 'lucide-react';
import { useEffect } from 'react';

import type { ReviewContext as ReviewContextData } from '../../types/diff';

export function ReviewContext({ context }: { context?: ReviewContextData }) {
  const name = context?.repositoryName || 'Imported diff';
  const address = window.location.host;

  useEffect(() => {
    if (!context) return;
    const previousTitle = document.title;
    document.title = `${name} — difit (${address})`;
    return () => {
      document.title = previousTitle;
    };
  }, [context, name, address]);

  if (!context) return null;

  return (
    <section aria-label="Review context" className="min-w-0">
      <details className="group min-w-0">
        <summary className="flex h-9 min-w-0 cursor-pointer list-none items-center gap-2 bg-github-bg-secondary pl-[16px] pr-4 hover:bg-github-bg-tertiary focus-visible:outline-2 focus-visible:outline-blue-500 [&::-webkit-details-marker]:hidden">
          <ChevronRight
            size={16}
            aria-hidden="true"
            className="shrink-0 transition-transform group-open:rotate-90"
          />
          <Info size={16} aria-hidden="true" className="shrink-0 text-github-text-secondary" />
          <span className="min-w-0 truncate text-sm font-medium text-github-text-primary">
            Repository info
          </span>
        </summary>
        <dl className="grid min-w-0 grid-cols-1 gap-y-1 pb-3 pl-[40px] pr-4 pt-2 text-xs [&>dt:not(:first-child)]:mt-2">
          {context.source === 'stdin' && (
            <>
              <dt className="text-github-text-secondary">Review source</dt>
              <dd className="min-w-0 text-github-text-primary">Imported diff</dd>
            </>
          )}
          {context.repositoryPath && (
            <>
              <dt className="text-github-text-secondary">Repository</dt>
              <dd className="min-w-0 select-text break-all text-github-text-primary">{name}</dd>
              <dt className="text-github-text-secondary">Worktree</dt>
              <dd className="min-w-0 select-text break-all font-mono text-github-text-primary">
                {context.repositoryPath}
              </dd>
            </>
          )}
          <dt className="text-github-text-secondary">Browser address</dt>
          <dd className="min-w-0 select-text break-all font-mono text-github-text-primary">
            {window.location.origin}
          </dd>
          <dt className="text-github-text-secondary">Server host</dt>
          <dd className="min-w-0 select-text break-all font-mono text-github-text-primary">
            {context.hostname}
          </dd>
          <dt className="text-github-text-secondary">Launched from</dt>
          <dd className="min-w-0 select-text break-all font-mono text-github-text-primary">
            {context.workingDirectory}
          </dd>
        </dl>
      </details>
    </section>
  );
}
