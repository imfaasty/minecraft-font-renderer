import { getMinecraftColor, getMinecraftShadowColor, type MinecraftStyle } from "./minecraftColors.js";

export type MinecraftTextSegment = MinecraftStyle & {
    text: string;
};

const format_prefixes = new Set(["\u00A7", "&"]);

export function parseMinecraftText(text: string): MinecraftTextSegment[] {
    const segments: MinecraftTextSegment[] = [];

    let state = createDefaultStyle();
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
                    ...createDefaultStyle(),
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
                state = createDefaultStyle();
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
    const color = "#FFFFFF";

    return {
        color,
        shadowColor: getMinecraftShadowColor(color),
        bold: false,
        italic: false,
    };
}
