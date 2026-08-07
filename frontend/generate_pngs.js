import fs from 'fs';
import path from 'path';
import { Resvg } from '@resvg/resvg-js';

// SVG matching login icon EXACTLY: Shield inside maroon box with border and shadow
const createSvg = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="128" fill="#800000" />
  <rect x="24" y="24" width="464" height="464" rx="104" fill="none" stroke="#ffffff" stroke-opacity="0.25" stroke-width="12" />
  <g transform="translate(0, 10)">
    <!-- Shield Icon matching Lucide Shield -->
    <path d="M256 90 C340 90, 390 110, 410 130 C410 260, 370 365, 256 420 C142 365, 102 260, 102 130 C122 110, 172 90, 256 90 Z" 
          fill="none" 
          stroke="#ffffff" 
          stroke-width="32" 
          stroke-linecap="round" 
          stroke-linejoin="round" />
  </g>
</svg>`;

const publicDir = './public';

const generatePng = (size, filename) => {
  const svg = createSvg(size);
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: size },
  });
  const pngData = resvg.render();
  const pngBuffer = pngData.asPng();
  fs.writeFileSync(path.join(publicDir, filename), pngBuffer);
  console.log(`Generated ${filename} (${size}x${size})`);
};

try {
  generatePng(192, 'pwa-192x192.png');
  generatePng(512, 'pwa-512x512.png');
  generatePng(180, 'apple-touch-icon.png');
  generatePng(512, 'maskable-icon-512x512.png');
  generatePng(64, 'favicon.png');
  console.log("All PNG icons created successfully!");
} catch (e) {
  console.error("Error generating PNGs:", e);
}
