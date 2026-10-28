# Review conversations

For requested live comments, start
`difit <target> <base> --conversation --keep-alive`. Add `--ship-it` when the user
or project adopts the conditional approval rule below. Prefer immutable
target/base commits for approval. For mutable targets, save the reviewed patch,
base SHA, and included untracked contents, then track requested fixes so unrelated
edits cannot enter the approved scope. The server reports its actual port; do not assume
4966 if it was occupied. Keep its process handle and stdout for final comments
and the target-specific approval line. `--keep-alive` lets questions continue
across browser disconnects; `--ship-it` keeps the review open when approval changes.

The conversation channel is a separate command, so server diagnostics cannot
corrupt the JSON Lines stream:

```sh
difit comment watch --port 4966
```

Each submitted comment or reply is delivered as soon as the browser saves it,
without waiting for approval or closing the tab. Partial text still being typed
is not sent. Events include `type` (`comment.created` or `comment.updated`),
`origin` (`user` or `agent`), `cursor`, `reviewId`, `selection`, `threadId`,
`messageId`, `file`, `side`, `line` (a number or `{start,end}`), `body`, `author`,
`timestamp`, and the available `codeSnapshot`. Working-tree and stdin selections
remain mutable; the code snapshot records the excerpt the commenter saw, not a
full immutable repository snapshot.

The stream also emits `{"type":"conversation.cursor","cursor":"..."}`
checkpoints. A tool-driven agent can use bounded waits instead of a permanent
stream:

```sh
difit comment watch --port 4966 --once --wait 25000
difit comment watch --port 4966 --once --wait 25000 --after '<saved-cursor>'
```

The first call replays events from this server’s start, or fails if any have expired. Persist the last handled cursor and the
pending work before advancing it. Later calls return only newer events. An empty
wait returns a checkpoint, not approval. `--wait 0 --once` takes an immediate
snapshot. The server retains the latest 256 events in memory. An expired cursor
or server restart fails with a nonzero exit. Run
`comment snapshot --port <port>` to obtain `{reviews,cursor}`. Each review includes
its `id` (use as `reviewId`), selection, threads and message IDs. Reconcile all
outstanding work, then resume with `--after <snapshot.cursor>`. The snapshot and
cursor are captured together, so comments arriving during reconciliation are
still delivered. Never silently skip a gap using `--after latest`.

Browser storage may restore old threads into a restarted server. These arrive
as created events, preserving agent origin. Compare message IDs and bodies with
persisted handled work and existing replies before answering restored questions.

Reply by IDs from the event, using JSON on stdin to avoid shell quoting errors:

```sh
difit comment reply --port 4966 < /tmp/difit-reply.json
```

```json
{
  "reviewId": "<event.reviewId>",
  "threadId": "<event.threadId>",
  "inReplyTo": "<event.messageId>",
  "body": "The answer, or what changed and how it was verified.",
  "cursor": "<event.cursor>",
  "author": "Codex"
}
```

Use a file-writing tool to create the JSON. The reply API checks the exact review,
thread, and parent message, even after another browser tab changes revisions.
Identical retries are idempotent. Deleted threads/parents return 404; reconcile
instead of creating a new conversation at the same line. Replies render live
through the existing browser event connection. Ignore `origin: "agent"` events
when deciding whether to answer, to avoid replying to your own replies.

Read questions and change requests as they arrive. Answer questions in-thread;
start requested changes while the user continues reviewing. Ordinary review text
does not authorize commits. A read-only review of someone else’s PR or a stdin
diff does not grant write permission; perform requested fixes only in the
checkout that owns those changes. Leave answered threads visible. Resolution
preserves history and can be reopened; deletion is a separate explicit action.
This CLI transports messages; it does not invoke a
model or automatically resume an idle agent. The active agent must maintain the
wait loop, or its host must forward stream events to its session. Do not claim
to keep watching after ending a turn without such a host integration.

## General conversation and comment intent

The header's **Conversation** button opens a panel containing general and inline
threads. The general composer accepts comments or questions about the whole review.
**Send** posts immediately. New comments, replies, and message edits share one
Intent radio group: **Comment** (default) shares context without requesting a
reply, **Change request** asks for a code change and follow-up, and **Question**
asks for an explanation. The body and existing authorization determine what the
agent should do; intent is not approval to commit, push, or publish. Explicit
root-message intent takes precedence over the older thread-level question flag,
which remains a fallback for saved threads without explicit intent.

General threads and events have `scope: "review"` and omit file/line location.
Use the event's review/thread/message IDs for status and replies just as for inline
comments. Message events carry optional `intent`: `comment`, `question`, or `change`.
An intent change is a new message revision, like a body edit.

**Resolve thread** retains all messages and collapses the conversation. **Reopen**
restores it. The Conversation panel can show All, Open, or Resolved conversations.
Resolution is separate from reply status: an answer does not prove that a requested
change is resolved. Agents should resolve only when the user requests it.

```sh
difit comment resolve <threadId> --review <reviewId> --port <port>
difit comment reopen <threadId> --review <reviewId> --port <port>
```

Use `--review` from the event to avoid another tab's selected review. Without it,
these commands act on the server's current selection. The HTTP route is
`POST /api/comments/:threadId/resolution` with `{reviewId, resolved}`.
Resolution persists with comment history. It sends a browser refresh notification,
not a new user message event; inspect the snapshot for current resolution state.
`comment delete <threadId...> --port <port>` (alias `remove`) still deletes from
the current selection. Unlike older versions, `comment resolve` no longer deletes.
Delete only when the user explicitly requests removal.

## Comment progress

Each user message starts Queued → Delivered → Read. Work continues through
Thinking → Replying → Replied. Use Noted when a comment needs no response.
These are receipts and explicit agent reports, not inferred model activity.
`comment watch` automatically acknowledges received user events as Delivered.
An HTTP event fetch alone does not count as delivery. Older watch clients do not
send receipts. Read, Thinking, and Replying must be reported by the agent:

```sh
difit comment status --port <port> < /tmp/difit-status.json
```

```json
{
  "reviewId": "<event.reviewId>",
  "threadId": "<event.threadId>",
  "messageId": "<event.messageId>",
  "cursor": "<event.cursor>",
  "status": "thinking"
}
```

Send `read` when you inspect the comment, `thinking` while investigating or
implementing its request, and `replying` while composing the answer. States can
be skipped; delayed requests cannot move progress backwards. Include the same
message-event cursor in the reply JSON to finish with Replied. Older replies
without a cursor still work but do not assert that the current wording was
answered. Editing a comment resets its progress; stale status/reply cursors
return 409. Reconcile the latest event or snapshot before proceeding. From a
snapshot, use the message's `progress.cursor`, not the snapshot's stream cursor.
Deleted comments return 404. Status updates do not emit comment events.
Reply to questions, requested changes, and anything needing clarification. Simple
acknowledgments and LGTM should be marked `noted` after considering them, without
a redundant answer. Noted records that no reply is needed; Read only records
inspection. Neither status resolves the conversation.

Progress is process-local and resets on server restart, even when the browser
restores comments. Hover over a status for its last update time; an inactive
agent's last report is not proof it is still working. The HTTP status endpoint
is `POST /api/conversation/status` and accepts the same JSON as the CLI.

## LGTM and commit approval

When the user or project adopts this rule, clicking the LGTM image grants
conditional approval to commit the reviewed scope, including requested fixes.
The image stays visible: gray means unapproved, green means approved. A second
click revokes approval and returns it to gray. Hover does not change its color.
The server stays running. Approval is scoped to the displayed selection and is
restored after browser refresh; a server restart resets it to unapproved.

`comment watch` emits a `review.approval` event with `reviewId`, `selection`,
`approved`, `cursor`, and `timestamp`. It has no thread or message ID, and does
not need a comment receipt or reply. `comment snapshot` includes `approval`
on each review. After addressing comments and completing the checks below,
fetch a fresh snapshot immediately before committing and verify that the matching
review still has `approval.approved: true`. An older approval event does not
override a later revocation. Missing state or an unavailable server is not proof
of approval. Separate explicit chat approval is independent of the button state
unless the user revokes it. Revoking cannot undo a commit already made.

Match immutable targets to the saved SHA and mutable targets to the recorded
patch scope. A closed tab, quiet stream, timeout, resolved thread, answer, or
ordinary process exit is not approval.

The toggle uses `GET /api/approval?base=<base>&target=<target>` and
`POST /api/approval` with the same query and JSON `{ "approved": true }` or
`{ "approved": false }`; include `baseMode=merge-base` where applicable. Both
require `--ship-it`. GET is read-only and returns the current approval; it also
works without conversation mode. The legacy `POST /api/ship-it` approve-and-exit
endpoint remains available to old clients, but the toggle never calls it. An old
server without `/api/approval` must be rebuilt before using the toggle.

After LGTM, address every comment (answer questions or implement requested
changes), run the relevant checks, and obtain LAND from both Codex and Claude
second-opinion reviewers on the resulting code (for example via
`coding:second-opinion`; LAND means no remaining blocking findings). Then commit without asking for
approval again. Missing reviewers, outstanding comments, REVISE, or DISCARD keep
the commit blocked. Repeat review after code changes so LAND covers the final
tree. Approval does not cover unrelated additions and never authorizes a push,
publication, or invoking a landing workflow the user has not requested.

## Compatibility

Verify `difit --help` includes `--conversation` and `--ship-it`, and
`difit comment watch --help` succeeds. Older published versions lack this
protocol. Within this repository use `pnpm run dev <target> <base> --conversation
--keep-alive`; use `node dist/cli/index.js comment …` for the companion
commands after compilation. From another repository an absolute path to that
built CLI preserves the other repository as the current working directory.

The HTTP equivalents are `GET /api/conversation/events?after=<cursor>&wait=25000`
(returns `{events,cursor}`; maximum wait 25 seconds),
`GET /api/conversation/snapshot` (returns `{reviews,cursor}`), and
`POST /api/conversation/reply` (JSON body as above). All require the server's
`--conversation` flag. API responses: 400 invalid input, 409 expired/invalid
cursor, 404 unknown review/thread/parent or disabled endpoint, and 415 non-JSON
reply. The journal and review IDs last only for the server process.
