const fs = require("fs");
const path = require("path");

const sizes = [16, 32, 48, 128];

function generatePNG(size) {
  try {
    const { createCanvas } = require("canvas");
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#1f6feb";
    const r = size * 0.2;
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.lineTo(size - r, 0);
    ctx.quadraticCurveTo(size, 0, size, r);
    ctx.lineTo(size, size - r);
    ctx.quadraticCurveTo(size, size, size - r, size);
    ctx.lineTo(r, size);
    ctx.quadraticCurveTo(0, size, 0, size - r);
    ctx.lineTo(0, r);
    ctx.quadraticCurveTo(0, 0, r, 0);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "white";
    ctx.lineWidth = Math.max(1, size * 0.1);
    ctx.lineCap = "round";

    const margin = size * 0.25;
    const lineYs = [0.35, 0.5, 0.65];
    lineYs.forEach(y => {
      ctx.beginPath();
      ctx.moveTo(margin, size * y);
      ctx.lineTo(size - margin, size * y);
      ctx.stroke();
    });

    return canvas.toBuffer("image/png");
  } catch (e) {
    return null;
  }
}

const iconsDir = path.join(__dirname, "icons");
if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir, { recursive: true });

let canvasAvailable = false;
try {
  require("canvas");
  canvasAvailable = true;
} catch (e) {}

if (canvasAvailable) {
  sizes.forEach(size => {
    const buf = generatePNG(size);
    if (buf) {
      fs.writeFileSync(path.join(iconsDir, `icon${size}.png`), buf);
      console.log(`Generated icon${size}.png`);
    }
  });
} else {
  console.log("Module 'canvas' not found. Generating minimal placeholder icons...");
  const MINIMAL_PNG_1x1 = Buffer.from(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6260000000000200010e21bc330000000049454e44ae426082",
    "hex"
  );
  sizes.forEach(size => {
    fs.writeFileSync(path.join(iconsDir, `icon${size}.png`), MINIMAL_PNG_1x1);
    console.log(`Generated placeholder icon${size}.png`);
  });
  console.log("\nTo generate real icons, run:");
  console.log("  npm install canvas");
  console.log("  node generate-icons.js");
}
