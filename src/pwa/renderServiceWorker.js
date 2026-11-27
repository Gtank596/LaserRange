// Turns the service worker template into the sw.js that ships with a build.
// Kept free of file and browser access so it can be tested.

/**
 * The list of things to keep on the device, from the list of files in a build.
 * The page itself is stored as "./" (how it is opened), the service worker
 * never stores itself, and source maps are left out.
 * @param {string[]} files paths relative to the build folder, e.g. "assets/index-abc.js"
 * @returns {string[]} sorted, no duplicates
 */
export function precacheList(files) {
  const wanted = files
    .map((file) => file.replace(/\\/g, '/'))
    .filter((file) => file !== 'sw.js' && !file.endsWith('.map'))
    .map((file) => (file === 'index.html' ? './' : file));
  return [...new Set(wanted)].sort();
}

/**
 * A short id that changes whenever the build's files change, so two builds of
 * the same commit with different content never share a cache.
 * @param {string} buildId
 * @param {string[]} files
 */
export function cacheId(buildId, files) {
  let hash = 0;
  for (const char of `${buildId}|${files.join('|')}`) hash = (Math.imul(hash, 31) + char.codePointAt(0)) >>> 0;
  const commit = buildId.split(' ')[0].replace(/[^A-Za-z0-9]/g, '') || 'build';
  return `${commit}-${hash.toString(36)}`;
}

/**
 * @param {string} template contents of sw.template.js
 * @param {{ buildId: string, files: string[] }} build files as found in the build folder
 */
export function renderServiceWorker(template, { buildId, files }) {
  const list = precacheList(files);
  if (!list.includes('./')) throw new Error('The build has no index.html to keep for offline use.');
  if (!template.includes("'%BUILD%'") || !template.includes("['%FILES%']")) throw new Error('The service worker template has lost its placeholders.');
  return template.replace("'%BUILD%'", JSON.stringify(cacheId(buildId, list))).replace("['%FILES%']", JSON.stringify(list));
}
