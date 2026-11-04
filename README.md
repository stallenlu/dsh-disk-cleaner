# dsh-disk-cleaner

[English](#english) | [中文](#中文)

<!-- badges -->
| | |
| --- | --- |
| **version** | `1.0.0` |
| **DSH** | `0.2.1-rc.5`（开发与实测版本；用到 `plugins.bundle.config`、`settings.section`） |
| **license** | [MIT](LICENSE) |
| **Node** | `>= 22`（仅运行冒烟测试需要） |
| **平台** | Windows（清理路径按 Windows 目录布局构造） |

<a id="english"></a>
## English

**dsh-disk-cleaner** is a disk-space plugin for [DeepSeek Harness](https://github.com/deepseek-ai) (DSH). It does two different jobs, and keeps them apart on purpose:

1. **Clean** — thirteen known-safe cache locations (temp folders, package manager stores, browser caches, crash dumps, the Recycle Bin). Only these are ever deleted.
2. **Assess** — everything the plugin will *not* delete (installed programs, the WSL virtual disk, the Windows component store, chat-app data, your own folders). Measured and listed, never removed.

The assessment ends with a **plan**: the same numbers ordered by what it costs you to act, with the exact Windows command for the steps the plugin cannot perform itself.

Both the panel and the agent reach the *same* operations: the cleaning logic lives once in `lib/catalog.js`, and the HTTP route and the `disk_cleaner` tool are two callers of it.

### Features

| Feature | Description |
| --- | --- |
| Scan | Measures all thirteen targets concurrently and shows what each occupies |
| Per-drive filter | Chip row of mounted volumes; scanning or cleaning can be limited to one drive, and rows with nothing on that drive disappear |
| Risk labels | Every target is `safe` or `caution`, with a one-line reason (`in-use` / `rebuild` / `elevation`) and a permanent legend, so "caution" never means "unspecified" |
| Aged deletion | `temp` and `windows-temp` only remove files older than one day; files a running program still holds are skipped |
| Space assessment | Walks the disk read-only and groups the result into Windows / installed software / your own files, plus the ten largest app-data folders |
| Plan | Nine possible steps, ordered from zero-cost to your-decision-only; the steps the plugin can run have a button, the rest have a copyable command |
| Entry placement | Sidebar icon, settings section, or both (default) — switched from the plugin's own config card or the panel's ⚙ button |
| Behaviour settings | What is preselected after a scan, and whether deleting asks first |
| Panel memory | Scan results, the selection and the assessment survive switching to another panel and back |
| Agent tool | `disk_cleaner` exposes the same four actions to the model, in readable prose |
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
| `recycle-bin` | `$Recycle.Bin\S-1-5-*` on every mounted volume | purge | safe | it is the Recycle Bin |
| `inet-cache` | `%LOCALAPPDATA%\Microsoft\Windows\INetCache` | purge | caution | rebuilt |

`aged` targets skip anything modified within the retention window; `purge` targets remove every entry. Both keep the target directory itself and leave locked entries alone, counting them as skipped.

### Space assessment areas

`wsl` (ext4.vhdx images), `winsxs`, `system-files` (hiberfil / pagefile / swapfile), `programs` (user scope), `program-files` (machine scope), `downloads`, `documents`, `pictures`, `videos`, `desktop`. An area that does not exist is dropped rather than reported as zero. The ten largest folders under `%LOCALAPPDATA%` and `%APPDATA%` (≥100 MB each) are listed separately, because "3.6 GB in Roaming\kingsoft" points somewhere a Settings page does not.

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
| `action` | `overview` \| `scan` \| `clean` \| `audit` | required |
| `ids` | string[] | catalog ids; required for `clean`, max 32 |
| `drive` | string | `C:` / `D:\` — limits the work to one volume |
| `confirm` | boolean | without it, `clean` is a dry run |

`clean` without `confirm: true` deletes nothing and reports what it would free — that is the approval path. `audit` is read-only and returns the plan in prose, ending with "Report that plan to the user; never run those commands yourself."

### HTTP surface

One route, `POST /api/disk-cleaner/`, used by the panel:

```jsonc
{"action":"overview"}                          // drives + target ids
{"action":"scan","drive":"C:"}                 // measured targets
{"action":"audit"}                             // areas + largest apps + plan
{"action":"clean","ids":["temp"],"confirm":true}
```

POST only (405 otherwise), same-origin only (403 otherwise), body ≤4096 bytes, at most 32 ids, unknown ids or actions rejected with 400. Handlers never receive a path.

### Safety rules

These are enforced in `lib/catalog.js` and must not be relaxed:

- Only paths built by the catalog are touched. No API accepts a path.
- A candidate must have at least three path segments and must not be a volume root (`tooBroad`).
- After `realpath`, the candidate must still sit inside the environment root it was built from — a junction planted in a cache directory cannot widen the blast radius.
- Symlinks and junctions met during a walk are skipped, never followed or deleted.
- Locked or denied entries are counted as skipped and the walk continues.
- The target directory itself is kept; only its contents go.
- The directory Windows refuses to let an unelevated process write (`SoftwareDistribution\Download`) is labelled `elevation` and excluded from "reclaimable now". `C:\Windows\Temp` is **not** one of them on a default ACL: it grants `BUILTIN\Users` create and delete, so only EBUSY on a live file stops a delete there, which the age limit covers.

### Install

Published on npm as [`dsh-disk-cleaner`](https://www.npmjs.com/package/dsh-disk-cleaner):

```bash
npm i dsh-disk-cleaner
```

Then enable it in the profile — in `$DSH_PROFILE_DIR/package.json`:

```json
{
  "dependencies": {
    "dsh-disk-cleaner": "^1.0.0"
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
node smoke.mjs                       # 61 assertions, zero dependencies
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
| `overview` / `scan` / `clean` / `audit` round-trip | Real `POST /api/disk-cleaner/` against a live host |
| Real deletion keeps the target directory, honours the age limit | Temp directory seeded with old and new files |
| Dry run deletes nothing | `confirm` omitted, byte counts unchanged |
| Drive filter rejects unmounted and malformed volumes | `C:extra`, `Z:`, `abc` → 400 |
| Plan excludes elevation bytes from `reclaimNow` | Live audit against this machine |
| Visual layout | Checked by hand in the running Web UI. No browser automation here, so this one is a human check, not a test. |

### Implementation notes

- Client halves of static boot bundles receive only `require` in their factory — `styles` / `host` / `harness` do not exist there. Styles are installed as a `<style data-plugin>` element appended to `document.head`, and removed on dispose.
- All colours go through `--dsw-alias-*` theme tokens; no literal colours in the CSS, and every class is prefixed `dsc-`.
- A slot cannot be registered conditionally, so a setting that removes an entry is expressed by mounting and disposing the injection (`bindWhile`), deferred with `queueMicrotask` — the control that removes a section may itself live inside that section.
- `plugins.bundle.config` returns `null` for `view: 'summary'`, the same way other bundles do; the rows render only on the plugin page.
- `apply()` registers everything through `ctx.effect` so the host can dispose it as a unit.

### Known ceilings

- **Windows only.** Paths are built from the Windows layout; there is no POSIX branch.
- **First assessment takes 40–60 s.** Named areas and the per-app folder list walk overlapping trees. A result is cached for 10 minutes and invalidated by a real deletion, so only the first caller pays. `ponytail:` comment in `lib/audit.js` records the shared-map alternative.
- **No elevation.** The one Windows directory that refuses an unelevated write is reported, never attempted.
- **No uninstall, no move.** Steps the plugin cannot perform carry a command instead of a button.
- **Traversal caps** at 2,000,000 entries per walk, so an absurdly large tree is measured partially rather than hanging.

### Architecture

```
├─ package.json           dsh.bundle.patch + dsh.client { platform: "web" }
├─ cordis.patch.yml       - insert:  id: dsh-disk-cleaner
├─ lib/index.js    (330)  Host: HTTP route + disk_cleaner tool, same run() for both
├─ lib/catalog.js  (413)  The 13 targets, measurePath / purgePath / resolveTargets / drives
├─ lib/audit.js    (262)  Read-only assessment, 10-minute cache, exposes no deletion
├─ lib/plan.js     (150)  Pure: measurements → ordered steps
├─ lib/client.js  (1234)  Client half: slots, panel, preferences, zh/en dictionaries, CSS
├─ locale/{en,zh}.json    Display metadata (meta.title / meta.description)
├─ icon.svg               Plugin icon
├─ README.md              This file
├─ LICENSE                MIT
└─ smoke.mjs              61 assertions, zero dependencies
```

Client-half slots: `sidebar.panellist` (order 50, disposed in settings-only mode), `main` (keyed by the package name), `settings.section` (order 30, disposed in sidebar-only mode), `plugins.bundle.config` (keyed by the package name).

---

<a id="中文"></a>
## 中文

**dsh-disk-cleaner** 是 [DeepSeek Harness](https://github.com/deepseek-ai)（DSH）的磁盘空间插件。它做两件不同的事，并且刻意分开：

1. **清理** —— 十三个已知安全的缓存位置（临时目录、包管理器存储、浏览器缓存、崩溃转储、回收站）。只有这些会被删除。
2. **评估** —— 所有本插件**不会**删的东西（已装程序、WSL 虚拟磁盘、Windows 组件库、聊天软件数据、你自己的文件夹）。只测量、只列出，绝不删除。

评估的最后是一份**处理方案**：同一批数字按「你要付出多少代价」排序，本插件做不到的步骤附上确切的 Windows 命令。

面板和 agent 用的是**同一套操作**：清理逻辑只在 `lib/catalog.js` 里写一次，HTTP 路由和 `disk_cleaner` 工具都是它的调用方。

### 功能

| 功能 | 说明 |
| --- | --- |
| 扫描 | 并发测量全部十三个目标，显示各自占用 |
| 按盘过滤 | 已挂载卷的胶囊按钮；扫描与清理都可限定单盘，该盘上为空的项会隐藏 |
| 风险标注 | 每个目标都标 `安全` 或 `注意`，并给一行理由（`in-use` / `rebuild` / `elevation`），图例常驻，所以「注意」永远不是「说不清」 |
| 保留期删除 | `temp` 与 `windows-temp` 只删一天前的文件；被运行中程序占住的自动跳过 |
| 空间评估 | 只读遍历磁盘，按 Windows 自身 / 已装软件 / 你自己的文件 分组，另列占用最大的十个应用数据目录 |
| 处理方案 | 九种可能步骤，从零风险到只能你决定；本插件能执行的带按钮，其余给可复制的命令 |
| 入口位置 | 侧边栏图标、设置页分区、或两者都要（默认）——在插件自己的配置卡或面板 ⚙ 里切换 |
| 行为设置 | 扫描后默认勾选什么、删除前是否确认 |
| 面板记忆 | 扫描结果、勾选、评估结果在切走再回来时都还在 |
| Agent 工具 | `disk_cleaner` 把同样的四个动作以可读文本交给模型 |
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
| `recycle-bin` | 各已挂载卷的 `$Recycle.Bin\S-1-5-*` | 全清 | 安全 | 就是回收站 |
| `inet-cache` | `%LOCALAPPDATA%\Microsoft\Windows\INetCache` | 全清 | 注意 | 会重建 |

保留期方式会跳过保留期内修改过的文件；全清方式清掉全部条目。两者都保留目标目录本身，并把锁定或无权限的条目跳过计数。

### 空间评估范围

`wsl`（ext4.vhdx 映像）、`winsxs`、`system-files`（hiberfil / pagefile / swapfile）、`programs`（用户级）、`program-files`（机器级）、`downloads`、`documents`、`pictures`、`videos`、`desktop`。不存在的范围直接略去，不报成 0。`%LOCALAPPDATA%` 与 `%APPDATA%` 下超过 100 MB 的十个最大目录另外列出——因为「Roaming\kingsoft 占 3.6 GB」指向的地方，设置页里根本找不到。

### 处理方案步骤

| 代码 | 出现条件 | 本插件可执行 |
| --- | --- | --- |
| `reclaim-safe` | 安全目标共 ≥200 MB | 是，一个按钮 |
| `reclaim-caution` | 注意目标共 ≥200 MB（不含需提权的） | 是，一个按钮 |
| `wsl-compact` | WSL 映像 ≥1 GB | 否 —— `wsl --shutdown` + `diskpart` 的 `compact vdisk` |
| `winsxs-cleanup` | WinSxS ≥1 GB | 否 —— `Dism.exe /Online /Cleanup-Image /StartComponentCleanup` |
| `elevation-clean` | 需提权目标 ≥200 MB | 否 —— 以管理员身份运行本插件 |
| `hibernate-off` | `system-files` ≥200 MB | 否 —— `powercfg.exe /hibernate off` |
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
| `action` | `overview` \| `scan` \| `clean` \| `audit` | 必填 |
| `ids` | string[] | catalog id；`clean` 必填，最多 32 个 |
| `drive` | string | `C:` / `D:\`，把操作限定在一块盘 |
| `confirm` | boolean | 不传时 `clean` 只做试运行 |

不带 `confirm: true` 的 `clean` 一个字节都不删，只报告本来能释放多少——这就是审批路径。`audit` 只读，并以文本返回处理方案，结尾固定为「把方案报告给用户，不要自己执行这些命令」。

### HTTP 接口

只有一个路由 `POST /api/disk-cleaner/`，面板使用：

```jsonc
{"action":"overview"}                          // 磁盘容量 + 目标 id
{"action":"scan","drive":"C:"}                 // 测量后的目标
{"action":"audit"}                             // 范围 + 最大应用目录 + 方案
{"action":"clean","ids":["temp"],"confirm":true}
```

只接受 POST（否则 405），只接受同源（否则 403），body ≤4096 字节，id 最多 32 个，未知 id 或动作返回 400。处理器永远收不到路径。

### 安全规则

以下在 `lib/catalog.js` 中强制，不得放宽：

- 只碰 catalog 构造出的路径，没有任何接口接受路径参数。
- 候选路径至少三段，且不能是卷根（`tooBroad`）。
- `realpath` 之后必须仍落在它所属的环境根内——在缓存目录里种一个 junction 也扩大不了波及面。
- 遍历时遇到符号链接与 junction 一律跳过，不跟随也不删除。
- 锁定或无权限的条目计为跳过，遍历继续。
- 保留目标目录本身，只清内容。
- 那个拒绝普通权限写入的 Windows 目录标为 `elevation`，并排除在「现在能回收」之外。

### 安装

已发布到 npm：[`dsh-disk-cleaner`](https://www.npmjs.com/package/dsh-disk-cleaner)。

```bash
npm i dsh-disk-cleaner
```

然后在 profile 里启用 —— 在 `$DSH_PROFILE_DIR/package.json`：

```json
{
  "dependencies": {
    "dsh-disk-cleaner": "^1.0.0"
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

```bash
git clone https://github.com/stallenlu/dsh-disk-cleaner
```

### 开发

```bash
node smoke.mjs                       # 61 条断言，零依赖
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
| 四个动作端到端 | 对真实宿主 `POST /api/disk-cleaner/` |
| 真删保留目标目录、遵守保留期 | 在 Temp 里造一旧一新两个文件验证 |
| 试运行不删任何东西 | 不传 `confirm`，字节数不变 |
| 盘过滤拒绝未挂载与畸形卷名 | `C:extra`、`Z:`、`abc` → 400 |
| 方案不把提权目标的字节算进「现在能回收」 | 在本机跑真实 audit |
| 视觉排版 | 在运行中的 Web UI 里手工确认过。本环境没有浏览器自动化，所以这条是人眼检查，不是测试。 |

### 实现要点

- 静态 boot bundle 的 client 半面工厂只收到 `require`——`styles` / `host` / `harness` 在这里不存在。样式自建 `<style data-plugin>` 插入 `document.head`，销毁时移除。
- 颜色全部走 `--dsw-alias-*` 主题 token，CSS 不写死颜色，类名统一 `dsc-` 前缀。
- slot 不能条件注册，所以「某个设置项让入口消失」是靠挂载与拆除（`bindWhile`）表达的，并用 `queueMicrotask` 延后——因为触发拆除的控件本身可能就长在要被拆掉的那个分区里。
- `plugins.bundle.config` 在 `view: 'summary'` 时返回 `null`，与其它 bundle 一致；行只在插件页渲染。
- `apply()` 内一切资源都通过 `ctx.effect` 注册，宿主可整体销毁。

### 已知上限

- **仅 Windows。** 路径按 Windows 目录布局构造，没有 POSIX 分支。
- **首次评估 40–60 秒。** 命名范围与「最大应用目录」会遍历重叠的树。结果缓存 10 分钟，并在真删后失效，所以只有第一个调用者付这笔钱。`lib/audit.js` 里有 `ponytail:` 注释记录「共享 Map」这个替代方案。
- **不提权。** 那个拒绝普通权限写入的 Windows 目录只报告，不尝试删除。`C:\Windows\Temp` **不是**其中之一：默认 ACL 给 `BUILTIN\Users` 创建与删除权限，挡住删除的只是被服务占用的 EBUSY，而保留期已经处理了这一类。
- **不卸载、不迁移。** 本插件做不到的步骤给命令，不给按钮。
- **遍历上限**每棵树 2,000,000 条目，极端大的树会被部分测量，而不是卡死。

### 架构

```
├─ package.json           dsh.bundle.patch + dsh.client { platform: "web" }
├─ cordis.patch.yml       - insert:  id: dsh-disk-cleaner
├─ lib/index.js    (330)  Host：HTTP 路由 + disk_cleaner 工具，共用同一个 run()
├─ lib/catalog.js  (413)  13 个目标，measurePath / purgePath / resolveTargets / drives
├─ lib/audit.js    (262)  只读评估，10 分钟缓存，不暴露任何删除
├─ lib/plan.js     (150)  纯函数：测量结果 → 有序步骤
├─ lib/client.js  (1234)  Client 半面：slot、面板、偏好、zh/en 字典、CSS
├─ locale/{en,zh}.json    展示元数据（meta.title / meta.description）
├─ icon.svg               插件图标
├─ README.md              本文件
├─ LICENSE                MIT
└─ smoke.mjs              61 条断言，零依赖
```

Client 半面注册的 slot：`sidebar.panellist`（order 50，仅设置页模式下拆除）、`main`（以包名为 key）、`settings.section`（order 30，仅侧边栏模式下拆除）、`plugins.bundle.config`（以包名为 key）。

## License

[MIT](LICENSE)
