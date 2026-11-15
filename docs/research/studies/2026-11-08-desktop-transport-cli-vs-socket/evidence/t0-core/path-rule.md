# T0.2 socket path rule (herdr-core 0.1.18)

Observed (isolated core only; the live core was never contacted except a read-only `hc server status` at the start):

- Socket: `<runtime>/herdr-core/<session>.sock`; session defaults to `default`, set by `HC_SESSION` or `hc --session X`.
  - Live: `/run/user/1000/herdr-core/default.sock` (+ `default.holder.<hex>.sock` for the holder).
  - Isolated: `HC_SESSION=sp`, `XDG_RUNTIME_DIR=~/.cache/hcs/r` gave `~/.cache/hcs/r/herdr-core/sp.sock` (appeared on `hc server start`, gone after `stop`).
- `<runtime>` is `$XDG_RUNTIME_DIR`. Unset: it falls back to `/run/user/<uid>` (test: session `pp`, env cleared, socket at `/run/user/1000/herdr-core/pp.sock`).
- Override: `HC_SOCKET=<path>` (string seen in binary; error hint "set HC_SOCKET to the first path"), and a `socket` key in `~/.config/herdr-core/config.toml` ("use a shorter HC_SESSION (or socket in the config)": unix path length limit).
  - Test: server started with XDG_RUNTIME_DIR path, client run with `HC_SOCKET=<other>`: error kind `unavailable`, "the core listens at <real path>, but this shell looks at <HC_SOCKET path>". So the core records its path (core.lock in the state dir) and the client checks it. A client must use the path where the core started.
- `HC_SESSION` charset is restricted (rejects `/\:*?"<>|` etc.).
- The `hc` CLI does connect to this socket. During `HC_SESSION=sp hc wait wt --timeout 20`: /proc/<hc pid>/fd/3 is `socket:[307814819]`; `ss -xp` showed it ESTAB with peer inode 307818544, which `/proc/<pid>/net/unix` lists as the accepted end of `~/.cache/hcs/r/herdr-core/sp.sock`. No other socket FDs. fd 0 is the caller's own socket.
- Protocol: JSON-RPC 2.0, one JSON message per line (NDJSON), `hello` with `framed: true` switches to binary framed mode (needed for `terminal.attach`). `hc connect` speaks it over stdin/stdout. `hc schema` prints the OpenRPC document (methods, params, event docs).
