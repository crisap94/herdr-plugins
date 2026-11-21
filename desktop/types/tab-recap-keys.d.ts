export interface KeyPress {
    readonly key: string;
    readonly keystroke?: string;
    readonly modifiers?: Readonly<Record<string, boolean>>;
}
export interface KeyHit {
    readonly action: string;
    readonly arg: number | null;
}
export declare function keyName(e: KeyPress): string;
export declare function keyAction(e: KeyPress, typing: boolean): KeyHit | null;
