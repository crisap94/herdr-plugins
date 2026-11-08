import { View, div } from "gpui-kit";
import { props } from "herdr";
import { DEFAULT_ROLE, ROLES } from "./constants.js";
import { TEXT } from "./text.js";
import Chip from "./roles/chip.js";
import Popover from "./roles/popover.js";
import Strip from "./roles/strip.js";
import Window from "./roles/window.js";

const BUILDERS = { [ROLES.chip]: Chip, [ROLES.strip]: Strip, [ROLES.fleet]: Window, [ROLES.brief]: Window, [ROLES.compact]: Popover };

export default class TabRecap extends View {
  init(p, cx) {
    const given = props() ?? p ?? {};
    this.name = given.role ?? DEFAULT_ROLE;
    const Role = BUILDERS[this.name];
    this.role = Role ? new Role() : null;
    this.role?.init?.(given, cx);
  }

  async close(cx) {
    await this.role?.close?.(cx);
  }

  render(cx) {
    if (!this.role) return div().child(TEXT.noRole(this.name));
    return this.role.render(cx);
  }
}
