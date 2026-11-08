import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { SECTIONS, SECTION_TOKEN } from "../constants.js";
import { SIZE } from "../metrics.js";
import { TEXT } from "../text.js";
import { bins } from "../derive-timeline.js";
import { btn, search } from "../ui/button.js";
import { hoverCard, plot } from "./timeline-plot.js";
import { feedView } from "./timeline-feed.js";

function filters(c) {
  const { t } = c;
  const count = (k) => c.model.events.filter((e) => e.sec === k).length;
  return h_flex().flex_wrap().items_center().gap(SIZE.headGap)
    .children(SECTIONS.map((k) => h_flex().gap(SIZE.headGap).items_center().child(
      btn(t, TEXT.sections[k], { id: `sec-${k}`, pressed: c.tlSec.has(k), count: count(k), swatch: t[SECTION_TOKEN[k]], onClick: (_e, cx) => c.onSec(k, cx) }))))
    .child(div().flex_1()).child(search(t, "tq", c.tqState, SIZE.searchTl, c.tqFocus))
    .when(c.bin >= 0, (e) => e.child(btn(t, TEXT.clearRange, { id: "clear-range", icon: "close", onClick: (_e, cx) => c.onClearBin(cx) })));
}

export function timeline(c) {
  const filter = { sections: c.tlSec, q: c.tq };
  const shown = c.model.events.filter((e) => (!filter.sections.size || filter.sections.has(e.sec)) && (!filter.q || e.text.toLowerCase().includes(filter.q)));
  const made = bins(shown, c.now);
  const picked = c.bin >= 0 ? made.bins[c.bin] : null;
  return v_flex().relative().gap(SIZE.gap).child(filters(c)).child(plot(c, made))
    .child(feedView(c, { ...filter, bin: picked }, made.older)).when(c.hoverBin !== null, (e) => e.child(hoverCard(c, made.bins[c.hoverBin])));
}
