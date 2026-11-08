import { div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { closeOverlay, focused, nextCommand, openOverlay, setShared, shared } from "herdr";
import { INTERVAL, MOD, ROLES, SHARED, STATUS, TINT, WINDOW } from "../constants.js";
import { countBy, worstOf } from "../derive.js";
import { LOOP, SIZE } from "../metrics.js";
import { TEXT } from "../text.js";
import { liveTabs } from "../model.js";
import { Store } from "../store.js";
import { tint, tokens } from "../theme.js";
import { status } from "../ui/status.js";
import { announce } from "./notify.js";

export default class Chip {
  init(_p, cx) {
    this.store = new Store();
    this.windowId = null;
    this.store.start(cx, (c) => this.publish(c), INTERVAL.poll);
    cx.spawn(async (c) => {
      for (;;) {
        const name = await nextCommand();
        if (name === ROLES.fleet) this.toggle();
        else if (name === ROLES.brief) this.openBrief();
        c.notify();
      }
    });
  }

  openBrief() {
    const tab = focused()?.tab;
    if (tab) this.windowId = openOverlay({ mod: MOD, ...WINDOW, keep: true, props: { role: ROLES.brief, tab } });
  }

  publish() {
    const rows = this.store.rows;
    const text = JSON.stringify(rows);
    if (JSON.stringify(shared(SHARED.rows)) !== text) setShared(SHARED.rows, rows);
    announce(this.store, rows);
  }

  toggle() {
    if (this.windowId) {
      try { closeOverlay(this.windowId); this.windowId = null; return; } catch { this.windowId = null; }
    }
    this.windowId = openOverlay({ mod: MOD, ...WINDOW, keep: true, props: { role: ROLES.fleet } });
  }

  render() {
    const t = tokens();
    const tabs = liveTabs().filter((x) => x.status !== null);
    const blocked = countBy(tabs, STATUS.blocked);
    const body = h_flex().id("tab-recap-chip").h(SIZE.chipBody).pl(SIZE.chipLeft).pr(SIZE.ctlPad).gap(SIZE.chipGap).items_center().rounded(SIZE.round).border(SIZE.border)
      .border_color(blocked ? tint(t.blocked, TINT.chip) : t.border).bg(t.raised).cursor_pointer().on_click(() => this.toggle())
      .child(status(t, worstOf(tabs), SIZE.icon)).child(div().font_semibold().text_size(SIZE.text).child(TEXT.needs(blocked)))
      .child(div().text_size(SIZE.text).text_color(t.muted).child(TEXT.workingCount(countBy(tabs, STATUS.working))));
    return div().relative().p(SIZE.chipRing / 2)
      .when(blocked > 0, (e) => e.child(div().absolute().left(0).top(0).w_full().h_full().rounded(SIZE.round).bg(tint(t.blocked, TINT.ring)).loop("opacity", LOOP.ring)))
      .child(body);
  }
}
