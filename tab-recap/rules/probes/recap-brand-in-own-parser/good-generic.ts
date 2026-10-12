export function parsePaneId(raw: unknown) {
  return brand<string, 'PaneId'>(String(raw));
}
