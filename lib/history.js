import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * What each real run actually freed, appended as one JSON line per run.
 *
 * The panel is the only writer and it writes after the deletion has already happened, so a
 * failed append must never turn a successful clean into an error: every function here answers
 * with a value instead of throwing. Nothing else reads this file, which is why it is a plain
 * JSONL log rather than a database.
 */

const MAX_BYTES = 512 * 1024;

export function historyDir(env = process.env) {
  const home =
    typeof env.DSH_HOME === 'string' && env.DSH_HOME.trim() !== ''
      ? env.DSH_HOME.trim()
      : path.join(os.homedir(), '.dsh');
  return path.join(home, 'dsh-disk-cleaner');
}

export function historyFile(env = process.env) {
  return path.join(historyDir(env), 'history.jsonl');
}

const trim = (file) => {
  try {
    const stat = fs.statSync(file);
    if (stat.size <= MAX_BYTES) return;
    const lines = fs.readFileSync(file, 'utf8').split('\n').filter((line) => line.trim() !== '');
    // Keep the newest half, which is what a reader ever asks about.
    const kept = lines.slice(Math.floor(lines.length / 2));
    fs.writeFileSync(file, `${kept.join('\n')}\n`, 'utf8');
  } catch {
    /* a log that cannot be trimmed is still a log */
  }
};

export function appendRun(record, env = process.env) {
  try {
    const dir = historyDir(env);
    fs.mkdirSync(dir, { recursive: true });
    const file = historyFile(env);
    fs.appendFileSync(file, `${JSON.stringify(record)}\n`, 'utf8');
    trim(file);
    return true;
  } catch {
    return false;
  }
}

export function readRuns(limit = 50, env = process.env) {
  try {
    const text = fs.readFileSync(historyFile(env), 'utf8');
    const lines = text.split('\n').filter((line) => line.trim() !== '');
    const out = [];
    for (const line of lines.slice(-limit)) {
      try {
        const parsed = JSON.parse(line);
        if (parsed !== null && typeof parsed === 'object') out.push(parsed);
      } catch {
        /* a torn last line is not a reason to lose the rest */
      }
    }
    return out.reverse();
  } catch {
    return [];
  }
}
