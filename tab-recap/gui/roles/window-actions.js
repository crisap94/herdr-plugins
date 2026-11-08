import { closeOverlay, openOverlay, props, setShared, shared } from "herdr";
import { ACTION, INTERVAL, MOD, REFRESH_ALL_MAX, ROLES, SCENES, SHARED, STATUS, VIEWS } from "../constants.js";
import { clearMarker, jumpToLane, refreshAll, refreshTab, restartDaemon, safe, touchMarker } from "../commands.js";
import { visible } from "../derive.js";
import { keyAction } from "../keys.js";
import { tabRows } from "../model.js";
import { lastSeen, markSeen } from "../seen.js";
import { SIZE } from "../metrics.js";

export class WindowActions {
  rows() {
    return tabRows(this.store.rows);
  }

  order() {
    return visible(this.rows(), new Set(), "");
  }

  open(tab, cx) {
    const left = this.leave();
    this.sel = tab;
    this.scene = SCENES.brief;
    this.view = VIEWS[0];
    this.seenAt = lastSeen(tab, Date.now());
    this.bin = -1;
    this.openDecs.clear();
    this.store.track(tab, cx);
    left.then(() => touchMarker(tab));
    cx.notify();
  }

  leave() {
    this.closePopup();
    if (this.scene !== SCENES.brief || !this.sel) return Promise.resolve();
    markSeen(this.sel, Date.now());
    this.store.tracked = null;
    return clearMarker(this.sel);
  }

  back(cx) {
    this.leave();
    this.scene = SCENES.fleet;
    cx.notify();
  }

  escape(cx) {
    if (this.scene === SCENES.brief) this.back(cx);
    else if (props()?.overlay) closeOverlay(props().overlay);
  }

  move(d, cx) {
    const list = this.order();
    const next = list[list.findIndex((r) => r.id === this.sel) + d];
    if (!next) return;
    if (this.scene === SCENES.brief) this.open(next.id, cx);
    else { this.sel = next.id; cx.notify(); }
  }

  refresh(cx, all) {
    this.refreshUntil = Date.now() + INTERVAL.refreshMax;
    const tabs = all ? this.rows().filter((r) => r.status !== STATUS.idle).map((r) => r.id).filter(safe).slice(0, REFRESH_ALL_MAX) : [this.sel];
    refreshAll(tabs).then(() => this.acx.notify());
    cx.timer.after(INTERVAL.refreshMax, (c) => c.notify());
    cx.notify();
  }

  restart(cx) {
    this.restarting = true;
    cx.notify();
    restartDaemon().then((ok) => { this.restarting = false; this.store.daemon = ok ? "running" : "down"; this.store.reload(this.acx); });
  }

  closePopup() {
    if (!this.popupId) return;
    try { closeOverlay(this.popupId); } catch { this.popupId = null; }
    this.popupId = null;
    setShared(SHARED.popup, null);
  }

  toggleLane(i, bounds, cx) {
    const wasOpen = shared(SHARED.popup)?.lane === i;
    this.closePopup();
    const lane = this.model?.lanes[i];
    if (wasOpen || !lane) { cx.notify(); return; }
    const at = bounds ? { x: bounds.x, y: bounds.y + bounds.height + SIZE.popGap } : "pointer";
    const pct = lane.contextPercent;
    this.popupId = openOverlay({ mod: MOD, kind: "popup", at, width: SIZE.popW, height: SIZE.popHeight,
      props: { role: ROLES.compact, name: lane.name, pct, window: lane.window, hint: this.hint } });
    setShared(SHARED.popup, { lane: i });
  }

  onKey(e, cx) {
    const hit = keyAction(e, this.typing);
    if (!hit) { if (this.typing && e.key === "escape") { this.typing = false; this.handle.focus(); cx.stop_propagation(); cx.notify(); } return; }
    const brief = this.scene === SCENES.brief;
    if (hit.action === ACTION.down) this.move(1, cx);
    else if (hit.action === ACTION.up) this.move(-1, cx);
    else if (hit.action === ACTION.open && !brief && this.sel) this.open(this.sel, cx);
    else if (hit.action === ACTION.search) (brief ? this.tqState : this.qState).focus();
    else if (hit.action === ACTION.view && this.sel) { if (!brief) this.open(this.sel, cx); this.view = VIEWS[hit.arg]; this.bin = -1; cx.notify(); }
    else if (hit.action === ACTION.compact && brief) this.compactKey(cx);
    else if (hit.action === ACTION.refresh) this.refresh(cx, !brief);
    else if (hit.action === ACTION.back) this.escape(cx);
  }

  compactKey(cx) {
    const lanes = this.model?.lanes ?? [];
    const hinted = lanes.findIndex((l) => l.contextPercent !== null && l.contextPercent >= this.hint);
    this.view = VIEWS[0];
    if (lanes.length) this.toggleLane(hinted < 0 ? 0 : hinted, null, cx);
  }

  jump(terminal) {
    jumpToLane(this.sel, terminal);
  }
}
