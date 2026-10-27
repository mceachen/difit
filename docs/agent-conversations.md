# Review conversations

Start an explicitly requested live review with `difit <target> <base> --conversation --keep-alive`.
Use the server's reported port rather than assuming 4966. Comments reach the watching
agent when the browser saves them; partially typed drafts are not sent.

`difit comment watch --port <port>` emits JSON Lines with comment bodies, intent,
origin, review/thread/message IDs, the code snapshot, and a resume cursor. Review-wide
threads have scope `review` and omit file/line positions. Tool-driven agents can use
`--once --wait 25000` for bounded waits, then resume with `--after <saved-cursor>`.
An empty batch is not approval. Preserve outstanding work before advancing the cursor.

If a cursor expires or the server restarts, run `difit comment snapshot --port <port>`,
reconcile all reviews and message IDs, then resume from the atomic snapshot cursor.
Do not silently skip outstanding work with `--after latest`.

Reply using `difit comment reply --port <port> < /tmp/reply.json`. The JSON contains
`reviewId`, `threadId`, `inReplyTo`, `body`, and optional `author`. Exact identities
keep replies attached to the original discussion when another tab changes revisions.
Retrying the same reply is idempotent. Imported/restored agent messages preserve their
origin so the watcher can avoid replying to itself.

`difit comment resolve <thread-id> --port <port> --review <review-id>` retains a discussion;
`comment reopen` reopens it. `comment delete` explicitly removes the thread from the
current selection. Watching does not start or wake an agent automatically.
