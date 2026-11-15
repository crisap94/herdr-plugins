import { GUIDE, INTERVAL } from "../constants.js";
import { compactMessage, handoffMessage } from "../messages.js";

const viewOf = (res) => (res.ok ? { kind: GUIDE.ready, text: res.text, limit: res.limit, model: res.model } : { kind: GUIDE.error, reason: res.reason });

export class Guidance {
  constructor(note) {
    this.note = note;
    this.cx = null;
    this.tab = null;
    this.pane = null;
    this.others = [];
    this.to = null;
    this.view = { kind: GUIDE.loading };
    this.want = 0;
    this.busy = false;
    this.shut = false;
    this.asked = null;
    this.tick = 0;
    this.copied = null;
    this.stamp = 0;
    this.fallback = null;
    this.handoff = { busy: false, reason: null, detail: null };
    this.handoffs = 0;
  }

  open(p, cx) {
    this.cx = cx;
    this.tab = p?.tab ?? null;
    this.pane = p?.terminal ?? null;
    this.others = (p?.lanes ?? []).filter((l) => l.terminal !== this.pane);
    this.to = this.others[0]?.terminal ?? null;
    if (this.tab && this.pane) this.load();
  }

  close() {
    this.shut = true;
  }

  edit() {
    this.tick += 1;
    const mine = this.tick;
    this.cx.timer.after(INTERVAL.debounce, () => { if (mine === this.tick && !this.shut) this.load(); });
  }

  flush() {
    this.tick += 1;
    if (this.tab && this.pane) this.load();
  }

  async load() {
    const note = this.note.value();
    if (this.asked === note && this.view.kind !== GUIDE.error) return;
    this.asked = note;
    this.want += 1;
    this.view = { kind: GUIDE.loading };
    this.fallback = null;
    this.cx.notify();
    if (this.busy) return;
    this.busy = true;
    try {
      await this.settle();
    } finally {
      this.busy = false;
    }
  }

  async settle() {
    while (!this.shut) {
      const mine = this.want;
      const res = await compactMessage(this.tab, this.pane, this.asked);
      if (this.shut || mine !== this.want) continue;
      this.view = viewOf(res);
      this.cx.notify();
      return;
    }
  }

  pick(terminal, cx) {
    this.to = terminal;
    this.handoffs += 1;
    this.handoff = { busy: false, reason: null, detail: null };
    cx.notify();
  }

  copyCompact() {
    if (this.view.kind === GUIDE.ready) this.write(GUIDE.compact, this.view.text);
  }

  async copyHandoff() {
    if (!this.to || this.handoff.busy) return;
    this.handoffs += 1;
    const mine = this.handoffs;
    this.handoff = { busy: true, reason: null, detail: null };
    this.cx.notify();
    const res = await handoffMessage(this.tab, this.pane, this.to);
    if (this.shut || mine !== this.handoffs) return;
    this.handoff = { busy: false, reason: res.ok ? null : res.reason, detail: res.detail ?? null };
    if (res.ok) this.write(GUIDE.handoff, res.text);
    else this.cx.notify();
  }

  write(kind, text) {
    this.stamp += 1;
    const mine = this.stamp;
    try {
      this.cx.write_to_clipboard(text);
      this.copied = kind;
      this.fallback = null;
      this.cx.timer.after(INTERVAL.copied, (c) => { if (mine === this.stamp && !this.shut) { this.copied = null; c.notify(); } });
    } catch {
      this.copied = null;
      this.fallback = text;
    }
    this.cx.notify();
  }
}
