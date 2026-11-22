export interface Setting {
    readonly id: string;
    readonly env: string;
    readonly kind: string;
    readonly value: string;
    readonly options: readonly string[];
    readonly locked: boolean;
}
export interface Group {
    readonly key: string;
    readonly items: readonly Setting[];
}
export interface Messages {
    readonly autoSystem: string;
    readonly optionLabels: Readonly<Record<string, string>>;
    readonly settingLabels: Readonly<Record<string, string>>;
    readonly settingHints: Readonly<Record<string, string>>;
    readonly modelLabel: (backend: string) => string;
    readonly modelHint: string;
}
export declare const OTHER_GROUP: "other";
export declare const KNOWN_IDS: readonly string[];
export declare const GROUPS: readonly { readonly key: string; readonly ids: readonly string[] }[];
export declare function groupOf(id: string): string;
export declare function controlOf(setting: Setting): string;
export declare function layoutOf(settings: readonly Setting[]): readonly Group[];
export declare function isSwitchOn(setting: Setting): boolean;
export declare function flipped(setting: Setting): string;
export declare function optionLabel(messages: Messages, setting: Setting, value: string): string;
export declare function labelOf(messages: Messages, id: string): string;
export declare function hintOf(messages: Messages, id: string): string;
