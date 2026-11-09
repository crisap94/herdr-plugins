import { h_flex } from "gpui-base";
import { STATUS, TINT } from "../constants.js";
import { SIZE } from "../metrics.js";
import { TEXT } from "../text.js";
import { tint } from "../theme.js";
import { status, statusColor } from "./status.js";

export function pill(t, st, label) {
  const color = statusColor(t, st);
  return h_flex().flex_none().h(SIZE.pill).pl(SIZE.pillLeft).pr(SIZE.pillPad).gap(SIZE.pillGap).items_center().rounded(SIZE.round)
    .bg(tint(color, TINT.pill)).text_color(color).text_size(SIZE.small).font_semibold()
    .child(status(t, st, SIZE.iconSm)).child(label ?? TEXT.pills[st] ?? TEXT.pills[STATUS.unknown]);
}

export const pillCompacting = (t) => pill(t, STATUS.working, TEXT.compacting);
