import { InputState } from "gpui-base";
import { closeOverlay, openOverlay, props, setShared, shared } from "herdr";
import { ACTION, CONTROL, INTERVAL, MOD, REFRESH_ALL_MAX, ROLES, SCENES, SETTINGS_STATE, SHARED, STATUS, VIEWS } from "../constants.js";
import { clearMarker, jumpToLane, refreshAll, refreshTab, restartDaemon, safe, touchMarker } from "../commands.js";
import { visible } from "../derive.js";
import { keyAction, keyName } from "../keys.js";
import { systemLang } from "../env.js";
import { currentLang, setLang } from "../lang.js";
import { resolveLanguage } from "../language.js";
import { readSettings, saveSettings } from "../settings.js";
import { controlOf, KNOWN_IDS } from "../settings-model.js";
import { TEXT } from "../text.js";
import { tabRows } from "../model.js";
import { lastSeen, markSeen } from "../seen.js";
import { SIZE } from "../metrics.js";

export class WindowActions {
  rows() {
    return tabRows(this.store.rows, (tab) => { const entry = this.store.docOf(tab); return entry.state === "ok" ? entry.doc.tasks : null; });
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
    this.needDone.reset();
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
      props: { role: ROLES.compact, name: lane.name, pct, window: lane.window, hint: this.hint, tab: this.sel, terminal: lane.terminal,
        lanes: this.model.lanes.map((l) => ({ terminal: l.terminal, name: l.name, status: l.status })) } });
    setShared(SHARED.popup, { lane: i });
  }

  openSettings(cx) {
    this.leave();
    this.scene = SCENES.settings;
    this.ensureFields();
    cx.notify();
    this.loadSettings(cx);
  }

  async loadSettings(cx) {
    this.settings.state = SETTINGS_STATE.loading;
    cx.notify();
    const body = await readSettings();
    if (body) this.takeBody(body);
    else this.settings.state = SETTINGS_STATE.failed;
    cx.notify();
  }

  takeBody(body) {
    this.settings.body = body;
    this.settings.state = SETTINGS_STATE.ready;
    this.ensureFields();
    this.syncFields();
  }

  makeField(id, value) {
    const state = InputState.new({ placeholder: TEXT.textPlaceholder, value });
    state.on("focus", (_e, cx) => { this.typing = true; this.activeField = id; cx.notify(); });
    state.on("blur", (_e, cx) => {
      if (this.activeField === id) { this.activeField = null; this.typing = false; }
      this.commit(id, cx);
      cx.notify();
    });
    state.on("submit", (_e, cx) => { this.commit(id, cx); this.handle.focus(); });
    return state;
  }

  ensureFields() {
    const ids = [...KNOWN_IDS, ...(this.settings.body?.settings ?? []).map((s) => s.id)];
    for (const id of ids) {
      if (this.fields.has(id)) continue;
      try { this.fields.set(id, this.makeField(id, "")); } catch { break; }
    }
  }

  rebuildFields() {
    for (const [id, old] of [...this.fields]) {
      try { this.fields.set(id, this.makeField(id, old.value())); } catch { break; }
    }
    this.syncFields();
  }

  syncFields() {
    for (const s of this.settings.body?.settings ?? []) {
      const state = this.fields.get(s.id);
      const typed = controlOf(s) === CONTROL.text || controlOf(s) === CONTROL.number;
      if (state && typed && this.activeField !== s.id && state.value() !== s.value) state.set_value(s.value);
    }
  }

  commit(id, cx) {
    const setting = this.settings.body?.settings.find((s) => s.id === id);
    const state = this.fields.get(id);
    if (!setting || !state || setting.locked || this.scene !== SCENES.settings) return;
    const value = state.value().trim();
    if (value !== setting.value) this.save(id, value, cx);
  }

  async save(id, value, cx) {
    this.settings.busy = true;
    this.settings.message = null;
    cx.notify();
    const body = await saveSettings([[id, value]]);
    this.settings.busy = false;
    if (body) this.takeBody(body);
    this.settings.message = body && !body.rejected?.length ? "saved" : "failed";
    if (this.settings.message === "saved" && id === "locale") await this.applyLanguage(body, cx);
    cx.notify();
    cx.timer.after(INTERVAL.saved, (c) => { this.settings.message = null; c.notify(); });
  }

  async applyLanguage(body, cx) {
    const next = resolveLanguage(body.locale?.setting, await systemLang());
    if (next === currentLang()) return;
    setLang(next);
    this.onLanguage(cx);
  }

  settingsKey(e, cx) {
    const key = keyName(e);
    if (key === "escape") {
      if (this.typing) { this.typing = false; this.activeField = null; this.handle.focus(); cx.stop_propagation(); cx.notify(); } else this.back(cx);
    } else if (key === "enter" && this.typing && this.activeField) {
      this.commit(this.activeField, cx);
      this.handle.focus();
    }
  }

  onKey(e, cx) {
    if (this.scene === SCENES.settings) { this.settingsKey(e, cx); return; }
    const hit = keyAction(e, this.typing);
    if (!hit) { if (this.typing && e.key === "escape") { this.typing = false; this.handle.focus(); cx.stop_propagation(); cx.notify(); } return; }
    const brief = this.scene === SCENES.brief;
    if (hit.action === ACTION.down) this.move(1, cx);
    else if (hit.action === ACTION.up) this.move(-1, cx);
    else if (hit.action === ACTION.open) this.openSelected(cx);
    else if (hit.action === ACTION.search) (brief ? this.tqState : this.qState).focus();
    else if (hit.action === ACTION.view && this.sel) { if (!brief) this.open(this.sel, cx); this.view = VIEWS[hit.arg]; this.bin = -1; cx.notify(); }
    else if (hit.action === ACTION.compact && brief) this.compactKey(cx);
    else if (hit.action === ACTION.refresh) this.refresh(cx, !brief);
    else if (hit.action === ACTION.back) this.escape(cx);
  }

  openSelected(cx) {
    if (this.scene !== SCENES.fleet) return;
    if (this.typing) { this.typing = false; this.handle.focus(); }
    const list = visible(this.rows(), this.filter, this.q);
    const target = list.find((r) => r.id === this.sel) ?? list[0];
    if (target) this.open(target.id, cx);
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
