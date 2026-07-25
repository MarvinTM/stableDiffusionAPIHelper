import { readFileSync } from 'fs';
import { resolve } from 'path';
import { loadConfig } from './config.js';
import { loadProfile, findPlaceholders } from './profile.js';
import { run } from './runner.js';

function showHelp() {
  console.log(`Usage: node src/cli.js --profile <name> [options]

Required:
  --profile <name>         Profile file name (without .json)

Options:
  --param KEY=VALUE        Parameter value(s). Repeatable.
                           VALUE: comma-separated list, or @path/to/file
  --concurrency <N>        Max concurrent API requests (default: 1)
  --samples <N>            Generations per value combination (default: 1)
  --config <path>          Override config.json path
  --profiles-dir <path>    Override profiles directory (default: profiles)
  --output <path>          Override output directory
  --dry-run                Print requests without calling API
  --help, -h               Show this help

Examples:
  node src/cli.js --profile example --param ICON=sword,shield,potion
  node src/cli.js --profile example --param ICON=@icons.txt
  node src/cli.js --profile example --param ICON=sword,shield --samples 6 --concurrency 2
  node src/cli.js --profile example --param ICON=sword --dry-run`);
}

function parseArgs(argv) {
  const args = {
    profile: null,
    params: {},
    concurrency: 1,
    samples: 1,
    config: null,
    profilesDir: 'profiles',
    output: null,
    dryRun: false,
    help: false,
  };

  let i = 2;
  while (i < argv.length) {
    const arg = argv[i];
    switch (arg) {
      case '--profile':
        args.profile = argv[++i];
        break;
      case '--param': {
        const raw = argv[++i];
        const eqIdx = raw.indexOf('=');
        if (eqIdx === -1) {
          console.error(`Invalid --param format: "${raw}". Expected KEY=VALUE.`);
          process.exit(1);
        }
        const key = raw.slice(0, eqIdx).trim();
        const value = raw.slice(eqIdx + 1);
        if (!args.params[key]) args.params[key] = [];
        args.params[key].push(value);
        break;
      }
      case '--concurrency':
        args.concurrency = parseInt(argv[++i], 10);
        break;
      case '--samples':
        args.samples = parseInt(argv[++i], 10);
        break;
      case '--config':
        args.config = argv[++i];
        break;
      case '--profiles-dir':
        args.profilesDir = argv[++i];
        break;
      case '--output':
        args.output = argv[++i];
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--help':
      case '-h':
        args.help = true;
        break;
      default:
        console.error(`Unknown option: ${arg}`);
        process.exit(1);
    }
    i++;
  }

  return args;
}

function expandParamValues(rawValues) {
  const result = [];
  let filenames = null;
  for (const raw of rawValues) {
    if (raw.startsWith('@')) {
      const filePath = resolve(raw.slice(1));
      let content;
      try {
        content = readFileSync(filePath, 'utf-8');
      } catch (err) {
        throw new Error(`Cannot read values file "${filePath}": ${err.message}`);
      }
      const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      if (lines.length === 0) {
        throw new Error(`Values file "${filePath}" is empty.`);
      }
      for (const line of lines) {
        const sepIdx = line.indexOf(';;;');
        if (sepIdx !== -1) {
          filenames = filenames || new Map();
          const name = line.slice(0, sepIdx).trim();
          const value = line.slice(sepIdx + 3).trim();
          if (value) {
            filenames.set(value, name);
            result.push(value);
          }
        } else {
          result.push(line);
        }
      }
    } else {
      result.push(...raw.split(',').map(v => v.trim()).filter(Boolean));
    }
  }
  return { values: result, filenames };
}

async function main() {
  const rawArgs = parseArgs(process.argv);

  if (rawArgs.help) {
    showHelp();
    process.exit(0);
  }

  if (!rawArgs.profile) {
    console.error('Error: --profile is required.');
    showHelp();
    process.exit(1);
  }

  const config = loadConfig(rawArgs.config);

  const profileData = loadProfile(rawArgs.profile, rawArgs.profilesDir);
  const placeholders = findPlaceholders(profileData);

  const paramValues = {};
  const paramFilenames = {};
  for (const key of Object.keys(rawArgs.params)) {
    const expanded = expandParamValues(rawArgs.params[key]);
    paramValues[key] = expanded.values;
    if (expanded.filenames) {
      paramFilenames[key] = expanded.filenames;
    }
  }

  for (const key of Object.keys(paramValues)) {
    if (!placeholders.includes(key)) {
      console.warn(`Warning: --param ${key} has no matching placeholder ###${key}### in profile.`);
    }
  }

  for (const ph of placeholders) {
    if (!paramValues[ph] || paramValues[ph].length === 0) {
      console.error(`Error: Placeholder ###${ph}### found in profile but no --param ${ph}=... provided.`);
      process.exit(1);
    }
  }

  if (Object.keys(paramValues).length === 0 && placeholders.length === 0) {
    console.log('No placeholders or params provided. Running a single request with profile as-is.');
  }

  const now = new Date();
  const ts = now.toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
  const baseOutputDir = rawArgs.output || resolve(config.output_dir);
  const outputDir = resolve(baseOutputDir, `${rawArgs.profile}_${ts}`);

  await run({
    profile: { name: rawArgs.profile, data: profileData },
    host: config.host,
    port: config.port,
    timeoutMs: config.timeout_ms,
    outputDir,
    paramValues,
    paramFilenames,
    concurrency: rawArgs.concurrency,
    samples: rawArgs.samples,
    dryRun: rawArgs.dryRun,
  });
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
