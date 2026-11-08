import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { BULLET } from "../text.js";
import { SIZE } from "../metrics.js";

export function bullets(t, items, empty) {
  if (!items.length) return [div().text_color(t.dim).child(empty)];
  return [v_flex().gap(SIZE.gapSm).children(items.map((text) => h_flex().gap(SIZE.bulletGap).items_start()
    .child(div().flex_none().text_color(t.dim).child(BULLET)).child(div().flex_1().min_w(0).child(text))))];
}
