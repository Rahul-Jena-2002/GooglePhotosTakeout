import path from 'path';
import sharp from 'sharp';

const images = [
  'hero-graphic-light',
  'hero-graphic-dark',
  'hero-graphic'
];

async function main() {
  console.log('Optimizing hero images to WebP format...');
  for (const name of images) {
    const src = path.resolve(`public/${name}.png`);
    const dest = path.resolve(`public/${name}.webp`);
    
    const info = await sharp(src)
      .webp({ quality: 80 })
      .toFile(dest);
      
    console.log(`Converted public/${name}.png to WebP:`);
    console.log(`- Original Size: ${(info.size / 1024).toFixed(2)} KB`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
