export type MinecraftStyle = {
    color: string;
    shadowColor: string;
    bold: boolean;
    italic: boolean;
};

export type MinecraftText = MinecraftStyle & {
    text: string;
};

export const minecraftColors = [
    { code: "0", hex: "#000000" },
    { code: "1", hex: "#0000AA" },
    { code: "2", hex: "#00AA00" },
    { code: "3", hex: "#00AAAA" },
    { code: "4", hex: "#AA0000" },
    { code: "5", hex: "#AA00AA" },
    { code: "6", hex: "#FFAA00" },
    { code: "7", hex: "#AAAAAA" },
    { code: "8", hex: "#555555" },
    { code: "9", hex: "#5555FF" },
    { code: "a", hex: "#55FF55" },
    { code: "b", hex: "#55FFFF" },
    { code: "c", hex: "#FF5555" },
    { code: "d", hex: "#FF55FF" },
    { code: "e", hex: "#FFFF55" },
    { code: "f", hex: "#FFFFFF" },
] as const;

export function getMinecraftShadowColor(hex: string): string {
    const normalized = hex.replace("#", "");

    const r = Number.parseInt(normalized.slice(0, 2), 16);
    const g = Number.parseInt(normalized.slice(2, 4), 16);
    const b = Number.parseInt(normalized.slice(4, 6), 16);

    const shadowR = Math.floor(r / 4);
    const shadowG = Math.floor(g / 4);
    const shadowB = Math.floor(b / 4);

    return `#${toHex(shadowR)}${toHex(shadowG)}${toHex(shadowB)}`
};

export function getMinecraftColor(code: string): string | null {
    const color = minecraftColors.find(
        (color) => color.code === code.toLowerCase()
    );

    return color?.hex ?? null;
};

function toHex(value: number): string {
    return value.toString(16).padStart(2, "0").toUpperCase();
};

