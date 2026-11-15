import { ACTION, KEYS } from "./constants.js";

export function keyAction(e, typing) {
  if (typing || KEYS.blocked.some((m) => e.modifiers?.[m])) return null;
  const view = KEYS.views.indexOf(e.key);
  if (view >= 0) return { action: ACTION.view, arg: view };
  const map = {
    [KEYS.down]: ACTION.down, [KEYS.up]: ACTION.up, [KEYS.open]: ACTION.open, [KEYS.search]: ACTION.search,
    [KEYS.compact]: ACTION.compact, [KEYS.refresh]: ACTION.refresh, [KEYS.back]: ACTION.back,
  };
  const action = map[e.key];
  return action ? { action, arg: null } : null;
}
