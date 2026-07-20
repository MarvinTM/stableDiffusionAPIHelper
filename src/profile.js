import { readFileSync } from 'fs';
import { resolve } from 'path';

const PLACEHOLDER_RE = /###(\w+)###/g;

export function loadProfile(name, profilesDir = 'profiles') {
  const profilePath = resolve(profilesDir, `${name}.json`);
  let raw;
  try {
    raw = readFileSync(profilePath, 'utf-8');
  } catch (err) {
    throw new Error(`Cannot read profile "${name}" at ${profilePath}: ${err.message}`);
  }
  return JSON.parse(raw);
}

export function findPlaceholders(profile) {
  const params = new Set();
  const walk = (obj) => {
    if (typeof obj === 'string') {
      for (const match of obj.matchAll(PLACEHOLDER_RE)) {
        params.add(match[1]);
      }
    } else if (Array.isArray(obj)) {
      for (const item of obj) walk(item);
    } else if (obj && typeof obj === 'object') {
      for (const val of Object.values(obj)) walk(val);
    }
  };
  walk(profile);
  return [...params];
}

export function substitute(profile, values) {
  const walk = (obj) => {
    if (typeof obj === 'string') {
      return obj.replace(PLACEHOLDER_RE, (_, name) => {
        if (name in values) return values[name];
        return `###${name}###`;
      });
    }
    if (Array.isArray(obj)) return obj.map(walk);
    if (obj && typeof obj === 'object') {
      const result = {};
      for (const [key, val] of Object.entries(obj)) {
        result[key] = walk(val);
      }
      return result;
    }
    return obj;
  };
  return walk(profile);
}
