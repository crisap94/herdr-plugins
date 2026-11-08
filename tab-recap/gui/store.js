import { readTextFile, watchFolder } from "herdr";
import { DOC_VERSIONS, NEWER, PATHS } from "./constants.js";
import { ensureDaemon, resolve, safe } from "./commands.js";
import { parseIndex } from "./index.js";

const MISSING = { state: "missing", doc: null };
const UNREADABLE = { state: "unreadable", doc: null };

export class Store {
  constructor() {
    this.rows = [];
    this.indexState = "loading";
    this.docs = new Map();
    this.daemon = null;
    this.dir = null;
    this.watching = false;
    this.tracked = null;
    this.onChange = null;
  }

  async start(cx, onChange, poll, ensure = true) {
    this.onChange = onChange;
    this.dir = (await resolve()).dir;
    await this.reload(cx);
    this.watch(cx);
    if (poll) cx.timer.every(poll, (c) => { this.watch(c); this.reload(c); });
    if (!ensure) return;
    this.daemon = (await ensureDaemon()) ? "running" : "down";
    cx.notify();
  }

  watch(cx) {
    if (this.watching || !this.dir) return;
    this.watching = true;
    cx.spawn(async (c) => {
      try {
        for (;;) {
          await watchFolder(this.dir);
          await this.reload(c);
        }
      } catch {
        this.watching = false;
      }
    });
  }

  async reload(cx) {
    await this.loadIndex();
    if (this.tracked) this.docs.set(this.tracked, await this.loadDoc(this.tracked));
    if (this.onChange) this.onChange(cx);
    cx.notify();
  }

  async loadIndex() {
    try {
      const text = await readTextFile(`${this.dir}/${PATHS.index}`);
      this.rows = text ? parseIndex(text) : [];
      this.indexState = text ? "ready" : "missing";
    } catch {
      this.indexState = "unreadable";
    }
  }

  async track(tab, cx) {
    this.tracked = tab;
    if (!tab) return;
    this.docs.set(tab, await this.loadDoc(tab));
    cx.notify();
  }

  async loadDoc(tab) {
    if (!safe(tab) || !this.dir) return MISSING;
    try {
      const text = await readTextFile(`${this.dir}/${encodeURIComponent(tab)}${PATHS.extension}`);
      if (!text) return MISSING;
      const doc = JSON.parse(text);
      if (DOC_VERSIONS.includes(doc?.version)) return { state: "ok", doc };
      return { state: doc?.version > Math.max(...DOC_VERSIONS) ? NEWER : "unreadable", doc: null };
    } catch {
      return UNREADABLE;
    }
  }

  docOf(tab) {
    return this.docs.get(tab) ?? MISSING;
  }
}
