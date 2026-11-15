import { readTextFile, watchFolder } from "herdr";
import { DOC_VERSIONS, HTTP, MODE, NEWER, PATHS, ROUTE, TOPIC } from "./constants.js";
import { api, tabRoute } from "./api.js";
import { ensureDaemon, resolve, safe } from "./commands.js";
import { Feed } from "./feed.js";
import { parseIndex } from "./index.js";

const MISSING = { state: "missing", doc: null };
const UNREADABLE = { state: "unreadable", doc: null };

function docEntry(text) {
  try {
    const doc = JSON.parse(text);
    if (DOC_VERSIONS.includes(doc?.version)) return { state: "ok", doc };
    return { state: doc?.version > Math.max(...DOC_VERSIONS) ? NEWER : "unreadable", doc: null };
  } catch {
    return UNREADABLE;
  }
}

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
    this.mode = MODE.files;
    this.filesOn = false;
    this.running = false;
    this.seenApi = false;
    this.stamp = 0;
    this.stamped = new Map();
    this.indexStamped = 0;
    this.feed = new Feed({
      isApi: () => this.mode === MODE.api,
      up: (c) => this.enterApi(c),
      down: (c) => this.enterFiles(c),
      reset: (c) => this.reload(c),
      events: (list, c) => this.apply(list, c),
    });
  }

  async start(cx, onChange, poll, ensure = true) {
    this.onChange = onChange;
    this.running = true;
    this.dir = (await resolve()).dir;
    const up = await this.feed.attach();
    if (!this.running) return;
    if (up) await this.enterApi(cx);
    else await this.enterFiles(cx);
    if (!this.running) return;
    if (poll) cx.timer.every(poll, (c) => this.tick(c));
    this.feed.start(cx);
    if (!ensure) return;
    const ensured = await ensureDaemon();
    if (!this.running) return;
    if (this.mode !== MODE.api) this.daemon = ensured ? "running" : "down";
    cx.notify();
  }

  async passive(cx, poll) {
    this.running = true;
    this.dir = (await resolve()).dir;
    if (!this.running) return;
    await this.reload(cx);
    if (!this.running) return;
    cx.timer.every(poll, (c) => this.tick(c));
  }

  stop() {
    this.running = false;
    this.filesOn = false;
    this.feed.stop();
  }

  tick(cx) {
    if (!this.running || this.mode !== MODE.files) return;
    this.watch(cx);
    this.reload(cx);
  }

  async enterApi(cx) {
    this.mode = MODE.api;
    this.seenApi = true;
    this.daemon = "running";
    this.filesOn = false;
    await this.reload(cx);
  }

  async enterFiles(cx) {
    this.mode = MODE.files;
    if (this.seenApi) this.daemon = "down";
    this.filesOn = this.running;
    await this.reload(cx);
    this.watch(cx);
  }

  watch(cx) {
    if (this.watching || !this.dir || !this.filesOn) return;
    this.watching = true;
    cx.spawn(async (c) => {
      try {
        while (this.filesOn) {
          await watchFolder(this.dir);
          if (this.filesOn) await this.reload(c);
        }
      } catch {
        this.watching = false;
      }
      this.watching = false;
    });
  }

  async apply(events, cx) {
    if (events.some((e) => e.topic === TOPIC.index)) await this.loadIndex();
    if (this.tracked && events.some((e) => e.topic === TOPIC.tab && e.tab === this.tracked)) await this.refreshDoc(this.tracked);
    if (this.onChange) this.onChange(cx);
    cx.notify();
  }

  async reload(cx) {
    await this.loadIndex();
    if (this.tracked) await this.refreshDoc(this.tracked);
    if (this.onChange) this.onChange(cx);
    cx.notify();
  }

  async loadIndex() {
    this.stamp += 1;
    const mine = this.stamp;
    const got = (this.mode === MODE.api && (await this.indexFromApi())) || (await this.indexFromFiles());
    if (mine <= this.indexStamped) return;
    this.indexStamped = mine;
    if (got.rows) this.rows = got.rows;
    this.indexState = got.state;
  }

  async indexFromApi() {
    const res = await api.get(ROUTE.index);
    if (!res?.ok) return null;
    try {
      return { rows: parseIndex(res.text), state: "ready" };
    } catch {
      return null;
    }
  }

  async indexFromFiles() {
    try {
      const text = await readTextFile(`${this.dir}/${PATHS.index}`);
      return { rows: text ? parseIndex(text) : [], state: text ? "ready" : "missing" };
    } catch {
      return { rows: null, state: "unreadable" };
    }
  }

  async track(tab, cx) {
    this.tracked = tab;
    if (!tab) return;
    await this.refreshDoc(tab);
    cx.notify();
  }

  async refreshDoc(tab) {
    this.stamp += 1;
    const mine = this.stamp;
    const entry = await this.loadDoc(tab);
    if (mine <= (this.stamped.get(tab) ?? 0)) return;
    this.stamped.set(tab, mine);
    this.docs.set(tab, entry);
  }

  async loadDoc(tab) {
    if (!safe(tab) || !this.dir) return MISSING;
    if (this.mode === MODE.api) {
      const got = await this.docFromApi(tab);
      if (got) return got;
    }
    return this.docFromFiles(tab);
  }

  async docFromApi(tab) {
    const res = await api.get(tabRoute(tab));
    if (!res) return null;
    if (res.status === HTTP.notFound) return MISSING;
    return res.ok ? docEntry(res.text) : null;
  }

  async docFromFiles(tab) {
    try {
      const text = await readTextFile(`${this.dir}/${encodeURIComponent(tab)}${PATHS.extension}`);
      return text ? docEntry(text) : MISSING;
    } catch {
      return UNREADABLE;
    }
  }

  docOf(tab) {
    return this.docs.get(tab) ?? MISSING;
  }
}
