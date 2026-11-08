export const MOD = "tab-recap";
export const ROLES = { chip: "chip", strip: "strip", fleet: "fleet", brief: "brief", compact: "compact" };
export const DEFAULT_ROLE = ROLES.fleet;
export const SCENES = { fleet: "fleet", brief: "brief" };
export const VIEWS = ["brief", "story", "timeline", "session"];
export const WINDOW = { key: MOD, kind: "window", width: 780, height: 620 };

export const STATUS = { blocked: "blocked", done: "done", working: "working", idle: "idle", unknown: "unknown" };
export const STATUS_ORDER = [STATUS.blocked, STATUS.done, STATUS.working, STATUS.idle];
export const LANE_ORDER = [STATUS.blocked, STATUS.done, STATUS.working, STATUS.idle, STATUS.unknown];
export const SECTIONS = ["needs", "decisions", "done", "progress"];
export const FACT_SECTION = { needs: "needs", decisions: "decisions", done: "done", now: "progress" };
export const BREAK_KIND = { compacted: "compaction", switched: "session" };
export const BREAK_ICON = { compaction: "compress", session: "play" };
export const STEPS = ["briefing", "compacting", "restoring", "compacted"];
export const RUNNING_STAGES = ["briefing", "compacting", "restoring"];
export const STAGE = { compacted: "compacted", failed: "failed", unconfirmed: "unconfirmed", skipped: "skipped" };
export const FACT_STATE = { open: "open", closed: "closed" };
export const YES = "yes";
export const DOC_VERSIONS = [1, 2];
export const NEWER = "newer";

export const KEYS = {
  down: "j", up: "k", open: "enter", search: "/", compact: "c", refresh: "r", back: "escape",
  views: ["1", "2", "3", "4"],
  blocked: ["control", "alt", "platform"],
};
export const ACTION = {
  down: "down", up: "up", open: "open", search: "search", compact: "compact", refresh: "refresh", back: "back", view: "view",
};
export const FOOTER = [
  { keys: [KEYS.down, KEYS.up], label: "move" },
  { keys: ["Enter"], label: "open" },
  { keys: [KEYS.search], label: "search" },
  { keys: ["1-4"], label: "views" },
  { keys: [KEYS.compact], label: "compact" },
  { keys: [KEYS.refresh], label: "refresh" },
  { keys: ["Esc"], label: "back" },
];

export const COMMANDS = { ensure: "ensure", refresh: "refresh", stop: "stop", start: "start" };
export const SYSTEM = { printenv: "printenv", touch: "touch", rm: "rm", rmForce: "-f", opener: "xdg-open" };
export const ENV = { bin: "TAB_RECAP_BIN", state: "TAB_RECAP_STATE" };
export const DEFAULT_BIN = "tab-recap-desktop";
export const DEFAULT_STATE = ".local/state/herdr/plugins/tab-recap/desktop";
export const PATHS = { gui: "gui", index: "index.json", marker: "open.", icons: "mods/tab-recap/icons/", extension: ".json" };
export const SAFE_TAB = /^[A-Za-z0-9%@_][\w.:%@-]*$/;
export const WEB_URL = /^https?:\/\//;
export const URL_IN_TEXT = /\s*https?:\/\/\S+/g;
export const SHARED = { rows: "tab-recap.rows", notified: "tab-recap.notified", popup: "tab-recap.popup" };
export const STORAGE = { seen: "tab-recap.seen" };

export const MS = { second: 1000, minute: 60000, hour: 3600000, day: 86400000 };
export const INTERVAL = { focus: 400, poll: 15000, marker: 20000, refreshMax: 8000, stageFresh: 600000, firstLook: 86400000, tick: 30000 };
export const HINT_DEFAULT = 40;
export const NOTE_MAX = 280;
export const BIN_COUNT = 32;
export const HOURS = 48;
export const AXIS_STEP_HOURS = 6;
export const HOVER_EVENTS = 4;
export const INDEX_LANES_MAX = 8;
export const REFRESH_ALL_MAX = 8;
export const ROW_STEPS = 2;
export const SPIN_MS = 1000;
export const ACTIONS_ENABLED = { compact: false, reply: false };
export const WRITING = "writing";
export const FULL = 100;

export const TINT = { pill: "29", need: "0f", needBorder: "8c", banner: "1a", bannerBorder: "59", hint: "99", ring: "4d", chip: "99" };
export const FALLBACK_ZONE = "UTC";
export const CLOCK_PAD = 2;
export const CLOCK_FILL = "0";
export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const DOC = { needs: "needs", decisions: "decisions", now: "now", done: "done", next: "next", links: "links", compacted: "compacted", switched: "switched" };
export const SECTION_TOKEN = { needs: "blocked", decisions: "violet", done: "done", progress: "working" };
export const NOTIFIED_KEEP = 50;
export const UNIT = { minHour: 60, minDay: 1440, secHour: 3600, secDay: 86400, thousand: 1000, million: 1000000, percent: 100, secMin: 60 };
export const STEP_STATE = { ok: "ok", now: "now", idle: "idle" };
export const ICON = { working: "working", refresh: "refresh" };
