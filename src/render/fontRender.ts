import { Canvas, loadImage, type CanvasRenderingContext2D } from 'skia-canvas';
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { parseMinecraftText, type MinecraftTextSegment } from './minecraftPrefix.js';
import { asciiAtlasLayout } from "./asciiAtlasLayout.js";

type GlyphMetrics = Record<string, { trimLeft?: number; visibleWidth?: number }>;
type FontImage = { canvas: Canvas; ctx: CanvasRenderingContext2D; width: number; height: number; scale: number; isUpdscaled: boolean };
type TextOptions = { color?: string; shadow?: boolean; shadowColor?: string; bold?: boolean; italic?: boolean; size?: number; hdFont?: boolean };
type TextAlign = "left" | "center" | "right";
type FillTextOptions = Pick<TextOptions, "shadow" | "size" | "hdFont"> & { align?: TextAlign };
type CharacterLayer = { x: number; y: number; color: string };
type GlyphBitmap = { pixels: { x: number, y: number }[]; width: number; height: number; scale: number; advance: number; shadowDistance: number; boldLayerCount: number };
type GlyphSource = { x: number; y: number; width: number; height: number; image: FontImage; scale: number; advance: number; shadowDistance: number; boldLayerCount: number };
type CharacterPosition = { x: number; y: number };

interface GlyphMetricsFile { ascii: GlyphMetrics; unicode: GlyphMetrics; }

export class FontRender {
    private images: Map<string, FontImage>;
    private glyphCache: Map<string, GlyphBitmap>;
    private asciiPositions: Map<string, CharacterPosition>;
    private glyphMetrics: GlyphMetricsFile | null;

    public constructor() {
        this.images = new Map();
        this.glyphCache = new Map();
        this.asciiPositions = this.createAsciiPositionMap();
        this.glyphMetrics = null;
    }

    public async loadImages(fontPath: string) {
        this.images.clear();
        this.glyphCache.clear();

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
                canvas, ctx, width: canvas.width, height: canvas.height, scale: canvas.width / 256, isUpdscaled: !file.includes("unicode_page_")
            });
        }
    }

    private drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, options: TextOptions = {}) {
        const color = options.color ?? "#ffffff";
        const shadow = options.shadow ?? false;
        const shadowColor = options.shadowColor ?? "rgba(0, 0, 0, 0.5)";
        const bold = options.bold ?? false;
        const size = options.size ?? 2;
        const italic = options.italic ?? false;
        const hdFont = options.hdFont ?? false;

        let currentX = x;

        const textOptions = { color, shadow, shadowColor, bold, italic, size, hdFont };

        for (const char of text) {
            const spacing = this.drawChar(ctx, char, currentX, y, textOptions);
            currentX += spacing;
        }

        return currentX - x;
    }

    public fillText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, options: FillTextOptions = {}) {
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
        const shadow = options.shadow ?? false;
        const shadowColor = options.shadowColor ?? "rgba(0, 0, 0, 0.5)";
        const bold = options.bold ?? false;
        const size = options.size ?? 2;
        const italic = options.italic ?? false;
        const hdFont = options.hdFont ?? false;

        const textOptions = { color, shadow, shadowColor, bold, italic, size, hdFont };
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

    private measureChar(char: string, options: Required<TextOptions>): number {
        const glyph = this.getGlyph(char, options.hdFont);
        if (!glyph) return 0;

        const drawSize = glyph.scale === 1 ? options.size / 2 : options.size;
        const boldAdvance = options.bold ? glyph.boldLayerCount : 0;

        return (glyph.advance + boldAdvance) * glyph.scale * drawSize;
    }

    private drawChar(ctx: CanvasRenderingContext2D, char: string, x: number, y: number, options: Required<TextOptions>): number {
        const glyph = this.getGlyph(char, options.hdFont);
        if (!glyph) return 0;

        const drawSize = glyph.scale === 1 ? options.size / 2 : options.size;

        const shadowOffset = glyph.shadowDistance * glyph.scale * drawSize;
        const boldOffsetX = glyph.scale * drawSize;
        const boldAdvance = options.bold ? glyph.boldLayerCount : 0;

        const layers = this.getCharacterLayers(
            options,
            shadowOffset,
            shadowOffset,
            boldOffsetX,
            glyph.boldLayerCount
        );

        for (const layer of layers) {
            this.drawGlyph(
                ctx,
                glyph,
                x + layer.x,
                y + layer.y,
                drawSize,
                layer.color,
                { italic: options.italic }
            );
        }

        return (glyph.advance + boldAdvance) * glyph.scale * drawSize;
    }

    private drawGlyph(ctx: CanvasRenderingContext2D, glyph: GlyphBitmap, x: number, y: number, drawSize: number, color: string, options: { italic: boolean }) {
        ctx.beginPath();

        for (const pixel of glyph.pixels) {
            const italicOffset = options.italic ? this.getItalicOffset(pixel.y, glyph.scale, drawSize) : 0;

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

    private getGlyph(char: string, hdFont: boolean): GlyphBitmap | null {
        const unicode = this.toUnicode(char);
        const cacheKey = `${hdFont ? "hd" : "normal"}:${unicode}`;

        const cached = this.glyphCache.get(cacheKey);
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

        this.glyphCache.set(cacheKey, glyph);
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
        const characterSize = metrics[usesAsciiAtlas ? "ascii" : "unicode"][glyphUnicode.toUpperCase()];

        const trimLeft = characterSize?.trimLeft ?? 0;
        const visibleWidth = characterSize?.visibleWidth ?? 16;

        return {
            x: (trimLeft + x * 16) * scale,
            y: y * 16 * scale,
            width: visibleWidth * scale,
            height: 16 * scale,
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
        return usesAsciiAtlas ? 2 : 1;
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
