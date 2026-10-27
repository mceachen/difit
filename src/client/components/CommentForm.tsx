import React, { useRef, useState } from 'react';

import type { CommentIntent } from '../../types/diff';

import { CommentBodyRenderer, hasSuggestionInBody } from './CommentBodyRenderer';
import type { AppearanceSettings } from './SettingsModal';
import { SuggestionTemplateButton } from './SuggestionTemplateButton';

export interface CommentSubmitOptions {
  isQuestion: boolean;
  intent?: CommentIntent;
}

interface CommentFormProps {
  onSubmit: (body: string, options: CommentSubmitOptions) => Promise<void>;
  onCancel: () => void;
  selectedCode?: string;
  syntaxTheme?: AppearanceSettings['syntaxTheme'];
  filename?: string;
  initialValue?: string;
  value?: string;
  onChange?: React.Dispatch<React.SetStateAction<string>>;
  embedded?: boolean;
  title?: string;
  submitLabel?: string;
  placeholder?: string;
  autoFocus?: boolean;
  dismissOnOutsideClick?: boolean;
  showIntent?: boolean;
  intentValue?: CommentIntent;
  onIntentChange?: (intent: CommentIntent) => void;
  showQuestionToggle?: boolean;
  questionValue?: boolean;
  onQuestionChange?: (isQuestion: boolean) => void;
}

type CommentFormMode = 'edit' | 'preview';

export function CommentForm({
  onSubmit,
  onCancel,
  selectedCode,
  syntaxTheme,
  filename,
  initialValue = '',
  value,
  onChange,
  embedded = false,
  title = 'Add a comment',
  submitLabel = 'Send',
  showIntent = !initialValue,
  intentValue,
  onIntentChange,
  autoFocus = true,
  dismissOnOutsideClick = true,
  placeholder = 'Leave a comment...',
  showQuestionToggle = false,
  questionValue,
  onQuestionChange,
}: CommentFormProps) {
  const [localBody, setLocalBody] = useState(initialValue);
  const body = value ?? localBody;
  const setBody = (nextBody: React.SetStateAction<string>) => {
    setLocalBody(nextBody);
    onChange?.(nextBody);
  };
  const [localIntent, setLocalIntent] = useState<CommentIntent>('comment');
  const intent = intentValue ?? localIntent;
  const [localIsQuestion, setLocalIsQuestion] = useState(false);
  const isQuestion = questionValue ?? localIsQuestion;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mode, setMode] = useState<CommentFormMode>('edit');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hasSuggestion = hasSuggestionInBody(body);
  const effectiveMode: CommentFormMode = hasSuggestion ? mode : 'edit';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!body.trim()) return;

    setIsSubmitting(true);
    try {
      await onSubmit(body.trim(), {
        isQuestion: showQuestionToggle && isQuestion,
        ...(intent !== 'comment' ? { intent } : {}),
      });
      if (value === undefined) {
        setBody((currentBody) => (currentBody === body ? '' : currentBody));
      }
      setLocalIsQuestion(false);
      setLocalIntent('comment');
      setMode('edit');
    } catch (error) {
      console.error('Failed to submit comment:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      void handleSubmit(e);
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <form
      className={
        embedded
          ? 'bg-transparent'
          : 'm-2 mx-3 rounded-md border border-yellow-600/50 border-l-4 border-l-yellow-400 bg-github-bg-tertiary p-3'
      }
      onSubmit={handleSubmit}
      onReset={(event) => {
        event.preventDefault();
        if (!isSubmitting) onCancel();
      }}
      onClick={(e) => e.stopPropagation()}
      data-empty={!body.trim()}
      data-dismiss-on-outside-click={dismissOnOutsideClick}
    >
      {showIntent && (
        <label className="mb-2 flex items-center gap-2 text-xs text-github-text-secondary">
          Intent
          <select
            aria-label="Comment intent"
            value={intent}
            onChange={(event) => {
              const nextIntent = event.target.value as CommentIntent;
              setLocalIntent(nextIntent);
              onIntentChange?.(nextIntent);
            }}
            disabled={isSubmitting}
            className="rounded border border-github-border bg-github-bg-secondary px-2 py-1"
          >
            <option value="comment">Comment</option>
            <option value="question">Question</option>
            <option value="change">Request change</option>
          </select>
        </label>
      )}
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium" style={{ color: 'var(--color-yellow-path-text)' }}>
          {title}
        </span>
        {hasSuggestion ? (
          <div className="flex items-center border border-github-border rounded-md overflow-hidden">
            <button
              type="button"
              onClick={() => setMode('edit')}
              className={`text-xs px-2.5 py-1.5 ${
                effectiveMode === 'edit'
                  ? 'bg-github-bg-tertiary text-github-text-primary'
                  : 'bg-github-bg-secondary text-github-text-secondary'
              } transition-colors`}
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => setMode('preview')}
              className={`text-xs px-2.5 py-1.5 border-l border-github-border ${
                effectiveMode === 'preview'
                  ? 'bg-github-bg-tertiary text-github-text-primary'
                  : 'bg-github-bg-secondary text-github-text-secondary'
              } transition-colors`}
            >
              Preview
            </button>
          </div>
        ) : (
          <SuggestionTemplateButton
            selectedCode={selectedCode}
            value={body}
            onChange={setBody}
            textareaRef={textareaRef}
          />
        )}
      </div>

      {hasSuggestion && effectiveMode === 'preview' ? (
        <div className="min-h-[60px] mb-2 bg-github-bg-secondary border border-github-border rounded px-3 py-2">
          <CommentBodyRenderer
            body={body}
            originalCode={selectedCode}
            filename={filename}
            syntaxTheme={syntaxTheme}
          />
        </div>
      ) : (
        <textarea
          ref={textareaRef}
          className="w-full min-h-[60px] mb-2 resize-y bg-github-bg-secondary border border-github-border rounded px-3 py-2 text-github-text-primary text-sm leading-6 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/30 focus:min-h-[80px] disabled:opacity-50"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={Math.max(3, body.split('\n').length)}
          autoFocus={autoFocus}
          disabled={isSubmitting}
        />
      )}

      <div className="flex gap-2 justify-end">
        {showQuestionToggle && (
          <label
            className="mr-auto flex cursor-pointer items-center gap-1.5 text-xs text-github-text-secondary"
            title="Ask the AI to answer this instead of changing code"
          >
            <input
              type="checkbox"
              checked={isQuestion}
              onKeyDown={handleKeyDown}
              onChange={(e) => {
                setLocalIsQuestion(e.target.checked);
                onQuestionChange?.(e.target.checked);
              }}
              disabled={isSubmitting}
            />
            Question
          </label>
        )}
        <button
          type="submit"
          className="text-xs px-3 py-1.5 rounded transition-all disabled:opacity-50"
          style={{
            backgroundColor: 'var(--color-yellow-btn-bg)',
            color: 'var(--color-yellow-btn-text)',
            border: '1px solid var(--color-yellow-btn-border)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--color-yellow-btn-hover-bg)';
            e.currentTarget.style.borderColor = 'var(--color-yellow-btn-hover-border)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--color-yellow-btn-bg)';
            e.currentTarget.style.borderColor = 'var(--color-yellow-btn-border)';
          }}
          disabled={!body.trim() || isSubmitting}
        >
          {isSubmitting ? 'Submitting...' : submitLabel}
        </button>
      </div>
    </form>
  );
}
