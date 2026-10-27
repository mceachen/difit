---
name: difit
description: Ask the user for a code review by opening the changes in difit, a local diff viewer. Explicit opt-in only — use when the user names difit, asks to open or show the diff in the viewer, or has a standing instruction to request reviews through difit after changes. Do not use it for ordinary requests to review code, diffs, commits, branches, or pull requests.
---

# Difit

## When to Use This Skill

difit opens an external browser UI and starts a long-running local server, so launching it must be explicit opt-in:

- Use this skill only when the user explicitly names difit, asks to open or show the diff in a viewer, or has a standing instruction (for example in project docs or agent configuration) to request reviews through difit after code changes.
- Do NOT use it for ordinary review requests such as "review these changes", "use the reviewer agent", "find problems in this diff", or "review this PR/commit/branch". Answer those through your normal response channel.
- When a request is ambiguous, prefer the non-difit path.

## Overview

This skill requests a code review from the user using difit.
Use `npx --yes @photostructure/difit` wherever this skill says
`<difit-command>`, or a local `difit` launcher explicitly installed from this
scoped package. Verify `--version` when starting a session and use the same
version for the server and all comment commands. Do not substitute unscoped
`difit` from npm.

Conversation and the LGTM toggle are enabled by default. Use `--no-lgtm` for
read-only reviews. Showing the toggle alone does not authorize a commit; follow
the user's review and commit approval rules.

For a requested live conversation or an adopted LGTM approval workflow, use the section below. Otherwise use the ordinary Commands flow and address review comments returned when the server exits.
If the server is shut down without comments, treat it as "no review comments were provided." Restarting it is unnecessary.
Manual verification of whether the page launched correctly is also unnecessary.

## Commands

- Review uncommitted changes before commit: `<difit-command> .`
- Review the HEAD commit: `<difit-command>`
- Review staging area changes: `<difit-command> staged`
- Review unstaged changes only: `<difit-command> working`

Basic Usage:

```bash
<difit-command> <target>                    # View single commit diff. ex: difit 6f4a9b7
<difit-command> <target> [compare-with]     # Compare two commits/branches. ex: difit feature main
```

## Optional Startup Comments

If there is something you want to tell the user when difit opens, attach it as startup comments with `--comment`.
This is useful for review findings, explanations, and any context the user should see directly on the diff.

```bash
<difit-command> <target> [compare-with] \
  --comment '{"type":"thread","filePath":"src/foobar.ts","position":{"side":"old","line":102},"body":"line 1\nline 2"}' \
  --comment '{"type":"thread","filePath":"src/example.ts","position":{"side":"new","line":{"start":36,"end":39}},"body":"Range comment for L36-L39"}'
```

- Use `type: "thread"` for each comment.
- Write comment bodies in the language the user is using.
- Use `position.side: "new"` for lines that exist on the target side of the diff.
- Use `position.side: "old"` for lines that exist only on the deleted side.
- Use range comments for issues that span multiple lines.
- Never copy secrets, tokens, passwords, API keys, private keys, or other credential-like material from the diff into `--comment` bodies or any command-line arguments.

## Including Untracked Files

For uncommitted changes, if files not yet added to git should also appear in the diff, add `--include-untracked`.

```bash
<difit-command> . --include-untracked
```

## Reusing a Running Server

Keep at most one live difit server per Git root and review target. When you edit again after starting a review, reuse the running server instead of launching another one — repeated launches create duplicate ports and browser tabs.

- Before starting difit, check whether a difit server you started earlier is still running for the same Git root (for example, the background process you launched is still alive).
- If one is running for the same target, do not start another and do not reopen its URL. For working-tree targets (`.`, `working`, `staged`, and the HEAD default) difit watches the repository, and the open page prompts the user to reload when the diff changes.
- If review rounds are expected to repeat, start the server with `--keep-alive` (the server survives browser disconnects) or `--background` (a detached keep-alive server; prints JSON like `{"port":4966,"url":"http://localhost:4966","pid":123}` and does not auto-open a browser, so share the URL with the user once).
- While the server stays alive, exchange feedback without restarting it:
  - `<difit-command> comment get --port <port>` — read the user's review comments (`--format json` for structured output).
  - `<difit-command> comment add --port <port> '<json>'` — add new comments to the running server (same JSON shape as `--comment`).
  - `<difit-command> comment delete <threadId...> --port <port>` — delete threads only when the user requests removal; leave answered conversation threads visible.
- If the review target changes (for example, a different commit range), stop the existing server and start a new one rather than leaving two servers for the same repository.

## Constraints

Can only be used inside a Git-managed directory.

## Live conversations and conditional approval

Use this workflow when the user or project requests live comments or adopts
the LGTM approval rule below. Ordinary
viewer requests can use the Commands flow without these flags. Enable commit
approval only when the user or project has adopted the LGTM rule below; a
read-only review of another person's PR or a stdin diff does not authorize
editing or committing. Keep replies conversational unless changes are requested,
and make authorized fixes in the checkout that owns the reviewed changes.

Check that the chosen CLI supports `--conversation` and `comment watch --help`
(and `--ship-it` for approval). For a requested live conversation, do not silently
substitute an older published version. Use an available source build or report
the missing capability; installation is a separate action. Ordinary review
requests remain usable with older versions.

Launch `<difit-command> <target> <base> --conversation --keep-alive`.
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

- Run `<difit-command> comment watch --port <port> --once --wait 25000`
  while the review is active; resume each batch with `--after <cursor>`.
  Stdout contains JSON Lines and `conversation.cursor` checkpoints; stderr
  carries errors. Persist pending work before advancing the cursor.
- Handle each `origin: "user"` event promptly: answer questions or begin requested
  fixes while the user continues reviewing. Ignore agent-origin events to avoid
  answering yourself. Use the event's revisions, location, and code snapshot.
- Report progress with `<difit-command> comment status --port <port> < <status-json-file>`.
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
  `<difit-command> comment reply --port <port> < <reply-json-file>`.
  Answers render live; identical retries do not duplicate them. Leave answered
  threads visible. Resolve only when the user asks:
  `comment resolve <threadId> --review <reviewId> --port <port>` preserves
  the history; `comment reopen`
  reverses it. A reply or Noted status does not resolve a thread.
  `comment delete` (alias `remove`) deletes threads; use only for requested removal.
- Keep one watch loop active, checking queued events between work steps. On an
  expired cursor or restart, run `<difit-command> comment snapshot --port <port>`;
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
