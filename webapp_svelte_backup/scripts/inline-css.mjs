/**
 * Post-build script: Inline the CSS into the HTML to eliminate render-blocking.
 * This removes the <link rel="stylesheet"> tag and replaces it with an inline <style>.
 */
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const distDir = 'dist';
const htmlPath = join(distDir, 'index.html');

let html = readFileSync(htmlPath, 'utf-8');

// Find CSS file in assets
const assetsDir = join(distDir, 'assets');
const cssFile = readdirSync(assetsDir).find(f => f.endsWith('.css'));

if (cssFile) {
  const cssContent = readFileSync(join(assetsDir, cssFile), 'utf-8');
  
  // Replace the <link> tag with inline <style>
  const linkRegex = /<link[^>]*href="[^"]*\.css"[^>]*\/?>/g;
  html = html.replace(linkRegex, `<style>${cssContent}</style>`);
  
  writeFileSync(htmlPath, html);
  console.log(`✅ Inlined ${cssFile} (${(cssContent.length / 1024).toFixed(1)} KB) into index.html`);
} else {
  console.log('⚠️ No CSS file found to inline');
}
