import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { ACTIONS_ENABLED, ICON, SPIN_MS, STATUS, TINT } from "../constants.js";
import { LOOP, SIZE } from "../metrics.js";
import { TEXT } from "../text.js";
import { ago, minutes } from "../time.js";
import { tint } from "../theme.js";
import { btn } from "../ui/button.js";
import { card, cardHead } from "../ui/card.js";
import { chip } from "../ui/chip.js";
import { laneChip } from "../ui/lane-chip.js";
import { bullets } from "../ui/list.js";
import { pill } from "../ui/pill.js";
import { briefBanner } from "./banner.js";
import { needCard } from "./need.js";
import { decisionsCard } from "./decisions.js";

function titleRow(c) {
  const { t, tab } = c;
  const age = tab.recapAt ? TEXT.recapAge(ago(c.now - tab.recapAt)) : TEXT.neverRecap;
  return h_flex().gap(SIZE.gapMd).items_center()
    .child(v_flex().flex_1().min_w(0).child(h_flex().gap(SIZE.gap).items_center().child(div().text_size(SIZE.title).font_semibold().truncate().child(tab.name)).child(pill(t, tab.status)))
      .when(Boolean(c.model.goal), (e) => e.child(div().text_size(SIZE.text).text_color(t.muted).truncate().child(TEXT.goal(c.model.goal)))))
    .child(div().flex_none().text_size(SIZE.text).text_color(t.dim).child(age))
    .child(btn(t, c.refreshing ? TEXT.refreshing : TEXT.refresh, { id: "refresh", icon: c.refreshing ? ICON.working : ICON.refresh, spin: c.refreshing ? SPIN_MS : 0, onClick: c.onRefresh }));
}

function linksRow(c) {
  return h_flex().flex_wrap().gap(SIZE.headGap).pt(SIZE.padSm).children(c.model.links.map((l, i) => chip(c.t, `link-${i}`, l.label, l.url)));
}

function lanesRow(c) {
  const { model } = c;
  return h_flex().flex_wrap().gap(SIZE.padSm).items_start().children(model.lanes.map((l, i) =>
    laneChip(c.t, l, i, { hint: c.hint, now: c.now, open: c.openLane === i, onToggle: c.onLaneToggle })));
}

function cutsLine(c) {
  return c.model.cuts.map((x, i) => div().id(`cut-${i}`).text_size(SIZE.hint).text_color(c.t.dim).child(TEXT.cut(x.part, x.kept, x.total)));
}

export function brief(c) {
  const { t, model } = c;
  const left = v_flex().flex_1().min_w(0).gap(SIZE.gapMd).children(model.needCards.map((n, i) => needCard(c, n, i)))
    .child(card(t, TEXT.now, bullets(t, model.now, TEXT.nothingRunning)));
  const right = v_flex().flex_1().min_w(0).gap(SIZE.gapMd).child(decisionsCard(c))
    .child(card(t, TEXT.next, bullets(t, model.next, TEXT.nothingPlanned).concat(model.links.length ? [linksRow(c)] : [])));
  return v_flex().gap(SIZE.gapMd).child(titleRow(c)).child(lanesRow(c)).child(briefBanner(c))
    .child(h_flex().gap(SIZE.gapMd).items_start().child(left).child(right)).children(cutsLine(c));
}
