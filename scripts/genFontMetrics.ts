import { readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Canvas, loadImage, type CanvasRenderingContext2D } from "skia-canvas";
import { asciiAtlasLayout } from "../src/render/asciiAtlasLayout.js";

type GlyphSize = {
    trimLeft: number;
    visibleWidth: number;
}

type Sizes = {
    ascii: Record<string, GlyphSize>;
    unicode: Record<string, GlyphSize>;
}

const assetsPath = "assets";
const outputPath = "json/fontMetrics.json";

const cell_size = 16;

async function loadImageData(path: string) {
    const img = await loadImage(path);

    const canvas = new Canvas(img.width, img.height);
    const ctx = canvas.getContext('2d');

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0);

    return {
        ctx,
        width: img.width,
        height: img.height,
        scale: img.width / 256,
    }
}

function measureCell(ctx: CanvasRenderingContext2D, cellx: number, celly: number, scale: number): GlyphSize {
    const scaledCellSize = Math.round(cell_size * scale);

    const imgData = ctx.getImageData(
        cellx * scaledCellSize,
        celly * scaledCellSize,
        scaledCellSize,
        scaledCellSize
    )

    let minX = scaledCellSize;
    let maxX = -1;

    for (let i = 0; i < imgData.data.length; i += 4) {
        const alpha = imgData.data[i + 3];

        if (alpha === 0) continue;

        const pixelIndex = i / 4;
        const x = pixelIndex % scaledCellSize;

        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
    }

    if (maxX === -1) {
        return {
            trimLeft: 0,
            visibleWidth: 0
        }
    }

    return {
        trimLeft: Math.floor(minX / scale),
        visibleWidth: Math.ceil((maxX - minX + 1) / scale)
    };
}

async function generateAsciiSizes(): Promise<Record<string, GlyphSize>> {
    const { ctx, scale } = await loadImageData(join(assetsPath, "ascii.png"));

    const ascii: Record<string, GlyphSize> = {};

    for (let y = 0; y < asciiAtlasLayout.length; y++) {
        const row = asciiAtlasLayout[y]!;

        for (let x = 0; x < row.length; x++) {
            const unicode = row[x]!;

            if (unicode === "0000") continue;

            ascii[unicode] = measureCell(ctx, x, y, scale);
        }
    }

    ascii["0020"] = {
        trimLeft: 0,
        visibleWidth: 10,
    };

    return ascii;
}

async function generateUnicodeSizes(): Promise<Record<string, GlyphSize>> {
    const unicode: Record<string, GlyphSize> = {};
    const files = await readdir(assetsPath);

    const unicodePages = files.filter((file) => file.startsWith("unicode_page_") && file.endsWith(".png"));

    for (const file of unicodePages) {
        const p = file.replace("unicode_page_", "").replace(".png", "").toUpperCase();

        const { ctx, scale } = await loadImageData(join(assetsPath, file));

        for (let cellY = 0; cellY < 16; cellY++) {
            for (let cellX = 0; cellX < 16; cellX++) {
                const unicodeHex = `${p}${cellY.toString(16)}${cellX.toString(16)}`.toUpperCase().padStart(4, '0');

                const size = measureCell(ctx, cellX, cellY, scale);

                if (size.visibleWidth === 0) continue;

                unicode[unicodeHex] = size;
            }
        }
    }

    return unicode;
}

async function main() {
    const sizes: Sizes = {
        ascii: await generateAsciiSizes(),
        unicode: await generateUnicodeSizes()
    };

    await writeFile(outputPath, `${JSON.stringify(sizes, null, 2)}\n`);
    console.log("Generated fontMetrics.json");
}

await main();
