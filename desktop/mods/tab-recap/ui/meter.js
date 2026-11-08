import { div } from "gpui-kit";
import { FULL } from "../constants.js";
import { LOOP, SIZE } from "../metrics.js";

export function meter(t, percent, width, hint) {
  const warn = percent !== null && percent >= hint;
  const box = div().relative().h(SIZE.meterBox).flex_none();
  const sized = width === null ? box.flex_1().min_w(0) : box.w(width);
  const track = div().absolute().left(0).top((SIZE.meterBox - SIZE.meterH) / 2).w(`${FULL}%`).h(SIZE.meterH).rounded(SIZE.meterH / 2).bg(t.hover);
  const fill = div().absolute().left(0).top((SIZE.meterBox - SIZE.meterH) / 2).w(`${Math.min(FULL, percent ?? 0)}%`).h(SIZE.meterH).rounded(SIZE.meterH / 2).bg(warn ? t.working : t.idle);
  const tick = div().absolute().left(`${hint}%`).top(0).w(SIZE.meterTick).h(SIZE.meterBox).rounded(1).bg(t.fg).opacity(LOOP.tickAlpha);
  return sized.child(track).child(fill).child(tick);
}
