import { div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { TINT } from "../constants.js";
import { SIZE } from "../metrics.js";
import { TEXT } from "../text.js";
import { ago } from "../time.js";
import { tint } from "../theme.js";
import { icon } from "../ui/icon.js";

const bold = (t, n, rest) => h_flex().gap(SIZE.tiny).child(div().font_semibold().text_color(t.fg).child(`${n}`)).child(rest);

function parts(t, s) {
  return [
    s.need && bold(t, s.need, TEXT.needOpen),
    s.dec && bold(t, s.dec, TEXT.newDecisions(s.dec)),
    s.fact && bold(t, s.fact, TEXT.progress(s.fact)),
    s.comp && h_flex().gap(SIZE.tiny).child(TEXT.compacted).child(div().font_semibold().text_color(t.fg).child(`${s.comp}x`)),
  ].filter(Boolean);
}

export function briefBanner(c) {
  const { t } = c;
  const shown = parts(t, c.model.banner);
  const body = shown.length ? shown.flatMap((p, i) => (i ? [div().child(TEXT.separator.trim()), p] : [p])) : [div().child(TEXT.nothingNew)];
  return h_flex().flex_wrap().gap(SIZE.gap).items_center().px(SIZE.ctlPad).py(SIZE.banner).rounded(SIZE.radius).border(SIZE.border)
    .border_color(tint(t.accent, TINT.bannerBorder)).bg(tint(t.accent, TINT.banner)).text_size(SIZE.text)
    .child(icon("history", SIZE.lead, t.accent)).child(TEXT.since(ago(c.now - c.model.banner.seen))).children(body);
}
