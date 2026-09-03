import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const outputDir = path.join(projectRoot, 'qa');
const url = process.env.QA_URL ?? 'http://localhost:3000/';

await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: edgePath,
  headless: true,
});

const viewports = [
  { name: 'desktop', width: 1440, height: 960 },
  { name: 'mobile', width: 390, height: 840 },
];

const results = [];

try {
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport });
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { state: 'attached' });
    await page.waitForTimeout(1600);

    const canvasStats = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return { found: false };

      const rect = canvas.getBoundingClientRect();
      const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
      if (!gl) {
        return {
          found: true,
          hasWebgl: false,
          width: rect.width,
          height: rect.height,
        };
      }

      const width = gl.drawingBufferWidth;
      const height = gl.drawingBufferHeight;
      const pixels = new Uint8Array(width * height * 4);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

      let litPixels = 0;
      let sampledPixels = 0;
      const stride = Math.max(4, Math.floor(pixels.length / 10000 / 4) * 4);
      for (let index = 0; index < pixels.length; index += stride) {
        sampledPixels += 1;
        const value = pixels[index] + pixels[index + 1] + pixels[index + 2];
        if (value > 28) litPixels += 1;
      }

      return {
        found: true,
        hasWebgl: true,
        width: rect.width,
        height: rect.height,
        drawingBufferWidth: width,
        drawingBufferHeight: height,
        litPixelRatio: litPixels / sampledPixels,
      };
    });

    await page.screenshot({
      path: path.join(outputDir, `${viewport.name}.png`),
      fullPage: true,
    });

    results.push({ viewport, canvasStats });
    await page.close();
  }
} finally {
  await browser.close();
}

for (const result of results) {
  const stats = result.canvasStats;
  if (!stats.found || !stats.hasWebgl) {
    throw new Error(`${result.viewport.name}: WebGL canvas was not available`);
  }
  if (stats.width < 280 || stats.height < 360) {
    throw new Error(`${result.viewport.name}: canvas is too small`);
  }
  if (stats.litPixelRatio < 0.02) {
    throw new Error(`${result.viewport.name}: canvas appears blank`);
  }
}

console.table(
  results.map((result) => ({
    viewport: result.viewport.name,
    cssSize: `${Math.round(result.canvasStats.width)}x${Math.round(result.canvasStats.height)}`,
    bufferSize: `${result.canvasStats.drawingBufferWidth}x${result.canvasStats.drawingBufferHeight}`,
    litPixelRatio: result.canvasStats.litPixelRatio.toFixed(3),
  })),
);
