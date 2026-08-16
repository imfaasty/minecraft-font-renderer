import type { FillTextOptions } from "./types.js";

export const LIBRARY_PREFIX = "[minecraft-font-renderer]";

export function warnOddSize(size: number | undefined, method: string): void {
    if (size !== undefined && size % 2 !== 0) {
        console.warn(`${LIBRARY_PREFIX} ${method}: an odd size can result in irregular pixel spacing. Use an even value.`);
    }
}

export function validateText(text: unknown, method: string): asserts text is string {
    if (typeof text !== "string") {
        throw new TypeError(`${LIBRARY_PREFIX} ${method}: expected text to be a string, received ${typeof text}`);
    }
}

export function validateFillTextOptions(options: unknown, method: string): asserts options is FillTextOptions {
    if (typeof options !== "object" || options === null) {
        throw new TypeError(`${LIBRARY_PREFIX} ${method}: expected options to be an object, received ${typeof options}`);
    }

    const opts = options as Record<string, unknown>;

    if (opts.size !== undefined && (typeof opts.size !== "number" || !Number.isFinite(opts.size) || opts.size <= 0)) {
        throw new TypeError(`${LIBRARY_PREFIX} ${method}: expected options.size to be a positive number, received ${opts.size}`);
    }

    if (opts.shadow !== undefined && typeof opts.shadow !== "boolean") {
        throw new TypeError(`${LIBRARY_PREFIX} ${method}: expected options.shadow to be a boolean, received ${typeof opts.shadow}`);
    }

    if (opts.hdFont !== undefined && typeof opts.hdFont !== "boolean") {
        throw new TypeError(`${LIBRARY_PREFIX} ${method}: expected options.hdFont to be a boolean, received ${typeof opts.hdFont}`);
    }

    if (opts.align !== undefined && !["left", "center", "right"].includes(opts.align as string)) {
        throw new TypeError(`${LIBRARY_PREFIX} ${method}: expected options.align to be "left", "center", or "right", received ${JSON.stringify(opts.align)}`);
    }
}