/**
 * Read-only space assessment.
 *
 * The catalog above can only ever *delete* from directories it already knows are caches.
 * Most of the space on a real disk is not cache at all — it is installed programs, WSL
 * disk images, chat-app data, Windows component store, and the user's own files. Those
 * must never be auto-deleted, but the user still needs to see where the space went.
 *
 * So this module measures and reports, and exposes no deletion at all. Anything it finds
 * is advisory: the panel shows it as a lead to investigate, not a button to press.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { drives, measurePath, scan } from './catalog.js';
import { buildPlan } from './plan.js';

const { promises: fsp } = fs;

const MB = 1024 * 1024;

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

const sizeOfFile = (p) => {
  try {
    const stat = fs.statSync(p);
    return stat.isFile() ? stat.size : 0;
  } catch {
    return 0;
  }
};

/**
 * Each area is a category the user recognises, described by where it lives and why it is
 * not something this plugin will remove. `group` separates the three different kinds of
 * answer: `system` (Windows itself), `app` (installed software and its data), `personal`
 * (the user's own files).
 */
const AREAS = () => {
  const home = os.homedir();
  const local = env('LOCALAPPDATA') ?? '';
  const roaming = env('APPDATA') ?? '';
  const systemDrive = env('SystemDrive') ?? 'C:';

  return [
    {
      id: 'wsl',
      group: 'system',
      label: 'WSL distros (ext4.vhdx)',
      why: 'Virtual disks grow but never shrink on their own; compacting one is a separate, deliberate operation.',
      paths: () => virtualDisks(path.join(local, 'wsl')),
    },
    {
      id: 'winsxs',
      group: 'system',
      label: 'Windows component store (WinSxS)',
      why: 'Holds rollback copies of system components. Only DISM can service it, and it needs an elevated prompt.',
      paths: () => [path.join(systemDrive + path.sep, 'Windows', 'WinSxS')],
    },
    {
      id: 'system-files',
      group: 'system',
      label: 'Hibernation and page files',
      why: 'Reserved by Windows at boot. Turned off through system settings, never by deleting the file.',
      files: () => ['hiberfil.sys', 'pagefile.sys', 'swapfile.sys'].map((name) => path.join(systemDrive + path.sep, name)),
    },
    {
      id: 'programs',
      group: 'app',
      label: 'Installed programs (user scope)',
      why: 'Actual applications under your profile. Uninstall them, do not delete the folder.',
      paths: () => [path.join(local, 'Programs')],
    },
    {
      id: 'program-files',
      group: 'app',
      label: 'Installed programs (machine scope)',
      why: 'Machine-wide applications. Uninstall through Settings.',
      paths: () => [path.join(systemDrive + path.sep, 'Program Files'), path.join(systemDrive + path.sep, 'Program Files (x86)')],
    },
    {
      id: 'downloads',
      group: 'personal',
      label: 'Downloads',
      why: 'Your own files. Only you can decide what is finished with.',
      paths: () => [path.join(home, 'Downloads')],
    },
    {
      id: 'documents',
      group: 'personal',
      label: 'Documents',
      why: 'Your own files.',
      paths: () => [path.join(home, 'Documents')],
    },
    {
      id: 'pictures',
      group: 'personal',
      label: 'Pictures',
      why: 'Your own files.',
      paths: () => [path.join(home, 'Pictures')],
    },
    {
      id: 'videos',
      group: 'personal',
      label: 'Videos',
      why: 'Your own files.',
      paths: () => [path.join(home, 'Videos')],
    },
    {
      id: 'desktop',
      group: 'personal',
      label: 'Desktop',
      why: 'Your own files.',
      paths: () => [path.join(home, 'Desktop')],
    },
  ];
};

/** WSL keeps one ext4.vhdx per distro, one level down under a GUID-named folder. */
const virtualDisks = (root) => {
  if (!isDir(root)) return [];
  const out = [];
  let entries = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const distro = path.join(root, entry.name);
    let inner = [];
    try {
      inner = fs.readdirSync(distro, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const item of inner) {
      if (item.isFile() && item.name.toLowerCase().endsWith('.vhdx')) out.push(path.join(distro, item.name));
    }
  }
  return out;
};

/**
 * Measure every area that can be addressed at all. Areas that resolve to nothing are
 * dropped rather than reported as zero, so the list only shows what actually exists.
 */
/**
 * Long enough that returning to the panel within a normal work session is instant, short
 * enough that a folder cleared half an hour ago does not still show its old size.
 */
const CACHE_TTL = 600_000;
let cached = undefined;
let cachedAt = 0;

/**
 * A real deletion invalidates the measurement it was based on: the panel re-assesses right
 * after a clean, and serving the old numbers would keep recommending space already freed.
 */
export function invalidateAudit() {
  cached = undefined;
  cachedAt = 0;
}

/**
 * Measure the whole disk's non-cache space. This is a deep walk (it takes a minute or two
 * on a full disk), so a result is reused for a short while: the panel and the agent ask
 * for the same picture within moments of each other, and re-walking every app folder for
 * the second caller buys nothing.
 */
export async function audit() {
  if (cached !== undefined && Date.now() - cachedAt < CACHE_TTL) return { ...cached, cached: true };
  const [areas, largestApps, reclaimable] = await Promise.all([
    Promise.all(AREAS().map(measureArea)),
    largestAppDirs(),
    scan(),
  ]);
  const measured = areas.filter(Boolean).sort((a, b) => b.bytes - a.bytes);
  const plan = buildPlan({ areas: measured, largestApps, reclaimable, driveInfo: drives() });
  cached = { areas: measured, largestApps, plan };
  cachedAt = Date.now();
  return { ...cached, cached: false };
}

/** Measure one area, or return null when none of its locations exist. */
async function measureArea(area) {
  let bytes = 0;
  let files = 0;
  let present = 0;
  let first;

  for (const file of area.files?.() ?? []) {
    const size = sizeOfFile(file);
    if (size > 0) {
      bytes += size;
      files += 1;
      present += 1;
      first ??= file;
    }
  }
  for (const abs of area.paths?.() ?? []) {
    const found = isDir(abs) ? await measurePath(abs) : { bytes: sizeOfFile(abs), files: 1 };
    if (found.bytes <= 0 && found.files <= 0) continue;
    bytes += found.bytes;
    files += found.files;
    present += 1;
    first ??= abs;
  }

  if (present === 0) return null;
  return { id: area.id, group: area.group, label: area.label, why: area.why, bytes, files, first };
}

/**
 * The single biggest contributors under the two app-data roots. This is what makes the
 * audit actionable: "3.6 GB in Roaming\kingsoft" points somewhere a Settings page does not.
 *
 * ponytail: the trees under the named areas (Programs, wsl, Temp, Downloads) get walked a
 * second time here, which is most of the ~45s first-run cost. The TTL cache means only the
 * first caller pays and every later one is instant. Measure each app-data root once into a
 * shared map only if a cold run is still too slow to sit through.
 */
async function largestAppDirs() {
  const out = [];
  for (const [root, label] of [
    [env('LOCALAPPDATA'), 'local'],
    [env('APPDATA'), 'roaming'],
  ]) {
    if (root === undefined || !isDir(root)) continue;
    let entries = [];
    try {
      entries = fs.readdirSync(root, { withFileTypes: true });
    } catch {
      continue;
    }
    const found = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
        .map(async (entry) => {
          const measured = await measurePath(path.join(root, entry.name));
          return { scope: label, name: entry.name, bytes: measured.bytes, files: measured.files };
        }),
    );
    for (const item of found) {
      if (item.bytes >= 100 * MB) out.push(item);
    }
  }
  return out.sort((a, b) => b.bytes - a.bytes).slice(0, 10);
}
