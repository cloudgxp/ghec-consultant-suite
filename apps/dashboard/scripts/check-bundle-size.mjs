import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const distDirectory = fileURLToPath(new URL('../dist/', import.meta.url));
const assetsDirectory = resolve(distDirectory, 'assets');
const indexHtml = readFileSync(resolve(distDirectory, 'index.html'), 'utf8');

const budgets = {
  largestJavaScriptBytes: 600 * 1024,
  initialJavaScriptGzipBytes: 270 * 1024,
  initialCssGzipBytes: 80 * 1024,
};

const initialAssets = new Set(
  [...indexHtml.matchAll(/(?:src|href)="([^"]+)"/g)]
    .map((match) => match[1])
    .filter((path) => path?.includes('/assets/'))
    .map((path) => basename(path)),
);

const assets = readdirSync(assetsDirectory)
  .filter((name) => name.endsWith('.js') || name.endsWith('.css'))
  .map((name) => {
    const path = resolve(assetsDirectory, name);
    const contents = readFileSync(path);
    return {
      name,
      bytes: statSync(path).size,
      gzipBytes: gzipSync(contents).byteLength,
      initial: initialAssets.has(name),
    };
  });

const javascript = assets.filter((asset) => asset.name.endsWith('.js'));
const initialJavaScript = javascript.filter((asset) => asset.initial);
const initialCss = assets.filter(
  (asset) => asset.initial && asset.name.endsWith('.css'),
);
const largestJavaScript = javascript.reduce((largest, asset) =>
  asset.bytes > largest.bytes ? asset : largest,
);
const initialJavaScriptGzipBytes = initialJavaScript.reduce(
  (total, asset) => total + asset.gzipBytes,
  0,
);
const initialCssGzipBytes = initialCss.reduce(
  (total, asset) => total + asset.gzipBytes,
  0,
);

const failures = [];
if (largestJavaScript.bytes > budgets.largestJavaScriptBytes) {
  failures.push(
    `${largestJavaScript.name} is ${formatKiB(largestJavaScript.bytes)} uncompressed; budget is ${formatKiB(budgets.largestJavaScriptBytes)}.`,
  );
}
if (initialJavaScriptGzipBytes > budgets.initialJavaScriptGzipBytes) {
  failures.push(
    `Initial JavaScript is ${formatKiB(initialJavaScriptGzipBytes)} gzip; budget is ${formatKiB(budgets.initialJavaScriptGzipBytes)}.`,
  );
}
if (initialCssGzipBytes > budgets.initialCssGzipBytes) {
  failures.push(
    `Initial CSS is ${formatKiB(initialCssGzipBytes)} gzip; budget is ${formatKiB(budgets.initialCssGzipBytes)}.`,
  );
}

const deferredExportPrefixes = [
  'export-pdf-',
  'html2canvas.',
  'index.es-',
  'purify.es-',
];
const eagerlyLoadedExportAssets = initialJavaScript.filter((asset) =>
  deferredExportPrefixes.some((prefix) => asset.name.startsWith(prefix)),
);
if (eagerlyLoadedExportAssets.length > 0) {
  failures.push(
    `PDF export dependencies must remain lazy: ${eagerlyLoadedExportAssets.map((asset) => asset.name).join(', ')}.`,
  );
}

console.log(
  `Bundle budget: largest JS ${formatKiB(largestJavaScript.bytes)} / ${formatKiB(budgets.largestJavaScriptBytes)}; initial JS gzip ${formatKiB(initialJavaScriptGzipBytes)} / ${formatKiB(budgets.initialJavaScriptGzipBytes)}; initial CSS gzip ${formatKiB(initialCssGzipBytes)} / ${formatKiB(budgets.initialCssGzipBytes)}.`,
);

if (failures.length > 0) {
  for (const failure of failures) console.error(`✖ ${failure}`);
  process.exitCode = 1;
} else {
  console.log('✔ Dashboard bundle budgets passed.');
}

function formatKiB(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}
