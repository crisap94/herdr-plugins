import { div } from "gpui-kit";
import { Input, h_flex } from "gpui-base";
import { SIZE, LOOP } from "../metrics.js";
import { TEXT } from "../text.js";
import { icon } from "./icon.js";

const stop = (_e, cx) => cx.stop_propagation();

function glyph(t, o) {
  const el = icon(o.icon, SIZE.icon, o.primary ? t.onAccent : t.fg);
  return o.spin ? el.spin(o.spin) : el;
}

export function btn(t, label, o) {
  const border = o.primary ? t.accent : o.pressed ? t.accent : t.border;
  const el = h_flex().id(o.id).h(SIZE.ctl).gap(SIZE.headGap).items_center().justify_center().flex_none().rounded(SIZE.radiusSm)
    .border(SIZE.border).border_color(border).text_size(SIZE.text).whitespace_nowrap()
    .bg(o.primary ? t.accent : o.pressed ? t.selected : t.raised).text_color(o.primary ? t.onAccent : t.fg)
    .on_mouse_down("left", stop);
  const sized = label ? el.px(SIZE.ctlPad) : el.w(SIZE.ctl);
  const shown = (o.primary ? sized.font_semibold() : sized)
    .when(Boolean(o.icon), (e) => e.child(glyph(t, o)))
    .when(Boolean(o.swatch), (e) => e.child(div().flex_none().size(SIZE.swatch).rounded(SIZE.tiny).bg(o.swatch)))
    .when(Boolean(label), (e) => e.child(label))
    .when(o.count !== undefined, (e) => e.child(div().text_color(t.dim).child(`${o.count}`)));
  if (o.disabled) {
    return div().id(`${o.id}-tip`).flex_none().tooltip(o.tip ?? TEXT.disabled).child(shown.opacity(LOOP.dim));
  }
  const live = shown.cursor_pointer().hover((s) => s.bg(t.hover)).on_click(o.onClick ?? (() => null));
  return o.tip ? div().id(`${o.id}-tip`).flex_none().tooltip(o.tip).child(live) : live;
}

export function kbd(t, key) {
  return div().h(SIZE.kbdMin).min_w(SIZE.kbdMin).px(SIZE.kbdPad).flex().items_center().justify_center().rounded(SIZE.kbdRadius)
    .border(SIZE.border).border_color(t.border).bg(t.hover).text_size(SIZE.hint).text_color(t.muted).child(key);
}

export function seg(t, id, items, active, onPick) {
  return h_flex().flex_none().p(SIZE.segInset).rounded(SIZE.segRadius).border(SIZE.border).border_color(t.border).bg(t.bg).children(items.map(([key, label]) =>
    div().id(`${id}-${key}`).h(SIZE.segH).px(SIZE.segPad).flex().items_center().rounded(SIZE.radiusSm).text_size(SIZE.text).cursor_pointer()
      .bg(key === active ? t.raised : t.bg).text_color(key === active ? t.fg : t.muted)
      .on_mouse_down("left", stop).on_click((e, cx) => onPick(key, cx)).child(label)));
}

export function search(t, id, state, width, focused) {
  return h_flex().id(id).h(SIZE.ctl).w(width).px(SIZE.chipPad).gap(SIZE.gap).items_center().rounded(SIZE.radiusSm)
    .border(SIZE.border).border_color(focused ? t.accent : t.border).bg(t.bg).on_mouse_down("left", stop)
    .child(icon("search", SIZE.icon, t.dim)).child(Input.new(state).flex_1().h_full().text_size(SIZE.text).text_color(t.fg));
}
