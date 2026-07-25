import { mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { substitute } from './profile.js';
import { generateImage } from './api.js';

function cartesianProduct(paramSets) {
  const keys = Object.keys(paramSets);
  if (keys.length === 0) return [{}];

  const result = [];
  const combine = (index, current) => {
    if (index === keys.length) {
      result.push({ ...current });
      return;
    }
    const key = keys[index];
    for (const val of paramSets[key]) {
      current[key] = val;
      combine(index + 1, current);
    }
  };
  combine(0, {});
  return result;
}

function comboToFilename(combo, sampleIndex, sampleCount, batchIdx, batchSize, filenames = {}) {
  const parts = [];
  const entries = Object.entries(combo);
  if (entries.length === 0) {
    parts.push('image');
  } else {
    for (const [key, val] of entries) {
      const keyFilenames = filenames[key];
      if (keyFilenames && keyFilenames.has(val)) {
        parts.push(keyFilenames.get(val));
      } else {
        parts.push(val);
      }
    }
  }
  if (sampleCount > 1) {
    parts.push(String(sampleIndex + 1));
  }
  if (batchSize > 1) {
    parts.push(`batch${batchIdx + 1}`);
  }
  return parts.join('_') + '.png';
}

export async function run(options) {
  const {
    profile,
    host,
    port,
    timeoutMs,
    outputDir,
    paramValues,
    paramFilenames = {},
    concurrency,
    samples,
    dryRun,
  } = options;

  const combos = cartesianProduct(paramValues);

  const tasks = [];
  for (const combo of combos) {
    for (let s = 0; s < samples; s++) {
      tasks.push({ combo, sampleIndex: s });
    }
  }

  if (dryRun) {
    console.log(`[dry-run] Profile: ${profile.name}`);
    console.log(`[dry-run] Host: ${host}:${port}`);
    console.log(`[dry-run] Param values: ${JSON.stringify(paramValues)}`);
    console.log(`[dry-run] Combinations: ${combos.length}`);
    console.log(`[dry-run] Samples per combo: ${samples}`);
    console.log(`[dry-run] Total requests: ${tasks.length}`);
    console.log(`[dry-run] Concurrency: ${concurrency}`);
    console.log(`[dry-run] Output dir: ${outputDir}`);
    console.log(`[dry-run] Files that would be generated:`);
    for (const task of tasks) {
      const label = comboToFilename(task.combo, task.sampleIndex, samples, 0, 1, paramFilenames);
      const comboDesc = Object.values(task.combo).join(',') || '(no params)';
      console.log(`[dry-run]   ${label}  <- ${comboDesc}${samples > 1 ? ` sample=${task.sampleIndex + 1}` : ''}`);
    }
    return;
  }

  mkdirSync(outputDir, { recursive: true });

  const profileData = profile.data;
  const total = tasks.length;
  let completed = 0;
  let failed = 0;

  const processTask = async (task) => {
    const { combo, sampleIndex } = task;
    const substituted = substitute(profileData, combo);
    const comboDesc = Object.values(combo).join('_') || 'single';
    const sampleLabel = samples > 1 ? ` #${sampleIndex + 1}` : '';

    try {
      const buffers = await generateImage(host, port, substituted, timeoutMs);
      buffers.forEach((buf, batchIdx) => {
        const filename = comboToFilename(combo, sampleIndex, samples, batchIdx, buffers.length, paramFilenames);
        writeFileSync(resolve(outputDir, filename), buf);
      });
      completed++;
      const progress = completed + failed;
      console.log(`[${progress}/${total}] ${comboDesc}${sampleLabel} \u2713`);
    } catch (err) {
      failed++;
      const progress = completed + failed;
      console.error(`[${progress}/${total}] ${comboDesc}${sampleLabel} \u2717 ${err.message}`);
    }
  };

  const running = new Set();
  let taskIndex = 0;

  while (taskIndex < tasks.length) {
    const task = tasks[taskIndex++];
    const p = processTask(task);
    running.add(p);
    p.finally(() => running.delete(p));
    if (running.size >= concurrency) {
      await Promise.race(running);
    }
  }
  await Promise.all(running);

  const succeeded = completed;
  console.log(`\nDone. ${succeeded} succeeded, ${failed} failed.`);
  console.log(`Output: ${outputDir}`);
}
