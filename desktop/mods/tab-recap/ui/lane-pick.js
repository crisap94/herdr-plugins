import { div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { SIZE } from "../metrics.js";
import { TEXT } from "../text.js";
import { status } from "./status.js";

const stop = (_e, cx) => cx.stop_propagation();

function option(t, lane, i, active, onPick) {
  const on = lane.terminal === active;
  return h_flex().id(`pick-${i}`).h(SIZE.chipH).px(SIZE.chipPad).gap(SIZE.pillGap).items_center().flex_none().rounded(SIZE.round).cursor_pointer()
    .border(SIZE.border).border_color(on ? t.accent : t.border).bg(on ? t.selected : t.surface).text_size(SIZE.text).text_color(on ? t.fg : t.muted)
    .hover((s) => s.bg(t.hover)).on_mouse_down("left", stop).on_click((_e, cx) => onPick(lane.terminal, cx))
    .child(status(t, lane.status, SIZE.iconSm)).child(div().truncate().max_w(SIZE.pickMax).child(lane.name));
}

export function lanePick(t, lanes, active, onPick) {
  return h_flex().id("handoff-pick").flex_wrap().gap(SIZE.gapSm).items_center()
    .child(div().text_size(SIZE.hint).text_color(t.muted).child(TEXT.handoffTo))
    .children(lanes.map((lane, i) => option(t, lane, i, active, onPick)));
}
