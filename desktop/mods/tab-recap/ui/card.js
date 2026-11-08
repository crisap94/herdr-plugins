import { h_flex, v_flex } from "gpui-base";
import { SIZE } from "../metrics.js";
import { icon } from "./icon.js";

export function cardHead(t, label, iconName, color) {
  return h_flex().gap(SIZE.headGap).items_center().text_size(SIZE.hint).font_semibold().text_color(color ?? t.dim)
    .when(Boolean(iconName), (e) => e.child(icon(iconName, SIZE.icon, color ?? t.dim))).child(label.toUpperCase());
}

export function card(t, title, body, o = {}) {
  return v_flex().gap(SIZE.gap).px(SIZE.cardPad).py(SIZE.cardPadV).rounded(SIZE.cardRadius).border(SIZE.border)
    .border_color(o.border ?? t.border).bg(o.bg ?? t.raised).child(cardHead(t, title, o.icon, o.head)).children(body);
}
