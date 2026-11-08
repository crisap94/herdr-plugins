import net from "node:net";
const [sock, method, params] = process.argv.slice(2);
const c = net.connect(sock); let b = "";
c.on("connect", () => c.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: JSON.parse(params) }) + "\n"));
c.on("data", (d) => { b += d; if (b.includes("\n")) { console.log(b.trim()); c.end(); } });
