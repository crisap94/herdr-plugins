import { NEED_PHASE, REASON } from "../constants.js";
import { answerNeed, needOpen } from "../answer.js";
import { TEXT } from "../text.js";
import { toast } from "./notify.js";

export class NeedDone {
  constructor(window) {
    this.window = window;
    this.cur = null;
  }

  reset() {
    this.cur = null;
  }

  phase(id) {
    return this.cur?.id === id ? this.cur.phase : NEED_PHASE.idle;
  }

  error(id) {
    return this.cur?.id === id ? this.cur.error : null;
  }

  ask(id, cx) {
    if (this.cur?.phase === NEED_PHASE.pending) return;
    this.cur = { id, phase: NEED_PHASE.confirm, error: null };
    cx.notify();
  }

  cancel(cx) {
    if (this.cur?.phase === NEED_PHASE.pending) return;
    this.cur = null;
    cx.notify();
  }

  async confirm(id, text, cx) {
    const cur = this.cur;
    if (cur?.id !== id || cur.phase !== NEED_PHASE.confirm) return;
    cur.phase = NEED_PHASE.pending;
    cx.notify();
    const acx = this.window.acx;
    const res = await answerNeed(this.window.sel, id);
    if (!res.ok && res.reason === REASON.down) await this.recheck(cur, id);
    else if (!res.ok && this.cur === cur) this.cur = { id, phase: NEED_PHASE.idle, error: res.reason };
    if (res.ok) {
      toast(TEXT.markedDone, text);
      try {
        await this.window.store.reload(acx);
      } finally {
        if (this.cur === cur) this.cur = null;
      }
    }
    acx.notify();
  }

  async recheck(cur, id) {
    const store = this.window.store;
    const sel = this.window.sel;
    await store.reload(this.window.acx);
    if (this.cur !== cur) return;
    const landed = store.docs.get(sel)?.doc && !needOpen(store.docs.get(sel).doc, id);
    this.cur = landed ? null : { id, phase: NEED_PHASE.idle, error: REASON.down };
  }

  bind(api) {
    return {
      api, phase: (id) => this.phase(id), error: (id) => this.error(id),
      ask: (id, cx) => this.ask(id, cx), cancel: (cx) => this.cancel(cx), confirm: (id, text, cx) => this.confirm(id, text, cx),
    };
  }
}
