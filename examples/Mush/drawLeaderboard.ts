import type { MinecraftTextSegment } from "../../src/render/minecraftPrefix.js";
import { type CanvasRenderingContext2D } from "skia-canvas"
import { getMinecraftShadowColor } from "../../src/render/minecraftColors.js";
import { FontRender, defaultFontPath } from "../../src/index.js";

const renderer = new FontRender();
await renderer.loadImages(defaultFontPath);

export async function drawSegments(ctx: CanvasRenderingContext2D, segments: MinecraftTextSegment[], x: number, y: number, size: number) {
    let currentX = x;

    for (const segment of segments) {
        const width = await renderer.drawText(ctx, segment.text, currentX, y, {
            color: segment.color,
            shadow: true,
            shadowColor: segment.shadowColor,
            bold: segment.bold,
            italic: segment.italic,
            size,
        });

        currentX += width;
    }
}

export function createSegment(text: string, color = "#FFFFFF", options: Partial<Pick<MinecraftTextSegment, "bold" | "italic">> = {}): MinecraftTextSegment {

    return {
        text,
        color,
        shadowColor: getMinecraftShadowColor(color),
        bold: options.bold ?? false,
        italic: options.italic ?? false,
    };
}

export async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
    const results: R[] = [];

    for (let i = 0; i < items.length; i += limit) {
        const batch = items.slice(i, i + limit);
        const batchResults = await Promise.all(batch.map(fn));
        results.push(...batchResults);
    }

    return results;
}
