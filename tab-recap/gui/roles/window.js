import { InputState, v_flex } from "gpui-base";
import { props, shared } from "herdr";
import { INTERVAL, MODE, ROLES, SCENES, SHARED, STATUS, VIEWS, WRITING } from "../constants.js";
import { clearMarker, touchMarker } from "../commands.js";
import { hintOf } from "../derive.js";
import { briefOf } from "../brief-model.js";
import { Store } from "../store.js";
import { tokens } from "../theme.js";
import { SIZE } from "../metrics.js";
import { TEXT } from "../text.js";
import { markSeen } from "../seen.js";
import { brief } from "../views/brief.js";
import { session } from "../views/session.js";
import { story } from "../views/story.js";
import { timeline } from "../views/timeline.js";
import { notice } from "./notice.js";
import { briefBar, fleetBar, footer } from "./chrome.js";
import { fleetView } from "./fleet.js";
import { NeedDone } from "./need-done.js";
import { WindowActions } from "./window-actions.js";

const VIEW_FN = { brief, story, timeline, session };

export default class Window extends WindowActions {
  init(p, cx) {
    this.store = new Store();
    this.needDone = new NeedDone(this);
    this.scene = SCENES.fleet;
    this.sel = null;
    this.view = VIEWS[0];
    this.filter = new Set();
    this.tlSec = new Set();
    this.openDecs = new Set();
    this.q = "";
    this.tq = "";
    this.bin = -1;
    this.hoverBin = null;
    this.typing = false;
    this.qFocus = false;
    this.tqFocus = false;
    this.refreshUntil = 0;
    this.restarting = false;
    this.seenAt = 0;
    this.acx = cx;
    this.handle = cx.focus_handle();
    this.qState = this.field(InputState.new({ placeholder: TEXT.searchTabs }), "q", "qFocus");
    this.tqState = this.field(InputState.new({ placeholder: TEXT.searchEvents }), "tq", "tqFocus");
    this.store.start(cx, null, INTERVAL.poll).then(() => this.arrive(p, cx));
    cx.timer.after(INTERVAL.focus, () => this.handle.focus());
    cx.timer.every(INTERVAL.marker, () => { if (this.scene === SCENES.brief && this.sel) touchMarker(this.sel); });
    cx.timer.every(INTERVAL.tick, (c) => c.notify());
  }

  field(state, key, flag) {
    state.on("change", (_e, cx) => { this[key] = state.value().toLowerCase(); this.bin = -1; cx.notify(); });
    state.on("focus", (_e, cx) => { this.typing = true; this[flag] = true; cx.notify(); });
    state.on("blur", (_e, cx) => { this.typing = false; this[flag] = false; cx.notify(); });
    return state;
  }

  arrive(p, cx) {
    const first = this.order()[0]?.id ?? null;
    const tab = p?.role === ROLES.brief && p.tab ? p.tab : null;
    this.sel = tab ?? first;
    if (tab) this.open(tab, cx);
    else cx.notify();
  }

  async close() {
    this.store.stop();
    this.closePopup();
    if (this.scene === SCENES.brief && this.sel) {
      markSeen(this.sel, Date.now());
      await clearMarker(this.sel);
    }
  }

  context(t, rows, row, now) {
    const entry = this.store.docOf(this.sel);
    this.model = entry.state === "ok" ? briefOf(entry.doc, this.seenAt) : null;
    this.hint = hintOf(row);
    return {
      t, rows, tab: row, now, model: this.model, hint: this.hint, sel: this.sel, view: this.view, filter: this.filter, q: this.q, qState: this.qState, qFocus: this.qFocus,
      refreshing: this.refreshUntil > now || row.writing === WRITING, openLane: shared(SHARED.popup)?.lane ?? -1, openDecs: this.openDecs, tlSec: this.tlSec,
      need: this.needDone.bind(this.store.mode === MODE.api),
      tq: this.tq, tqState: this.tqState, tqFocus: this.tqFocus, bin: this.bin, hoverBin: this.hoverBin, position: rows.findIndex((r) => r.id === row.id) + 1, total: rows.length,
      onOpen: (tab, cx) => this.open(tab, cx), onBack: (_e, cx) => this.back(cx), onRefresh: (_e, cx) => this.refresh(cx, false), onRefreshAll: (_e, cx) => this.refresh(cx, true),
      onView: (v, cx) => { this.view = v; this.bin = -1; cx.notify(); }, onFilter: (s, cx) => { this.toggle(this.filter, s); cx.notify(); },
      onJump: (terminal) => this.jump(terminal), onLaneToggle: (i, b, cx) => this.toggleLane(i, b, cx), toggleDec: (id, cx) => { this.toggle(this.openDecs, id); cx.notify(); },
      onSec: (k, cx) => { this.toggle(this.tlSec, k); this.bin = -1; cx.notify(); }, onBin: (i, cx) => { this.bin = this.bin === i ? -1 : i; cx.notify(); },
      onHoverBin: (i, on, cx) => { this.hoverBin = on ? i : this.hoverBin === i ? null : this.hoverBin; cx.notify(); }, onClearBin: (cx) => { this.bin = -1; cx.notify(); },
    };
  }

  toggle(set, key) {
    if (!set.delete(key)) set.add(key);
  }

  body(c) {
    const entry = this.store.docOf(this.sel);
    const lines = notice(c, entry, this.store, this.restarting, (cx) => this.restart(cx));
    const view = this.model ? VIEW_FN[this.view](c) : null;
    return v_flex().id("body").flex_1().min_h(0).overflow_y_scrollbar().gap(SIZE.gapMd).px(SIZE.gutter).py(SIZE.cardPadV).children(lines).when(Boolean(view), (e) => e.child(view));
  }

  render() {
    const t = tokens();
    const now = Date.now();
    const rows = this.rows();
    const row = rows.find((r) => r.id === this.sel) ?? { id: this.sel ?? "", name: this.sel ?? "", space: "", status: STATUS.idle, writing: "", hintPercent: null, recapAt: null };
    const c = this.context(t, rows, row, now);
    const brief = this.scene === SCENES.brief;
    return v_flex().id("tab-recap").size_full().bg(t.surface).text_color(t.fg).text_size(SIZE.body).track_focus(this.handle)
      .on_key_down((e, cx) => this.onKey(e, cx)).child(brief ? briefBar(c) : fleetBar(c))
      .child(brief ? this.body(c) : fleetView(c)).child(footer(t));
  }
}
