# Chat storage and Chrome memory usage

Chat transcripts use the `tampersloth-chats-v2` IndexedDB database. Each chat has
one transcript record and one small summary record, committed in a single
transaction. History and code-file grouping read summaries; selecting a chat
reads just its transcript. Saving a chat does not read other chats or broadcast
their contents through `chrome.storage.onChanged`.

Attachment bytes live in a separate `attachments` store (database version 2),
written once when the message is sent and keyed by an id the transcript keeps;
autosave never rewrites them. Thumbnails mint fresh object URLs from that store
on each panel load, because `blob:` URLs die with the document. Deleting a chat
deletes its attachments in the same transaction. Chats saved before this change
have no stored bytes, so their images show a placeholder. When building model
input, the newest message sends all its attachments and earlier ones share a
budget of `MAX_HISTORY_ATTACHMENTS` (newest first); the rest are named in a note.

Picked-element screenshots use the same store (`pickedElementShots` holds their
ids by index). They are display-only: the model receives the element's HTML
summary, never the screenshot. A missing screenshot falls back to the tag pill.

The previous implementation stored all conversations in the `ts_conversations`
Chrome storage key. Autosave repeatedly read and rewrote the whole archive.
Chrome delivers both old and new values to storage listeners, so large archives
required multiple large allocations across the browser and extension processes.
Local crash reports showed out-of-memory exceptions during storage change
dispatch from the development extension, with failed allocations of roughly
216–314 MiB.

The old key is preserved. Archives up to 2 MiB remain readable and their summaries
appear alongside new chats. A newly saved IndexedDB record takes precedence over
an older record with the same ID. Larger legacy archives are not automatically
read, rewritten, or deleted: history shows a notice that they have been preserved.
They require a separate recovery/export workflow before their conversations can
be opened safely. Do not clear extension storage or uninstall the extension to
resolve this issue, because doing so removes the preserved history.

File listings use `chrome.storage.local.getKeys()` and read no file or chat
contents. Persistent-store namespace listings request only the matching keys.
Autosaves serialize database writes and retain only the latest queued snapshot
for each chat if disk writes fall behind the stream. Save errors appear in the
chat panel.

Open chats are held in a module-level store in `useAgent.ts`, not in the chat
page, so a run keeps streaming and saving while the user starts a new chat,
opens another from history, or visits the gallery or settings. Several chats can
run at once; each has its own abort controller and pending `askUser` question.
Only one chat at a time uses a tab (`lib/tabLease.ts`): a chat claims it on its
first page tool call (reads included) and holds it until its run ends; others
keep working with tab-free tools and queue in order for the page, showing a
notice that can stop the holding chat.
A chat that is off screen, idle and fully written is dropped from memory and
reloaded from IndexedDB when reopened. Unsent composer drafts (text, picked
elements, files) are kept per chat in `lib/drafts.ts`, and "New chat" reuses the
one blank chat so its draft is found again; picked-element marks on the page are
grouped by chat and only the open chat's are drawn. Everything lasts as long as
the side panel document: closing the panel ends its runs and drops its drafts.

`tests/conversation-storage.test.mjs` exercises actual IndexedDB semantics using
`fake-indexeddb`, including concurrent saves, reopening storage, atomic failure,
safe legacy reads, metadata-only history, and coalesced writes. The Chrome storage
mock refuses oversized legacy reads and whole-storage reads.
