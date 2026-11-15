import { exec, run } from "herdr";
import { api, tabRoute } from "./api.js";
import { COMMANDS, PATHS, ROUTE, SAFE_TAB, SYSTEM, WEB_URL } from "./constants.js";
import { resolve } from "./env.js";

const filed = new Set();

export { resolve };

export const safe = (tab) => typeof tab === "string" && SAFE_TAB.test(tab);

const desk = async (args) => {
  const env = await resolve();
  return exec(env.bin, args).then((r) => r, () => ({ code: 1, stdout: "", stderr: "" }));
};

export const ensureDaemon = () => desk([COMMANDS.ensure]).then((r) => r.code === 0);
export async function refreshTab(tab) {
  if (!safe(tab)) return null;
  const sent = await api.post(`${tabRoute(tab)}${ROUTE.refresh}`);
  return sent?.ok ? sent : desk([COMMANDS.refresh, tab]);
}

export async function refreshAll(tabs) {
  for (const tab of tabs) await refreshTab(tab);
}

export async function restartDaemon() {
  await desk([COMMANDS.stop]);
  await desk([COMMANDS.start]);
  return ensureDaemon();
}

const markerPath = async (tab) => `${(await resolve()).dir}/${PATHS.marker}${encodeURIComponent(tab)}`;

export async function touchMarker(tab) {
  if (!safe(tab)) return;
  const leased = await api.put(`${tabRoute(tab)}${ROUTE.open}`);
  if (leased?.ok) return;
  filed.add(tab);
  await exec(SYSTEM.touch, [await markerPath(tab)]).then(() => null, () => null);
}

export async function clearMarker(tab) {
  if (!safe(tab)) return;
  const released = await api.del(`${tabRoute(tab)}${ROUTE.open}`);
  if (released?.ok && !filed.delete(tab)) return;
  filed.delete(tab);
  await exec(SYSTEM.rm, [SYSTEM.rmForce, await markerPath(tab)]).then(() => null, () => null);
}

export function jumpToLane(tab, terminal) {
  if (!safe(tab)) return;
  run("tab.select", { id: tab });
  if (terminal) run("pane.focus", { terminal });
}

export function openLink(url) {
  if (typeof url === "string" && WEB_URL.test(url)) exec(SYSTEM.opener, [url]).then(() => null, () => null);
}
