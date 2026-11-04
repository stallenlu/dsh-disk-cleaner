/**
 * Turn measurements into an ordered plan.
 *
 * An assessment that only says "79 GB is in WSL" leaves the user to work out what to do,
 * which is the hard part. This module turns the same numbers into steps, ordered by what
 * it costs the user to act: zero-risk deletions first, then the one deliberate operation
 * that reclaims the most, then things only the user can decide.
 *
 * Every step carries a `code` and its numbers; the wording lives in the client locale, the
 * same split the cleaner rows already use. Steps this plugin cannot perform carry the exact
 * Windows command, because "compact your WSL disk" without the command is not a plan.
 */
const MB = 1024 * 1024;
const GB = 1024 * MB;

/** Below this a step is noise — a 3 MB win does not deserve a line in a plan. */
const FLOOR = 200 * MB;

/** The list of app folders that a cache target or an area already accounts for. */
const COVERED = new Set(['wsl', 'temp', 'programs', 'npm-cache', 'pnpm', 'pip', 'uv']);

const sum = (rows) => rows.reduce((total, row) => total + row.bytes, 0);
const fileSum = (rows) => rows.reduce((total, row) => total + (row.files || 0), 0);
const rootOf = (abs) => (typeof abs === 'string' && /^[A-Za-z]:/.test(abs) ? abs[0].toUpperCase() : '');

/**
 * The drive with the most room that is not the one holding `abs`. Moving folders only helps
 * when there is somewhere to move them to, which is why this is measured rather than assumed.
 */
const roomElsewhere = (driveInfo, abs) => {
  const here = rootOf(abs);
  const candidates = driveInfo.filter((drive) => drive.root[0] !== here);
  if (candidates.length === 0) return undefined;
  return candidates.sort((a, b) => b.free - a.free)[0];
};

export function buildPlan({ areas, largestApps, reclaimable, driveInfo }) {
  const steps = [];
  const byId = new Map(areas.map((area) => [area.id, area]));

  // Space this plugin cannot actually reach from an unelevated process must never appear as
  // "reclaimable now": the delete would fail and the plan would promise bytes it cannot free.
  const reachable = reclaimable.filter((row) => row.note !== 'elevation');

  // 1. Zero-cost wins. Pure caches: deleting them costs a slower first start, nothing else.
  const safe = reachable.filter((row) => row.risk === 'safe' && row.bytes >= FLOOR);
  if (safe.length > 0) {
    steps.push({
      code: 'reclaim-safe',
      bytes: sum(safe),
      files: fileSum(safe),
      ids: safe.map((row) => row.id),
      count: safe.length,
    });
  }

  // 2. Same deletion, known rebuild cost — still worth doing, but the user should agree.
  const caution = reachable.filter((row) => row.risk !== 'safe' && row.bytes >= FLOOR);
  if (caution.length > 0) {
    steps.push({
      code: 'reclaim-caution',
      bytes: sum(caution),
      files: fileSum(caution),
      ids: caution.map((row) => row.id),
      count: caution.length,
    });
  }

  // 3. The single biggest structural win on most developer machines: a virtual disk that
  //    only ever grew. It cannot be shrunk while it is mounted, so this is one deliberate
  //    operation, not a deletion.
  const wsl = byId.get('wsl');
  if (wsl && wsl.bytes >= GB) {
    steps.push({
      code: 'wsl-compact',
      bytes: wsl.bytes,
      vhdx: wsl.first,
      command:
        `wsl --shutdown\n` +
        `diskpart\n` +
        `  select vdisk file="${wsl.first ?? '<path to ext4.vhdx>'}"\n` +
        `  attach vdisk readonly\n` +
        `  compact vdisk\n` +
        `  detach vdisk\n` +
        `  exit`,
    });
  }

  // 4. Windows' own rollback copies. Only DISM may service this store, and only elevated.
  const winsxs = byId.get('winsxs');
  if (winsxs && winsxs.bytes >= GB) {
    steps.push({
      code: 'winsxs-cleanup',
      bytes: winsxs.bytes,
      command: 'Dism.exe /Online /Cleanup-Image /StartComponentCleanup',
    });
  }

  // 5. Reserved system files. Turned off in settings, never deleted.
  const systemFiles = byId.get('system-files');
  if (systemFiles && systemFiles.bytes >= FLOOR) {
    steps.push({ code: 'hibernate-off', bytes: systemFiles.bytes, command: 'powercfg.exe /hibernate off' });
  }

  // 6. Space that exists but a normal window cannot delete: Windows' own folders refuse an
  //    unelevated process. No shell one-liner here — the fix is to run this plugin elevated,
  //    which the user can do without trusting a copied command.
  const elevated = reclaimable.filter((row) => row.note === 'elevation' && row.bytes >= FLOOR);
  if (elevated.length > 0) {
    steps.push({
      code: 'elevation-clean',
      bytes: sum(elevated),
      files: fileSum(elevated),
      ids: elevated.map((row) => row.id),
      count: elevated.length,
    });
  }

  // 7. Installed software. The plugin cannot uninstall anything, so it names the folders
  //    that are worth opening Settings for, biggest first.
  const apps = largestApps.filter((app) => app.bytes >= GB && !COVERED.has(app.name.toLowerCase())).slice(0, 3);
  for (const app of apps) {
    steps.push({ code: 'app-review', name: app.name, scope: app.scope, bytes: app.bytes });
  }

  // 8. The user's own folders, when another drive has room to take them.
  const personal = areas
    .filter((area) => area.group === 'personal' && area.bytes >= 2 * GB)
    .slice(0, 3);
  for (const area of personal) {
    const target = roomElsewhere(driveInfo, area.first);
    if (!target) continue;
    steps.push({
      code: 'move-folder',
      folder: area.label,
      bytes: area.bytes,
      drive: target.root,
      free: target.free,
    });
  }

  // 9. Context for everything above: how tight the drive actually is.
  const primary = driveInfo.find((drive) => drive.root[0] === (process.env.SystemDrive ?? 'C:')[0]);
  if (primary && primary.total > 0 && primary.free / primary.total < 0.12) {
    steps.push({ code: 'pressure', drive: primary.root, free: primary.free, total: primary.total });
  }

  const now = sum(steps.filter((step) => step.code === 'reclaim-safe' || step.code === 'reclaim-caution'));
  return { steps, reclaimNow: now };
}
