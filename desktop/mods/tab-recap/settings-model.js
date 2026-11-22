import { CONTROL, MODEL_PREFIX, SWITCH_VALUES } from "./constants.js";

export const GROUPS = [
  { key: "general", ids: ["locale", "recapLanguage", "screenAgents", "gitNote", "herdrEvents", "telemetryTags"] },
  { key: "recap", ids: ["harness", `${MODEL_PREFIX}*`, "effort"] },
  { key: "compaction", ids: ["compactTarget", "compactNote", "compactHint", "contextWindow", "compactBy", "compactModel", "compactEffort"] },
  { key: "autocompact", ids: ["autocompact", "autocompactAt", "autocompactStyle", "autocompactMissed", "decideBy", "decideModel", "decideEffort"] },
  { key: "jobs", ids: ["judgeBy", "judgeModel", "judgeEffort", "curateBy", "curateModel", "curateEffort"] },
];

export const OTHER_GROUP = "other";

const WILD = `${MODEL_PREFIX}*`;

const positionIn = (group, id) => {
  const exact = group.ids.indexOf(id);
  return exact >= 0 || !id.startsWith(MODEL_PREFIX) ? exact : group.ids.indexOf(WILD);
};

export const groupOf = (id) => GROUPS.find((g) => positionIn(g, id) >= 0)?.key ?? OTHER_GROUP;

export const KNOWN_IDS = GROUPS.flatMap((g) => g.ids.filter((id) => id !== WILD));

export function controlOf(setting) {
  if (setting.kind === "choice") {
    const same = setting.options.length === SWITCH_VALUES.length && SWITCH_VALUES.every((v) => setting.options.includes(v));
    return same ? CONTROL.toggle : CONTROL.select;
  }
  return setting.kind === "number" ? CONTROL.number : CONTROL.text;
}

export function layoutOf(settings) {
  const keys = [...GROUPS.map((g) => g.key), OTHER_GROUP];
  return keys.map((key) => ({
    key,
    items: settings.filter((s) => groupOf(s.id) === key).toSorted((a, b) => {
      const group = GROUPS.find((g) => g.key === key);
      return group ? positionIn(group, a.id) - positionIn(group, b.id) : 0;
    }),
  })).filter((g) => g.items.length > 0);
}

export const isSwitchOn = (setting) => setting.value === SWITCH_VALUES[0];

export const flipped = (setting) => (isSwitchOn(setting) ? SWITCH_VALUES[1] : SWITCH_VALUES[0]);

export const optionLabel = (messages, setting, value) => {
  if (setting.id === "locale" && value === "auto") return messages.autoSystem;
  return messages.optionLabels[value] ?? value;
};

export const labelOf = (messages, id) => (id.startsWith(MODEL_PREFIX) ? messages.modelLabel(id.slice(MODEL_PREFIX.length)) : messages.settingLabels[id] ?? id);

export const hintOf = (messages, id) => (id.startsWith(MODEL_PREFIX) ? messages.modelHint : messages.settingHints[id] ?? "");
