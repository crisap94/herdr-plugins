# herdr-core 0.1.18 -> 0.1.19 consolidated review (2026-11-08)

Paths are relative to evidence/hc-0.1.19/. Critic pass: claims re-checked against files or read-only hc commands (hc --version, server status, ls, get, events/wait/keys/label --help).

## NEW FEATURES
- Detached programs survive terminal close on Linux/macOS (tmux-like); old terminals keep old behaviour until recreated. release-notes/notes.md, cli-manual/skill-vs-stored-0.1.18ish.diff. CONFIRMED (changelog + skill diff agree). High.
- Updates and `hc server restart` keep the core's environment (best effort, 3 min expiry, no boot crossing). Same files. High.
- `hc --skill` grew by exactly these two bullets (diff re-read). High.

## FIXES
- systemd 239 (RHEL/Rocky 8) service start/restart (#135). notes.md. High (changelog only).
- Windows system PATH expansion. notes.md. High (changelog only).
- `hc attach` half-printed character garble (#144). notes.md. High (changelog only).
- 15 s start grace before "didn't start". notes.md. High.
- Fallback to serving core when hc missing from PATH, plus the revert of the core's own-hc fallback (net effect unclear). notes.md. Medium.

## BREAKING OR RISKY
- Cleanup semantic change: kill/exit/pane close/server stop no longer sweep detached processes, so ports may stay busy. skill diff. High. Relevant if tab-recap or tests spawn background servers.
- Mixed holders: live core is 0.1.19, 6 terminals sit in a draining 0.1.18 holder (`holder:null`, `holders[0].current:false`; re-run `hc server status` confirms). wire/wire.txt. High. Consumers that read `holder.current` will see null. tab-recap should not depend on `holder`.
- `seq` resets on core restart (15 vs 10682); a socket client must not assume monotonic seq across restarts. wire/subscribe-40s.txt. High.
- Behaviour changed with no schema change: pin `hello.version` in a soft conformance test. wire/rpc.discover.json. Medium.

## UNCHANGED
- hello: generation 1, 32 methods, features framed, attach, events, status, shell, resize_notifications, automatic_input. wire/hello-vs-0.1.18.json (re-read). High.
- `hc ls --json` / `hc get --json` shapes, tab-recap hc-fleet parsers (8 tests pass per impact; not re-run). wire/*.shape.json. High.
- Error codes -32601/-32602/-32000 with data.kind. wire/errors.json. Medium (not re-run).
- events.subscribe snapshot `{channel,seq,terminals}` plus 15 s heartbeat. Medium.
- Latency within noise. wire/latency.json. Medium (single run).
- `hc --help` identical to stored copy. High.

## UNKNOWN
- Per-command flag newness (--children, --output, --outlive-parent etc.): no 0.1.18 binary or per-command help. Only wait --children is dated (0.1.18 changelog).
- Framed-mode byte layout: probes got no reply, schema gives none. Do not use framed in tab-recap.
- `blocked` and `error` status values live: never observed; only done, working, idle, and null (plain shells) appeared in `hc ls`. High that those 3 exist, unknown for others.
- Real change event kinds in events.subscribe: only heartbeats seen in 40 s (idle fleet). Fact/status change notifications not captured.

## CONTRADICTIONS BETWEEN REPORTS
1. wire says rpc.discover is "identical to the 0.1.18 schema modulo version", but no 0.1.18 discover file exists in evidence/. UNSUPPORTED (only the saved 0.1.19 copy was compared).
2. cli says `hc server status` fields cannot be called new; wire says only holder fields differ. Compatible, but nobody has a 0.1.18 status file with the same keys (wire.txt has one, so wire is the better source).
3. impact says core name `<host>` in live hello vs `host` in saved evidence: that is masking, not a change. Wire's keys-only comparison is consistent.
4. impact lists `status` as plain string in `hc ls` and an object in `hc get`: correct (verified), not a contradiction, but the socket `terminal.list` shape differs from the CLI; verify before building a socket parser.
5. cli says `--lines` default 0; not re-checked.

## NOT CHECKED, MATTERS FOR SOCKET CLIENT (my checks)
- terminal.wait semantics (rpc.discover): returns when not "working" (any other word, exit, or loss); no status yet counts as working; after own send waits for that turn; message to caller ends with reason `message`; timeout returns ended:false (not an error). CONFIRMED from schema. Note CLI default timeout is 180 s.
- terminal.keys and terminal.send: "quiet rule" ~3 s since the last human typing, held keys; send refuses a blocked program unless `force`. Socket client must tolerate a delayed reply.
- Labels: terminal.label sets `key=value`, `key=` removes; tab/space ids come from `herdr.tab`, `herdr.space`, `herdr.seen`, `where` labels (verified on t3). Free-form, never interpreted.
- Status object `{app,state,msg?}` verified on t3. `status_ms` was null in socket-get shape.
- Event kinds under real change: not checked (would need a mutating action).

## HYGIENE
- tab-recap/snapshot.txt contained home path, user and host. Masked in place by this pass (`~`, `<user>`, `<host>`); re-grep clean. Impact's scratch script snap.mts is not in evidence.
