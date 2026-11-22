import { ACTION, KEYS } from "./constants.js";

const ENTER = new Set(["enter", "return"]);

export const keyName = (e) => (ENTER.has(e.key) ? KEYS.open : e.key);

export function keyAction(e, typing) {
  const key = keyName(e);
  if (KEYS.blocked.some((m) => e.modifiers?.[m])) return null;
  if (typing) return key === KEYS.open ? { action: ACTION.open, arg: null } : null;
  const view = KEYS.views.indexOf(key);
  if (view >= 0) return { action: ACTION.view, arg: view };
  const map = {
    [KEYS.down]: ACTION.down, [KEYS.up]: ACTION.up, [KEYS.open]: ACTION.open, [KEYS.search]: ACTION.search,
    [KEYS.compact]: ACTION.compact, [KEYS.refresh]: ACTION.refresh, [KEYS.back]: ACTION.back,
  };
  const action = map[key];
  return action ? { action, arg: null } : null;
}
