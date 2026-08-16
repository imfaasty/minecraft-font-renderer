export type TextOptions = { color?: string; shadow?: boolean; shadowColor?: string; bold?: boolean; italic?: boolean; size?: number; hdFont?: boolean; underline?: boolean; strikethrough?: boolean; };
export type TextAlign = "left" | "center" | "right";
export type FillTextOptions = Pick<TextOptions, "shadow" | "size" | "hdFont"> & { align?: TextAlign };