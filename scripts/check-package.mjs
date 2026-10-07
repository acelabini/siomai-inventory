import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractFile, listPackage } from '@electron/asar';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageTarget = path.resolve(process.argv[2] ?? path.join(projectRoot, 'out'));
const archivePath = packageTarget.endsWith('.asar') ? packageTarget : findFile(packageTarget, 'app.asar');
assert.ok(archivePath, `No packaged app.asar was found at or below ${packageTarget}. Run npm run package first.`);

const entries = listPackage(archivePath, { isPack: false });
const normalizeEntry = (entry) => entry.replaceAll('\\', '/').replace(/^\/+/, '');
const metadataPath = entries.find((entry) => normalizeEntry(entry) === 'package.json');
assert.ok(metadataPath, 'The packaged archive has no package.json metadata.');
const metadata = JSON.parse(extractFile(archivePath, normalizeEntry(metadataPath)).toString('utf8'));
assert.equal(metadata.name, 'siomai-inventory', 'Unexpected packaged app name.');
assert.equal(metadata.productName, 'Siomai Inventory', 'Unexpected packaged product name.');
assert.match(metadata.version, /^\d+\.\d+\.\d+$/, 'Packaged version must be a semantic release version.');
assert.equal(metadata.main, '.vite/build/main.cjs', 'Unexpected packaged Electron entry point.');

const rendererHtmlPath = entries.find((entry) => /(?:^|\/)\.vite\/renderer\/main_window\/index\.html$/.test(normalizeEntry(entry)));
assert.ok(rendererHtmlPath, 'The packaged renderer HTML is missing.');
const html = extractFile(archivePath, normalizeEntry(rendererHtmlPath)).toString('utf8');
const cspTag = html.match(/<meta\b(?=[^>]*http-equiv=["']Content-Security-Policy["'])[^>]*>/is)?.[0];
const policy = cspTag?.match(/\bcontent="([^"]+)"/i)?.[1];
assert.ok(policy, 'The packaged renderer has no explicit Content Security Policy.');
for (const directive of ["default-src 'self'", "script-src 'self'", "object-src 'none'", "base-uri 'none'"]) {
  assert.ok(policy.includes(directive), `Packaged Content Security Policy is missing ${directive}.`);
}
assert.doesNotMatch(policy, /https?:|unsafe-inline|unsafe-eval/i, 'Packaged Content Security Policy permits remote or unsafe content.');

const searchable = entries
  .filter((entry) => /\.(?:html|js|cjs|mjs|json|css|map)$/i.test(entry))
  .map((entry) => extractFile(archivePath, normalizeEntry(entry)));
const productionText = Buffer.concat(searchable).toString('utf8');
assert.doesNotMatch(productionText, /https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]):\d+/i, 'A development server URL is present in the packaged app.');
assert.doesNotMatch(productionText, /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/i, 'A private signing key is present in the packaged app.');
assert.ok(!entries.some((entry) => /\.(?:p12|pfx|p8|keychain)$/i.test(entry)), 'A signing credential file is present in the packaged app.');

const secretEnvironmentNames = [
  'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_CERTIFICATE_PASSWORD',
  'APPLE_CERTIFICATE_P12_BASE64', 'APPLE_API_KEY_PRIVATE_KEY', 'CSC_KEY_PASSWORD',
];
for (const name of secretEnvironmentNames) {
  const secret = process.env[name];
  if (secret && secret.length >= 6) {
    assert.ok(!productionText.includes(secret), `A value from ${name} was found in packaged text.`);
    for (const entry of entries) {
      assert.ok(!extractFile(archivePath, normalizeEntry(entry)).includes(Buffer.from(secret)), `A value from ${name} was found in ${entry}.`);
    }
  }
}

const bundlePath = packageTarget.endsWith('.app') ? packageTarget : findAppBundle(packageTarget);
if (bundlePath) {
  const plistPath = path.join(bundlePath, 'Contents', 'Info.plist');
  assert.ok(statSync(plistPath).isFile(), 'The macOS app bundle is missing Info.plist.');
  const plist = readFileSync(plistPath, 'utf8');
  assert.ok(plist.includes('<string>com.siomai.inventory</string>'), 'The macOS bundle identifier is incorrect.');
  assert.ok(plist.includes('<string>13.0.0</string>'), 'The macOS minimum version is not 13.0.0.');
  const iconFile = plist.match(/<key>CFBundleIconFile<\/key>\s*<string>([^<]+)<\/string>/)?.[1];
  assert.ok(iconFile, 'The macOS bundle does not declare an app icon.');
  const iconPath = path.join(bundlePath, 'Contents', 'Resources', iconFile);
  assert.equal(readFileSync(iconPath).subarray(0, 4).toString('ascii'), 'icns', 'The packaged macOS icon is invalid.');
  console.log('PASS: macOS bundle metadata and packaged ICNS icon are valid.');
} else {
  console.log('SKIP: Info.plist, macOS bundle identifier, deployment target, and installed ICNS are checked only on macOS.');
}

console.log(`PASS: checked ${entries.length} packaged archive entries at ${archivePath}`);

function findFile(root, name) {
  if (!statSync(root, { throwIfNoEntry: false })) return undefined;
  const items = readdirSync(root, { withFileTypes: true });
  for (const item of items) {
    const fullPath = path.join(root, item.name);
    if (item.isFile() && item.name === name) return fullPath;
    if (item.isDirectory()) {
      const match = findFile(fullPath, name);
      if (match) return match;
    }
  }
  return undefined;
}

function findAppBundle(root) {
  if (!statSync(root, { throwIfNoEntry: false })?.isDirectory()) return undefined;
  const items = readdirSync(root, { withFileTypes: true });
  for (const item of items) {
    const fullPath = path.join(root, item.name);
    if (item.isDirectory() && item.name.endsWith('.app')) return fullPath;
    if (item.isDirectory()) {
      const match = findAppBundle(fullPath);
      if (match) return match;
    }
  }
  return undefined;
}
