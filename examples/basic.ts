import { Canvas } from "skia-canvas";
import { writeFile } from "node:fs/promises";
import { FontRender } from "../src/index";
import { defaultFontPath } from "../src/defaultFontPath"

const renderer = new FontRender();
await renderer.loadImages(defaultFontPath);

const canvas = new Canvas(560, 250);
const ctx = canvas.getContext("2d");

ctx.imageSmoothingEnabled = false;
ctx.fillStyle = "#000000";
ctx.fillRect(0, 0, canvas.width, canvas.height);

const text = "&bHello World!"

renderer.fillText(ctx, text, 50, 80, {
    shadow: true,
    size: 8,
    hdFont: false,   
});

const buffer = await canvas.toBuffer("png");
await writeFile("basic.png", buffer);

console.log("Generated basic.png");
