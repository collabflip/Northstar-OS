#!/usr/bin/env node
/**
 * lockfile-host-gate
 *
 * Portability gate: every "resolved" URL in package-lock.json must point at an
 * allowlisted public registry host. Internal mirror hosts (e.g.
 * npm.mirrors.msh.team) break `npm ci` for anyone outside the internal
 * network, so this gate fails the build if one sneaks back in.
 *
 * Exit 0: clean. Exit 1: violations found (each printed with package path).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOCKFILE = join(ROOT, 'package-lock.json');

const ALLOWED_HOSTS = new Set(['registry.npmjs.org']);
// Raw-text tripwires: known internal/mirror registry markers that must never
// appear anywhere in the lockfile (not just in "resolved" fields).
const BANNED_TOKENS = ['msh.team', 'npmmirror'];

const raw = readFileSync(LOCKFILE, 'utf8');
const lock = JSON.parse(raw);

const violations = [];
const hosts = new Set();
let resolvedCount = 0;

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

function walk(node, path) {
  if (!node || typeof node !== 'object') return;
  if (typeof node.resolved === 'string') {
    resolvedCount += 1;
    const host = hostOf(node.resolved);
    if (host) hosts.add(host);
    if (!host || !ALLOWED_HOSTS.has(host)) {
      violations.push({ path: path || '(root)', host: host ?? '(unparseable)', resolved: node.resolved });
    }
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === 'resolved') continue;
    walk(value, path ? `${path}/${key}` : key);
  }
}

walk(lock, '');

for (const token of BANNED_TOKENS) {
  if (raw.includes(token)) {
    violations.push({ path: '(raw-text scan)', host: token, resolved: `lockfile contains banned token "${token}"` });
  }
}

if (violations.length > 0) {
  console.error('lockfile-host gate: VIOLATIONS FOUND');
  for (const v of violations) {
    console.error(`  - ${v.path}: host=${v.host} (${v.resolved})`);
  }
  process.exit(1);
}

console.log(`lockfile-host gate: clean (${resolvedCount} resolved URLs, hosts: ${[...hosts].sort().join(', ') || 'none'})`);
