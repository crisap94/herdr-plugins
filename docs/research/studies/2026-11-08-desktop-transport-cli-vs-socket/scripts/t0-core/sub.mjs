import net from "node:net";
import fs from "node:fs";
const [sock, outDir, secs = "180", params = "{}", tag = "main", pauseMs = "0"] = process.argv.slice(2);
const raw = fs.createWriteStream(`${outDir}/frames${tag === "main" ? "" : "." + tag}.ndjson`);
const timed = fs.createWriteStream(`${outDir}/frames${tag === "main" ? "" : "." + tag}.timed.ndjson`);
const t0 = Date.now();
const log = (dir, line) => { raw.write(line + "\n"); timed.write(JSON.stringify({ t_ms: Date.now() - t0, dir, raw: line }) + "\n"); };
const c = net.connect(sock);
let buf = "";
const send = (o) => { const l = JSON.stringify(o); log("tx", l); c.write(l + "\n"); };
c.on("data", (d) => { buf += d; let i; while ((i = buf.indexOf("\n")) >= 0) { log("rx", buf.slice(0, i)); buf = buf.slice(i + 1); } });
c.on("connect", () => {
  send({ jsonrpc: "2.0", id: 0, method: "hello", params: { generation: 1 } });
  setTimeout(() => {
    send({ jsonrpc: "2.0", id: 1, method: "events.subscribe", params: JSON.parse(params) });
    if (+pauseMs > 0) { c.pause(); setTimeout(() => c.resume(), +pauseMs); }
  }, 300);
});
c.on("close", () => { log("rx", "#closed"); });
setTimeout(() => { c.end(); setTimeout(() => process.exit(0), 300); }, +secs * 1000);
