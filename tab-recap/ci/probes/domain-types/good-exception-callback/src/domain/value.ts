export function onData(handler: (chunk: string) => void): void {
    handler('x');
}
