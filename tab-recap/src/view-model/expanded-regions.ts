import { regionsOf as drawRegions, session as drawSession } from '@stateforge-labs/recap-view/unstable/expanded-regions.ts';
import type { Draw } from '@stateforge-labs/recap-view/unstable/expanded-regions.ts';
import type { Messages } from '#src/i18n/messages.ts';
import { wordingOf } from './wording.ts';

export type { RegionId, Regions, TaskData } from '@stateforge-labs/recap-view/unstable/expanded-regions.ts';
export type { PluginDraw as Draw };

interface PluginDraw extends Omit<Draw, 'wording'> {
    readonly messages: Messages;
}

export interface DrawPresented extends Draw {}

export function drawOf(draw: PluginDraw): DrawPresented {
    const { messages, ...rest } = draw;
    return { ...rest, wording: wordingOf(messages) };
}

const regionDrawing =
    <Data, Drawn>(paint: (data: Data, draw: DrawPresented) => Drawn) =>
    (data: Data, draw: PluginDraw): Drawn =>
        paint(data, drawOf(draw));

export const session = regionDrawing(drawSession);

export const regionsOf = regionDrawing(drawRegions);
