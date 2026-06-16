import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const svgPath = path.resolve('public/favicon.svg');
const publicDir = path.resolve('public');

const sizes = {
  'favicon-16x16.png': 16,
  'favicon-32x32.png': 32,
  'favicon-48x48.png': 48,
  'favicon-96x96.png': 96,
  'favicon-192x192.png': 192,
  'apple-touch-icon.png': 180
};

async function main() {
  console.log('Generating PNG favicons from SVG...');
  for (const [filename, size] of Object.entries(sizes)) {
    const destPath = path.join(publicDir, filename);
    await sharp(svgPath)
      .resize(size, size)
      .png()
      .toFile(destPath);
    console.log(`Generated ${filename} (${size}x${size})`);
  }
  console.log('Done generating PNG favicons!');
}

main().catch(err => {
  console.error('Error generating favicons:', err);
  process.exit(1);
});
