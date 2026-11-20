import fs from 'fs';
import path from 'path';

const redirectsFile = path.resolve('dist/client/_redirects');
const adminRewrite = '/admin/* /admin.html 200';

if (!fs.existsSync(redirectsFile)) {
  throw new Error('Missing dist/client/_redirects in the Cloudflare Worker assets.');
}

const redirects = fs.readFileSync(redirectsFile, 'utf8');
if (!redirects.split(/\r?\n/).some(line => line.trim() === adminRewrite)) {
  fs.appendFileSync(redirectsFile, `\n${adminRewrite}\n`);
}
