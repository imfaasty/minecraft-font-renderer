import { getMinecraftColor, getMinecraftShadowColor, type MinecraftStyle } from "./minecraftColors.js";

export type MinecraftTextSegment = MinecraftStyle & {
    text: string;
};

const format_prefixes = new Set(["\u00A7", "&"]);

export function parseMinecraftText(text: string, initialStyle: Partial<MinecraftStyle> = {}): MinecraftTextSegment[] {
    const segments: MinecraftTextSegment[] = [];

    const baseStyle = createStyle(initialStyle);
    const resetStyle = createDefaultStyle();

    let state = baseStyle;
    let currentText = "";

    function flush() {
        if (!currentText) return;

        segments.push({
            text: currentText,
            ...state,
        });

        currentText = "";
    };

    for (let i = 0; i < text.length; i++) {
        const char = text[i]!;

        if (format_prefixes.has(char) && i + 1 < text.length) {
            const code = text[i + 1]!.toLowerCase();
            const color = getMinecraftColor(code);

            if (color) {
                flush();

                state = {
                    ...resetStyle,
                    color,
                    shadowColor: getMinecraftShadowColor(color),
                };

                i++;
                continue;
            }

            if (code === "l") {
                flush();
                state = { ...state, bold: true };
                i++;
                continue;
            }

            if (code === "o") {
                flush();
                state = { ...state, italic: true };
                i++;
                continue;
            }

            if (code === "r") {
                flush();
                state = resetStyle;
                i++;
                continue;
            }
        }

        currentText += char;
    }

    flush();
    return segments;
};

function createDefaultStyle(): MinecraftStyle {
    return createStyle();
}

function createStyle(style: Partial<MinecraftStyle> = {}): MinecraftStyle {
    const color = "#FFFFFF";
    const resolvedColor = style.color ?? color;

    return {
        color: resolvedColor,
        shadowColor: style.shadowColor ?? getMinecraftShadowColor(resolvedColor),
        bold: style.bold ?? false,
        italic: style.italic ?? false,
    };
}
