import fs from 'fs';
import path from 'path';

const paths = [
  path.resolve('dist/client/_redirects'),
  path.resolve('dist/_redirects')
];

paths.forEach(p => {
  if (fs.existsSync(p)) {
    fs.appendFileSync(p, '\n/admin/* /admin/index.html 200\n');
    console.log('Appended SPA rewrite to ' + p);
  }
});
