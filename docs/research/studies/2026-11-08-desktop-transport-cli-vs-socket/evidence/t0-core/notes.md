# T0.3 notes: events.subscribe over node:net (isolated core sp, 0.1.18)

Scripts: scripts/t0-core/{sub,rpc}.mjs (client), scenario.sh (terminal program), drive.sh / drive2.sh / drive3.sh (rounds 1-3), attach.py (pty attach with resizes).
Frames: frames.ndjson = round 1 verbatim lines (tx and rx; tx lines are our requests); *.timed.ndjson wrap each line with t_ms/dir. Masked: home -> ~, user -> user, machine -> host.

Handshake: `{"jsonrpc":"2.0","id":0,"method":"hello","params":{"generation":1}}` -> result {core:{id,name}, features:["framed","attach","events","status","shell","resize_notifications","automatic_input"], framed:false, generation:1, methods:[32 names], version:"0.1.18"}. Full line in frames.ndjson line 2. hello is not required before events.subscribe (the schema marks all params optional); we sent it first.

Subscribe: `{"jsonrpc":"2.0","id":1,"method":"events.subscribe","params":{}}` -> result `{channel:null, seq:N, terminals:[Terminal...]}` (snapshot, includes finished/live existing terminals; terminal objects carry the 27 keys address, argv, cols, created_ms, cwd, die_with_parent, exit_code, finished_ms, foreground (live only), identity, keep, labels, name, notify, parent, pid, reason, reported, rm, rows, screen, signal, state, status, status_ms, template, title, turn). Then notifications.

Filters (params): `labels` {k:v} (all must match), `terminal` (address or name), `children_of` (address or name). The terminal/parent MUST exist at subscribe time, else error `-32000 data.kind=not_found message='no terminal "t03b"'` and no stream (frames.r2terminal, r2children). With existing terminals (r3*): snapshot lists only matching terminals (names resolve to addresses); labels filter delivers events for matches only (no doc events); terminal filter delivered labels, finished, removed for that terminal; children_of delivered created (child started after subscribe), foreground, labels, finished, removed for children. Heartbeats still arrive on filtered streams.

Envelope: `{"jsonrpc":"2.0","method":"event","params":{"seq":N,"terminal":"t1v","type":K,"data":{...}}}`. `seq` is global and monotonic (not per subscription). `doc` events have no `terminal`.
Data per type (seen):
- created: full Terminal object (no `foreground` key), labels {} at creation.
- foreground: {argv,cwd,name,pid} (fires on process change: shell -> script, exec sleep, keep shell).
- labels: {labels:{...}} full map after change (not a diff).
- title: {title}. OSC 0 produces it; also after restart the shell sets its own.
- status: {records:{}, reported:true, status:{app,state}|null}. OSC 7501 `app=fakeagent:state=working` -> working. State sequence working, blocked, idle, done, working, idle all produced status events. status:null after the agent process left.
- turn: {state, turn} emitted at some transitions only (here at blocked -> turn 1, idle -> turn 2), not for every status event.
- keep: {keep:bool}.
- lost: {exit_code:null, finished_ms:null, reason:"signaled", signal:9} (kill -9 of the foreground process of a kept terminal).
- restarted: seq 102 is `lost`, seq 103 is `restarted`: the line after `lost` is `type:"restarted"` carrying a full Terminal object (keep:true, argv ["/usr/bin/bash"], new pid, state live); then title and foreground events for the replacement shell.
- finished: {exit_code, finished_ms, reason:"exited", signal:null}.
- removed: {}.
- size: {cols,rows} (from a pty `hc attach` resized 30x100, 40x120, 25x80; frames.r2all.ndjson).
- doc: {name, version} (version only, no value; from doc.set RPC; value null delete also bumps version). Only on unfiltered streams.
Heartbeat: `{"jsonrpc":"2.0","method":"heartbeat","params":{"seq":N}}` every 15 s (seq = last event seq).
Missed: `{"jsonrpc":"2.0","method":"missed","params":{"seq":2797,"terminals":[...fresh snapshot...]}}` provoked in round 3 (frames.r3paused.ndjson line 671): subscriber paused (socket.pause) for 30 s while 2500 label updates ran; it received ~664 events, then `missed` with fresh snapshot, then heartbeats resumed. Round 2 flood of 150 events with 6 KB labels did NOT give missed: the connection was closed by the core (`#closed`) once the socket buffer overflowed; so a slow reader can see either missed or EOF.
Other: hc/our events arrive within ms of the cause. Terminal events keep arriving for terminals other users of the same core own (snapshot also lists pre-existing synthetic sp terminals t2...).

Not provoked: none of the 12 requested kinds. Extra kinds seen: foreground, lost, keep.
Unknowns: whether `seq` gaps exist when the core lags without `missed`; the queue size at which missed triggers (between ~660 and 2500 events); `channel` is always null for events.subscribe; turn trigger rule; created event for children carries parent address ("t1w") not name.
