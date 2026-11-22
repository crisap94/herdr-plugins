import { exec, shared } from "herdr";
import { AUTO_LANG, COMMANDS, DEFAULT_LANG, SHARED } from "./constants.js";
import { resolve, systemLang } from "./env.js";
import { isLanguage, resolveLanguage } from "./language.js";
import { setLang } from "./lang.js";

function parse(result) {
  if (!result?.stdout) return null;
  try {
    const body = JSON.parse(result.stdout);
    return body && Array.isArray(body.settings) ? body : null;
  } catch {
    return null;
  }
}

const desk = async (args) => {
  const env = await resolve();
  return exec(env.bin, args).then((r) => r, () => null);
};

export const readSettings = async () => parse(await desk([COMMANDS.settings]));

export const saveSettings = async (pairs) => parse(await desk([COMMANDS.settings, COMMANDS.set, ...pairs.map(([id, value]) => `${id}=${value}`)]));

export async function loadLanguage() {
  if (isLanguage(shared(SHARED.lang))) return false;
  const [body, system] = await Promise.all([readSettings(), systemLang()]);
  setLang(resolveLanguage(body?.locale?.setting ?? AUTO_LANG, system || DEFAULT_LANG));
  return true;
}
