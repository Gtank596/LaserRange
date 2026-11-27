import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cacheId, precacheList, renderServiceWorker } from './renderServiceWorker.js';

const template = readFileSync(new URL('./sw.template.js', import.meta.url), 'utf8');
const files = ['index.html', 'manifest.webmanifest', 'assets/index-abc.js', 'assets/index-def.css', 'icons/icon-192.png'];

describe('precacheList', () => {
  it('stores the page as "./" and leaves out the service worker and source maps', () => {
    expect(precacheList([...files, 'sw.js', 'assets/index-abc.js.map'])).toEqual([
      './',
      'assets/index-abc.js',
      'assets/index-def.css',
      'icons/icon-192.png',
      'manifest.webmanifest',
    ]);
  });

  it('accepts Windows-style paths and drops duplicates', () => {
    expect(precacheList(['index.html', 'assets\\a.js', 'assets/a.js'])).toEqual(['./', 'assets/a.js']);
  });
});

describe('cacheId', () => {
  it('starts with the commit and changes when the files change', () => {
    const one = cacheId('947e163 · 2026-11-27 21:30 UTC', ['./', 'assets/a.js']);
    const two = cacheId('947e163 · 2026-11-27 21:30 UTC', ['./', 'assets/b.js']);
    expect(one.startsWith('947e163-')).toBe(true);
    expect(one).not.toBe(two);
    expect(cacheId('947e163 · 2026-11-27 21:30 UTC', ['./', 'assets/a.js'])).toBe(one);
  });
});

describe('renderServiceWorker', () => {
  it('fills in the build and the file list, and the result is valid JavaScript', () => {
    const output = renderServiceWorker(template, { buildId: 'abc1234 · 2026-11-27 21:30 UTC', files });
    expect(output).not.toContain('%BUILD%');
    expect(output).not.toContain('%FILES%');
    expect(output).toContain('"assets/index-abc.js"');
    expect(output).toMatch(/const BUILD = "abc1234-[a-z0-9]+";/);
    expect(() => new Function(output)).not.toThrow();
  });

  it('refuses a build with no page, and a template that has lost its placeholders', () => {
    expect(() => renderServiceWorker(template, { buildId: 'x', files: ['assets/a.js'] })).toThrow('no index.html');
    expect(() => renderServiceWorker('// nothing here', { buildId: 'x', files })).toThrow('placeholders');
  });
});
