import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { SIZE } from "../metrics.js";
import { TEXT } from "../text.js";
import { duration, sizeOf } from "../time.js";
import { card } from "../ui/card.js";
import { meter } from "../ui/meter.js";
import { status } from "../ui/status.js";

function tiles(s) {
  if (!s) return [];
  const causes = (s.runs?.byCause ?? []).map((x) => `${x.count} ${x.cause}`).join(TEXT.separator);
  return [
    s.started && [duration(s.started.forMs), TEXT.chip.started],
    s.runs && [`${s.runs.total}`, `${TEXT.chip.turns}${causes ? `: ${causes}` : ""}`],
    s.compactions && [`${s.compactions.count}`, `${TEXT.chip.compactions}${s.chapters ? `, ${TEXT.chapters(s.chapters)}` : ""}`],
    s.files?.length && [`${s.files.length}`, TEXT.chip.sessionFiles],
    ...(s.agents ?? []).map((a) => [`${a.share}%`, `${TEXT.chip.context}, ${a.label}`]),
    s.repo && [s.repo.name, s.repo.branch ?? TEXT.chip.repo],
  ].filter(Boolean);
}

const tile = (t, pair, i) => v_flex().id(`tile-${i}`).flex_1().min_w(SIZE.tileW).px(SIZE.ctlPad).py(SIZE.padSm).rounded(SIZE.radius).border(SIZE.border)
  .border_color(t.border).bg(t.raised).child(div().text_size(SIZE.big).font_semibold().truncate().child(pair[0])).child(div().text_size(SIZE.hint).text_color(t.dim).child(pair[1]));

function laneRow(c, l, i) {
  const { t } = c;
  const pct = l.contextPercent;
  return h_flex().gap(SIZE.padSm).items_center().py(SIZE.rowPadV).border_t(i ? SIZE.border : 0).border_color(t.border).text_size(SIZE.text)
    .child(status(t, l.status, SIZE.icon)).child(div().w(SIZE.laneRow).text_color(t.muted).child(l.agent)).child(div().font_semibold().child(l.name))
    .child(div().flex_1()).child(meter(t, pct, SIZE.meterSession, c.hint))
    .child(div().child(pct === null ? TEXT.dash : `${pct}% of ${l.window ? sizeOf(l.window) : TEXT.dash}`));
}

export function session(c) {
  const { t, model } = c;
  return v_flex().gap(SIZE.gapMd).child(h_flex().flex_wrap().gap(SIZE.gap).children(tiles(model.session).map((p, i) => tile(t, p, i))))
    .child(card(t, TEXT.lanesHead, model.lanes.map((l, i) => laneRow(c, l, i))));
}
