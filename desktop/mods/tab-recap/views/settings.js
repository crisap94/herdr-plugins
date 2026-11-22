import { div } from "gpui-kit";
import { Input, h_flex, v_flex } from "gpui-base";
import { CONTROL, SETTINGS_STATE } from "../constants.js";
import { SIZE } from "../metrics.js";
import { TEXT } from "../text.js";
import { controlOf, flipped, hintOf, isSwitchOn, labelOf, layoutOf, optionLabel } from "../settings-model.js";
import { btn } from "../ui/button.js";
import { card } from "../ui/card.js";

const stop = (_e, cx) => cx.stop_propagation();

function toggle(c, s) {
  const { t } = c;
  const on = isSwitchOn(s);
  const el = div().id(`set-${s.id}`).relative().flex_none().w(SIZE.toggleW).h(SIZE.toggleH).rounded(SIZE.round).border(SIZE.border).border_color(on ? t.accent : t.border)
    .bg(on ? t.accent : t.hover).on_mouse_down("left", stop)
    .child(div().absolute().top(SIZE.knobInset).left(on ? SIZE.toggleW - SIZE.knob - SIZE.knobInset - SIZE.border * 2 : SIZE.knobInset).size(SIZE.knob).rounded(SIZE.round).bg(on ? t.onAccent : t.muted));
  return s.locked ? el.opacity(SIZE.faint) : el.cursor_pointer().on_click((_e, cx) => c.onSave(s.id, flipped(s), cx));
}

function select(c, s) {
  const { t } = c;
  return h_flex().flex_wrap().justify_end().gap(SIZE.headGap).children(s.options.map((value) => btn(t, optionLabel(TEXT, s, value), {
    id: `set-${s.id}-${value}`, pressed: value === s.value, disabled: s.locked, tip: s.locked ? TEXT.lockedBy(s.env) : undefined, onClick: (_e, cx) => { if (value !== s.value) c.onSave(s.id, value, cx); },
  })));
}

function entry(c, s, width) {
  const { t } = c;
  const state = c.fields.get(s.id);
  const box = h_flex().id(`set-${s.id}`).flex_none().h(SIZE.ctl).w(width).px(SIZE.chipPad).items_center().rounded(SIZE.radiusSm).border(SIZE.border)
    .border_color(c.activeField === s.id ? t.accent : t.border).bg(t.bg).on_mouse_down("left", stop);
  if (!state) return box.child(div().text_size(SIZE.text).text_color(t.muted).truncate().child(s.value));
  const shown = box.child(Input.new(state).flex_1().h_full().text_size(SIZE.text).text_color(t.fg));
  return s.locked ? shown.opacity(SIZE.faint) : shown;
}

function control(c, s) {
  const kind = controlOf(s);
  if (kind === CONTROL.toggle) return toggle(c, s);
  if (kind === CONTROL.select) return select(c, s);
  return entry(c, s, kind === CONTROL.number ? SIZE.numberW : SIZE.fieldW);
}

function row(c, s, last) {
  const { t } = c;
  const hint = hintOf(TEXT, s.id);
  return h_flex().id(`setting-${s.id}`).gap(SIZE.gapMd).items_center().py(SIZE.padSm).border_color(t.border).when(!last, (e) => e.border_b(SIZE.border))
    .child(v_flex().flex_1().min_w(0).gap(SIZE.tiny2)
      .child(h_flex().gap(SIZE.headGap).items_center().child(div().font_semibold().child(labelOf(TEXT, s.id))))
      .when(Boolean(hint) || s.locked, (e) => e.child(div().text_size(SIZE.hint).text_color(t.dim).child(s.locked ? TEXT.lockedBy(s.env) : hint))))
    .child(div().flex_none().max_w(SIZE.fieldW * 2).child(control(c, s)));
}

function notice(c) {
  const { t, settings } = c;
  if (settings.state === SETTINGS_STATE.loading) return [div().text_color(t.dim).child(TEXT.settingsLoading)];
  if (settings.state === SETTINGS_STATE.failed) {
    return [div().text_color(t.blocked).child(TEXT.settingsFailed), h_flex().child(btn(t, TEXT.settingsRetry, { id: "settings-retry", icon: "refresh", onClick: c.onSettingsRetry }))];
  }
  return [];
}

export function settingsStatus(c) {
  const { t, settings } = c;
  if (settings.busy) return div().id("settings-status").text_color(t.dim).child(TEXT.saving);
  if (settings.message === "saved") return div().id("settings-status").text_color(t.done).child(TEXT.savedOk);
  if (settings.message === "failed") return div().id("settings-status").text_color(t.blocked).child(TEXT.saveFailed);
  return div().id("settings-status");
}

export function settingsView(c) {
  const { t, settings } = c;
  const groups = settings.body ? layoutOf(settings.body.settings) : [];
  return v_flex().id("settings").flex_1().min_h(0).overflow_y_scrollbar().px(SIZE.gutter).py(SIZE.cardPadV).gap(SIZE.gapMd)
    .child(div().text_size(SIZE.text).text_color(t.muted).child(TEXT.settingsLead))
    .children(notice(c))
    .children(groups.map((g) => card(t, TEXT.settingGroups[g.key], g.items.map((s, i) => row(c, s, i === g.items.length - 1)))));
}
