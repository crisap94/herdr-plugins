import { present as drawColumn, presentBar as drawBar } from '@stateforge-labs/recap-view/unstable/present.ts';
import { barDrawing, viewDrawing } from './column.ts';

export { badge, firstItem, footer } from '@stateforge-labs/recap-view/unstable/present.ts';
export type { Markdown, Mode } from '@stateforge-labs/recap-view/unstable/present.ts';
export type { PluginColumnView as ColumnView } from './column.ts';

export const present = viewDrawing(drawColumn);

export const presentBar = barDrawing(drawBar);
