import { Canvas, loadImage, type CanvasRenderingContext2D } from 'skia-canvas';
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { parseMinecraftText, parseMinecraftTextLines, type MinecraftTextSegment } from './minecraftPrefix.js';
import { asciiAtlasLayout } from "./asciiAtlasLayout.js";
import { validateText, validateFillTextOptions, warnOddSize } from "../validation.js";
import type { TextOptions, FillTextOptions } from "../types.js";

type GlyphMetrics = Record<string, { trimLeft?: number; visibleWidth?: number }>;
type FontImage = { canvas: Canvas; ctx: CanvasRenderingContext2D; width: number; height: number; scale: number };
type CharacterLayer = { x: number; y: number; color: string };
type GlyphBitmap = { pixels: { x: number, y: number }[]; width: number; height: number; scale: number; advance: number; shadowDistance: number; boldLayerCount: number };
type GlyphSource = { x: number; y: number; width: number; height: number; image: FontImage; scale: number; advance: number; shadowDistance: number; boldLayerCount: number };
type CharacterPosition = { x: number; y: number };

interface GlyphMetricsFile { ascii: GlyphMetrics; asciiHd: GlyphMetrics; unicode: GlyphMetrics; }

const GLYPH_CELL_SIZE = 16;
const LINE_SPACING = 2;

const UNDERLINE_ROW = 16;
const STRIKETHROUGH_ROW = 6;
const LINE_THICKNESS = 2;
const DECORATION_PADDING = 2;

const ASCII_SHADOW_DISTANCE = 2;
const UNICODE_SHADOW_DISTANCE = 1;
const MAX_SHADOW_DISTANCE = Math.max(ASCII_SHADOW_DISTANCE, UNICODE_SHADOW_DISTANCE);

export class FontRender {
    private images: Map<string, FontImage>;
    private glyphCache: Map<string, GlyphBitmap>;
    private bitmapCache: Map<string, Canvas>;
    private asciiPositions: Map<string, CharacterPosition>;
    private glyphMetrics: GlyphMetricsFile | null;

    public constructor() {
        this.images = new Map();
        this.glyphCache = new Map();
        this.bitmapCache = new Map();
        this.asciiPositions = this.createAsciiPositionMap();
        this.glyphMetrics = null;
    }

    public async loadImages(fontPath: string) {
        this.images.clear();
        this.glyphCache.clear();
        this.bitmapCache.clear();

        await this.loadMetrics(fontPath);

        const files = await readdir(fontPath);
        const p = files.filter((file) => file.endsWith(".png"));

        for (const file of p) {
            const img = await loadImage(join(fontPath, file));

            const targetWidth = file.includes("unicode_page_") ? img.width : 256;
            const targetHeight = file.includes("unicode_page_") ? img.height : 256;

            const canvas = new Canvas(targetWidth, targetHeight);
            const ctx = canvas.getContext("2d");

            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

            this.images.set(file.replace("unicode_page_", "").replace(".png", ""), {
                canvas, ctx, width: canvas.width, height: canvas.height, scale: canvas.width / 256
            });
        }
    }

    private drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, options: TextOptions = {}) {
        const color = options.color ?? "#ffffff";
        const shadow = options.shadow ?? true;
        const shadowColor = options.shadowColor ?? "rgba(0, 0, 0, 0.5)";
        const bold = options.bold ?? false;
        const underline = options.underline ?? false;
        const strikethrough = options.strikethrough ?? false;
        const size = options.size ?? 2;
        const italic = options.italic ?? false;
        const hdFont = options.hdFont ?? false;

        const chars = Array.from(text);
        let currentX = Math.round(x);

        const textOptions = { color, shadow, shadowColor, bold, underline, strikethrough, italic, size, hdFont };

        chars.forEach((char, index) => {
            const isFirst = index === 0;
            const isLast = index === chars.length - 1;
            const spacing = this.drawChar(ctx, char, currentX, y, textOptions, isFirst, isLast)
            currentX += Math.round(spacing);
        })

        return currentX - Math.round(x);
    }

    public fillText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, options: FillTextOptions = {}) {
        validateText(text, "fillText");
        validateFillTextOptions(options, "fillText");
        warnOddSize(options.size, "fillText");

        ctx.imageSmoothingEnabled = false;

        if (text.includes("\n")) {
            return this.fillMultilineText(ctx, text, x, y, options);
        }

        const segments = parseMinecraftText(text);

        let currentX = this.getAlignedStartX(x, segments, options);
        const startX = currentX;

        for (const segment of segments) {
            const width = this.drawText(ctx, segment.text, currentX, y, {
                ...options,
                color: segment.color,
                shadowColor: segment.shadowColor,
                bold: segment.bold,
                italic: segment.italic,
                underline: segment.underline,
                strikethrough: segment.strikethrough,
            });
            currentX += width;
        }

        return currentX - startX;
    }

    private async loadMetrics(fontPath: string) {
        const metricsPath = join(fontPath, "../json/fontMetrics.json");
        const json = await readFile(metricsPath, "utf8");

        this.glyphMetrics = JSON.parse(json) as GlyphMetricsFile;
    }

    private getMetrics() {
        if (!this.glyphMetrics) {
            throw new Error("Font metrics are not loaded. Call loadImages() before rendering text.");
        }

        return this.glyphMetrics;
    }

    private measureText(text: string, options: TextOptions = {}): number {
        const color = options.color ?? "#ffffff";
        const shadow = options.shadow ?? true;
        const shadowColor = options.shadowColor ?? "rgba(0, 0, 0, 0.5)";
        const bold = options.bold ?? false;
        const underline = options.underline ?? false;
        const strikethrough = options.strikethrough ?? false;
        const size = options.size ?? 2;
        const italic = options.italic ?? false;
        const hdFont = options.hdFont ?? false;

        const textOptions = { color, shadow, shadowColor, bold, underline, strikethrough, italic, size, hdFont };
        let width = 0;

        for (const char of text) {
            width += this.measureChar(char, textOptions);
        }

        return width;
    }

    private measureSegments(segments: MinecraftTextSegment[], options: FillTextOptions): number {
        let width = 0;

        for (const segment of segments) {
            width += this.measureText(segment.text, {
                ...options,
                color: segment.color,
                shadowColor: segment.shadowColor,
                bold: segment.bold,
                italic: segment.italic,
                underline: segment.underline,
                strikethrough: segment.strikethrough,
            });
        }

        return width;
    }

    private getAlignedStartX(x: number, segments: MinecraftTextSegment[], options: FillTextOptions): number {
        const align = options.align ?? "left";

        if (align === "left") return x;

        const width = this.measureSegments(segments, options);

        if (align === "center") return x - width / 2;
        if (align === "right") return x - width;

        return x;
    }

    private getCharRenderMetrics(glyph: GlyphBitmap, options: Required<TextOptions>) {
        const drawSize = glyph.scale === 1 ? options.size / 2 : options.size;
        const boldAdvance = options.bold ? glyph.boldLayerCount : 0;
        const shadowOffset = glyph.shadowDistance * glyph.scale * drawSize;
        const boldOffsetX = glyph.scale * drawSize;
        const advance = (glyph.advance + boldAdvance) * glyph.scale * drawSize;

        return { drawSize, shadowOffset, boldOffsetX, advance };
    }

    private measureChar(char: string, options: Required<TextOptions>): number {
        const glyphKey = this.getGlyphKey(char, options.hdFont);
        const glyph = this.getGlyph(char, options.hdFont, glyphKey);
        if (!glyph) return 0;

        return this.getCharRenderMetrics(glyph, options).advance;
    }

    private drawChar(ctx: CanvasRenderingContext2D, char: string, x: number, y: number, options: Required<TextOptions>, isFirst: boolean, isLast: boolean): number {
        const glyphKey = this.getGlyphKey(char, options.hdFont);
        const glyph = this.getGlyph(char, options.hdFont, glyphKey);
        if (!glyph) return 0;

        const { drawSize, shadowOffset, boldOffsetX, advance } = this.getCharRenderMetrics(glyph, options);
        const baseX = Math.round(x);
        const baseY = Math.round(y);
        const layers = this.getCharacterLayers(options, shadowOffset, shadowOffset, boldOffsetX, glyph.boldLayerCount);

        if (options.strikethrough && options.shadow) {
            this.drawTextDecorations(ctx, { ...options, underline: false }, [{ x: shadowOffset, y: shadowOffset, color: options.shadowColor }], baseX, baseY, drawSize, advance, isFirst, isLast);
        }

        for (const layer of layers) {
            this.drawGlyph(ctx, glyphKey, glyph, baseX + Math.round(layer.x), baseY + Math.round(layer.y), drawSize, layer.color, { italic: options.italic });
        }

        if (options.strikethrough) {
            this.drawTextDecorations(ctx, { ...options, underline: false }, [{ x: 0, y: 0, color: options.color }], baseX, baseY, drawSize, advance, isFirst, isLast);
        }

        if (options.underline) {
            const decorationLayers = this.getCharacterLayers(options, shadowOffset, shadowOffset, boldOffsetX, glyph.boldLayerCount);
            this.drawTextDecorations(ctx, { ...options, strikethrough: false }, decorationLayers, baseX, baseY, drawSize, advance, isFirst, isLast);
        }

        return advance;
    }

    private drawTextDecorations(ctx: CanvasRenderingContext2D, options: Required<TextOptions>, layers: CharacterLayer[], baseX: number, baseY: number, drawSize: number, advance: number, isFirst: boolean, isLast: boolean) {
        const thickness = Math.max(1, Math.round(LINE_THICKNESS * drawSize));

        const padding = Math.round(DECORATION_PADDING * drawSize);
        const startExtra = isFirst ? padding : 0;
        const endExtra = isLast ? padding : 0;
        const underlineWidth = Math.max(1, Math.round(advance) + startExtra + endExtra);
        const strikethroughWidth = Math.max(1, Math.round(advance));

        for (const layer of layers) {
            const baseLayerX = baseX + Math.round(layer.x);
            const layerY = baseY + Math.round(layer.y);

            if (options.underline) {
                this.drawDecorationLine(ctx, baseLayerX - startExtra, layerY, underlineWidth, thickness, drawSize, UNDERLINE_ROW, layer.color);
            }
            if (options.strikethrough) {
                this.drawDecorationLine(ctx, baseLayerX, layerY, strikethroughWidth, thickness, drawSize, STRIKETHROUGH_ROW, layer.color);
            }
        }
    }

    private drawDecorationLine(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, thickness: number, drawSize: number, row: number, color: string) {
        const lineY = y + Math.round(row * drawSize);
        ctx.fillStyle = color;
        ctx.fillRect(x, lineY, width, thickness);
    }

    private getSegmentsDecorationHeight(segments: MinecraftTextSegment[], options: FillTextOptions): number {
        const drawSize = this.getDrawSize(options);
        const thickness = Math.max(1, Math.round(LINE_THICKNESS * drawSize));
        const shadow = options.shadow ?? true;
        const shadowOffset = shadow ? MAX_SHADOW_DISTANCE * drawSize : 0;

        let height = GLYPH_CELL_SIZE * drawSize;

        for (const segment of segments) {
            if (segment.underline) {
                height = Math.max(
                    height,
                    UNDERLINE_ROW * drawSize + thickness,
                    UNDERLINE_ROW * drawSize + shadowOffset + thickness
                );
            }

            if (segment.strikethrough) {
                height = Math.max(
                    height,
                    STRIKETHROUGH_ROW * drawSize + thickness,
                    STRIKETHROUGH_ROW * drawSize + shadowOffset + thickness
                );
            }
        }

        return height;
    }

    private fillMultilineText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, options: FillTextOptions): number {
        const lines = parseMinecraftTextLines(text);

        let maxWidth = 0;
        let currentY = y;

        for (const segments of lines) {
            let currentX = this.getAlignedStartX(x, segments, options);
            const startX = currentX;

            for (const segment of segments) {
                const width = this.drawText(ctx, segment.text, currentX, currentY, {
                    ...options,
                    color: segment.color,
                    shadowColor: segment.shadowColor,
                    bold: segment.bold,
                    italic: segment.italic,
                    underline: segment.underline,
                    strikethrough: segment.strikethrough,
                });

                currentX += width;
            }

            maxWidth = Math.max(maxWidth, currentX - startX);
            currentY += this.getLineAdvanceHeight(segments, options);
        }

        return maxWidth;
    }

    private getGlyphKey(char: string, hdFont: boolean): string {
        const unicode = this.toUnicode(char);
        return `${hdFont ? "hd" : "normal"}:${unicode}`;
    }

    private getLineAdvanceHeight(segments: MinecraftTextSegment[], options: FillTextOptions): number {
        const decorationHeight = this.getSegmentsDecorationHeight(segments, options);
        const drawSize = this.getDrawSize(options);

        return decorationHeight + LINE_SPACING * drawSize;
    }

    private drawGlyph(ctx: CanvasRenderingContext2D, glyphKey: string, glyph: GlyphBitmap, x: number, y: number, drawSize: number, color: string, options: { italic: boolean }) {
        if (options.italic) {
            this.drawGlyphVector(ctx, glyph, x, y, drawSize, color);
            return;
        }

        const bitmap = this.getGlyphBitmap(glyphKey, glyph, drawSize, color);
        ctx.drawImage(bitmap, x, y);
    }

    private drawGlyphVector(ctx: CanvasRenderingContext2D, glyph: GlyphBitmap, x: number, y: number, drawSize: number, color: string) {
        ctx.beginPath();

        for (const pixel of glyph.pixels) {
            const italicOffset = this.getItalicOffset(pixel.y, glyph.scale, drawSize);

            this.addPixelRect(
                ctx,
                x + italicOffset + pixel.x * drawSize,
                y + pixel.y * drawSize,
                drawSize
            );
        }

        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
    }

    private getCharacterLayers(options: Required<TextOptions>, shadowOffsetX: number, shadowOffsetY: number, boldOffsetX: number, boldPasses: number): CharacterLayer[] {
        const layers: CharacterLayer[] = [];

        if (options.shadow) {
            layers.push({
                x: shadowOffsetX,
                y: shadowOffsetY,
                color: options.shadowColor,
            });

            if (options.bold) {
                for (let pass = 1; pass <= boldPasses; pass++) {
                    layers.push({
                        x: shadowOffsetX + boldOffsetX * pass,
                        y: shadowOffsetY,
                        color: options.shadowColor,
                    });
                }
            }
        }

        layers.push({
            x: 0,
            y: 0,
            color: options.color,
        });

        if (options.bold) {
            for (let pass = 1; pass <= boldPasses; pass++) {
                layers.push({
                    x: boldOffsetX * pass,
                    y: 0,
                    color: options.color,
                });
            }
        }

        return layers;
    }

    private getGlyphBitmap(glyphKey: string, glyph: GlyphBitmap, drawSize: number, color: string): Canvas {
        const key = `${glyphKey}:${drawSize}:${color}`;
        const cached = this.bitmapCache.get(key);
        if (cached) return cached;

        const w = Math.ceil(glyph.width * drawSize) + 1;
        const h = Math.ceil(glyph.height * drawSize) + 1;
        const canvas = new Canvas(w, h);
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.fillStyle = color;

        for (const pixel of glyph.pixels) {
            ctx.fillRect(
                Math.round(pixel.x * drawSize),
                Math.round(pixel.y * drawSize),
                Math.ceil(drawSize),
                Math.ceil(drawSize)
            );
        }

        this.bitmapCache.set(key, canvas);
        return canvas;
    }

    private getGlyph(char: string, hdFont: boolean, glyphKey: string): GlyphBitmap | null {
        const cached = this.glyphCache.get(glyphKey);
        if (cached) return cached;

        const source = this.resolveGlyphSource(char, hdFont);
        if (!source) return null;

        const { x, y, width, height, image, scale } = source;
        const pixels: { x: number; y: number }[] = [];

        if (width > 0 && height > 0) {
            const imageData = image.ctx.getImageData(x, y, width, height);

            for (let i = 0; i < imageData.data.length; i += 4) {
                if (imageData.data[i + 3] === 0) continue;

                pixels.push({
                    x: (i / 4) % width,
                    y: Math.floor(i / 4 / width),
                });
            }
        }

        const glyph = {
            pixels,
            width,
            height,
            scale,
            advance: source.advance,
            shadowDistance: source.shadowDistance,
            boldLayerCount: source.boldLayerCount
        };

        this.glyphCache.set(glyphKey, glyph);
        return glyph;
    }

    private resolveGlyphSource(char: string, hdFont: boolean): GlyphSource | null {
        const unicode = this.toUnicode(char);
        const glyphUnicode = unicode;

        const usesAsciiAtlas = this.hasAsciiGlyph(glyphUnicode);
        const image = this.getAtlas(glyphUnicode, usesAsciiAtlas, hdFont);

        if (!image) return null;

        const location = this.getCharacterIndexLocation(glyphUnicode, usesAsciiAtlas);
        if (!location) return null;

        const { x, y } = location;
        const scale = image.scale;

        const metrics = this.getMetrics();
        const metricsKey = usesAsciiAtlas ? hdFont ? "asciiHd" : "ascii" : "unicode";
        const characterSize = metrics[metricsKey]?.[glyphUnicode.toUpperCase()];

        const trimLeft = characterSize?.trimLeft ?? 0;
        const visibleWidth = characterSize?.visibleWidth ?? GLYPH_CELL_SIZE;

        return {
            x: (trimLeft + x * GLYPH_CELL_SIZE) * scale,
            y: y * GLYPH_CELL_SIZE * scale,
            width: visibleWidth * scale,
            height: GLYPH_CELL_SIZE * scale,
            image,
            scale,
            advance: this.getGlyphAdvance(char, visibleWidth),
            shadowDistance: this.getShadowDistance(usesAsciiAtlas),
            boldLayerCount: this.getBoldLayerCount(usesAsciiAtlas)
        }
    }

    private getAtlas(unicode: string, usesAsciiAtlas: boolean, hdFont: boolean) {

        if (usesAsciiAtlas) {
            return this.images.get(hdFont ? "ascii_hd" : "ascii");
        }

        return this.images.get(`${unicode[0]}${unicode[1]}`);
    }

    private getCharacterIndexLocation(glyphUnicode: string, usesAsciiAtlas: boolean) {

        if (usesAsciiAtlas) {
            return this.getAsciiPosition(glyphUnicode);
        }

        return {
            x: Number.parseInt(glyphUnicode[3]!, 16),
            y: Number.parseInt(glyphUnicode[2]!, 16),
        }
    }

    private getAsciiPosition(unicode: string): CharacterPosition {
        return this.asciiPositions.get(unicode.toUpperCase()) ?? { x: 0, y: 0 };
    }

    private createAsciiPositionMap(): Map<string, CharacterPosition> {
        const map = new Map<string, CharacterPosition>();

        for (let y = 0; y < asciiAtlasLayout.length; y++) {
            const row = asciiAtlasLayout[y]!;

            for (let x = 0; x < row.length; x++) {
                const unicode = row[x]!;

                if (unicode !== "0000") {
                    map.set(unicode, { x, y });
                }
            }
        }

        return map;
    }

    public getTextSize(text: string, options: FillTextOptions = {}): { width: number; height: number } {
        validateText(text, "getTextSize");
        validateFillTextOptions(options, "getTextSize");

        if (text.includes("\n")) {
            return this.getMultilineTextSize(text, options);
        }

        const segments = parseMinecraftText(text);
        const width = this.measureSegments(segments, options);
        const height = this.getSegmentsDecorationHeight(segments, options);

        return { width, height };
    }

    private getMultilineTextSize(text: string, options: FillTextOptions): { width: number; height: number } {
        const lines = parseMinecraftTextLines(text);

        let maxWidth = 0;
        let height = 0;

        lines.forEach((segments, index) => {
            maxWidth = Math.max(maxWidth, this.measureSegments(segments, options));

            if (index === lines.length - 1) {
                height += this.getSegmentsDecorationHeight(segments, options);
            } else {
                height += this.getLineAdvanceHeight(segments, options);
            }
        });

        return { width: maxWidth, height };
    }

    private getDrawSize(options: Pick<TextOptions, "size">): number {
        const size = options.size ?? 2;
        return size / 2;
    }

    private hasAsciiGlyph(unicode: string) {
        return unicode.toUpperCase() in this.getMetrics().ascii;
    }

    private toUnicode(char: string) {
        return (char.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0");
    }

    private getGlyphAdvance(char: string, visibleWidth: number) {
        if (char === " ") return 8;

        return visibleWidth + 2;
    }

    private getShadowDistance(usesAsciiAtlas: boolean) {
        return usesAsciiAtlas ? ASCII_SHADOW_DISTANCE : UNICODE_SHADOW_DISTANCE;
    }

    private getBoldLayerCount(usesAsciiAtlas: boolean) {
        return usesAsciiAtlas ? 2 : 1;
    }

    private addPixelRect(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
        ctx.moveTo(x, y);
        ctx.lineTo(x + size, y);
        ctx.lineTo(x + size, y + size);
        ctx.lineTo(x, y + size);
        ctx.lineTo(x, y);
    }

    private getItalicOffset(pixelY: number, scale: number, drawSize: number) {
        const row = Math.floor(pixelY / scale);

        const topOffset = 2;
        const bottomOffset = -2;
        const progress = row / 15;

        const offset = Math.round(
            topOffset + (bottomOffset - topOffset) * progress
        );

        return offset * scale * drawSize;
    }
}
