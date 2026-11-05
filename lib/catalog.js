/**
 * Known-safe cleanup targets and the two operations over them: measure and purge.
 *
 * Safety rules that must never be relaxed here:
 *  - Only paths built from this catalog are ever touched. Callers select catalog ids,
 *    never raw paths, so no user-supplied string can reach an unlink.
 *  - A resolved target must sit inside the environment root it was built from, checked
 *    after realpath, so a junction planted in a cache directory cannot widen the blast radius.
 *  - Symlinks and junctions met during a walk are skipped, never followed or deleted.
 *  - Locked or denied entries are counted as failures and the walk continues.
 */
import fs from 'node:fs';
import path from 'node:path';

const { promises: fsp } = fs;

const DAY = 86_400_000;
const MAX_ENTRIES = 2_000_000;

/** @typedef {{ id: string, root: string, paths: string[] }} Resolved */

const env = (name) => {
  const value = process.env[name];
  return typeof value === 'string' && value !== '' ? value : undefined;
};

const isDir = (p) => {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
};

const subdirs = (parent, names) => {
  const out = [];
  if (!isDir(parent)) return out;
  for (const name of names) {
    const candidate = path.join(parent, name);
    if (isDir(candidate)) out.push(candidate);
  }
  return out;
};

/**
 * The per-account recycle bin directories on every mounted volume. Each SID directory
 * is a real three-segment path, so purging them keeps the `tooBroad` guard intact and
 * never reaches the $Recycle.Bin container itself.
 */
const recycleBins = () => {
  const out = [];
  for (const letter of 'CDEFGHIJKLMNOPQRSTUVWXYZ') {
    const base = `${letter}:\\$Recycle.Bin`;
    if (!isDir(base)) continue;
    let entries = [];
    try {
      entries = fs.readdirSync(base, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      if (!/^S-1-5-/.test(entry.name)) continue;
      out.push(path.join(base, entry.name));
    }
  }
  return out;
};

/** `readdirSync` that answers an empty list instead of throwing on a denied directory. */
const listDir = (parent) => {
  try {
    return fs.readdirSync(parent, { withFileTypes: true });
  } catch {
    return [];
  }
};

/** Compare `0.5.2` style folder names numerically, falling back to a plain string compare. */
const compareVersion = (a, b) => {
  const pa = a.split(/[._-]/);
  const pb = b.split(/[._-]/);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const na = Number(pa[i]);
    const nb = Number(pb[i]);
    if (Number.isFinite(na) && Number.isFinite(nb)) {
      if (na !== nb) return na - nb;
      continue;
    }
    const cmp = String(pa[i] ?? '').localeCompare(String(pb[i] ?? ''));
    if (cmp !== 0) return cmp;
  }
  return 0;
};

/**
 * Version folders a per-user install keeps beside itself, such as Qoder's
 * `.qoder-versions/0.5.2`. The newest child stays — it is the version the installer last
 * put there — and the rest are rollback copies. A holder with only one child is skipped,
 * because then nothing distinguishes a rollback copy from the install itself.
 */
export const appVersionDirs = () => {
  const programs = path.join(env('LOCALAPPDATA') ?? '', 'Programs');
  if (!isDir(programs)) return [];
  const out = [];
  for (const app of listDir(programs)) {
    if (!app.isDirectory() || app.isSymbolicLink()) continue;
    const appDir = path.join(programs, app.name);
    for (const inner of listDir(appDir)) {
      if (!inner.isDirectory() || inner.isSymbolicLink()) continue;
      if (!/versions?$/i.test(inner.name) && !/_old$/i.test(inner.name)) continue;
      const holder = path.join(appDir, inner.name);
      const versions = listDir(holder)
        .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
        .map((entry) => entry.name)
        .sort(compareVersion);
      if (versions.length < 2) continue;
      for (const name of versions.slice(0, -1)) out.push(path.join(holder, name));
    }
  }
  return out;
};

/**
 * Update caches: an Electron-style updater keeps the installer it downloaded in
 * `%LOCALAPPDATA%/<app>-updater` after applying it. The name pattern is the only signal a
 * cleaner can use without knowing every vendor; the age limit keeps a download that has
 * not been applied yet.
 */
const appUpdaters = () => {
  const out = [];
  for (const root of [env('LOCALAPPDATA'), env('APPDATA')]) {
    if (root === undefined || !isDir(root)) continue;
    for (const entry of listDir(root)) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      if (!/-updater$/i.test(entry.name)) continue;
      out.push(path.join(root, entry.name));
    }
  }
  return out;
};

/** Chromium-family caches live per browser profile, so they are discovered, not spelled out. */
const browserCaches = (userData) => {
  if (!isDir(userData)) return [];
  const out = [];
  let entries = [];
  try {
    entries = fs.readdirSync(userData, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const profile = path.join(userData, entry.name);
    out.push(...subdirs(profile, ['Cache', 'Code Cache', 'GPUCache', 'DawnCache', 'ShaderCache', 'GrShaderCache']));
  }
  return out;
};

/**
 * Per-app cache folders inside `%APPDATA%`. Every one is spelled out instead of discovered by
 * a `*cache*` sweep: a folder is only safe to delete when somebody has looked at what it
 * holds, and the same sweep that finds this WPS cache also finds WeChat's profile store and
 * VS Code's web storage, which cost a re-login to rebuild.
 */
const appCaches = () => {
  const roaming = env('APPDATA') ?? '';
  return [
    path.join(roaming, 'kingsoft', 'wps', 'addons', 'data', 'win-i386', 'cef', '2', 'cache'),
    path.join(roaming, 'FTNN', '2.0', 'Common', 'cef_cache'),
    ...subdirs(path.join(roaming, 'com.qoder.app.stable'), ['Cache', 'Code Cache']),
    ...subdirs(path.join(roaming, 'Trae CN'), ['Cache', 'CachedData']),
    ...subdirs(path.join(roaming, 'Trae'), ['Cache', 'CachedData']),
    ...subdirs(path.join(roaming, '@deepseek-ai', 'dsh-desktop'), ['Cache', 'Code Cache', 'GPUCache', 'GrShaderCache']),
    ...subdirs(path.join(roaming, 'PersonalCenter'), ['Cache']),
    ...subdirs(path.join(roaming, '微信开发者工具'), ['Cache']),
    ...subdirs(path.join(roaming, '腾讯电脑管家-全局搜'), ['Cache']),
    ...subdirs(path.join(roaming, 'appGallery'), ['Crashpad']),
  ];
};

/** Log folders that only ever hold history: nothing reads an old log back at runtime. */
const appLogs = () => {
  const roaming = env('APPDATA') ?? '';
  return [
    path.join(roaming, 'FTNN', '2.0', 'Logs'),
    path.join(roaming, 'Tencent', 'xwechat', 'log'),
    ...subdirs(path.join(roaming, 'com.qoder.app.stable'), ['logs']),
    ...subdirs(path.join(roaming, 'Trae CN'), ['logs']),
    ...subdirs(path.join(roaming, 'Trae'), ['logs']),
    ...subdirs(path.join(roaming, 'DingTalk'), ['log']),
    ...subdirs(path.join(roaming, 'PersonalCenter'), ['log']),
    ...subdirs(path.join(roaming, 'io.github.clash-verge-rev.clash-verge-rev'), ['logs']),
    ...subdirs(path.join(roaming, 'MAXHUBShare'), ['log']),
  ];
};

/**
 * Scratch directories an app keeps inside its own roaming folder rather than in `%TEMP%`.
 * These belong to an app that may be running right now, so the target keeps a two-day floor
 * instead of being purged outright.
 */
const appTempDirs = () => [
  path.join(env('APPDATA') ?? '', 'WorkDaddy', 'client-tmp'),
  path.join(env('APPDATA') ?? '', 'PersonalCenter', 'Temp'),
];

/**
 * A plugin pool keeps every version it ever installed, because the manager picks one by name
 * instead of replacing it in place. WPS alone had 347 folders across 131 families here. The
 * highest version of each family stays — it is what the manager loads — and the rest are dead
 * weight it never reads again. Families with a single member are skipped: nothing then proves
 * which one is live.
 */
const pooledOldVersions = (pool, pattern) => {
  if (!isDir(pool)) return [];
  const families = new Map();
  for (const entry of listDir(pool)) {
    if (entry.isSymbolicLink()) continue;
    const match = pattern.exec(entry.name);
    if (match === null) continue;
    const [, base, version] = match;
    if (!families.has(base)) families.set(base, []);
    families.get(base).push({ name: entry.name, version });
  }
  const out = [];
  for (const list of families.values()) {
    if (list.length < 2) continue;
    list.sort((a, b) => compareVersion(a.version, b.version));
    for (const older of list.slice(0, -1)) out.push(path.join(pool, older.name));
  }
  return out;
};

const wpsPluginOldVersions = () =>
  pooledOldVersions(path.join(env('APPDATA') ?? '', 'kingsoft', 'wps', 'addons', 'pool', 'win-i386'), /^(.+)_([0-9][0-9._]*)$/);

/** The version folders an installer left under its own `app` directory, such as FTNN's. */
const installedAppVersions = (appRoot) => {
  if (!isDir(appRoot)) return [];
  return listDir(appRoot)
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
    .map((entry) => entry.name)
    .filter((name) => /^[0-9][0-9._]*$/.test(name));
};

/**
 * Update packages the vendor has already applied, decided by comparison rather than by age.
 * FTNN names a patch `Download-<from>-<to>-<hash>.spd` with bare build numbers while it keeps
 * full `16.35.27108` folders in Program Files, so the comparison is build number against the
 * newest installed build. A patch at or above that build may still be pending, so it stays.
 */
const ftnnAppliedPatches = () => {
  const programFiles = env('ProgramFiles');
  if (programFiles === undefined) return [];
  const installed = installedAppVersions(path.join(programFiles, 'FTNN', 'app')).sort(compareVersion);
  if (installed.length === 0) return [];
  const newestBuild = Number(installed[installed.length - 1].split('.').pop());
  if (!Number.isFinite(newestBuild)) return [];
  const liveUpdate = path.join(env('APPDATA') ?? '', 'FTNN', '2.0', 'LiveUpdate', 'win_qtnn');
  const out = [];
  for (const entry of listDir(liveUpdate)) {
    if (!entry.isFile() || entry.isSymbolicLink()) continue;
    const match = /^Download-[0-9]+-([0-9]+)-[0-9a-f]+\.spd$/i.exec(entry.name);
    if (match === null) continue;
    if (Number(match[1]) < newestBuild) out.push(path.join(liveUpdate, entry.name));
  }
  return out;
};

const supersededUpdatePackages = () => [
  ...ftnnAppliedPatches(),
  ...pooledOldVersions(path.join(env('APPDATA') ?? '', 'WorkDaddy', 'update'), /^(.+)-([0-9][0-9._]*)(\.[A-Za-z0-9]+)?$/),
];

/**
 * `purge` targets drop every entry under the path. `aged` targets keep anything modified
 * within `minAgeDays`, because those files may belong to a process that is still running.
 *
 * `note` says why a target carries the `caution` risk, in one stable code the UI
 * translates: 'in-use' (a running program may hold these files), 'rebuild' (the owner
 * regenerates them, so the first use afterwards is slower), or 'elevation' (Windows
 * refuses an unelevated delete). Safe targets have none.
 */
const CATALOG = [
  {
    id: 'temp',
    kind: 'aged',
    minAgeDays: 1,
    risk: 'caution',
    note: 'in-use',
    roots: ['TEMP', 'LOCALAPPDATA'],
    paths: () => [env('TEMP'), env('TMP'), path.join(env('LOCALAPPDATA') ?? '', 'Temp')],
  },
  {
    id: 'windows-temp',
    kind: 'aged',
    minAgeDays: 1,
    risk: 'caution',
    // Measured on Windows 11: this folder's ACL grants BUILTIN\Users create and delete, so an
    // unelevated run does remove what it owns here — the real blocker is EBUSY on a file a
    // service still holds, which the age limit already handles. Calling it `elevation` sent
    // the user to an elevated prompt that changed nothing and hid the bytes from the plan.
    note: 'in-use',
    roots: [],
    paths: () => ['C:\\Windows\\Temp'],
  },
  {
    id: 'npm-cache',
    kind: 'purge',
    risk: 'safe',
    roots: ['LOCALAPPDATA'],
    paths: () => [path.join(env('LOCALAPPDATA') ?? '', 'npm-cache')],
  },
  {
    id: 'pnpm-store',
    kind: 'purge',
    risk: 'safe',
    roots: ['LOCALAPPDATA'],
    paths: () => [path.join(env('LOCALAPPDATA') ?? '', 'pnpm', 'store')],
  },
  {
    id: 'pip-cache',
    kind: 'purge',
    risk: 'safe',
    roots: ['LOCALAPPDATA'],
    paths: () => [path.join(env('LOCALAPPDATA') ?? '', 'pip', 'Cache')],
  },
  {
    id: 'uv-cache',
    kind: 'purge',
    risk: 'safe',
    roots: ['LOCALAPPDATA'],
    paths: () => [path.join(env('LOCALAPPDATA') ?? '', 'uv', 'cache')],
  },
  {
    id: 'crash-dumps',
    kind: 'purge',
    risk: 'safe',
    roots: ['LOCALAPPDATA'],
    paths: () => [path.join(env('LOCALAPPDATA') ?? '', 'CrashDumps')],
  },
  {
    id: 'chrome-cache',
    kind: 'purge',
    risk: 'caution',
    note: 'rebuild',
    roots: ['LOCALAPPDATA'],
    paths: () => browserCaches(path.join(env('LOCALAPPDATA') ?? '', 'Google', 'Chrome', 'User Data')),
  },
  {
    id: 'edge-cache',
    kind: 'purge',
    risk: 'caution',
    note: 'rebuild',
    roots: ['LOCALAPPDATA'],
    paths: () => browserCaches(path.join(env('LOCALAPPDATA') ?? '', 'Microsoft', 'Edge', 'User Data')),
  },
  {
    id: 'code-cache',
    kind: 'purge',
    risk: 'caution',
    note: 'rebuild',
    roots: ['APPDATA'],
    paths: () => subdirs(env('APPDATA') ?? '', [path.join('Code', 'Cache'), path.join('Code', 'CachedData'), path.join('Code', 'CachedExtensionVSIXs')]),
  },
  {
    id: 'windows-update',
    kind: 'purge',
    risk: 'caution',
    note: 'elevation',
    roots: [],
    paths: () => ['C:\\Windows\\SoftwareDistribution\\Download'],
  },
  {
    id: 'recycle-bin',
    kind: 'purge',
    risk: 'safe',
    roots: [],
    paths: () => recycleBins(),
  },
  {
    id: 'inet-cache',
    kind: 'purge',
    risk: 'caution',
    note: 'rebuild',
    roots: ['LOCALAPPDATA'],
    paths: () => [path.join(env('LOCALAPPDATA') ?? '', 'Microsoft', 'Windows', 'INetCache')],
  },
  {
    id: 'app-updaters',
    kind: 'aged',
    minAgeDays: 3,
    risk: 'caution',
    note: 'pending-update',
    roots: ['LOCALAPPDATA', 'APPDATA'],
    paths: () => appUpdaters(),
  },
  {
    id: 'app-caches',
    kind: 'purge',
    risk: 'caution',
    note: 'rebuild',
    roots: ['APPDATA'],
    paths: () => appCaches(),
  },
  {
    id: 'app-logs',
    kind: 'purge',
    risk: 'safe',
    roots: ['APPDATA'],
    paths: () => appLogs(),
  },
  {
    id: 'app-temp',
    kind: 'aged',
    minAgeDays: 2,
    risk: 'caution',
    note: 'in-use',
    roots: ['APPDATA'],
    paths: () => appTempDirs(),
  },
  {
    id: 'plugin-old-versions',
    kind: 'purge',
    risk: 'caution',
    note: 'rollback',
    roots: ['APPDATA'],
    paths: () => wpsPluginOldVersions(),
  },
  {
    id: 'update-packages',
    kind: 'purge',
    risk: 'caution',
    note: 'superseded',
    roots: ['APPDATA'],
    paths: () => supersededUpdatePackages(),
  },
];

const byId = new Map(CATALOG.map((entry) => [entry.id, entry]));

/** A path is refused unless it is deep enough to be a cache and not a filesystem root. */
const tooBroad = (abs) => {
  const parts = path.resolve(abs).split(path.sep).filter(Boolean);
  return parts.length < 3 || /^[A-Za-z]:$/.test(path.resolve(abs));
};

const realOrSelf = (p) => {
  try {
    return fs.realpathSync.native(p);
  } catch {
    return path.resolve(p);
  }
};

const within = (abs, root) => {
  const a = realOrSelf(abs);
  const r = realOrSelf(root);
  const rel = path.relative(r, a);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
};

/** A volume such as `C:\`; anything else (including undefined) means every volume. */
const onDrive = (abs, drive) => drive === undefined || path.parse(abs).root.toLowerCase() === drive.toLowerCase();

/**
 * Some targets are single files (an already-applied update package) rather than directories,
 * so every step below answers both. A file target is unlinked directly and never has its
 * parent removed.
 */
const isFile = (p) => {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
};

/** Resolve catalog ids to the concrete directories that exist right now, optionally on one volume. */
export function resolveTargets(only, drive) {
  const selected = only === undefined ? CATALOG : CATALOG.filter((entry) => only.includes(entry.id));
  return selected.map((entry) => {
    const found = [];
    for (const candidate of entry.paths()) {
      if (typeof candidate !== 'string' || candidate === '') continue;
      if (tooBroad(candidate)) continue;
      if (!isDir(candidate) && !isFile(candidate)) continue;
      if (!onDrive(candidate, drive)) continue;
      const roots = entry.roots.map((name) => env(name)).filter(Boolean);
      if (roots.length > 0 && !roots.some((root) => within(candidate, root))) continue;
      if (!found.includes(candidate)) found.push(candidate);
    }
    // The volume each target sits on, so a caller can group or filter by drive.
    const drives = [...new Set(found.map((abs) => path.parse(abs).root))];
    return {
      id: entry.id,
      kind: entry.kind,
      risk: entry.risk,
      note: entry.note ?? '',
      minAgeDays: entry.minAgeDays ?? 0,
      paths: found,
      drives,
    };
  });
}

export async function measurePath(abs) {
  if (isFile(abs)) {
    try {
      return { bytes: fs.statSync(abs).size, files: 1 };
    } catch {
      return { bytes: 0, files: 0 };
    }
  }
  let bytes = 0;
  let files = 0;
  let seen = 0;
  const stack = [abs];
  while (stack.length > 0 && seen < MAX_ENTRIES) {
    const dir = stack.pop();
    let handle;
    try {
      handle = await fsp.opendir(dir);
    } catch {
      continue;
    }
    try {
      for await (const entry of handle) {
        seen += 1;
        if (entry.isSymbolicLink()) continue;
        if (entry.isDirectory()) {
          stack.push(path.join(dir, entry.name));
          continue;
        }
        if (!entry.isFile()) continue;
        try {
          bytes += (await fsp.stat(path.join(dir, entry.name))).size;
          files += 1;
        } catch {
          /* a file that vanished or is locked contributes nothing */
        }
      }
    } catch {
      /* an unreadable directory ends this branch */
    }
  }
  return { bytes, files };
}

/** Measure every resolved target concurrently, keeping the host event loop free. */
export async function scan(only, drive) {
  const targets = resolveTargets(only, drive);
  const measured = await Promise.all(
    targets.map(async (target) => {
      let bytes = 0;
      let files = 0;
      for (const abs of target.paths) {
        const size = await measurePath(abs);
        bytes += size.bytes;
        files += size.files;
      }
      return { ...target, bytes, files };
    }),
  );
  return measured;
}

async function purgePath(abs, cutoff) {
  let bytes = 0;
  let removed = 0;
  let failed = 0;
  const dirs = [];
  const stack = [abs];
  while (stack.length > 0 && dirs.length < MAX_ENTRIES) {
    const dir = stack.pop();
    dirs.push(dir);
    let handle;
    try {
      handle = await fsp.opendir(dir);
    } catch {
      failed += 1;
      continue;
    }
    try {
      for await (const entry of handle) {
        const full = path.join(dir, entry.name);
        if (entry.isSymbolicLink()) continue;
        if (entry.isDirectory()) {
          stack.push(full);
          continue;
        }
        if (!entry.isFile()) continue;
        try {
          const stat = await fsp.stat(full);
          if (cutoff !== undefined && stat.mtimeMs > cutoff) continue;
          await fsp.unlink(full);
          bytes += stat.size;
          removed += 1;
        } catch {
          failed += 1;
        }
      }
    } catch {
      failed += 1;
    }
  }
  // Deepest first; index 0 is the target itself, which stays as an empty directory.
  for (let i = dirs.length - 1; i > 0; i -= 1) {
    try {
      await fsp.rmdir(dirs[i]);
    } catch {
      /* still holds a kept or undeletable file, which is expected */
    }
  }
  return { bytes, removed, failed };
}

/** Delete the contents of the selected targets, or with `dryRun` only report what it would delete. */
export async function clean(ids, options = {}) {
  const dryRun = options.dryRun === true;
  const targets = resolveTargets(ids, options.drive);
  const results = [];
  for (const target of targets) {
    const cutoff = target.minAgeDays > 0 ? Date.now() - target.minAgeDays * DAY : undefined;
    if (dryRun) {
      let bytes = 0;
      let files = 0;
      for (const abs of target.paths) {
        const size = await measurePath(abs);
        bytes += size.bytes;
        files += size.files;
      }
      results.push({ id: target.id, bytes, removed: files, failed: 0 });
      continue;
    }
    let bytes = 0;
    let removed = 0;
    let failed = 0;
    for (const abs of target.paths) {
      if (tooBroad(abs)) {
        failed += 1;
        continue;
      }
      if (isFile(abs)) {
        try {
          const stat = await fsp.stat(abs);
          if (cutoff !== undefined && stat.mtimeMs > cutoff) continue;
          await fsp.unlink(abs);
          bytes += stat.size;
          removed += 1;
        } catch {
          failed += 1;
        }
        continue;
      }
      const outcome = await purgePath(abs, cutoff);
      bytes += outcome.bytes;
      removed += outcome.removed;
      failed += outcome.failed;
    }
    results.push({ id: target.id, bytes, removed, failed });
  }
  return results;
}

/** Per-drive capacity, measured with the same call the filesystem itself answers. */
export function drives() {
  const out = [];
  for (const letter of 'CDEFGHIJKLMNOPQRSTUVWXYZ') {
    const root = `${letter}:\\`;
    try {
      const stat = fs.statfsSync(root);
      const blockSize = Number(stat.bsize);
      const total = blockSize * Number(stat.blocks);
      const free = blockSize * Number(stat.bavail);
      if (!Number.isFinite(total) || total <= 0) continue;
      out.push({ root, total, free, used: total - free });
    } catch {
      /* no volume at this letter */
    }
  }
  return out;
}

export const catalogIds = () => CATALOG.map((entry) => entry.id);
export const hasTarget = (id) => byId.has(id);
