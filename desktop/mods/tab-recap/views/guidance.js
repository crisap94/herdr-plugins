import { div } from "gpui-kit";
import { TextView, h_flex, v_flex } from "gpui-base";
import { FENCE, GUIDE, ICON, SPIN_MS } from "../constants.js";
import { SIZE } from "../metrics.js";
import { TEXT } from "../text.js";
import { btn } from "../ui/button.js";
import { cardHead } from "../ui/card.js";
import { lanePick } from "../ui/lane-pick.js";

const frame = (t) => v_flex().id("guide-text").w_full().h(SIZE.msgH).px(SIZE.chipPad).py(SIZE.popAt).gap(SIZE.tiny).rounded(SIZE.radiusSm).border(SIZE.border)
  .border_color(t.border).bg(t.bg).text_size(SIZE.text).text_color(t.fg).overflow_y_scrollbar();

const lines = (text) => text.split("\n").map((line) => div().child(line || " "));

function fenced(text) {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const fence = FENCE.repeat(Math.max(3, longest + 1));
  return `${fence}\n${text}\n${fence}`;
}

function block(t, g) {
  const view = g.view;
  if (g.fallback !== null) return TextView.markdown("guide-select", fenced(g.fallback)).selectable().scrollable().h(SIZE.msgH).w_full().text_size(SIZE.text).text_color(t.fg);
  if (view.kind === GUIDE.loading) return frame(t).text_color(t.muted).child(TEXT.guideLoading);
  if (view.kind === GUIDE.error) return frame(t).text_color(t.blocked).child(TEXT.guideErrors[view.reason]);
  return frame(t).children(lines(view.text));
}

function captionOf(t, g) {
  const text = g.view.kind === GUIDE.ready && g.view.model !== false ? TEXT.guideWritten : TEXT.guideCaption;
  return div().id("guide-caption").text_size(SIZE.hint).text_color(t.muted).child(text);
}

function copyButton(t, g) {
  const ready = g.view.kind === GUIDE.ready;
  return btn(t, g.copied === GUIDE.compact ? TEXT.copied : TEXT.copy, { id: "copy", minW: SIZE.copyW, disabled: !ready, tip: TEXT.guideWait, onClick: () => g.copyCompact() });
}

function handoffButton(t, g) {
  const alone = g.others.length === 0;
  const busy = g.handoff.busy;
  const label = g.copied === GUIDE.handoff ? TEXT.copied : TEXT.copyHandoff;
  const spin = busy ? { icon: ICON.working, spin: SPIN_MS } : {};
  return btn(t, label, { id: "copy-handoff", disabled: alone, busy, tip: alone ? TEXT.needsSecond : TEXT.handoffBusy, onClick: () => g.copyHandoff(), ...spin });
}

export function guidanceSection(t, g) {
  const failed = g.fallback !== null;
  const reason = g.handoff.reason;
  return v_flex().id("guidance").gap(SIZE.headGap).pt(SIZE.gap).border_t(SIZE.border).border_color(t.border)
    .child(cardHead(t, TEXT.guideHead, undefined, t.muted))
    .child(block(t, g))
    .child(captionOf(t, g))
    .when(g.others.length > 1, (e) => e.child(lanePick(t, g.others, g.to, (terminal, cx) => g.pick(terminal, cx))))
    .child(h_flex().gap(SIZE.gap).items_center().child(copyButton(t, g)).child(handoffButton(t, g)))
    .when(failed, (e) => e.child(div().id("copy-failed").text_size(SIZE.text).text_color(t.blocked).child(TEXT.copyFailed)))
    .when(Boolean(reason), (e) => e.child(div().id("handoff-error").text_size(SIZE.text).text_color(t.blocked).child(g.handoff.detail ?? TEXT.guideErrors[reason])));
}
