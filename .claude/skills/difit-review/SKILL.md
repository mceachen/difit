---
name: difit-review
description: A skill for reviewing a specific diff and showing the findings as comments inside difit (the diff viewer). Use it to review branch diffs, commit diffs, or GitHub PRs, then preload findings or code explanations into difit with `--comment` before launching it for the user.
metadata:
  internal: true
---

# Difit Review

## Overview

This skill launches a requested git diff in a viewer that is easy for humans to read. At the same time, the agent can attach arbitrary comments via the `--comment` option.
This comment mechanism is well suited for code review findings and code explanations.

In this local repository copy, use `pnpm run dev` instead of the installed `difit` command.

## Steps

The final command typically looks like this:

```bash
pnpm run dev <target> [compare-with] \
  --comment '{"type":"thread","filePath":"src/foobar.ts","position":{"side":"old","line":102},"body":"line 1\nline 2"}' \
  --comment '{"type":"thread","filePath":"src/example.ts","position":{"side":"new","line":{"start":36,"end":39}},"body":"Range comment for L36-L39"}'
```

The detailed procedure is as follows.

1. Identify the target diff and review its contents.

- Inspect the diff specified by the user. This may be a local git revision, a GitHub URL, a patch file, or something similar.
- Understand the diff normally, inspect surrounding code when needed, and think through the response required by the user's request, whether that is review findings, explanations, or something else.
- For PR reviews, inspect the PR locally and keep the review result limited to difit output. Do not post comments back to remote GitHub.

2. Attach the prepared comments and launch difit.

- **pnpm run dev launch options**
  - Use `pnpm run dev <target> [compare-with]` to specify the target diff.
  - Do not insert `--` after `pnpm run dev` in this repository. `pnpm run dev -- ...` breaks argument parsing here.
  - For uncommitted changes use `pnpm run dev .`, for working tree changes use `pnpm run dev working`, and for staged changes use `pnpm run dev staged`.
  - For stdin input, use a form such as `diff -u file1.txt file2.txt | pnpm run dev`.
- **Comment arguments**
  - Use `type: "thread"` for each comment.
  - Write comment bodies in the language the user is using.
  - Use `position.side: "new"` for lines that exist on the target side of the diff.
  - Use `position.side: "old"` for lines that exist only on the deleted side.
  - Use range comments for issues that span multiple lines.
  - Never copy secrets, tokens, passwords, API keys, private keys, or other credential-like material from the diff into `--comment` bodies or any command-line arguments.
- **Additional argument for files not yet added to git**
  - For uncommitted changes, if you decide files not yet added to git should also appear in the diff, add `--include-untracked`.

3. Share the difit URL. For a requested live conversation, handle events as described below; otherwise finish the response and address comments when they are returned.
   - If there were no comments to attach, explicitly say so.
   - No manual verification of the launched difit page is required.

## Live conversations and conditional approval

Use this workflow when the user or project requests live comments or adopts
the LGTM approval rule below. Ordinary
viewer requests can use the Steps flow without these flags. Enable commit
approval only when the user or project has adopted the LGTM rule below; a
read-only review of another person's PR or a stdin diff does not authorize
editing or committing. Keep replies conversational unless changes are requested,
and make authorized fixes in the checkout that owns the reviewed changes.

Check that the chosen CLI supports `--conversation` and `comment watch --help`
(and `--ship-it` for approval). For a requested live conversation, do not silently
substitute an older published version. Use an available source build or report
the missing capability; installation is a separate action. Ordinary review
requests remain usable with older versions.

Launch `pnpm run dev <target> <base> --conversation --keep-alive`.
Add `--ship-it` only for the adopted conditional approval workflow. Retain the
process handle, actual API port, and stdout. Keep the foreground process handle and watch stream available for this review. Reuse a compatible server for the same review.

For a commit proposal, prefer immutable target/base SHAs. For uncommitted work,
prepare a review snapshot with `GIT_INDEX_FILE` pointing to a nonexistent file
in a temporary directory. Keep that variable set for every snapshot command:
`git read-tree <base>`, prepare the intended patch with
`git diff --binary <base> -- <paths>` (select only intended hunks), apply it with
`git apply --cached`, add only the intended
untracked paths, then use `git write-tree` and
`git commit-tree <tree> -p <base> -m 'Review snapshot'`. Use that resulting SHA as
the target. This creates a review object without moving HEAD or the branch;
remove the temporary index afterward and leave the real index unchanged.
For a mutable live review (`.`, `working`, or `staged`), save the full reviewed
patch, base SHA, and included untracked file contents before launch. Track
subsequent requested fixes. LGTM covers that recorded scope and those fixes;
it does not approve unrelated edits merely because the target still says `.`.

- Run `node dist/cli/index.js comment watch --port <port> --once --wait 25000`
  while the review is active; resume each batch with `--after <cursor>`.
  Stdout contains JSON Lines and `conversation.cursor` checkpoints; stderr
  carries errors. Persist pending work before advancing the cursor.
- Handle each `origin: "user"` event promptly: answer questions or begin requested
  fixes while the user continues reviewing. Ignore agent-origin events to avoid
  answering yourself. Use the event's revisions, location, and code snapshot.
- Report progress with `node dist/cli/index.js comment status --port <port> < <status-json-file>`.
  The JSON contains `reviewId`, `threadId`, `messageId`, `cursor` from the user
  event and `status`: `read` when inspecting it, `thinking` while working, then
  `replying` while composing the answer. Watch acknowledges Delivered automatically.
  Include the event's `cursor` in reply JSON to finish with Replied. An edited
  comment resets progress; on 409 reconcile the latest event or snapshot instead
  of marking the old wording handled. Snapshot messages carry `progress.cursor`;
  use that for status/reply, not the snapshot's stream cursor. Reports are explicit
  agent activity, not proof of an idle agent waking or continuing to work.
  Reply when there is a question, requested change, or need for clarification.
  Mark simple acknowledgments and LGTM `noted` after considering them, without
  another message. Read only means inspected; Noted means no reply is needed.
  General messages have `scope: "review"` and no file/line; use their review ID.
  Optional `intent` is `comment`, `question`, or `change`; use it with the body
  to understand the request, not as extra authorization.
- Create reply JSON with a file-writing tool: `reviewId`, `threadId`, `inReplyTo`
  (the event's `messageId`), `cursor` (the event's cursor), `body`, and optional
  `author`. Send it through
  `node dist/cli/index.js comment reply --port <port> < <reply-json-file>`.
  Answers render live; identical retries do not duplicate them. Leave answered
  threads visible. Resolve only when the user asks: `comment resolve <threadId>
  --review <reviewId> --port <port>` preserves the history; `comment reopen`
  reverses it. A reply or Noted status does not resolve a thread.
  `comment delete` (alias `remove`) deletes threads; use only for requested removal.
- Keep one watch loop active, checking queued events between work steps. On an
  expired cursor or restart, run `node dist/cli/index.js comment snapshot --port <port>`;
  reconcile its reviews/threads and resume with `--after <snapshot.cursor>`.
  Compare restored IDs/bodies and existing replies with handled work before
  answering again. A quiet/ended stream is not approval. Stdout cannot wake an
  idle agent; do not promise continued listening after ending the turn without
  a host integration that resumes it.
- Under the adopted rule, LGTM grants conditional approval to commit the reviewed
  scope and requested fixes. The LGTM image stays visible: green means approved,
  gray means unapproved. Clicking again revokes approval without ending the review.
  Watch emits `review.approval` with `reviewId`, `selection`, and `approved`.
  These are review events, not comments: do not send comment receipts or replies.
  Match the review selection to the recorded scope and reconcile pending comments.
  After the checks and reviews below, fetch a fresh `comment snapshot` immediately
  before committing: that review's `approval.approved` must still be true.
  A prior true event is insufficient after revocation. Missing approval or a
  server restart requires new approval; revocation cannot undo an existing commit.
  This state check applies to button approval, not separate explicit chat approval.
  Address every comment and pass relevant checks. Obtain independent Codex and
  Claude reviews, for example via `coding:second-opinion`; LAND means no remaining
  blocking findings. Both reviewers must return LAND on the resulting code.
  Then commit without asking again. Missing reviewers or unresolved findings
  block the commit; report the missing prerequisite. Re-review changes after
  LAND. This rule never authorizes unrelated changes, a push, publication, or an
  unrequested landing workflow. Tab closure or an ordinary exit is not approval.
