declare const Bun: {
    readonly TOML: { parse(text: string): unknown };
    stringWidth(text: string): number;
};
