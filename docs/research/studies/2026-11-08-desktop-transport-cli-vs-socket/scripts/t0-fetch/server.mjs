import http from "node:http";
const PORT = Number(process.env.PORT ?? 47811);
const t0 = Date.now();
const log = (m) => console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s ${m}`);
const BIG = "x".repeat(3 * 1024 * 1024);
http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  const h = Object.keys(req.headers).filter((k) => !["host", "connection"].includes(k)).map((k) => k === "authorization" ? `${k}=${req.headers[k]}` : k).join(",");
  let body = "";
  req.on("data", (d) => (body += d));
  req.on("end", async () => {
    log(`${req.method} ${u.pathname}${u.search} headers[${h}] bodyLen=${body.length}${body.length < 100 ? " body=" + body : ""}`);
    const ok = (o) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
    if (u.pathname === "/ping") return ok({ pong: true });
    if (u.pathname === "/auth") return ok({ auth: req.headers.authorization ?? null });
    if (u.pathname === "/hold") { await new Promise((r) => setTimeout(r, Number(u.searchParams.get("s")) * 1000)); log("hold answering"); return ok({ held: u.searchParams.get("s") }); }
    if (u.pathname === "/big") { res.writeHead(200, { "content-type": "text/plain" }); return res.end(BIG); }
    if (u.pathname === "/post") return ok({ method: req.method, echo: body, parsed: (() => { try { return JSON.parse(body); } catch { return null; } })() });
    res.writeHead(404); res.end("nf");
  });
}).listen(PORT, "127.0.0.1", () => log(`listening ${PORT}`));
