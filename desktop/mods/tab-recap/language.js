import { AUTO_LANG, DEFAULT_LANG, LANGS, SYSTEM_LANG_PREFIX } from "./constants.js";

export const isLanguage = (value) => LANGS.includes(value);

export function resolveLanguage(setting, system) {
  if (isLanguage(setting)) return setting;
  if (setting !== undefined && setting !== AUTO_LANG && setting !== "") return resolveLanguage(undefined, system);
  const prefix = String(system ?? "").trim().toLowerCase();
  return LANGS.find((lang) => lang in SYSTEM_LANG_PREFIX && prefix.startsWith(SYSTEM_LANG_PREFIX[lang])) ?? DEFAULT_LANG;
}
