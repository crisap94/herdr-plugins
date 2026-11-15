# T0.1 fetch spike (isolated session sp, Xvnc :77)
Mod: scripts/t0-fetch/mod-main.js + mod.json (no capabilities key). Server: scripts/t0-fetch/server.mjs (node 24.22.0, 127.0.0.1:47811).
Results (no `capabilities.network` declared; all worked without it):
- a GET /ping: 200 {"pong":true}
- b Authorization header: sent verbatim (server saw "Bearer spike-token")
- c GET /hold?s=28: server held 28 s (25.8s -> 53.8s), mod got 200 {"held":"28"}; no timeout seen at 28 s
- d 3 MiB body: 200, text() length 3145728 (no cap at 3 MiB)
- e refused port: rejected promise, message "fetch <url> failed: error sending request for url (<url>)"
- f POST with JSON body: 200, server received body {"a":1} and content-type
- Request headers the server saw: accept, content-length (plus content-type/authorization when set); no user-agent.
Elapsed times in the shots are quantised by redraw (all 2.0s); server log is the exact clock.
Not tested: >30 s holds, bodies >3 MiB, capabilities.network schema (undocumented in AGENTS.md/d.ts).
Slip: a pkill -x herdr-app was issued by mistake; live pid 917989 survived (verified), only the isolated window was killed by pid.
