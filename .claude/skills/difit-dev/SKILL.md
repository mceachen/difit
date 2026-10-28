---
name: difit-dev
description: Ask the user for a code review through difit after code changes in this repository, using `pnpm run dev`.
metadata:
  internal: true
---

# Difit Dev

Use only for an explicit difit/viewer request, skill invocation, or standing
instruction to request difit reviews. Ordinary review requests belong in chat.

Use `pnpm run dev` from this repository's Git root, with no extra `--` separator.
Use `node dist/cli/index.js` for the companion comment commands below.
Launch `pnpm run dev <target> [base]`. Targets: `.` (uncommitted),
`working`, `staged`, or omit for HEAD. Add `--include-untracked` when needed.

Keep one server per Git root and target; reuse its process, actual port, and URL.
Conversation and LGTM are enabled by default. Use `--keep-alive` for review rounds
and `--no-lgtm` for read-only review. A viewer request grants no edit/commit
permission; make requested, authorized fixes only in the owning checkout.

For a proposed commit, supply `--commit-message <text>` and `--why <text>`.
Read the review's saved `summary` from `comment snapshot` before committing;
honor the user's message edits within the approved scope and repository rules.
To update it, `comment summary` accepts `{reviewId,commitMessage,rationale,baseVersion}`
on stdin. Changed summaries revoke LGTM; `review.summary` events need no comment receipt.

While review is active, keep watching between work steps:

```sh
node dist/cli/index.js comment watch --port <port> --once --wait 25000 --after <cursor>
```

Omit `--after` initially. Handle user-origin events, ignore agent-origin events,
and save pending work before advancing `conversation.cursor` checkpoints.
Use `node dist/cli/index.js comment <status|reply> --port <port> < <json-file>`:
status JSON needs event `reviewId`, `threadId`, `messageId`, `cursor`, and `status`
(`read`, `thinking`, `replying`, or `noted` when no answer is needed). Reply JSON
needs `reviewId`, `threadId`, `inReplyTo` (event `messageId`), `cursor`, and `body`.
Write JSON with a file-writing tool. Replies mark Replied; neither replies nor
Noted resolve threads. Resolve/delete only on request. Intent guides responses,
not authorization. On expired cursors or 409, use `comment snapshot --port <port>`
to reconcile IDs/replies, resume from `snapshot.cursor`, and use message
`progress.cursor` for status/reply. Do not promise listening after ending the
turn without host support.

With an adopted LGTM rule, commit only the recorded scope/requested fixes after
addressing comments, passing checks, and independent Codex/Claude LAND on final code.
Require matching `approval.approved: true` in a fresh snapshot immediately before
commit; revocation/restart invalidates prior button approval. Then commit without
asking again. Separate chat approval is independent; silence/tab closure is not
approval. This rule never authorizes a push or publication.

Details: [conversation protocol](../../../docs/agent-conversations.md).
