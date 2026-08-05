#!/usr/bin/env node

/*
    website-media-downloader - A versatile tool to detect and download videos, music, and streams from almost any website.
    Copyright (C) 2026 anpa26

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

/*
    Build script for Website Media Downloader
    Builds separate Chrome and Firefox extension packages from shared source.

    Usage:
        node src/build.js chrome      - Build Chrome extension
        node src/build.js firefox     - Build Firefox extension
        node src/build.js all         - Build both (default)
        node src/build.js clean       - Remove build outputs
*/

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC_DIR = __dirname;
const OVERRIDES_DIR = path.join(SRC_DIR, 'overrides');
const BUILD_DIR = path.join(ROOT, 'build');

const EXCLUDE_FROM_BUILD = new Set(['build.js', 'overrides']);

const EXCLUDE_PER_TARGET = {
    chrome: new Set(['yt_core.js', 'wymd.js']),
    'chrome-yt': new Set(),
    firefox: new Set()
};

function cleanDir(dir) {
    if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

function copyRecursive(src, dest, excludeSet = new Set()) {
    const name = path.basename(src);
    if (excludeSet.has(name)) return;

    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
        fs.mkdirSync(dest, { recursive: true });
        for (const child of fs.readdirSync(src)) {
            copyRecursive(path.join(src, child), path.join(dest, child), excludeSet);
        }
    } else {
        fs.copyFileSync(src, dest);
    }
}

/**
 * Deep-merge override JSON into an existing JSON file.
 * Only top-level keys from the override replace keys in the base.
 */
function mergeJsonFile(basePath, overridePath) {
    const base = JSON.parse(fs.readFileSync(basePath, 'utf8'));
    const override = JSON.parse(fs.readFileSync(overridePath, 'utf8'));

    for (const key of Object.keys(override)) {
        if (override[key] === null) {
            delete base[key];
        } else {
            base[key] = override[key];
        }
    }

    fs.writeFileSync(basePath, JSON.stringify(base, null, 4) + '\n', 'utf8');
}

/**
 * Apply browser-specific overrides from overrides/<target>/ onto the build.
 * - JSON files are merged at the top-level key level
 * - Non-JSON files fully replace the base
 */
function applyOverrides(target, outDir) {
    const overrideDir = path.join(OVERRIDES_DIR, target);
    if (!fs.existsSync(overrideDir)) return;

    applyOverridesRecursive(overrideDir, outDir);
}

function applyOverridesRecursive(overrideDir, outDir) {
    for (const entry of fs.readdirSync(overrideDir)) {
        const overridePath = path.join(overrideDir, entry);
        const destPath = path.join(outDir, entry);
        const stat = fs.statSync(overridePath);

        if (stat.isDirectory()) {
            fs.mkdirSync(destPath, { recursive: true });
            applyOverridesRecursive(overridePath, destPath);
        } else if (entry.endsWith('.json') && fs.existsSync(destPath)) {
            mergeJsonFile(destPath, overridePath);
        } else {
            fs.copyFileSync(overridePath, destPath);
        }
    }
}

/**
 * Count the number of override files for a given target.
 */
function countOverrideFiles(target) {
    const overrideDir = path.join(OVERRIDES_DIR, target);
    let count = 0;
    if (fs.existsSync(overrideDir)) {
        const walk = (dir) => {
            for (const e of fs.readdirSync(dir)) {
                const p = path.join(dir, e);
                if (fs.statSync(p).isDirectory()) walk(p);
                else count++;
            }
        };
        walk(overrideDir);
    }
    return count;
}

function buildTarget(target) {
    const outDir = path.join(BUILD_DIR, target);
    cleanDir(outDir);
    fs.mkdirSync(outDir, { recursive: true });

    const targetExcludes = EXCLUDE_PER_TARGET[target] || new Set();
    for (const entry of fs.readdirSync(SRC_DIR)) {
        if (EXCLUDE_FROM_BUILD.has(entry) || targetExcludes.has(entry)) continue;
        copyRecursive(path.join(SRC_DIR, entry), path.join(outDir, entry), targetExcludes);
    }

    applyOverrides(target, outDir);

    const overrideCount = countOverrideFiles(target);
    console.log(`[OK] ${target} build -> build/${target}/  (${overrideCount} override${overrideCount !== 1 ? 's' : ''} applied)`);
}

const args = process.argv.slice(2);
const command = (args[0] || 'all').toLowerCase();

switch (command) {
    case 'chrome':
        buildTarget('chrome');
        break;
    case 'chrome-yt':
        buildTarget('chrome-yt');
        break;
    case 'firefox':
        buildTarget('firefox');
        break;
    case 'all':
        buildTarget('chrome');
        buildTarget('chrome-yt');
        buildTarget('firefox');
        break;
    case 'clean':
        cleanDir(BUILD_DIR);
        console.log('[OK] build/ cleaned');
        break;
    default:
        console.error(`[ERROR] Unknown command: ${command}`);
        console.error('Usage: node src/build.js [chrome|chrome-yt|firefox|all|clean]');
        process.exit(1);
}
