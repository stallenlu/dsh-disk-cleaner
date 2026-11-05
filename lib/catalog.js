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

/** The user profile, which roots every target built from a dot-directory in the home folder. */
const home = () => env('USERPROFILE') ?? '';

/**
 * Per-session backup dumps an editor's agent keeps beside a workspace, such as WorkBuddy's
 * `sessions/<id>/modify_backup`. Each file is a whole-file snapshot ten-odd days old; the
 * session's live state is elsewhere in the same folder, so the dumps are pure history.
 */
const sessionBackups = () => {
  const sessions = path.join(home(), '.workbuddy', 'workspace', 'sessions');
  const out = [];
  for (const entry of listDir(sessions)) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const backup = path.join(sessions, entry.name, 'modify_backup');
    if (isDir(backup)) out.push(backup);
  }
  return out;
};

/** `2026-11-04` and `20261104` both name one day; anything else is not a log archive. */
const LOG_DAY = /^(\d{4})-?(\d{2})-?(\d{2})$/;

/**
 * Day-named log archives an app writes and never prunes. The age limit on the target does
 * the pruning per file, so this only has to name the folders that look like a date.
 */
const datedLogDirs = (roots) => {
  const out = [];
  for (const root of roots) {
    for (const entry of listDir(root)) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      if (LOG_DAY.exec(entry.name) === null) continue;
      out.push(path.join(root, entry.name));
    }
  }
  return out;
};

/**
 * Sibling directories that repeat each other, decided by the content hash the owner writes
 * into its own metadata file. A snapshot keeper leaves the previous extraction behind after
 * an upgrade; two of them here were byte-identical. The newest stays, and a sibling with no
 * metadata proves nothing, so it is never touched.
 */
const repeatedSiblings = (parent, metaName, key) => {
  if (!isDir(parent)) return [];
  const groups = new Map();
  for (const entry of listDir(parent)) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const abs = path.join(parent, entry.name);
    let stamp;
    try {
      stamp = JSON.parse(fs.readFileSync(path.join(abs, metaName), 'utf8'))[key];
    } catch {
      continue;
    }
    if (typeof stamp !== 'string' || stamp === '') continue;
    if (!groups.has(stamp)) groups.set(stamp, []);
    let mtimeMs = 0;
    try {
      mtimeMs = fs.statSync(abs).mtimeMs;
    } catch {
      /* unreadable sorts last, so a broken copy is the one dropped */
    }
    groups.get(stamp).push({ abs, mtimeMs });
  }
  const out = [];
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    list.sort((a, b) => b.mtimeMs - a.mtimeMs);
    for (const older of list.slice(1)) out.push(older.abs);
  }
  return out;
};

/** Every child directory but the most recently written one; a lone child is left alone. */
const keepNewestChild = (parent) => {
  if (!isDir(parent)) return [];
  const stamped = listDir(parent)
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
    .map((entry) => {
      const abs = path.join(parent, entry.name);
      let mtimeMs = 0;
      try {
        mtimeMs = fs.statSync(abs).mtimeMs;
      } catch {
        /* unreadable sorts last */
      }
      return { abs, mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  if (stamped.length < 2) return [];
  return stamped.slice(1).map((item) => item.abs);
};

/**
 * An editor that ships a whole runtime per commit leaves the previous one behind after every
 * update: VS Code kept two complete 764 MB trees plus `old_Code.exe`. Unlike a version holder,
 * the tree names are commit hashes, so the newest mtime proves nothing — the launcher does.
 * `bin\code.cmd` names the live hash, and a build is only dropped when that launcher exists,
 * parses, and points at a different build that is also present. No launcher, no deletion.
 *
 * The renamed `old_*` copies are dead weight only while the file they duplicate still sits
 * beside them; a lone `old_x` may be the only copy left, so it stays.
 */
const vscodeSuperseded = () => {
  const appDir = path.join(env('LOCALAPPDATA') ?? '', 'Programs', 'Microsoft VS Code');
  if (!isDir(appDir)) return [];
  const out = [];
  let live = '';
  try {
    const launcher = fs.readFileSync(path.join(appDir, 'bin', 'code.cmd'), 'utf8');
    const match = /[\\/]([0-9a-f]{10,})[\\/]/.exec(launcher);
    if (match !== null) live = match[1];
  } catch {
    /* no launcher means no evidence about which build runs, so nothing is dropped */
  }
  if (live !== '') {
    const builds = listDir(appDir)
      .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
      .map((entry) => entry.name)
      .filter((name) => /^[0-9a-f]{10,}$/.test(name));
    if (builds.length >= 2 && builds.includes(live)) {
      for (const name of builds) if (name !== live) out.push(path.join(appDir, name));
    }
  }
  for (const dir of [appDir, path.join(appDir, 'bin')]) {
    for (const entry of listDir(dir)) {
      if (!entry.isFile() || entry.isSymbolicLink()) continue;
      const match = /^old_(.+)$/.exec(entry.name);
      if (match === null) continue;
      if (!isFile(path.join(dir, match[1]))) continue;
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
};

/**
 * The Chromium caches an Electron-based agent app writes under its own app folder. The root
 * is spelled out per app because the sibling `cache` next to it (`~/.workbuddy/cache`) holds
 * spilled conversation text rather than anything regenerable — it stays.
 */
const agentAppCaches = () => {
  const out = [];
  for (const name of ['.workbuddy', '.workbuddy-ai']) {
    const app = path.join(home(), name, 'app');
    out.push(...subdirs(path.join(app, 'session'), ['Cache', 'Code Cache', 'GPUCache', 'DawnCache', 'ShaderCache']));
    out.push(...subdirs(app, ['cache', 'CodeCache']));
  }
  return out;
};

/**
 * Rewind snapshots this harness writes one folder per session, never pruning. The folders are
 * named by session id, so age is the only signal; the target's 30-day floor keeps a recent
 * session restorable.
 */
const rewindSnapshots = () => {
  const root = path.join(home(), '.dsh', 'rewind-snapshots');
  return listDir(root)
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
    .map((entry) => path.join(root, entry.name));
};

/**
 * A log file rotated out of the way — `daemon.old.log`, `main.log.1` — as opposed to the
 * day-named folders the `agent-logs` target covers. Nothing reads a rotated file at runtime.
 */
const rotatedLogs = () => {
  const out = [];
  for (const name of ['.workbuddy', '.workbuddy-ai', '.qoder', '.zcode', '.codebuddy']) {
    const logs = path.join(home(), name, 'logs');
    for (const entry of listDir(logs)) {
      if (!entry.isFile() || entry.isSymbolicLink()) continue;
      if (!/\.(old\.log|log\.[0-9]+)$/i.test(entry.name)) continue;
      out.push(path.join(logs, entry.name));
    }
  }
  return out;
};

/** The one-generation database copies Zotero writes beside the library it is using. */
const zoteroBackups = () => {
  const data = path.join(home(), 'Zotero');
  return listDir(data)
    .filter((entry) => entry.isFile() && !entry.isSymbolicLink())
    .filter((entry) => /\.sqlite[0-9.]*\.bak$/i.test(entry.name))
    .map((entry) => path.join(data, entry.name));
};

/**
 * Qoder keeps one complete build per version under `.qoder-versions` and never removes the
 * one it replaced. The launcher writes the live build into `state.ini`
 * (`appExecutable=.qoder-versions\0.5.3\Qoder.exe`); `install.ini` next to it still names an
 * older version, so only `state.ini` is read. No readable state file means no evidence about
 * which build runs, and then nothing is returned at all.
 */
const qoderOldVersions = () => {
  const versions = path.join(env('LOCALAPPDATA') ?? '', 'Programs', 'Qoder', '.qoder-versions');
  if (!isDir(versions)) return [];
  let live = '';
  try {
    const state = fs.readFileSync(
      path.join(env('LOCALAPPDATA') ?? '', 'Qoder', 'Qoder Launcher', 'state.ini'),
      'utf8',
    );
    const match = /appExecutable\s*=\s*(.+)/.exec(state);
    if (match !== null) {
      const parts = match[1].trim().split(/[\\/]/).filter(Boolean);
      const index = parts.indexOf('.qoder-versions');
      if (index !== -1 && parts[index + 1] !== undefined) live = parts[index + 1];
    }
  } catch {
    /* no state.ini, no proof of which build is live: drop nothing */
  }
  if (live === '') return [];
  const builds = listDir(versions)
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
    .map((entry) => entry.name);
  if (builds.length < 2 || !builds.includes(live)) return [];
  return builds.filter((name) => name !== live).map((name) => path.join(versions, name));
};

/**
 * The plugin packages the WeChat devtools downloads per account. They are fetched again the
 * next time a mini program needs one, which is why this stays behind an age limit.
 */
const wechatDevtoolsCaches = () => {
  const data = path.join(env('LOCALAPPDATA') ?? '', '微信开发者工具', 'User Data');
  const out = [];
  for (const entry of listDir(data)) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    out.push(...subdirs(path.join(data, entry.name), ['WeappPlugin', 'WeappForeignPkgs', 'WeappVendor']));
  }
  return out;
};

/**
 * The newest modification time anywhere under a folder, or 0 when it cannot be read. Used to
 * tell "this app was uninstalled" from "this app is installed but its cache happens to be old":
 * only a completely quiet tree is treated as an orphan.
 */
const newestMtime = (dir) => {
  let newest = 0;
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    let handle;
    try {
      handle = fs.opendirSync(current);
    } catch {
      continue;
    }
    let entry;
    while ((entry = handle.readSync()) !== null) {
      const abs = path.join(current, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        stack.push(abs);
        continue;
      }
      try {
        const stat = statReal(abs);
        if (stat.mtimeMs > newest) newest = stat.mtimeMs;
      } catch {
        /* unreadable file contributes nothing */
      }
    }
    try {
      handle.closeSync();
    } catch {
      /* already closed */
    }
  }
  return newest;
};

/**
 * The Chromium caches left in `%LOCALAPPDATA%` by apps that are gone or idle. Each root is
 * listed because the app name alone proves nothing: `JianyingPro` and `DingTalk_108` have no
 * install and no shortcut, while `electron` and the devtools are still in use, so the age
 * limit is what keeps a live app's cache out of the result.
 */
const appDataCaches = () => {
  const local = env('LOCALAPPDATA') ?? '';
  const out = [
    path.join(local, 'electron', 'Cache'),
    ...subdirs(path.join(local, 'DingTalk_108'), ['Cache', 'Code Cache', 'Service Worker']),
    ...subdirs(path.join(local, 'JianyingPro', 'User Data'), ['Cache', 'Resources']),
    ...wechatDevtoolsCaches(),
  ];
  return out.filter((candidate) => isDir(candidate));
};

/**
 * `purge` targets drop every entry under the path. `aged` targets keep anything modified
 * within `minAgeDays`, because those files may belong to a process that is still running.
 *
 * `note` says why a target carries the `caution` risk, in one stable code the UI
 * translates: 'in-use' (a running program may hold these files), 'rebuild' (the owner
 * regenerates them, so the first use afterwards is slower), 'elevation' (Windows
 * refuses an unelevated delete), 'pending-update' (a download that may not be applied
 * yet), 'rollback' (an older version kept beside the live one), 'superseded' (an update
 * package the installed version already contains), 'history' (a snapshot nothing reads
 * back), 'duplicate' (a byte-identical copy of a live directory), 'database-backup' (a copy of
 * a database file made before an upgrade) or 'orphan' (the app that wrote this folder is no
 * longer installed anywhere). Safe targets have none.
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
    // pnpm 11 kept its content under `store`; 12 moved it to `package-manager-store` and left
    // `store` behind as an empty shell, so both are listed. `pnpm-cache` holds only registry
    // metadata, which pnpm downloads again on demand.
    roots: ['LOCALAPPDATA'],
    paths: () => [
      path.join(env('LOCALAPPDATA') ?? '', 'pnpm', 'store'),
      path.join(env('LOCALAPPDATA') ?? '', 'pnpm', 'package-manager-store'),
      path.join(env('LOCALAPPDATA') ?? '', 'pnpm-cache'),
    ],
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
  {
    id: 'session-backups',
    kind: 'purge',
    risk: 'caution',
    note: 'history',
    roots: ['USERPROFILE'],
    paths: () => sessionBackups(),
  },
  {
    id: 'agent-logs',
    kind: 'aged',
    minAgeDays: 3,
    risk: 'safe',
    roots: ['USERPROFILE'],
    paths: () => datedLogDirs([path.join(home(), '.workbuddy', 'logs'), path.join(home(), '.workbuddy-ai', 'logs')]),
  },
  {
    id: 'toolchain-snapshots',
    kind: 'purge',
    risk: 'caution',
    note: 'duplicate',
    roots: ['USERPROFILE'],
    paths: () => repeatedSiblings(path.join(home(), '.dsh', 'dsh-ops', 'bash-ipc'), '.ops-ipc.json', 'patchedSha256'),
  },
  {
    id: 'editor-server-bundles',
    kind: 'purge',
    risk: 'caution',
    note: 'superseded',
    roots: ['USERPROFILE'],
    paths: () => keepNewestChild(path.join(home(), 'vscode-remote-wsl', 'stable')),
  },
  {
    id: 'database-backups',
    kind: 'purge',
    risk: 'caution',
    note: 'database-backup',
    roots: ['USERPROFILE'],
    paths: () => zoteroBackups(),
  },
  {
    id: 'editor-builds',
    kind: 'purge',
    risk: 'caution',
    note: 'superseded',
    roots: ['LOCALAPPDATA'],
    paths: () => vscodeSuperseded(),
  },
  {
    id: 'agent-app-caches',
    kind: 'purge',
    risk: 'caution',
    note: 'rebuild',
    roots: ['USERPROFILE'],
    paths: () => agentAppCaches(),
  },
  {
    id: 'rewind-snapshots',
    kind: 'aged',
    minAgeDays: 30,
    risk: 'caution',
    note: 'history',
    roots: ['USERPROFILE'],
    paths: () => rewindSnapshots(),
  },
  {
    id: 'rotated-logs',
    kind: 'aged',
    minAgeDays: 3,
    risk: 'safe',
    roots: ['USERPROFILE'],
    paths: () => rotatedLogs(),
  },
  {
    id: 'qoder-old-versions',
    kind: 'purge',
    risk: 'caution',
    note: 'rollback',
    roots: ['LOCALAPPDATA'],
    paths: () => qoderOldVersions(),
  },
  {
    id: 'orphan-app-data',
    kind: 'purge',
    risk: 'caution',
    note: 'orphan',
    roots: ['LOCALAPPDATA'],
    paths: () => {
      const guild = path.join(env('LOCALAPPDATA') ?? '', 'Tencent', 'QQGuild');
      // Measured: no Start-menu shortcut, no uninstall entry, no Program Files folder and no
      // file touched for over two years. The folder also carries its own `Uninstall QQGuild.exe`,
      // which only a real install does. Every one of those signals has to agree before it goes.
      const recent = newestMtime(guild) > Date.now() - 30 * DAY;
      return isDir(guild) && !recent ? [guild] : [];
    },
  },
  {
    id: 'app-data-caches',
    kind: 'aged',
    minAgeDays: 7,
    risk: 'caution',
    note: 'rebuild',
    roots: ['LOCALAPPDATA'],
    paths: () => appDataCaches(),
  },
  {
    id: 'office-update-cache',
    kind: 'purge',
    risk: 'caution',
    note: 'superseded',
    roots: ['LOCALAPPDATA'],
    paths: () => [path.join(env('LOCALAPPDATA') ?? '', 'Microsoft', 'Office', 'SolutionPackages')],
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
    return statReal(p).isFile();
  } catch {
    return false;
  }
};

/**
 * `fs.statSync` with Electron's asar layer switched off for the call.
 *
 * The host is an Electron app, and its patched fs answers size 0 for any `*.asar` it cannot
 * parse as an archive. A superseded editor build can hold exactly one file — a 58 MB
 * `node_modules.asar` — so without this the target reports "0 B" and reads as nothing found.
 * The switch is synchronous and restored immediately, so no other filesystem call sees it.
 */
function statReal(p) {
  const prior = process.noAsar;
  process.noAsar = true;
  try {
    return fs.statSync(p);
  } finally {
    process.noAsar = prior;
  }
}

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

/**
 * Total the files under `abs`, answering two questions in one pass: how much the whole thing
 * holds (`bytes` / `files` when no cutoff is given) and how much a clean would free right now
 * (`bytes` / `files` restricted to the cutoff). Both are returned so a caller can say "245 MB
 * here, 0.2 MB past the age limit" instead of quietly reporting the smaller number.
 */
export async function measurePath(abs, cutoff) {
  if (isFile(abs)) {
    try {
      const stat = statReal(abs);
      const eligible = cutoff === undefined || stat.mtimeMs <= cutoff;
      return eligible
        ? { bytes: stat.size, files: 1, totalBytes: stat.size, totalFiles: 1 }
        : { bytes: 0, files: 0, totalBytes: stat.size, totalFiles: 1 };
    } catch {
      return { bytes: 0, files: 0, totalBytes: 0, totalFiles: 0 };
    }
  }
  let bytes = 0;
  let files = 0;
  let totalBytes = 0;
  let totalFiles = 0;
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
          const stat = statReal(path.join(dir, entry.name));
          totalBytes += stat.size;
          totalFiles += 1;
          if (cutoff !== undefined && stat.mtimeMs > cutoff) continue;
          bytes += stat.size;
          files += 1;
        } catch {
          /* a file that vanished or is locked contributes nothing */
        }
      }
    } catch {
      /* an unreadable directory ends this branch */
    }
  }
  return { bytes, files, totalBytes, totalFiles };
}

/**
 * Measure every resolved target concurrently, keeping the host event loop free. `bytes` is what
 * a clean would free right now (the target's own age limit applied); `totalBytes` is what the
 * folders hold. Reporting both is what tells the user "245 MB here, 0.2 MB past the limit"
 * instead of a small number that reads as "nothing found".
 */
export async function scan(only, drive) {
  const targets = resolveTargets(only, drive);
  const measured = await Promise.all(
    targets.map(async (target) => {
      const cutoff = target.minAgeDays > 0 ? Date.now() - target.minAgeDays * DAY : undefined;
      let bytes = 0;
      let files = 0;
      let totalBytes = 0;
      let totalFiles = 0;
      for (const abs of target.paths) {
        const size = await measurePath(abs, cutoff);
        bytes += size.bytes;
        files += size.files;
        totalBytes += size.totalBytes;
        totalFiles += size.totalFiles;
      }
      return { ...target, bytes, files, totalBytes, totalFiles };
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
          const stat = statReal(full);
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
        const size = await measurePath(abs, cutoff);
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
          const stat = statReal(abs);
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
