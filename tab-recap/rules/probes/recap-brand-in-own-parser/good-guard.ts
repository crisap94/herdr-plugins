export function isPaneId(input: unknown): input is PaneId {
  return brand(input, 'PaneId') !== undefined;
}
