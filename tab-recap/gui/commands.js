import { exec, home, run } from "herdr";
import { COMMANDS, DEFAULT_BIN, DEFAULT_STATE, ENV, PATHS, SAFE_TAB, SYSTEM, WEB_URL } from "./constants.js";

let environment = null;

const envOf = (name) => exec(SYSTEM.printenv, [name]).then((r) => (r.code === 0 ? r.stdout.trim() : ""), () => "");

export function resolve() {
  if (!environment) {
    environment = Promise.all([envOf(ENV.bin), envOf(ENV.state)]).then(([bin, state]) => ({
      bin: bin || DEFAULT_BIN,
      dir: `${state || `${home()}/${DEFAULT_STATE}`}/${PATHS.gui}`,
    }));
  }
  return environment;
}

export const safe = (tab) => typeof tab === "string" && SAFE_TAB.test(tab);

const desk = async (args) => {
  const env = await resolve();
  return exec(env.bin, args).then((r) => r, () => ({ code: 1, stdout: "", stderr: "" }));
};

export const ensureDaemon = () => desk([COMMANDS.ensure]).then((r) => r.code === 0);
export const refreshTab = (tab) => (safe(tab) ? desk([COMMANDS.refresh, tab]) : Promise.resolve(null));

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
  const path = await markerPath(tab);
  await exec(SYSTEM.touch, [path]).then(() => null, () => null);
}

export async function clearMarker(tab) {
  if (!safe(tab)) return;
  const path = await markerPath(tab);
  await exec(SYSTEM.rm, [SYSTEM.rmForce, path]).then(() => null, () => null);
}

export function jumpToLane(tab, terminal) {
  if (!safe(tab)) return;
  run("tab.select", { id: tab });
  if (terminal) run("pane.focus", { terminal });
}

export function openLink(url) {
  if (typeof url === "string" && WEB_URL.test(url)) exec(SYSTEM.opener, [url]).then(() => null, () => null);
}
