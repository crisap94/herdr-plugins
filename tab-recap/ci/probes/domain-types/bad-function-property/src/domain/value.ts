export interface Handler {
    readonly onEvent: (text: string) => void;
}

export function take(handler: Handler): void {
    void handler;
}
