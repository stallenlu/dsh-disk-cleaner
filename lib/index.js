/**
 * Host half of Disk Cleaner.
 *
 * The panel and the agent tool are two callers of the same three operations, so the
 * cleaning logic exists once (in catalog.js) and is reached two ways: an HTTP route for
 * the panel and a tool for the agent.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

import { areaPaths, audit, invalidateAudit } from './audit.js';
import { clean, drives, hasTarget, resolveTargets, scan } from './catalog.js';
import { appendRun, readRuns } from './history.js';

export const name = 'dsh-disk-cleaner';

export const inject = ['tools', 'webServer'];

const ROUTE_PREFIX = '/api/disk-cleaner/';
const MAX_BODY = 4096;
const MAX_IDS = 32;

/**
 * Every rejection carries a code beside its message. The message is for logs and curl; the
 * code is what the panel translates, so a Chinese user never reads "origin rejected".
 */
const coded = (code, message) => {
  const error = new Error(message);
  error.code = code;
  return error;
};

const sendJson = (res, status, value) => {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
};

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1', '::ffff:127.0.0.1']);

/**
 * The desktop app renders the panel under its own privileged protocol (`dsh-app://app`), so a
 * fetch from inside that window carries an Origin no `http://` comparison can ever match.
 */
const APP_SCHEME = 'dsh-app://';

/** `host` is `name` or `name:port`; the port is not ours to compare. */
function hostName(host) {
  if (host.startsWith('[')) {
    const end = host.indexOf(']');
    return end === -1 ? host : host.slice(0, end + 1);
  }
  const colon = host.lastIndexOf(':');
  return colon === -1 ? host : host.slice(0, colon);
}

/**
 * Whether the connection itself came in over loopback. This is the check that actually decides,
 * because it is the one a remote page cannot influence: the kernel reports the peer address.
 * Comparing Origin to `http://` + Host was the earlier approach and it broke the panel twice —
 * the desktop window sends `dsh-app://app` (or no Origin at all), and when it does send an
 * http origin the Host header may spell the address differently (`localhost` against
 * `127.0.0.1`, or a rewritten host from the forwarder), which the string comparison rejects.
 */
function fromLoopback(req) {
  const address = req.socket && typeof req.socket.remoteAddress === 'string' ? req.socket.remoteAddress : '';
  if (address !== '' && LOOPBACK_HOSTS.has(address)) return true;
  // No usable peer address (a test double, or a proxy that consumed the socket): fall back to
  // the Host header, which at least keeps the old protection for callers that set it honestly.
  const host = req.headers.host;
  if (typeof host !== 'string' || host === '') return false;
  return LOOPBACK_HOSTS.has(hostName(host));
}

/**
 * Only the panel may drive a state-changing route, and only from this machine.
 *
 * The gate is the peer address, not the Origin string: a web page on another origin cannot reach
 * a loopback socket, and one that reaches it through some other path still has to send an Origin
 * that we then refuse unless it is the app's own scheme or a loopback name.
 */
const sameOrigin = (req) => {
  if (!fromLoopback(req)) return false;
  const origin = req.headers.origin;
  if (typeof origin !== 'string' || origin === '' || origin === 'null') return true;
  if (origin.startsWith(APP_SCHEME)) return true;
  let host = '';
  try {
    host = new URL(origin).hostname;
  } catch {
    return false;
  }
  return LOOPBACK_HOSTS.has(host) || LOOPBACK_HOSTS.has(`[${host}]`);
};

const readBody = (req) =>
  new Promise((resolve, reject) => {
    let size = 0;
    let tooLarge = false;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        // Drain instead of destroying: the caller still gets a 400 rather than a reset socket.
        tooLarge = true;
        chunks.length = 0;
        return;
      }
      if (!tooLarge) chunks.push(chunk);
    });
    req.on('end', () => {
      if (tooLarge) {
        reject(new Error('request body too large'));
        return;
      }
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        resolve(parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {});
      } catch {
        reject(new Error('request body is not valid JSON'));
      }
    });
    req.on('error', reject);
  });

/** Only catalog ids are accepted; an unknown or malformed id rejects the request. */
const readIds = (value) => {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) throw coded('bad-ids', 'ids must be an array');
  if (value.length > MAX_IDS) throw coded('too-many-ids', 'too many ids');
  for (const id of value) {
    if (typeof id !== 'string' || !hasTarget(id)) throw coded('unknown-target', `unknown target: ${String(id)}`);
  }
  return value;
};

/**
 * The canonical root of a mounted volume, from a value such as C:, C:/ or C:\\ .
 * Only a bare drive designator is accepted, so a loose string such as C:extra
 * cannot be read as volume C.
 */
const readDrive = (value) => {
  if (value === undefined || value === null || value === '') return undefined;
  const raw = typeof value === 'string' ? value.trim() : '';
  const match = /^([A-Za-z])(?::[\\/]?)?$/.exec(raw);
  if (match === null) throw coded('unknown-drive', `unknown drive: ${String(value)}`);
  const letter = match[1].toUpperCase();
  const mounted = drives().find((drive) => drive.root[0] === letter);
  if (!mounted) throw coded('drive-not-mounted', `drive not mounted: ${letter}:`);
  return mounted.root;
};

const toPublic = (target) => ({
  id: target.id,
  kind: target.kind,
  risk: target.risk,
  note: target.note,
  group: target.group,
  minAgeDays: target.minAgeDays,
  drives: target.drives,
  pathCount: target.paths.length,
});

/**
 * Open a folder this plugin measured, in Explorer.
 *
 * The request never carries a path: it names an assessment area (or an app folder by
 * scope and name) and the path is rebuilt here from the same code that measured it. A
 * caller therefore cannot hand `explorer.exe` a string of its own choosing, which is the
 * only thing standing between "open my Downloads folder" and "launch anything on disk".
 */
function revealPath(payload) {
  if (typeof payload.area === 'string' && payload.area !== '') {
    const index = Number.isInteger(payload.index) ? payload.index : 0;
    const paths = areaPaths(payload.area);
    if (index < 0 || index >= paths.length) throw new Error(`no location ${index} in area: ${payload.area}`);
    return paths[index];
  }
  if (typeof payload.name === 'string' && payload.name !== '') {
    if (/[\\/]/.test(payload.name) || payload.name === '.' || payload.name === '..') {
      throw new Error('name must be a single folder name');
    }
    const root = payload.scope === 'roaming' ? process.env.APPDATA : payload.scope === 'local' ? process.env.LOCALAPPDATA : undefined;
    if (root === undefined || root === '') throw new Error(`unknown scope: ${String(payload.scope)}`);
    return path.join(root, payload.name);
  }
  throw new Error('reveal needs an area or a scope and name');
}

function reveal(payload) {
  const abs = revealPath(payload);
  let stat;
  try {
    stat = fs.statSync(abs);
  } catch {
    throw new Error('that folder no longer exists');
  }
  // `/select,` highlights the item; a bare path would open its parent for a file.
  const args = stat.isDirectory() ? [abs] : [`/select,${abs}`];
  spawn('explorer.exe', args, { detached: true, stdio: 'ignore' }).unref();
  return { revealed: abs, kind: stat.isDirectory() ? 'folder' : 'file' };
}

const overview = () => ({ drives: drives(), targets: resolveTargets().map(toPublic) });

async function run(action, payload) {
  if (action === 'overview') return overview();
  if (action === 'scan') {
    const measured = await scan(readIds(payload.ids), readDrive(payload.drive));
    return {
      targets: measured.map((target) => ({
        ...toPublic(target),
        bytes: target.bytes,
        files: target.files,
        // The folder's real size, which differs from `bytes` for every `aged` target. Without
        // it a folder holding 261 MB reads as "0.2 MB" and looks like nothing was found.
        totalBytes: target.totalBytes,
        totalFiles: target.totalFiles,
        // Set when the walk hit its cap, so a caller can say the totals are a lower bound.
        truncated: target.truncated === true,
      })),
    };
  }
  if (action === 'audit') return audit({ force: payload.force === true });
  if (action === 'reveal') return reveal(payload);
  if (action === 'clean') {
    const ids = readIds(payload.ids);
    if (ids === undefined || ids.length === 0) throw coded('no-targets', 'clean needs at least one target id');
    const dryRun = payload.confirm !== true;
    const results = await clean(ids, { dryRun, drive: readDrive(payload.drive) });
    // A real deletion changes the numbers the assessment reported, so the cached plan is
    // no longer the truth. A dry run removed nothing and leaves it valid.
    if (!dryRun) {
      invalidateAudit();
      // Written after the fact and never allowed to fail the request: the bytes are already
      // gone by the time this runs, so a broken log must not read as a broken clean.
      appendRun({
        at: new Date().toISOString(),
        bytes: results.reduce((sum, item) => sum + (item.bytes || 0), 0),
        files: results.reduce((sum, item) => sum + (item.removed || 0), 0),
        failed: results.reduce((sum, item) => sum + (item.failed || 0), 0),
        truncated: results.some((item) => item.truncated === true),
        ids: results.map((item) => item.id),
        results,
      });
    }
    return { dryRun, results };
  }
  if (action === 'history') return { runs: readRuns(50) };
  throw coded('unknown-action', `unknown action: ${String(action)}`);
}

const handle = async (req, res) => {
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, code: 'method-not-allowed', error: 'method not allowed' });
    return;
  }
  if (!sameOrigin(req)) {
    sendJson(res, 403, { ok: false, code: 'origin-rejected', error: 'origin rejected' });
    return;
  }
  try {
    const payload = await readBody(req);
    const action = typeof payload.action === 'string' ? payload.action : '';
    sendJson(res, 200, { ok: true, ...(await run(action, payload)) });
  } catch (error) {
    sendJson(res, 400, {
      ok: false,
      code: typeof error?.code === 'string' ? error.code : 'internal',
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

const NOTE_MEANING = {
  'in-use': 'a running program may hold some of these files; only files older than the age limit go',
  rebuild: 'the owner rebuilds these, so the next start or page load is slower',
  elevation: 'Windows refuses an unelevated delete here; run the plugin elevated to reach these bytes',
  rollback: 'an older version the app keeps for rollback; what it runs now is the newest of that family',
  superseded: 'an update package whose version is at or below what is already installed',
  'pending-update': 'a downloaded update inside the age limit, so it may not be applied yet',
  history: 'a backup snapshot of file edits that nothing reads back; the live state sits beside it',
  duplicate: 'a byte-identical copy of a directory that is still present',
  'database-backup': 'a copy of a database file taken before an upgrade; the live database is beside it',
  orphan: 'the QQGuild data folder is deleted in full when no file in it has been written for 30 days',
  irreversible: 'the recycle bin: everything in it was already deleted once, and emptying it cannot be undone',
};

const formatBytes = (bytes) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
};

/**
 * The agent's view of the plan: same order the panel shows, with the exact command for
 * anything this plugin cannot do itself. Wording lives here rather than in the plan module
 * because only this file formats for a human reading a tool result.
 */
function describePlan(plan) {
  if (!plan || !Array.isArray(plan.steps) || plan.steps.length === 0) return '';
  const lines = plan.steps.map((step, index) => {
    const detail = PLAN_DETAIL[step.code] ? PLAN_DETAIL[step.code](step, formatBytes) : '';
    const command = step.command ? `\n   ${step.command.replace(/\n/g, '\n   ')}` : '';
    const base = PLAN_TITLE[step.code] ?? step.code;
    const title = step.name ? `${base}: ${step.name}` : base;
    return `${index + 1}. ${title} — ${formatBytes(step.bytes ?? 0)}\n   ${detail}${command}`;
  });
  const safeBytes = plan.steps.filter((step) => step.code === 'reclaim-safe').reduce((total, step) => total + step.bytes, 0);
  const head =
    safeBytes > 0
      ? `Suggested plan. ${formatBytes(safeBytes)} of it is pure cache this plugin can remove right now:\n\n`
      : 'Suggested plan:\n\n';
  return (
    `\n\n${head}${lines.join('\n')}\n\n` +
    'Only the cache steps are performed by this plugin; the rest are deliberate actions for the user. Report them, never run those commands unasked.'
  );
}

const PLAN_TITLE = {
  'reclaim-safe': 'Clean pure caches',
  'reclaim-caution': 'Clean caches that rebuild',
  'wsl-compact': 'Compact the WSL virtual disk',
  'winsxs-cleanup': 'Service the Windows component store',
  'elevation-clean': 'Windows folders that need an elevated prompt',
  'hibernate-off': 'Turn off hibernation',
  'app-review': 'Review an installed program',
  'move-folder': 'Move a folder to another drive',
  'pressure': 'Drive nearly full',
};

const PLAN_DETAIL = {
  'reclaim-safe': (step) => `targets: ${step.ids.join(', ')}. No data lost, rebuilt on next use.`,
  'reclaim-caution': (step) => `targets: ${step.ids.join(', ')}. Expect a slower next start.`,
  'wsl-compact': (step) => `the image only ever grows; compacting keeps every file (${step.vhdx ?? 'ext4.vhdx'}).`,
  'winsxs-cleanup': () => 'needs an elevated prompt; drops superseded components, keeps current ones.',
  'elevation-clean': (step) =>
    `targets: ${step.ids.join(', ')}. Windows refuses a normal token, so these bytes are not counted as reclaimable now — run this plugin elevated to free them.`,
  'hibernate-off': () => 'frees the hibernation file; hibernate and fast startup stop working.',
  'app-review': (step) => `${step.scope === 'local' ? 'user' : 'machine'} scope. Uninstall if unused, never delete the folder.`,
  'move-folder': (step, fmt) => `${step.folder} to ${step.drive} (${fmt(step.free)} free): use its Properties > Location tab.`,
  'pressure': (step, fmt) => `${step.drive} has only ${fmt(step.free)} of ${fmt(step.total)} left.`,
};

export function apply(ctx) {
  ctx.effect(
    () => ctx.webServer.register({ kind: 'prefix', path: ROUTE_PREFIX, handler: handle }),
    'dsh-disk-cleaner: routes',
  );

  ctx.effect(
    () =>
      ctx.tools.register({
        name: 'disk_cleaner',
        description:
          'Inspect and reclaim disk space on this Windows machine from known-safe cache locations only: ' +
          'temp directories, package manager caches (npm, pnpm, pip, uv), crash dumps, browser and editor ' +
          'caches, the Windows internet cache, per-app caches, logs and scratch folders under %APPDATA%, ' +
          'superseded plugin versions and applied update packages, the backup snapshots, dated logs, ' +
          'rotated-out log files, duplicate toolchain copies and database backups under the user profile, ' +
          'editor builds their launcher no longer names, superseded editor versions, data left by an app ' +
          'that is no longer installed, applied Office update packages, and the Chromium caches of the ' +
          'agent apps. ' +
          'Call with action "overview" to list drives and target ids, ' +
          '"scan" to measure them, and "clean" to delete. clean without confirm: true is a dry run that only ' +
          'reports what it would free, so the user can approve the amount before anything is removed. ' +
          'Action "audit" instead assesses the space that CANNOT be cleaned automatically — installed programs, ' +
          'WSL disk images, the Windows component store, chat-app data and the user\'s own folders — so the ' +
          'answer covers the whole disk rather than only caches. audit is read-only: it never removes anything, ' +
          'and it also returns a suggested plan — the same numbers ordered into steps, with the exact command ' +
          'for the ones this plugin cannot perform. Report that plan to the user; never run those commands yourself. ' +
          'Action "reveal" opens one measured location in Explorer: pass an "area" id, or "scope" (local|roaming) ' +
          'with "name" for one app folder. It takes no path.',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['overview', 'scan', 'clean', 'audit', 'reveal'] },
            ids: {
              type: 'array',
              items: { type: 'string' },
              description: 'Target ids from overview or scan. Required for clean; omit to use every target.',
            },
            drive: {
              type: 'string',
              description:
                'Limit the work to one volume, as "C:" or "D:". Omit to cover every mounted drive; ' +
                'overview reports which drive each target sits on.',
            },
            confirm: {
              type: 'boolean',
              description: 'Set true to actually delete. Without it, clean only reports a dry run.',
            },
            force: {
              type: 'boolean',
              description: 'With audit, re-measure instead of answering from the ten-minute cache.',
            },
            area: {
              type: 'string',
              description: 'With reveal, the assessment area id to open. Rejects an id the assessment did not report.',
            },
            scope: {
              type: 'string',
              enum: ['local', 'roaming'],
              description: 'With reveal and name, which app-data root the folder is under.',
            },
            name: {
              type: 'string',
              description: 'With reveal and scope, one folder name from the largest-app list.',
            },
            index: {
              type: 'number',
              description: 'With reveal and area, which of its locations to open (default 0).',
            },
          },
          required: ['action'],
          additionalProperties: false,
        },
        output: {
          schema: { type: 'string' },
          render: (args, value) => [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
        },
        timeoutMs: 300_000,
        isConcurrencySafe: () => false,
        presentCall: (args) => ({
          card: 'generic',
          title: `Disk cleaner: ${typeof args.action === 'string' ? args.action : 'overview'}`,
          kind: 'disk-cleaner',
          rawInput: args,
        }),
        async execute(args) {
          const action = typeof args.action === 'string' ? args.action : 'overview';
          if (action === 'overview') {
            const value = overview();
            const capacity = value.drives
              .map((drive) => `${drive.root} ${formatBytes(drive.free)} free of ${formatBytes(drive.total)}`)
              .join('\n');
            const list = value.targets
              .map((target) => {
                const where = target.drives.length > 0 ? target.drives.join(' ') : 'no drive';
                const why = target.note ? `, caution: ${target.note}` : '';
                return `${target.id} (${target.risk}${why}, ${where}, ${target.pathCount} path(s) present)`;
              })
              .join('\n');
            return `Drives:\n${capacity}\n\nTargets:\n${list}`;
          }
          if (action === 'scan') {
            const measured = await scan(readIds(args.ids), readDrive(args.drive));
            const lines = measured.map((target) => {
              const limit = target.minAgeDays > 0 ? ` (${target.minAgeDays}d age limit)` : '';
              const holds =
                target.totalBytes > target.bytes ? ` of ${formatBytes(target.totalBytes)} present` : '';
              return `${target.id}: ${formatBytes(target.bytes)}${holds} in ${target.files} file(s)${limit}`;
            });
            const total = measured.reduce((sum, target) => sum + target.bytes, 0);
            const notes = [...new Set(measured.map((target) => target.note).filter(Boolean))];
            const meaning = notes.map((note) => `${note}: ${NOTE_MEANING[note] ?? note}`).join('\n');
            const tail = meaning === '' ? '' : `\n\nCaution codes:\n${meaning}`;
            return `Reclaimable: ${formatBytes(total)}\n\n${lines.join('\n')}${tail}`;
          }
          if (action === 'reveal') {
            const value = reveal(args);
            return `Opened ${value.revealed} (${value.kind}).`;
          }
          if (action === 'audit') {
            const value = await audit({ force: args.force === true });
            const total = value.areas.reduce((sum, area) => sum + area.bytes, 0);
            const lines = value.areas.map(
              (area) => `${area.label}: ${formatBytes(area.bytes)} in ${area.files} file(s)\n  why not automatic: ${area.why}`,
            );
            const apps = value.largestApps.map((item) => `${item.scope}/${item.name}: ${formatBytes(item.bytes)}`).join('\n');
            const appTail = apps === '' ? '' : `\n\nLargest per-app folders (not deletable by this plugin):\n${apps}`;
            const plan = describePlan(value.plan);
            return (
              `Not automatically cleanable: ${formatBytes(total)} across ${value.areas.length} area(s).\n\n` +
              `${lines.join('\n')}${appTail}${plan}`
            );
          }
          if (action === 'clean') {
            const ids = readIds(args.ids);
            if (ids === undefined || ids.length === 0) throw coded('no-targets', 'clean needs at least one target id');
            const dryRun = args.confirm !== true;
            const results = await clean(ids, { dryRun, drive: readDrive(args.drive) });
            if (!dryRun) {
              invalidateAudit();
              appendRun({
                at: new Date().toISOString(),
                bytes: results.reduce((sum, item) => sum + (item.bytes || 0), 0),
                files: results.reduce((sum, item) => sum + (item.removed || 0), 0),
                failed: results.reduce((sum, item) => sum + (item.failed || 0), 0),
                truncated: results.some((item) => item.truncated === true),
                ids: results.map((item) => item.id),
                source: 'agent',
                results,
              });
            }
            const freed = results.reduce((sum, item) => sum + item.bytes, 0);
            const files = results.reduce((sum, item) => sum + item.removed, 0);
            const failed = results.reduce((sum, item) => sum + item.failed, 0);
            const detail = results.map((item) => `${item.id}: ${formatBytes(item.bytes)}`).join(', ');
            const head = dryRun
              ? `Dry run, nothing deleted. Would free ${formatBytes(freed)} across ${files} file(s). Re-run with confirm: true to delete.`
              : `Freed ${formatBytes(freed)} across ${files} file(s).`;
            return `${head}\n${detail}\nLocked or denied entries skipped: ${failed}`;
          }
          throw coded('unknown-action', `unknown action: ${action}`);
        },
      }),
    'dsh-disk-cleaner: tool',
  );
}
