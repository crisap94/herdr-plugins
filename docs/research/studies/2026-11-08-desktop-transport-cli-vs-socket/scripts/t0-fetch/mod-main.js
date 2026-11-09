import { View, div } from "gpui-kit";

const BASE = "http://127.0.0.1:47811";
const CASES = [
  ["a ping", () => fetch(BASE + "/ping"), async (r) => r.status + " " + (await r.text())],
  ["b auth", () => fetch(BASE + "/auth", { headers: { Authorization: "Bearer spike-token" } }), async (r) => r.status + " " + (await r.text())],
  ["c hold28", () => fetch(BASE + "/hold?s=28"), async (r) => r.status + " " + (await r.text())],
  ["d big3MiB", () => fetch(BASE + "/big"), async (r) => r.status + " len=" + (await r.text()).length],
  ["e refused", () => fetch("http://127.0.0.1:47899/ping"), async (r) => r.status + " " + (await r.text())],
  ["f post", () => fetch(BASE + "/post", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ a: 1 }) }), async (r) => r.status + " " + (await r.text())],
];

export default class FetchSpike extends View {
  init(_p, cx) {
    this.lines = CASES.map(([n]) => n + ": pending");
    this.t0 = Date.now();
    CASES.forEach(([name, go, show], i) => {
      const start = Date.now();
      const set = (s) => { this.lines[i] = name + ": " + s + " (" + ((Date.now() - start) / 1000).toFixed(1) + "s)"; cx.notify(); };
      let p;
      try { p = go(); } catch (e) { set("THROW " + String(e)); return; }
      p.then((r) => show(r)).then((s) => set("OK " + s), (e) => set("ERR " + String(e && e.message ? e.message : e)));
    });
  }

  render() {
    const root = div().p(16).gap(6).flex().flex_col().text_size(13);
    this.lines.forEach((l) => root.child(div().child(l)));
    return root;
  }
}
