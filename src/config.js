import { readFileSync } from 'fs';
import { resolve } from 'path';

const DEFAULTS = {
  host: '127.0.0.1',
  port: 7860,
  output_dir: './output',
  timeout_ms: 120000,
};

export function loadConfig(customPath) {
  const configPath = customPath ? resolve(customPath) : resolve('config.json');
  let config;
  try {
    const raw = readFileSync(configPath, 'utf-8');
    config = JSON.parse(raw);
  } catch (err) {
    if (customPath) {
      throw new Error(`Cannot read config at ${configPath}: ${err.message}`);
    }
    console.warn('config.json not found. Using defaults. Copy config.json.example to config.json and edit it.');
    config = {};
  }
  return { ...DEFAULTS, ...config };
}
