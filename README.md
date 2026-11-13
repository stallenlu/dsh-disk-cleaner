# dsh-disk-cleaner

[English](#english) | [中文](#中文)

<!-- badges -->
| | |
| --- | --- |
| **version** | `1.6.11` |
| **DSH** | `0.2.1-rc.5`（开发与实测版本；用到 `plugins.bundle.config`、`settings.section`） |
| **license** | [MIT](LICENSE) |
| **Node** | `>= 22`（仅运行冒烟测试需要） |
| **平台** | Windows（清理路径按 Windows 目录布局构造） |

<a id="english"></a>
## English

**dsh-disk-cleaner** is a disk-space plugin for [DeepSeek Harness](https://github.com/deepseek-ai) (DSH). It does two different jobs, and keeps them apart on purpose:

1. **Clean** — thirty-two known locations (temp folders, package manager stores, browser caches, crash dumps, the Recycle Bin, leftover update installers, per-app caches and logs, superseded plugin versions and applied update packages). Only these are ever deleted, and the ones that cannot be rebuilt are never preselected.
2. **Assess** — everything the plugin will *not* delete (installed programs, the WSL virtual disk, the Windows component store, chat-app data, your own folders). Measured and listed, never removed.

The assessment ends with a **plan**: the same numbers ordered by what it costs you to act, with the exact Windows command for the steps the plugin cannot perform itself.

Both the panel and the agent reach the *same* operations: the cleaning logic lives once in `lib/catalog.js`, and the HTTP route and the `disk_cleaner` tool are two callers of it.

### Features

| Feature | Description |
| --- | --- |
| Scan | Measures all thirty-two targets concurrently and shows what each occupies |
| Per-drive filter | Chip row of mounted volumes; scanning or cleaning can be limited to one drive, and rows with nothing on that drive disappear |
| Risk labels | Every target is `safe` or `caution`, with a one-line reason (`in-use` / `rebuild` / `elevation` / `pending-update` / `rollback` / `superseded` / `history` / `duplicate` / `database-backup` / `orphan` / `irreversible`) and a permanent legend, so "caution" never means "unspecified" |
| Aged deletion | `temp` and `windows-temp` only remove files older than one day; files a running program still holds are skipped |
| Space assessment | Walks the disk read-only and groups the result into Windows / installed software / your own files, plus the ten largest app-data folders. Any row opens its folder in Explorer — click, right click, or Enter |
| Honest re-run | Re-running the assessment re-measures; a plain call still answers from the ten-minute cache |
| Plan | Nine possible steps, ordered from zero-cost to your-decision-only; the steps the plugin can run have a button, the rest have a copyable command |
| Entry placement | Sidebar icon, settings section, or both (default) — switched from the plugin's own config card or the panel's ⚙ button |
| Behaviour settings | What is preselected after a scan, and whether deleting asks first |
| Grouped list | The thirty-two targets are filed under seven headings — system temp, developer tools, browser caches, app caches, leftover updaters, backups, orphaned data. A section whose targets all read 0 B starts folded, so the list opens with only what there is to clean |
| Panel memory | Scan results, the selection and the assessment survive switching to another panel and back |
| Agent tool | `disk_cleaner` exposes the same five actions to the model, in readable prose |
| Bilingual | Follows the host locale service; zh and en dictionaries ship together |

### Cleanup targets

Every path is built from this table — a caller selects an **id**, never a path, so no user-supplied string can reach an `unlink`.

| id | What it is | Kind | Risk | Why |
| --- | --- | --- | --- | --- |
| `temp` | `%TEMP%`, `%TMP%`, `%LOCALAPPDATA%\Temp` | aged, 1 day | caution | a running program may hold some files |
| `windows-temp` | `C:\Windows\Temp` | aged, 1 day | caution | a service may still hold files; only older ones go |
| `npm-cache` | `%LOCALAPPDATA%\npm-cache` | purge | safe | pure cache |
| `pnpm-store` | `%LOCALAPPDATA%\pnpm\store` | purge | safe | pure cache |
| `pip-cache` | `%LOCALAPPDATA%\pip\Cache` | purge | safe | pure cache |
| `uv-cache` | `%LOCALAPPDATA%\uv\cache` | purge | safe | pure cache |
| `crash-dumps` | `%LOCALAPPDATA%\CrashDumps` | purge | safe | nothing to lose |
| `chrome-cache` | per-profile `Cache`, `Code Cache`, `GPUCache`, `DawnCache`, `ShaderCache`, `GrShaderCache` | purge | caution | rebuilt; next open is slower |
| `edge-cache` | same set, Edge profiles | purge | caution | rebuilt; next open is slower |
| `code-cache` | `%APPDATA%\Code\{Cache,CachedData,CachedExtensionVSIXs}` | purge | caution | rebuilt; next start is slower |
| `windows-update` | `C:\Windows\SoftwareDistribution\Download` | purge | caution | needs elevation |
| `recycle-bin` | `$Recycle.Bin\S-1-5-*` on every mounted volume | purge | caution | emptying it cannot be undone; never preselected |
| `inet-cache` | `%LOCALAPPDATA%\Microsoft\Windows\INetCache` | purge | caution | rebuilt |
| `app-updaters` | `*-updater` folders under `%LOCALAPPDATA%` and `%APPDATA%` — the installers app updaters leave behind | aged, 3 days | caution | a download from the last three days may still be a pending update |
| `app-caches` | named cache folders inside `%APPDATA%`: the WPS CEF cache, FTNN `cef_cache`, and the `Cache` / `Code Cache` / `CachedData` / `GPUCache` of Qoder, Trae, the DSH desktop app, PersonalCenter, the WeChat devtools and QQ PC Manager | purge | caution | CEF and Chromium caches rebuild on next start |
| `app-logs` | log folders inside `%APPDATA%`: FTNN, WeChat, Qoder, Trae, DingTalk, PersonalCenter, Clash Verge | purge | safe | nothing reads an old log back at runtime |
| `app-temp` | scratch folders apps keep inside their own `%APPDATA%` folder instead of `%TEMP%`: `WorkDaddy\client-tmp`, `PersonalCenter\Temp` | aged, 2 days | caution | the owning app may be running and holding files |
| `plugin-old-versions` | every version but the newest of each family in the WPS plugin pool `kingsoft\wps\addons\pool\win-i386` | purge | caution | the manager loads the newest; the rest are rollback copies |
| `update-packages` | update packages already applied: FTNN `.spd` patches whose build number is below the newest `Program Files\FTNN\app\[version]`, and `WorkDaddy\update` installers below the installed version | purge | caution | decided by version comparison, not by age |
| `session-backups` | `modify_backup` folders under `%USERPROFILE%\.workbuddy\workspace\sessions\*` — a whole-file snapshot of edits per agent session | purge | caution | the session itself lives beside the snapshot and does not read it back |
| `agent-logs` | date-named log folders under `%USERPROFILE%\.workbuddy\logs` and `\.workbuddy-ai\logs` | aged, 3 days | safe | nothing reads an old log back |
| `toolchain-snapshots` | duplicate snapshots under `%USERPROFILE%\.dsh\dsh-ops\bash-ipc`: folders whose `.ops-ipc.json` carries the same `patchedSha256` collapse to the newest | purge | caution | a folder without that metadata is never touched |
| `editor-server-bundles` | every bundle but the newest under `%USERPROFILE%\vscode-remote-wsl\stable` | purge | caution | the editor re-downloads the one it needs |
| `database-backups` | `zotero.sqlite*.bak` under `%USERPROFILE%\Zotero` | purge | caution | the live `zotero.sqlite` sits beside the copies |
| `editor-builds` | complete build trees under `%LOCALAPPDATA%\Programs\Microsoft VS Code` that `bin\code.cmd` does not name, plus `old_*` files whose original still sits beside them | purge | caution | no launcher, a launcher naming a missing build, or a lone build means nothing is dropped |
| `agent-app-caches` | `Cache` / `Code Cache` / `GPUCache` under `%USERPROFILE%\.workbuddy\app` and `\.workbuddy-ai\app` | purge | caution | the sibling `cache` folder holds spilled conversation text and is never a target |
| `rewind-snapshots` | `session-*` folders under `%USERPROFILE%\.dsh\rewind-snapshots` | aged, 30 days | caution | a recent session stays restorable |
| `rotated-logs` | `*.old.log` and `*.log.N` files in the `logs` folders of the agent apps | aged, 3 days | safe | nothing reads a rotated file back |
| `qoder-old-versions` | version folders under `%LOCALAPPDATA%\Programs\Qoder\.qoder-versions` other than the one the launcher names | purge | caution | the launcher's `state.ini` names the build it runs; an unreadable one means nothing is removed |
| `orphan-app-data` | `%LOCALAPPDATA%\Tencent\QQGuild` - the QQGuild data folder | purge | caution | the whole folder is offered for deletion once no file in it has been written for 30 days |
| `app-data-caches` | Chromium caches under `%LOCALAPPDATA%` for Electron, DingTalk, JianyingPro and the WeChat devtools | aged, 7 days | caution | an app that still runs rewrites its cache constantly, so only a week-old tree qualifies |
| `office-update-cache` | `%LOCALAPPDATA%\Microsoft\Office\SolutionPackages` - update packages Office already applied | purge | caution | Office stages them before applying; nothing reads them back afterwards |

`aged` targets skip anything modified within the retention window; `purge` targets remove every entry. Both keep the target directory itself and leave locked entries alone, counting them as skipped.

### Space assessment areas

`wsl` (ext4.vhdx images), `winsxs`, `system-files` (hiberfil / pagefile / swapfile), `programs` (user scope), `program-files` (machine scope), `old-versions` (builds an installer kept for rollback), `update-payloads` (setup and installer files sitting in temp and app-data), `downloads`, `documents`, `pictures`, `videos`, `desktop`. An area that does not exist is dropped rather than reported as zero. The ten largest folders under `%LOCALAPPDATA%` and `%APPDATA%` (≥100 MB each) are listed separately, because "3.6 GB in Roaming\kingsoft" points somewhere a Settings page does not.

### Plan steps

| code | When it appears | Runnable here |
| --- | --- | --- |
| `reclaim-safe` | safe targets ≥200 MB | yes, one button |
| `reclaim-caution` | caution targets ≥200 MB (elevation excluded) | yes, one button |
| `wsl-compact` | WSL images ≥1 GB | no — `wsl --shutdown` + `diskpart` `compact vdisk` |
| `winsxs-cleanup` | WinSxS ≥1 GB | no — `Dism.exe /Online /Cleanup-Image /StartComponentCleanup` |
| `hibernate-off` | `system-files` ≥200 MB | no — `powercfg.exe /hibernate off` |
| `elevation-clean` | elevation targets ≥200 MB | no — run the plugin elevated |
| `app-review` | an app-data folder ≥1 GB, top 3, not already covered | no — uninstall, never delete the folder |
| `move-folder` | a personal folder ≥2 GB with another drive having room | no — Properties → Location |
| `pressure` | system drive free < 12% | no — context for the steps above |

Bytes the plugin cannot reach from an unelevated process are **never** counted in `reclaimNow`: a delete that will fail must not appear as reclaimable.

### Settings

| Setting | Default | Options | Stored as |
| --- | --- | --- | --- |
| Panel entry | Everywhere | Everywhere / Sidebar only / Settings page only | `dsc.placement.v2` |
| Preselect after a scan | Safe targets only | Safe targets only / Safe and caution / Nothing | `dsc.pick` |
| Ask before deleting | Always | Always / Never | `dsc.confirm` |

Settings live in the browser's `localStorage` and are reachable from three places that share one implementation: the plugin's own card on its page in the plugin manager, the `settings.section` page, and the panel's ⚙ button.

Panel state (drives, drive filter, scan rows, selection, notices, assessment) is kept in a module-scope `Map`, so switching panels does not throw it away. It does not survive a page reload — only the three settings do.

### Agent tool

`disk_cleaner`, same logic as the panel:

| Argument | Type | Notes |
| --- | --- | --- |
| `action` | `overview` \| `scan` \| `clean` \| `audit` \| `reveal` | required |
| `ids` | string[] | catalog ids; required for `clean`, max 32 |
| `drive` | string | `C:` / `D:\` — limits the work to one volume |
| `confirm` | boolean | without it, `clean` is a dry run |
| `force` | boolean | `audit` re-measures instead of answering from the 10-minute cache |
| `area` / `scope` + `name` / `index` | | `reveal` names what to open; never a path |

`clean` without `confirm: true` deletes nothing and reports what it would free — that is the approval path. `audit` is read-only and returns the plan in prose, ending with "Report that plan to the user; never run those commands yourself."

### HTTP surface

One route, `POST /api/disk-cleaner/`, used by the panel:

```jsonc
{"action":"overview"}                          // drives + target ids
{"action":"scan","drive":"C:"}                 // measured targets
{"action":"audit","force":true}                // areas + largest apps + plan
{"action":"reveal","area":"downloads"}         // opens it in Explorer
{"action":"clean","ids":["temp"],"confirm":true}
```

POST only (405 otherwise), same-origin only (403 otherwise), body ≤4096 bytes, at most 32 ids, unknown ids or actions rejected with 400. Handlers never receive a path: `reveal` names an assessment area (or an app folder by scope and name), the host rebuilds the path from the same table that measured it, and hands that to `explorer.exe`.

### Safety rules

These are enforced in `lib/catalog.js` and must not be relaxed:

- Only paths built by the catalog are touched. No API accepts a path.
- A candidate must have at least three path segments and must not be a volume root (`tooBroad`).
- After `realpath`, the candidate must still sit inside the environment root it was built from — a junction planted in a cache directory cannot widen the blast radius.
- Symlinks and junctions met during a walk are skipped, never followed or deleted.
- Locked or denied entries are counted as skipped and the walk continues.
- The target directory itself is kept; only its contents go.
- Rules that pick "the newest of a group" fail closed: a family with only one member, a folder
  whose metadata file is missing or whose hash is not a string, and a `vscode-remote-wsl\stable`
  that holds a single bundle all resolve to *nothing to delete*. The newest member is never returned.
- `editor-builds` drops a build only when `bin\code.cmd` exists and names a different build that is also on disk; `old_x` goes only while `x` is still beside it.
- `database-backups` matches `.sqlite*.bak` by name only; the live `zotero.sqlite` is never a candidate.
- `qoder-old-versions` reads the launcher's `state.ini` for the build it runs; a missing or unparsable file, or a named build that is not on disk, removes nothing.
- `orphan-app-data` is offered when the QQGuild folder exists and no file in it has been written in the last 30 days; the whole folder is then a full-delete target. It does not check shortcuts, uninstall entries, or Program Files.
- The directory Windows refuses to let an unelevated process write (`SoftwareDistribution\Download`) is labelled `elevation` and excluded from "reclaimable now". `C:\Windows\Temp` is **not** one of them on a default ACL: it grants `BUILTIN\Users` create and delete, so only EBUSY on a live file stops a delete there, which the age limit covers.

### Install

Listed in the curated [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) catalog, which powers **dshmarket → Discover** ([PR #12970](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/12970), merged): search **dsh-disk-cleaner** there and install it in one click. The direct installs below do the same thing by hand.

Published on npm as [`dsh-disk-cleaner`](https://www.npmjs.com/package/dsh-disk-cleaner) — latest `1.6.11`:

```bash
npm i dsh-disk-cleaner
```

A prebuilt tarball is attached to the [v1.6.11 Release](https://github.com/stallenlu/dsh-disk-cleaner/releases/tag/v1.6.11); installing from it skips DSH's build-approval step:

```bash
dsh plugin --profile <profile> add https://github.com/stallenlu/dsh-disk-cleaner/releases/download/v1.6.11/dsh-disk-cleaner-1.6.11.tgz
```

Then enable it in the profile — in `$DSH_PROFILE_DIR/package.json`:

```json
{
  "dependencies": {
    "dsh-disk-cleaner": "^1.6.11"
  },
  "dsh": {
    "profile": {
      "bundles": ["dsh-disk-cleaner"]
    }
  }
}
```

Or point the plugin manager's `install_bundle` at a local checkout, using a `link:` dependency instead of a version range:

```bash
git clone https://github.com/stallenlu/dsh-disk-cleaner
```

The bundle's own `cordis.patch.yml` inserts the plugin row; no profile patch edit is needed. A `link:` dependency is a symlink, so **client** changes take effect on a page refresh, while **host** changes (`lib/index.js`) need the bundle re-enabled or DSH restarted. An installed npm copy is the opposite: bump the version to move it.

### Development

```bash
node smoke.mjs                       # 120 assertions, zero dependencies
node --check lib/client.js           # and lib/index.js, lib/catalog.js, lib/audit.js, lib/plan.js
```

`smoke.mjs` executes the real client bundle in a throwaway DOM (fake `window` / `document` / `require`): the slot lifecycle runs for real, so switching the entry off and on again is proven by disposers being called, not by matching source text. The host half is captured through a throwaway `ctx` to prove the route and the tool are registered.

Negative control (proving an assertion bites): change `reclaimable.filter((row) => row.note !== 'elevation')` back to `reclaimable` in `lib/plan.js` — `elevation steps are never counted as reclaimable now` must fail. Restore afterwards.

What the smoke test deliberately does **not** cover: anything that walks a real volume (`scan` / `clean` / `audit` take tens of seconds) and anything visual. Those were verified by hand against a live host — see below.

### Verification status

| Checked | How |
| --- | --- |
| Client bundle executes, slots register and dispose | `node smoke.mjs` (real bundle in a fake DOM) |
| Settings reach the plugin page, the settings section and the panel | `node smoke.mjs` + `cordis_inspect_query` slot occupants |
| Route and tool registered | `node smoke.mjs` (throwaway `ctx`) |
| `overview` / `scan` / `clean` / `audit` / `reveal` round-trip | Real `POST /api/disk-cleaner/` against a live host |
| Re-run bypasses the cache, a plain call still uses it | `audit` twice: `cached: false`, then `true` |
| `reveal` refuses a path and a traversal | `name: "../.."`, and a request with neither area nor name → 400 |
| Real deletion keeps the target directory, honours the age limit | Temp directory seeded with old and new files |
| Dry run deletes nothing | `confirm` omitted, byte counts unchanged |
| Drive filter rejects unmounted and malformed volumes | `C:extra`, `Z:`, `abc` → 400 |
| Plan excludes elevation bytes from `reclaimNow` | Live audit against this machine |
| "Keep only the newest of a group" fails closed | Throwaway fixture tree: a same-hash duplicate collapses to the newest, a folder with no metadata is left alone, a different hash is kept, the live database survives (9/9) |
| Old editor builds need a launcher that proves which one runs | Throwaway fixture tree: a build the launcher does not name goes, no launcher deletes nothing, a launcher naming a missing build deletes nothing, a lone build stays, `old_x` goes only while `x` exists (7/7) |
| A dry run reports what a real run frees | The 30-day rewind window reports 263 KB not 283 MB, and scan matches the dry run |
| Grouping and folding | The real `groupRows` runs out of the bundle against a mixed list: fixed order, per-section totals, an unknown group lands in "other", an empty section is the folded one. A click on a section head folds that section and only that one, and a folded section's rows drop out of bulk select |
| Visual layout | Checked by hand in the running Web UI. No browser automation here, so this one is a human check, not a test. |
| The confirmation follows the panel theme | `node smoke.mjs` regression assertion: both confirm sites render `ConfirmDialog`, `window.confirm` appears nowhere, and the dialog is styled with the baseline tokens |
| Agent tool returns a string matching its output schema | `node smoke.mjs` regression assertion (the 1.6.1 fix) |
| A real agent-tool delete invalidates the assessment cache | `node smoke.mjs` regression assertion (the 1.6.1 fix) |

### Implementation notes

- Client halves of static boot bundles receive only `require` in their factory — `styles` / `host` / `harness` do not exist there. Styles are installed as a `<style data-plugin>` element appended to `document.head`, and removed on dispose.
- All colours go through `--dsw-alias-*` theme tokens; no literal colours in the CSS, and every class is prefixed `dsc-`.
- A slot cannot be registered conditionally, so a setting that removes an entry is expressed by mounting and disposing the injection (`bindWhile`), deferred with `queueMicrotask` — the control that removes a section may itself live inside that section.
- `plugins.bundle.config` returns `null` for `view: 'summary'`, the same way other bundles do; the rows render only on the plugin page.
- `apply()` registers everything through `ctx.effect` so the host can dispose it as a unit.

### Known ceilings

- **Windows only.** Paths are built from the Windows layout; there is no POSIX branch.
- **First assessment takes 30–60 s.** Named areas and the per-app folder list walk overlapping trees. A result is cached for 10 minutes and invalidated by a real deletion, so only the first caller pays; the panel's re-run button passes `force` and always pays it. `ponytail:` comment in `lib/audit.js` records the shared-map alternative.
- **Leftover installers are cleaned by age, not by knowledge.** `*-updater` folders are recognised by name; a download from the last three days is left alone because only the app knows whether it has been applied.
- **No elevation.** The one Windows directory that refuses an unelevated write is reported, never attempted.
- **No uninstall, no move.** Steps the plugin cannot perform carry a command instead of a button.
- **Traversal caps** at 2,000,000 entries per walk, so an absurdly large tree is measured partially rather than hanging.

### Architecture

```
├─ package.json           dsh.bundle.patch + dsh.client { platform: "web" }
├─ cordis.patch.yml       - insert:  id: dsh-disk-cleaner
├─ lib/index.js    (525)  Host: HTTP route + disk_cleaner tool, same run() for both; reveal
├─ lib/catalog.js  (1265)  The 32 targets, measurePath / purgePath / resolveTargets / drives
├─ lib/audit.js    (365)  Read-only assessment, 10-minute cache, areaPaths, exposes no deletion
├─ lib/plan.js     (150)  Pure: measurements → ordered steps
├─ lib/history.js   (71)  Append-only run log in $DSH_HOME/dsh-disk-cleaner; never throws
├─ lib/client.js  (1962)  Client half: slots, panel, preferences, zh/en dictionaries, CSS
├─ locale/{en,zh}.json    Display metadata (meta.title / meta.description)
├─ icon.svg               Plugin icon
├─ README.md              This file
├─ LICENSE                MIT
└─ smoke.mjs              120 assertions, zero dependencies
```

Client-half slots: `sidebar.panellist` (order 50, disposed in settings-only mode), `main` (keyed by the package name), `settings.section` (order 30, disposed in sidebar-only mode), `plugins.bundle.config` (keyed by the package name).

### What's new

- **1.6.11** — A finished clean no longer reads as a restart. The panel kept doing three
  things after the last byte was freed: it flipped the busy flag from *cleaning* to *scanning*
  and back (every button changed label and disabled state twice), it let each section that had
  just been emptied hit zero and fold itself away, and because the panel is its own scroll
  container, the shortened list clamped the viewport back to the top. None of that reloaded
  anything — the panel now rescans quietly (no busy flip), pins whatever groups were open
  before the rescan, and restores the scroll offset afterwards, so you land on the same screen
  you were on. The harness's own updater folder
  (`%LOCALAPPDATA%\@deepseek-ai\dsh-desktop-updater`) is now treated as host-owned too, so
  *app-updaters* can no longer delete the payload that updates the running app. Four regression
  assertions cover the quiet rescan, the pinned groups, the restored scroll offset and the
  updater exclusion.
- **1.6.10** — Cleaning no longer restarts the harness. The `app-caches` target listed the
  harness's own Chromium profile (`%APPDATA%\@deepseek-ai\dsh-desktop`), so cleaning it
  emptied the caches of the very process drawing the panel: Chromium rebuilt them at once and
  the renderer reloaded, which reads as the plugin hot-restarting instead of returning to its
  own screen. Those four folders are gone from the target, and `resolveTargets()` now refuses
  any path inside the host's data folder outright, so a future definition cannot add them
  back. Everything else in `app-caches` (WPS, FTNN, Qoder, Trae, WeChat devtools, appGallery)
  is unchanged. Two regression assertions cover both halves of the fix.
- **1.6.9** — The one white box left in a dark panel is gone. The confirmation was `window.confirm`, which the browser draws outside the document: it cannot see `color-scheme`, the baseline tokens or the host theme, so a dark panel got a light rectangle in the middle of it. It is now a dialog the panel draws itself — same information (how many, how much, every target with its size, anything irreversible), painted with `--dsb-*`, dismissible with Escape, the overlay or Cancel, and the destructive button deliberately holds no focus so a stray Enter cannot delete. The plan-step confirmation goes through the same component. No behaviour change beyond the painting.
- **1.6.8** — Fixes the other half of the 1.6.7 story: the panel still answered "origin rejected" when the desktop window sent `Origin: http://localhost:<port>` while the request itself arrived at `127.0.0.1`, because the check compared those strings literally. The gate now decides on the **peer address** of the connection — something a remote page cannot influence — and only then looks at `Origin`: the app's own scheme, no `Origin` at all, or any loopback host name is accepted, everything else is still refused. An `https://evil.example` origin is rejected even from a loopback socket. The three assessment error paths (evaluate, reveal, run-a-plan-step) now go through the same translated-code path as the rest of the panel, so a Chinese user sees "请求来源不被接受" rather than the raw `origin rejected` string.
- **1.6.7** — Fixes a regression 1.6.6 shipped: refusing every request without an `Origin` header locked the plugin's own panel out of its API ("请求来源不被接受"), because the desktop window posts from `dsh-app://app`, not from `http://127.0.0.1:<port>`. The check now accepts the desktop scheme and a header the desktop forwarder stripped, but only when the request already arrived on a loopback address; a plain web page still cannot reach a loopback port without sending an `Origin`, so the door stays shut. No other behaviour changed.
- **1.6.6** — The results the plugin already computed are now shown. A **Dry run** button next to *Clean* asks the exact same question without `confirm`, so you see what a delete would free before anything goes; the result banner then survives the rescan that follows it (it used to be erased a line later). Plan steps name targets in words instead of printing `npm-cache, chrome-cache, pip-cache`, an empty plan says "nothing worth doing" instead of rendering a hole, and route errors arrive as a stable `code` the panel translates, so a Chinese user never reads `origin rejected` or `unknown target: x`. Every real clean now appends one line to `$DSH_HOME/dsh-disk-cleaner/history.jsonl`, and a **Clean history** panel reads it back with a *Copy as CSV* button. Under the hood: scan walks four targets at a time instead of all 32 at once, `SystemRoot` decides where the Windows targets live instead of a hardcoded `C:`, a request without an `Origin` header is refused unless it arrived on loopback (see 1.6.7), and a refused directory removal is counted separately from a legitimately full one.
- **1.6.5** — Documentation only: the install section now points at the Release it names (the prebuilt-tarball link is labelled v1.6.5 and resolves to the v1.6.5 tag), and the catalog paragraph says the awesome-dsh-plugin entry is merged rather than pending review. No code change.
- **1.6.4** — The panel now paints itself with [dsh-design-baseline](https://github.com/stallenlu/dsh-design-baseline): the stylesheet is inlined into the client bundle, the panel root carries `dsb-root`, and every colour resolves through a `--dsb-*` token instead of a host `--dsw-alias-*` name. That means it follows the host's light and dark themes (including `color-scheme`, so native `<select>` menus and scrollbars match), and colour is spent only on data that has state — the primary button and the active chip are now inverted neutrals rather than brand blue. No behaviour changes.
- **1.6.3** — Safety and honesty rather than new features. The Recycle Bin is no longer filed under `safe`: emptying it cannot be undone, so it is never preselected, never picked by "select all", and carries its own `irreversible` note instead of the generic "rebuilt; next start is slower". The confirm dialog now names each target and the total instead of asking a generic "delete these?". A target that names no environment root is bounded by the volume it sits on rather than skipping the boundary check. `measure` and `purge` now count entries in the same unit, and a walk that hits the 2,000,000-entry cap says so (`truncated`) instead of claiming exact totals. A directory removal refused for a reason other than "not empty" is counted as `blocked` instead of being swallowed, and a clean that left files behind reports a warning rather than a green success. The orphan target is named for what it actually measures (the QQGuild folder).
- **1.6.2** — Documentation only: the README, the in-source comment, the panel's zh/en explanations and the tool's note legend now describe `orphan-app-data` as it actually behaves (the QQGuild folder is offered for full deletion once no file in it has been written for 30 days), instead of claiming four independent signals and a two-year idle period. No behaviour change; the refreshed README ships in the npm package and the [v1.6.2 Release](https://github.com/stallenlu/dsh-disk-cleaner/releases/tag/v1.6.2) tarball.
- **1.6.1** — Fixed the `disk_cleaner` agent tool: `output.schema` now declares `type: 'string'`, matching the text `execute()` returns (previously every call was rejected by the host's output validator with `tool "disk_cleaner" returned invalid output: "value" must be an object`). A real delete through the agent tool now invalidates the assessment cache, the same way the panel's HTTP route does. Two regression assertions added; a prebuilt tarball ships on the [v1.6.1 Release](https://github.com/stallenlu/dsh-disk-cleaner/releases/tag/v1.6.1).
- **1.6.0** — The 32 targets are grouped under seven foldable headings.

---

<a id="中文"></a>
## 中文

**dsh-disk-cleaner** 是 [DeepSeek Harness](https://github.com/deepseek-ai)（DSH）的磁盘空间插件。它做两件不同的事，并且刻意分开：

1. **清理** —— 三十二个已知位置（临时目录、包管理器存储、浏览器缓存、崩溃转储、回收站、更新安装包残留、各应用的缓存与日志、被淘汰的插件版本与已应用的更新包）。只有这些会被删除，其中无法重建的项目永远不会被预选。
2. **评估** —— 所有本插件**不会**删的东西（已装程序、WSL 虚拟磁盘、Windows 组件库、聊天软件数据、你自己的文件夹）。只测量、只列出，绝不删除。

评估的最后是一份**处理方案**：同一批数字按「你要付出多少代价」排序，本插件做不到的步骤附上确切的 Windows 命令。

面板和 agent 用的是**同一套操作**：清理逻辑只在 `lib/catalog.js` 里写一次，HTTP 路由和 `disk_cleaner` 工具都是它的调用方。

### 功能

| 功能 | 说明 |
| --- | --- |
| 扫描 | 并发测量全部三十二个目标，显示各自占用 |
| 按盘过滤 | 已挂载卷的胶囊按钮；扫描与清理都可限定单盘，该盘上为空的项会隐藏 |
| 风险标注 | 每个目标都标 `安全` 或 `注意`，并给一行理由（`in-use` / `rebuild` / `elevation` / `pending-update` / `rollback` / `superseded` / `history` / `duplicate` / `database-backup` / `orphan` / `irreversible`），图例常驻，所以「注意」永远不是「说不清」 |
| 保留期删除 | `temp` 与 `windows-temp` 只删一天前的文件；被运行中程序占住的自动跳过 |
| 空间评估 | 只读遍历磁盘，按 Windows 自身 / 已装软件 / 你自己的文件 分组，另列占用最大的十个应用数据目录。每一行都能打开所在目录——单击、右键或回车 |
| 重新评估真的重测 | 「重新评估」会重新测量；普通调用仍然走十分钟缓存 |
| 处理方案 | 九种可能步骤，从零风险到只能你决定；本插件能执行的带按钮，其余给可复制的命令 |
| 入口位置 | 侧边栏图标、设置页分区、或两者都要（默认）——在插件自己的配置卡或面板 ⚙ 里切换 |
| 行为设置 | 扫描后默认勾选什么、删除前是否确认 |
| 分类折叠 | 三十二个目标归到七个标题下（系统临时、开发工具、浏览器缓存、应用缓存、升级残留、备份快照、已卸载残留）。整类都是 0 字节的默认收起来，所以打开面板先看到的只有真能清的那些 |
| 面板记忆 | 扫描结果、勾选、评估结果在切走再回来时都还在 |
| Agent 工具 | `disk_cleaner` 把同样的五个动作以可读文本交给模型 |
| 双语 | 跟随宿主语言服务，zh / en 字典一起发布 |

### 清理目标

所有路径都由这张表构造——调用方只选 **id**，从不传路径，所以任何用户输入的字符串都到不了 `unlink`。

| id | 是什么 | 方式 | 风险 | 原因 |
| --- | --- | --- | --- | --- |
| `temp` | `%TEMP%`、`%TMP%`、`%LOCALAPPDATA%\Temp` | 保留期 1 天 | 注意 | 可能有程序正在使用其中的文件 |
| `windows-temp` | `C:\Windows\Temp` | 保留期 1 天 | 注意 | 可能有服务正占着文件；只删一天前的 |
| `npm-cache` | `%LOCALAPPDATA%\npm-cache` | 全清 | 安全 | 纯缓存 |
| `pnpm-store` | `%LOCALAPPDATA%\pnpm\store` | 全清 | 安全 | 纯缓存 |
| `pip-cache` | `%LOCALAPPDATA%\pip\Cache` | 全清 | 安全 | 纯缓存 |
| `uv-cache` | `%LOCALAPPDATA%\uv\cache` | 全清 | 安全 | 纯缓存 |
| `crash-dumps` | `%LOCALAPPDATA%\CrashDumps` | 全清 | 安全 | 没有可丢失的数据 |
| `chrome-cache` | 各配置目录下的 `Cache`、`Code Cache`、`GPUCache`、`DawnCache`、`ShaderCache`、`GrShaderCache` | 全清 | 注意 | 会重建，下次打开更慢 |
| `edge-cache` | 同上，Edge 的配置目录 | 全清 | 注意 | 会重建，下次打开更慢 |
| `code-cache` | `%APPDATA%\Code\{Cache,CachedData,CachedExtensionVSIXs}` | 全清 | 注意 | 会重建，下次启动更慢 |
| `windows-update` | `C:\Windows\SoftwareDistribution\Download` | 全清 | 注意 | 需要管理员权限 |
| `recycle-bin` | 各已挂载卷的 `$Recycle.Bin\S-1-5-*` | 全清 | 注意 | 清空不可恢复，永不被预选 |
| `inet-cache` | `%LOCALAPPDATA%\Microsoft\Windows\INetCache` | 全清 | 注意 | 会重建 |
| `app-updaters` | `%LOCALAPPDATA%` 与 `%APPDATA%` 下的 `*-updater` 目录——升级程序留下的安装包 | 保留期 3 天 | 注意 | 三天内的下载可能还是待安装的更新 |
| `app-caches` | `%APPDATA%` 里点名列出的缓存目录：WPS 的 CEF 缓存、FTNN 的 `cef_cache`，以及 Qoder、Trae、DSH 桌面端、PersonalCenter、微信开发者工具、腾讯电脑管家的 `Cache` / `Code Cache` / `CachedData` / `GPUCache` | 全清 | 注意 | CEF 与 Chromium 缓存会在下次启动时重建 |
| `app-logs` | `%APPDATA%` 里的日志目录：FTNN、微信、Qoder、Trae、钉钉、PersonalCenter、Clash Verge | 全清 | 安全 | 旧日志运行时不会被读回 |
| `app-temp` | 应用自己放在 `%APPDATA%` 里的临时目录（不走 `%TEMP%`）：`WorkDaddy\client-tmp`、`PersonalCenter\Temp` | 保留期 2 天 | 注意 | 应用可能正在运行并占用其中的文件 |
| `plugin-old-versions` | WPS 插件池 `kingsoft\wps\addons\pool\win-i386` 里，每个插件族除最高版本以外的全部版本 | 全清 | 注意 | 管理器加载最高版本，其余是回滚副本 |
| `update-packages` | 已应用的更新包：FTNN 的 `.spd` 补丁（build 号低于 `Program Files\FTNN\app\[版本]` 中最新者），以及 `WorkDaddy\update` 里低于已装版本的安装包 | 全清 | 注意 | 按版本号比较判断，不按时间 |
| `session-backups` | `%USERPROFILE%\.workbuddy\workspace\sessions\*` 下的 `modify_backup` 目录——每个 agent 会话的整文件修改快照 | 全清 | 注意 | 会话本体在快照旁边，不会读回这些文件 |
| `agent-logs` | `%USERPROFILE%\.workbuddy\logs` 与 `\.workbuddy-ai\logs` 下按日期命名的日志目录 | 保留期 3 天 | 安全 | 旧日志不会被读回 |
| `toolchain-snapshots` | `%USERPROFILE%\.dsh\dsh-ops\bash-ipc` 下重复的快照：`.ops-ipc.json` 里 `patchedSha256` 相同的目录只留最新一份 | 全清 | 注意 | 没有该元数据的目录永不触碰 |
| `editor-server-bundles` | `%USERPROFILE%\vscode-remote-wsl\stable` 下除最新以外的服务包 | 全清 | 注意 | 编辑器需要时会重新下载 |
| `database-backups` | `%USERPROFILE%\Zotero` 下的 `zotero.sqlite*.bak` | 全清 | 注意 | 正在用的 `zotero.sqlite` 就在副本旁边 |
| `editor-builds` | `%LOCALAPPDATA%\Programs\Microsoft VS Code` 下 `bin\code.cmd` 未指向的完整构建目录，以及原件仍在旁边的 `old_*` 文件 | 全清 | 注意 | 没有启动器、启动器指向的构建不在磁盘上、或只有一份构建时，一律不删 |
| `agent-app-caches` | `%USERPROFILE%\.workbuddy\app` 与 `\.workbuddy-ai\app` 下的 `Cache` / `Code Cache` / `GPUCache` | 全清 | 注意 | 同级的 `cache` 目录存的是对话溢写内容，从不作为目标 |
| `rewind-snapshots` | `%USERPROFILE%\.dsh\rewind-snapshots` 下的 `session-*` 目录 | 保留期 30 天 | 注意 | 最近的会话仍然可以回滚 |
| `rotated-logs` | 各 agent 应用 `logs` 目录下的 `*.old.log` 与 `*.log.N` 文件 | 保留期 3 天 | 安全 | 轮转掉的日志不会被读回 |
| `qoder-old-versions` | `%LOCALAPPDATA%\Programs\Qoder\.qoder-versions` 下不是启动器所指的那个版本目录 | 全清 | 注意 | 启动器 `state.ini` 写明它跑哪个版本；读不到就一个都不删 |
| `orphan-app-data` | `%LOCALAPPDATA%\Tencent\QQGuild` —— QQ 频道数据目录 | 全清 | 注意 | 目录内 30 天没有任何文件写入时，整个目录会被列为全清目标 |
| `app-data-caches` | `%LOCALAPPDATA%` 下 Electron、钉钉、剪映、微信开发者工具的 Chromium 缓存 | 保留期 7 天 | 注意 | 还在跑的程序会不停改写缓存，所以只有一周没动过的才算 |
| `office-update-cache` | `%LOCALAPPDATA%\Microsoft\Office\SolutionPackages` —— Office 已应用的更新暂存包 | 全清 | 注意 | Office 先暂存再应用，应用后没有东西会读回 |

保留期方式会跳过保留期内修改过的文件；全清方式清掉全部条目。两者都保留目标目录本身，并把锁定或无权限的条目跳过计数。

### 空间评估范围

`wsl`（ext4.vhdx 映像）、`winsxs`、`system-files`（hiberfil / pagefile / swapfile）、`programs`（用户级）、`program-files`（机器级）、`old-versions`（安装器留给回滚的旧版本目录）、`update-payloads`（临时目录与应用数据里躺着的 setup / installer 文件）、`downloads`、`documents`、`pictures`、`videos`、`desktop`。不存在的范围直接略去，不报成 0。`%LOCALAPPDATA%` 与 `%APPDATA%` 下超过 100 MB 的十个最大目录另外列出——因为「Roaming\kingsoft 占 3.6 GB」指向的地方，设置页里根本找不到。

### 处理方案步骤

| 代码 | 出现条件 | 本插件可执行 |
| --- | --- | --- |
| `reclaim-safe` | 安全目标共 ≥200 MB | 是，一个按钮 |
| `reclaim-caution` | 注意目标共 ≥200 MB（不含需提权的） | 是，一个按钮 |
| `wsl-compact` | WSL 映像 ≥1 GB | 否 —— `wsl --shutdown` + `diskpart` 的 `compact vdisk` |
| `winsxs-cleanup` | WinSxS ≥1 GB | 否 —— `Dism.exe /Online /Cleanup-Image /StartComponentCleanup` |
| `hibernate-off` | `system-files` ≥200 MB | 否 —— `powercfg.exe /hibernate off` |
| `elevation-clean` | 需提权目标 ≥200 MB | 否 —— 以管理员身份运行本插件 |
| `app-review` | 单个应用数据目录 ≥1 GB，取前 3 个且未被其它步骤覆盖 | 否 —— 走卸载，绝不删目录 |
| `move-folder` | 个人文件夹 ≥2 GB，且另有盘有空间 | 否 —— 属性 → 位置 |
| `pressure` | 系统盘可用 < 12% | 否 —— 作为上述步骤的背景 |

普通权限够不到的字节**绝不**计入 `reclaimNow`：注定失败的删除不能被承诺成可回收空间。

### 设置项

| 设置 | 默认 | 选项 | 存储键 |
| --- | --- | --- | --- |
| 面板入口 | 全部 | 全部 / 仅侧边栏 / 仅设置页 | `dsc.placement.v2` |
| 扫描后默认勾选 | 仅安全项 | 仅安全项 / 安全 + 注意 / 都不勾选 | `dsc.pick` |
| 删除前确认 | 每次确认 | 每次确认 / 不再确认 | `dsc.confirm` |

设置在浏览器 `localStorage` 里，三个入口共用同一份实现：插件管理里该插件的配置卡、`settings.section` 设置页、面板的 ⚙ 按钮。

面板状态（盘列表、盘过滤、扫描结果、勾选、提示、评估结果）放在模块级 `Map` 里，所以切走面板不会丢；但它不跨刷新——只有那三个设置项会跨刷新保留。

### Agent 工具

`disk_cleaner`，与面板同一套逻辑：

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `action` | `overview` \| `scan` \| `clean` \| `audit` \| `reveal` | 必填 |
| `ids` | string[] | catalog id；`clean` 必填，最多 32 个 |
| `drive` | string | `C:` / `D:\`，把操作限定在一块盘 |
| `confirm` | boolean | 不传时 `clean` 只做试运行 |
| `force` | boolean | `audit` 跳过 10 分钟缓存重新测量 |
| `area` / `scope` + `name` / `index` | | `reveal` 用它说明要打开什么，从不传路径 |

不带 `confirm: true` 的 `clean` 一个字节都不删，只报告本来能释放多少——这就是审批路径。`audit` 只读，并以文本返回处理方案，结尾固定为「把方案报告给用户，不要自己执行这些命令」。

### HTTP 接口

只有一个路由 `POST /api/disk-cleaner/`，面板使用：

```jsonc
{"action":"overview"}                          // 磁盘容量 + 目标 id
{"action":"scan","drive":"C:"}                 // 测量后的目标
{"action":"audit","force":true}                // 范围 + 最大应用目录 + 方案
{"action":"reveal","area":"downloads"}         // 在资源管理器中打开
{"action":"clean","ids":["temp"],"confirm":true}
```

只接受 POST（否则 405），只接受同源（否则 403），body ≤4096 字节，id 最多 32 个，未知 id 或动作返回 400。处理器永远收不到路径：`reveal` 只报一个评估范围（或 scope + name 表示的应用目录），宿主用当初测量它的那张表重建路径，再交给 `explorer.exe`。

### 安全规则

以下在 `lib/catalog.js` 中强制，不得放宽：

- 只碰 catalog 构造出的路径，没有任何接口接受路径参数。
- 候选路径至少三段，且不能是卷根（`tooBroad`）。
- `realpath` 之后必须仍落在它所属的环境根内——在缓存目录里种一个 junction 也扩大不了波及面。
- 遍历时遇到符号链接与 junction 一律跳过，不跟随也不删除。
- 锁定或无权限的条目计为跳过，遍历继续。
- 保留目标目录本身，只清内容。
- 「只留最新一份」这类规则一律选保守的一侧：族内只有一个成员、元数据文件缺失或哈希不是字符串、
  `vscode-remote-wsl\stable` 下只有一个服务包，结果都是*没有可删项*。最新那一份永远不会被返回。
- `editor-builds` 只有在 `bin\code.cmd` 存在且指向另一份确实在磁盘上的构建时才删；`old_x` 也只有在 `x` 仍在旁边时才删。
- `database-backups` 只按名字匹配 `.sqlite*.bak`，正在用的 `zotero.sqlite` 永不成为候选。
- `qoder-old-versions` 从启动器的 `state.ini` 读出它实际运行哪个版本；文件缺失、解析不出、或它指的版本不在磁盘上，一律一个都不删。
- `orphan-app-data` 的判据只有一条：QQGuild 目录存在，且目录内 30 天内没有任何文件被写入过，此时整个目录被列为全清目标。它不检查快捷方式、卸载项或 Program Files。
- 那个拒绝普通权限写入的 Windows 目录标为 `elevation`，并排除在「现在能回收」之外。

### 安装

已收录进精选目录 [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)，它是 **dshmarket → 发现** 的数据源（[PR #12970](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/12970)，已合并）：在 dshmarket 里搜索 **dsh-disk-cleaner** 即可一键安装。下面的直接安装方式就是手动做同一件事。

已发布到 npm：[`dsh-disk-cleaner`](https://www.npmjs.com/package/dsh-disk-cleaner)，最新版 `1.6.11`。

```bash
npm i dsh-disk-cleaner
```

[v1.6.11 Release](https://github.com/stallenlu/dsh-disk-cleaner/releases/tag/v1.6.11) 还附带一个预构建 tarball，从它安装可跳过 DSH 的构建授权步骤：

```bash
dsh plugin --profile <profile> add https://github.com/stallenlu/dsh-disk-cleaner/releases/download/v1.6.11/dsh-disk-cleaner-1.6.11.tgz
```

然后在 profile 里启用 —— 在 `$DSH_PROFILE_DIR/package.json`：

```json
{
  "dependencies": {
    "dsh-disk-cleaner": "^1.6.11"
  },
  "dsh": {
    "profile": {
      "bundles": ["dsh-disk-cleaner"]
    }
  }
}
```

或者把插件管理的 `install_bundle` 指向本地检出目录，依赖写成 `link:` 而不是版本范围：

```bash
git clone https://github.com/stallenlu/dsh-disk-cleaner
```

bundle 自带的 `cordis.patch.yml` 会插入插件行，无需改 profile 的 patch。`link:` 依赖是符号链接，所以改 **client** 刷新页面即生效，改 **host**（`lib/index.js`）需要重新启用该 bundle 或重启 DSH。从 npm 装则是相反的一面：要升级就改版本号。

### 开发

```bash
node smoke.mjs                       # 120 条断言，零依赖
node --check lib/client.js           # 以及 lib/index.js、lib/catalog.js、lib/audit.js、lib/plan.js
```

`smoke.mjs` 在一次性假 DOM 里**真的执行** client bundle（假 `window` / `document` / `require`）：slot 生命周期是真的跑，所以「把入口关掉再打开」是靠 disposer 真被调用证明的，不是靠匹配源码文本。Host 半面用一次性 `ctx` 抓取，证明路由和工具确实注册了。

反向对照（证明断言有约束力）：把 `lib/plan.js` 里的 `reclaimable.filter((row) => row.note !== 'elevation')` 改回 `reclaimable`，`elevation steps are never counted as reclaimable now` 必须失败。测完恢复。

冒烟测试**刻意不覆盖**：任何需要真实卷的操作（`scan` / `clean` / `audit` 都要几十秒）和任何视觉呈现。这两类是对着真实宿主手工验证的，见下表。

### 验证状态

| 已验证 | 手段 |
| --- | --- |
| client bundle 能执行、slot 能注册与拆除 | `node smoke.mjs`（假 DOM 里跑真 bundle） |
| 设置能到达插件页、设置页、面板三处 | `node smoke.mjs` + `cordis_inspect_query` 查 slot 占用 |
| 路由与工具已注册 | `node smoke.mjs`（一次性 `ctx`） |
| 五个动作端到端 | 对真实宿主 `POST /api/disk-cleaner/` |
| 「重新评估」绕过缓存、普通调用仍走缓存 | 连调两次 `audit`：`cached` 先 false 后 true |
| `reveal` 拒绝路径与目录穿越 | `name: "../.."`，以及既无 area 又无 name → 400 |
| 真删保留目标目录、遵守保留期 | 在 Temp 里造一旧一新两个文件验证 |
| 试运行不删任何东西 | 不传 `confirm`，字节数不变 |
| 盘过滤拒绝未挂载与畸形卷名 | `C:extra`、`Z:`、`abc` → 400 |
| 方案不把提权目标的字节算进「现在能回收」 | 在本机跑真实 audit |
| 「只留最新一份」一律选保守一侧 | 一次性 fixture 目录：同哈希的重复项收敛到最新、无元数据的目录不动、不同哈希保留、正在用的数据库完好（9/9） |
| 旧版编辑器构建要有启动器作证才删 | 一次性 fixture 目录：启动器未指向的构建会删、没有启动器一律不删、启动器指向的构建不在磁盘上也不删、只有一份构建时不删、`old_x` 只在 `x` 仍在时删（7/7） |
| 预演报告的字节数等于真删能释放的字节数 | 30 天的回滚窗口报 263 KB 而不是 283 MB，且扫描结果与预演一致 |
| 分类与折叠 | 从 bundle 里取出真正的 `groupRows` 跑一组混合数据：顺序固定、按类合计、未知类别落到「其他」、空的类别是收起来的那个。点某一类的标题只折叠这一类，折叠里的行不参与批量选择 |
| 视觉排版 | 在运行中的 Web UI 里手工确认过。本环境没有浏览器自动化，所以这条是人眼检查，不是测试。 |
| 确认框跟随面板主题 | `node smoke.mjs` 回归断言：两处确认都渲染 `ConfirmDialog`、代码里不再出现 `window.confirm`、弹层只用基线令牌上色 |
| agent 工具返回字符串且与 output.schema 一致 | `node smoke.mjs` 回归断言（1.6.1 修复） |
| agent 工具真删后评估缓存失效 | `node smoke.mjs` 回归断言（1.6.1 修复） |

### 实现要点

- 静态 boot bundle 的 client 半面工厂只收到 `require`——`styles` / `host` / `harness` 在这里不存在。样式自建 `<style data-plugin>` 插入 `document.head`，销毁时移除。
- 颜色全部走 `--dsw-alias-*` 主题 token，CSS 不写死颜色，类名统一 `dsc-` 前缀。
- slot 不能条件注册，所以「某个设置项让入口消失」是靠挂载与拆除（`bindWhile`）表达的，并用 `queueMicrotask` 延后——因为触发拆除的控件本身可能就长在要被拆掉的那个分区里。
- `plugins.bundle.config` 在 `view: 'summary'` 时返回 `null`，与其它 bundle 一致；行只在插件页渲染。
- `apply()` 内一切资源都通过 `ctx.effect` 注册，宿主可整体销毁。

### 已知上限

- **仅 Windows。** 路径按 Windows 目录布局构造，没有 POSIX 分支。
- **首次评估 30–60 秒。** 命名范围与「最大应用目录」会遍历重叠的树。结果缓存 10 分钟，并在真删后失效，所以只有第一个调用者付这笔钱；面板的「重新评估」会传 `force`，每次都要重付。`lib/audit.js` 里有 `ponytail:` 注释记录「共享 Map」这个替代方案。
- **更新安装包按时间清理，不靠识别版本。** `*-updater` 目录靠名字认；三天内的下载一律不动，因为只有应用自己知道它装了没有。
- **不提权。** 那个拒绝普通权限写入的 Windows 目录只报告，不尝试删除。`C:\Windows\Temp` **不是**其中之一：默认 ACL 给 `BUILTIN\Users` 创建与删除权限，挡住删除的只是被服务占用的 EBUSY，而保留期已经处理了这一类。
- **不卸载、不迁移。** 本插件做不到的步骤给命令，不给按钮。
- **遍历上限**每棵树 2,000,000 条目，极端大的树会被部分测量，而不是卡死。

### 架构

```
├─ package.json           dsh.bundle.patch + dsh.client { platform: "web" }
├─ cordis.patch.yml       - insert:  id: dsh-disk-cleaner
├─ lib/index.js    (525)  Host：HTTP 路由 + disk_cleaner 工具，共用同一个 run()，含 reveal
├─ lib/catalog.js  (1265)  32 个目标，measurePath / purgePath / resolveTargets / drives
├─ lib/audit.js    (365)  只读评估，10 分钟缓存，带 areaPaths，不暴露任何删除
├─ lib/plan.js     (150)  纯函数：测量结果 → 有序步骤
├─ lib/history.js   (71)  只追加的运行日志，落在 $DSH_HOME/dsh-disk-cleaner；永不抛错
├─ lib/client.js  (1962)  Client 半面：slot、面板、偏好、zh/en 字典、CSS
├─ locale/{en,zh}.json    展示元数据（meta.title / meta.description）
├─ icon.svg               插件图标
├─ README.md              本文件
├─ LICENSE                MIT
└─ smoke.mjs              120 条断言，零依赖
```

Client 半面注册的 slot：`sidebar.panellist`（order 50，仅设置页模式下拆除）、`main`（以包名为 key）、`settings.section`（order 30，仅侧边栏模式下拆除）、`plugins.bundle.config`（以包名为 key）。

### 更新记录

- **1.6.11** — 清理结束后不再像重启了一次。最后一份字节删完之后，面板原本还会做三件多余的事：
  把忙碌标记从「清理中」切到「扫描中」再切回来（每个按钮的文字与禁用状态都变两遍）；
  让刚刚清零的分组按「0 字节就折叠」的规则自己折起来；而面板本身就是滚动容器，
  列表变短后视口被夹回顶部。这些都不会真的重载任何东西——现在重新扫描是静默的（不碰忙碌标记）、
  扫描前后把原本展开的分组钉住、并把滚动位置放回原处，于是你停在同一屏。
  同时把宿主自己的更新器目录（`%LOCALAPPDATA%\@deepseek-ai\dsh-desktop-updater`）也纳入宿主保护，
  *应用更新包* 再也不能删掉正在运行的程序的更新载荷。四条回归断言分别覆盖静默重扫、
  分组保持展开、滚动位置还原与更新器排除。
- **1.6.10** — 清理不再把宿主自己重启一遍。`app-caches` 目标里列了宿主自己的 Chromium 配置目录
  （`%APPDATA%\@deepseek-ai\dsh-desktop`），于是清它等于清掉正在绘制这个面板的进程的缓存：
  Chromium 立刻重建这些目录，渲染进程随之重载，看上去就像插件热重启了一次、而不是回到自己的界面。
  现在这 4 个目录已从目标中移除，并且 `resolveTargets()` 会直接拒绝宿主数据目录下的任何路径，
  以后改目标定义也加不回来。`app-caches` 里其余部分（WPS、FTNN、Qoder、Trae、微信开发者工具、appGallery）不变。
  两条回归断言覆盖这个修复的两半。
- **1.6.9** — 深色面板里最后一块白框没了。确认框原来是 `window.confirm`，它由浏览器画在文档之外：读不到 `color-scheme`、读不到基线令牌、也不跟宿主主题，于是深色面板中间出现一个浅色矩形。现在改成面板自己画的弹层：信息一条不少（几项、多少字节、每个目标的名称与大小、哪些不可恢复），用 `--dsb-*` 上色，Escape、点遮罩、点取消都能退出，危险按钮刻意不自动聚焦，免得顺手一个回车就删了。计划步骤的确认走同一个组件。除绘制方式外没有行为变化。
- **1.6.8** — 补上 1.6.7 的另一半：桌面窗口如果发的是 `Origin: http://localhost:<端口>`、而请求实际到达 `127.0.0.1`，1.6.7 仍然会报「origin rejected」——因为它逐字比较这两个字符串。现在判定改为看**连接的来源地址**（远端网页无法影响这个值），再看 `Origin`：桌面自有协议、压根没有 `Origin`、或任何 loopback 主机名都放行，其余照旧拒绝；即便是 loopback 连接，`https://evil.example` 也进不来。空间评估的三条错误路径（评估、打开位置、跑计划步骤）统一走面板已有的「稳定 code → 中文文案」通道，不会再直接显示原始英文串。
- **1.6.7** — 修掉 1.6.6 带进来的一个回归：把「没有 Origin 头的请求」一律拒绝，连插件自己的面板都进不了接口（界面报「请求来源不被接受」）——桌面窗口发请求时 Origin 是 `dsh-app://app`，不是 `http://127.0.0.1:<端口>`。现在的判定接受桌面协议，也接受被桌面转发层剥掉的头，但前提是请求本身已经到达 loopback 地址；普通网页不发 Origin 就到不了 loopback 端口，所以门仍然是关的。其余行为没变。
- **1.6.6** — 把插件本来就算出来的结果真正显示出来。*清理* 旁边多了 **预演** 按钮：发同一个请求但不带 `confirm`，删之前就能看到会释放多少；清理结果横幅不再被紧随其后的重新扫描抹掉（以前下一行就被清空）。计划步骤改用目标名称，不再直出 `npm-cache, chrome-cache, pip-cache`；没有可做的事时说明「现在没有值得动手的地方」，而不是留一片空白；接口错误改带稳定 `code`，由面板翻成中文，不会再出现 `origin rejected` 或 `unknown target: x`。每次真正清理都会往 `$DSH_HOME/dsh-disk-cleaner/history.jsonl` 追加一行，新增的 **清理记录** 面板可读回并按 *复制为 CSV* 导出。底层：扫描从「32 个目标同时跑」改为每次 4 个，Windows 目标路径改由 `SystemRoot` 决定而不再硬编码 `C:`，缺少 `Origin` 头的请求会被拒绝（这项判定在 1.6.7 收紧到只放行 loopback，见下），目录删除被拒与非空目录被跳过分别计数。
- **1.6.5** — 仅文档修正：安装段现在指向它所写的那个 Release（预构建 tarball 的链接标为 v1.6.5，且指向 v1.6.5 的 tag）；目录段落也从「审核中」改为「已合并」。代码无变化。
- **1.6.4** — 面板改用 [dsh-design-baseline](https://github.com/stallenlu/dsh-design-baseline) 上色：样式表内联进 client bundle，根节点带 `dsb-root`，所有颜色都走 `--dsb-*` 令牌而不是宿主的 `--dsw-alias-*` 名字。因此它跟随宿主的明暗主题（含 `color-scheme`，原生 `<select>` 弹层与滚动条也跟着变），并且颜色只花在有状态的数据上——主按钮与选中项改成中性反色，不再是品牌蓝。行为没有变化。
- **1.6.3** — 改的是安全与诚实，不是新功能。回收站不再归入「安全」：清空不可恢复，所以它永不被预选、不被「全选」勾中，并单独带 `irreversible` 注意码，而不是笼统的「重建，下次启动慢一些」。确认框现在逐条列出目标名与合计字节，不再只问一句「删除选中缓存目录里的文件？」。没有声明根目录的目标，改为按所在卷做边界校验，而不是直接跳过检查。`measure` 与 `purge` 现在用同一单位计数，走查触到 200 万条上限时会如实标 `truncated`，不再声称精确总量。目录删除失败若原因不是「非空」会计入 `blocked`（此前被静默吞掉），清理后仍有残留的目标会报警告而不是绿色成功。orphan 目标按它实际测量的东西重新命名（QQ 频道目录）。
- **1.6.2** — 仅文档修正：README、源码注释、面板中英文说明和工具里的注意码释义，现在都按真实行为描述 `orphan-app-data`（QQGuild 目录内 30 天没有文件写入时会被整目录列为可全清），不再声称「四条独立证据 / 两年未写」。行为不变；更新后的 README 也随 npm 包与 [v1.6.2 Release](https://github.com/stallenlu/dsh-disk-cleaner/releases/tag/v1.6.2) 的 tarball 一起发布。
- **1.6.1** — 修复了 `disk_cleaner` agent 工具：`output.schema` 现在声明 `type: 'string'`，与 `execute()` 返回的文本一致（此前每次调用都被宿主的输出校验器拒绝，报 `tool "disk_cleaner" returned invalid output: "value" must be an object`）。经由 agent 工具真删后也会让评估缓存失效，与面板的 HTTP 路径一致。新增两条回归断言；[v1.6.1 Release](https://github.com/stallenlu/dsh-disk-cleaner/releases/tag/v1.6.1) 附带预构建 tarball。
- **1.6.0** — 32 个目标按七个可折叠分组归类。

## License

[MIT](LICENSE)
