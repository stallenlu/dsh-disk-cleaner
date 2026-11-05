window.__ModuleLoader__.load({
  id: 'dsh-disk-cleaner',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useCallback, useEffect, useMemo, useRef, useState } = React;

    const NS = 'dsh-disk-cleaner';
    const PANEL_ID = 'dsh-disk-cleaner';
    const ROUTE = '/api/disk-cleaner/';

    const zh = {
      title: '磁盘清理',
      open: '磁盘清理',
      drives: '磁盘容量',
      free: '可用',
      used: '已用',
      scan: '扫描',
      scanning: '扫描中…',
      rescan: '重新扫描',
      selectAll: '全选',
      clearAll: '清空选择',
      clean: '清理选中项',
      cleaning: '清理中…',
      selected: '已选',
      reclaimable: '可回收',
      nothingYet: '点「扫描」统计各缓存目录当前占用。',
      noTargets: '没有发现可清理的缓存目录。',
      done: '已释放',
      files: '个文件',
      failed: '跳过',
      failedHint: '个锁定或无权限的条目未删除',
      risky: '注意',
      safe: '安全',
      legendSafe: '安全 — 纯缓存或可再生成的文件，删掉不影响任何数据，下次用到时自动重建。',
      legendCaution: '注意 — 仍会被程序使用，或删除后需要重建。只会删掉超过保留期的文件，锁定中的项目自动跳过。',
      why_safe: '纯缓存，删掉也会自动重建',
      'why_in-use': '只删 {n} 天前的文件，正在使用的会跳过',
      why_rebuild: '缓存会自动重建，下次打开略慢',
      why_elevation: '需要管理员权限；普通窗口下会被系统拒绝',
      'why_pending-update': '只清 {n} 天前的下载，避免删掉还没装的更新',
      why_rollback: '每个插件/程序只留版本号最高的一份，其余是回滚副本',
      why_superseded: '版本号不高于已装版本的更新包，装着的那份已经生效',
      why_history: '每个会话的整文件备份，删了不影响会话本身',
      why_duplicate: '内容完全相同的重复副本，保留最新那份',
      'why_database-backup': '升级前的数据库副本，正在用的数据库还在旁边',
      pathCount: '{n} 处',
      driveLabel: '清理范围',
      allDrives: '全部磁盘',
      scanError: '扫描失败',
      cleanError: '清理失败',
      cleanConfirm: '删除选中缓存目录里的文件？正在使用的文件会被跳过。',
      'target_temp': '用户临时文件',
      'target_windows-temp': 'Windows 临时文件',
      'target_npm-cache': 'npm 缓存',
      'target_pnpm-store': 'pnpm 存储',
      'target_pip-cache': 'pip 缓存',
      'target_uv-cache': 'uv 缓存',
      'target_crash-dumps': '崩溃转储',
      'target_chrome-cache': 'Chrome 缓存',
      'target_edge-cache': 'Edge 缓存',
      'target_code-cache': 'VS Code 缓存',
      'target_inet-cache': '系统网络缓存',
      'target_windows-update': 'Windows 更新缓存',
      'target_recycle-bin': '回收站',
      'target_app-updaters': '更新安装包残留',
      'target_app-caches': '各应用缓存',
      'target_app-logs': '各应用日志',
      'target_app-temp': '各应用临时目录',
      'target_plugin-old-versions': '插件旧版本',
      'target_update-packages': '已应用的更新包',
      'target_session-backups': '会话备份快照',
      'target_agent-logs': '按天的日志归档',
      'target_toolchain-snapshots': '重复的工具链快照',
      'target_editor-server-bundles': '多余的编辑器服务包',
      'target_database-backups': '数据库备份副本',
      'target_editor-builds': '编辑器的旧版构建',
      'target_agent-app-caches': 'AI 应用的浏览器缓存',
      'target_rewind-snapshots': '过期的回滚快照',
      'target_rotated-logs': '轮转掉的日志',
      auditTitle: '空间评估（本插件不会删除）',
      auditHint: '统计缓存之外真正占空间的东西：已装软件、WSL 虚拟磁盘、Windows 组件库，以及你自己的文件。这些一律不由本插件删除，只列出供你判断。',
      auditRun: '开始评估',
      auditRescan: '重新评估',
      auditRunning: '评估中…',
      auditCold: '首次评估需要一到两分钟，因为要逐个遍历已装程序的目录。结果会一直留在面板上，切走再回来也在。',
      auditCached: '（缓存结果）',
      auditTotal: '合计（不含缓存）',
      auditGroupSystem: 'Windows 自身',
      auditGroupApp: '已装软件',
      auditGroupPersonal: '你自己的文件',
      auditTop: '占用最大的单个应用目录',
      auditScopeLocal: 'Local',
      auditScopeRoaming: 'Roaming',
      auditError: '评估失败',
      auditOpen: '在资源管理器中打开',
      auditOpened: '已打开',
      area_wsl: 'WSL 虚拟磁盘',
      area_wsl_why: 'WSL 的 ext4.vhdx 只增不减，删发行版会丢数据；回收只能压缩，见下面的处理方案。',
      area_winsxs: 'Windows 组件库',
      area_winsxs_why: '系统更新的旧版本备份。只能由 DISM 清理，手动删会损坏系统。',
      'area_system-files': '休眠与页面文件',
      'area_system-files_why': '由 Windows 管理系统文件，只能通过关闭休眠或调整虚拟内存来回收。',
      area_programs: '用户安装的程序',
      'area_program-files': '全机安装的程序',
      area_programs_why: '装在你账户下的软件本体，删掉等同于卸载。',
      'area_program-files_why': 'Program Files 里的软件本体，请走正常的卸载流程。',
      'area_old-versions': '旧版本程序目录',
      'area_old-versions_why': '安装器留了上一版供回滚。确认当前版本没问题后，可以自己删掉旧版。',
      'area_update-payloads': '已下载的更新包',
      'area_update-payloads_why': '安装完通常会留下的 setup/installer 文件。三天内的下载视为可能还没装，不动。',
      area_downloads: '下载文件夹',
      area_downloads_why: '你自己下载的文件，插件一律不碰。',
      area_documents: '文档',
      area_documents_why: '你自己的文档，插件一律不碰。',
      area_pictures: '图片',
      area_pictures_why: '你自己的图片，插件一律不碰。',
      area_videos: '视频',
      area_videos_why: '你自己的视频，插件一律不碰。',
      area_desktop: '桌面',
      area_desktop_why: '桌面上放着的文件，插件一律不碰。',
      planTitle: '处理方案',
      planHint: '按"收益 ÷ 代价"排序：先做零风险的部分，再做需要一次慎重操作的，最后是只能你自己决定的。',
      planNow: '现在就能回收',
      planRun: '执行这一步',
      planRunning: '执行中…',
      planCopy: '复制命令',
      planCopied: '已复制',
      'plan_code_reclaim-safe': '清理纯缓存',
      'plan_code_reclaim-safe_detail': '{n} 个目标：{ids}。不丢数据，下次用到自动重建。',
      'plan_code_reclaim-caution': '清理需要重建的缓存',
      'plan_code_reclaim-caution_detail': '{n} 个目标：{ids}。下次启动会慢一些。',
      'plan_code_wsl-compact': '压缩 WSL 虚拟磁盘',
      'plan_code_wsl-compact_detail': '磁盘映像只增不减，压缩不会丢失任何文件。需先关闭 WSL。',
      'plan_code_elevation-clean': '管理员权限才能清的系统目录',
      'plan_code_elevation-clean_detail': '{n} 个目标：{ids}。这些目录拒绝普通权限，清不掉也算不进「现在能回收」。',
      'plan_code_winsxs-cleanup': '清理 Windows 组件库',
      'plan_code_winsxs-cleanup_detail': '需要管理员权限，只删被取代的旧组件，当前组件保留。',
      'plan_code_hibernate-off': '关闭休眠',
      'plan_code_hibernate-off_detail': '释放休眠文件；休眠和快速启动会一起失效。',
      'plan_code_app-review': '考虑卸载的程序',
      'plan_code_app-review_detail': '{name}（{scope}）——占 {bytes}。要清就走卸载，别直接删目录。',
      'plan_code_move-folder': '把文件夹移到别的盘',
      'plan_code_move-folder_detail': '{folder} 移到 {drive}（可用 {free}）：用属性 → 位置标签页迁移，不要手动剪切。',
      'plan_code_pressure': '磁盘空间偏紧',
      'plan_code_pressure_detail': '{drive} 只剩 {free} / {total}。上面的步骤做完再评估一次。',
      planScopeLocal: '用户级',
      planScopeRoaming: '机器级',
      settingsTitle: '磁盘清理',
      settingsOpen: '插件设置',
      settingsBack: '返回',
      settingsGroupDisplay: '入口与可见性',
      settingsHint: '改动立即生效，刷新页面后依然保留。',
      cfgPlacement: '面板入口',
      placementAll: '全部',
      placementSidebar: '仅侧边栏',
      placementSettings: '仅设置页',
      cfgGroupBehavior: '清理行为',
      cfgDefaultPick: '扫描后默认勾选',
      pickSafe: '仅安全项',
      pickAll: '安全 + 注意',
      pickNone: '都不勾选',
      cfgConfirm: '删除前确认',
      confirmAlways: '每次确认',
      confirmNever: '不再确认',
    };

    const en = {
      title: 'Disk Cleaner',
      open: 'Disk Cleaner',
      drives: 'Drives',
      free: 'free',
      used: 'used',
      scan: 'Scan',
      scanning: 'Scanning…',
      rescan: 'Rescan',
      selectAll: 'Select all',
      clearAll: 'Clear',
      clean: 'Clean selected',
      cleaning: 'Cleaning…',
      selected: 'Selected',
      reclaimable: 'Reclaimable',
      nothingYet: 'Press “Scan” to measure the cache directories.',
      noTargets: 'No cleanable cache directories were found.',
      done: 'Freed',
      files: 'file(s)',
      failed: 'skipped',
      failedHint: 'locked or denied entries were left alone',
      risky: 'caution',
      safe: 'safe',
      legendSafe: 'Safe — pure cache or regenerable files. No data is lost and it rebuilds on next use.',
      legendCaution: 'Caution — still used by programs, or rebuilt after a slower next start. Only files past the retention limit go; locked ones are skipped.',
      why_safe: 'pure cache, rebuilt automatically',
      'why_in-use': 'only files older than {n} day(s); files in use are skipped',
      why_rebuild: 'rebuilt automatically; the next open is slower',
      why_elevation: 'needs an elevated prompt; a normal window is refused by Windows',
      'why_pending-update': 'only downloads older than {n} day(s), so a pending update survives',
      why_rollback: 'only the highest version of each family stays; the rest are rollback copies',
      why_superseded: 'the update package version is not above what is installed, so it is already applied',
      why_history: 'a whole-file backup per session; removing it does not touch the session',
      why_duplicate: 'an identical copy; the newest one is kept',
      'why_database-backup': 'a copy made before an upgrade; the live database is beside it',
      pathCount: '{n} location(s)',
      driveLabel: 'Limit to',
      allDrives: 'All drives',
      scanError: 'Scan failed',
      cleanError: 'Clean failed',
      cleanConfirm: 'Delete the files in the selected cache directories? Files in use are skipped.',
      'target_temp': 'User temp files',
      'target_windows-temp': 'Windows temp files',
      'target_npm-cache': 'npm cache',
      'target_pnpm-store': 'pnpm store',
      'target_pip-cache': 'pip cache',
      'target_uv-cache': 'uv cache',
      'target_crash-dumps': 'Crash dumps',
      'target_chrome-cache': 'Chrome cache',
      'target_edge-cache': 'Edge cache',
      'target_code-cache': 'VS Code cache',
      'target_inet-cache': 'System internet cache',
      'target_windows-update': 'Windows update cache',
      'target_recycle-bin': 'Recycle Bin',
      'target_app-updaters': 'Leftover update installers',
      'target_app-caches': 'App caches',
      'target_app-logs': 'App logs',
      'target_app-temp': 'App scratch folders',
      'target_plugin-old-versions': 'Old plugin versions',
      'target_update-packages': 'Applied update packages',
      'target_session-backups': 'Session backup snapshots',
      'target_agent-logs': 'Dated log archives',
      'target_toolchain-snapshots': 'Duplicate toolchain snapshots',
      'target_editor-server-bundles': 'Extra editor server bundles',
      'target_database-backups': 'Database backup copies',
      'target_editor-builds': 'Old editor builds',
      'target_agent-app-caches': 'Browser caches of the AI apps',
      'target_rewind-snapshots': 'Expired rewind snapshots',
      'target_rotated-logs': 'Rotated-out log files',
      auditTitle: 'Space assessment (this plugin deletes none of it)',
      auditHint: 'What actually takes up room outside caches: installed programs, WSL disk images, the Windows component store, and your own files. None of it is removed here; it is listed so you can decide.',
      auditRun: 'Run assessment',
      auditRescan: 'Re-run',
      auditRunning: 'Assessing…',
      auditCold: 'The first run takes a minute or two because it walks every installed program folder. The result stays on this panel when you switch away and back.',
      auditCached: '(cached)',
      auditTotal: 'Total, caches excluded',
      auditGroupSystem: 'Windows itself',
      auditGroupApp: 'Installed software',
      auditGroupPersonal: 'Your own files',
      auditTop: 'Largest single app folders',
      auditScopeLocal: 'Local',
      auditScopeRoaming: 'Roaming',
      auditError: 'Assessment failed',
      auditOpen: 'Open in Explorer',
      auditOpened: 'Opened',
      area_wsl: 'WSL distros (ext4.vhdx)',
      area_wsl_why: 'The WSL ext4.vhdx only grows. Deleting a distro loses data; compacting is the only way to reclaim it, see the plan below.',
      area_winsxs: 'Windows component store (WinSxS)',
      area_winsxs_why: 'Superseded copies of system updates. Only DISM may clean these; deleting by hand damages Windows.',
      'area_system-files': 'Hibernation and page files',
      'area_system-files_why': 'Managed by Windows. Reclaimed only by turning hibernation off or shrinking virtual memory.',
      area_programs: 'Installed programs (user scope)',
      area_programs_why: 'The program itself, installed under your account. Deleting it is uninstalling it.',
      'area_program-files': 'Installed programs (machine scope)',
      'area_program-files_why': 'Program bodies under Program Files. Remove them through the normal uninstaller.',
      'area_old-versions': 'Superseded app versions',
      'area_old-versions_why': 'An installer kept the previous build for rollback. Once the current version is fine, delete the old one by hand.',
      'area_update-payloads': 'Downloaded update packages',
      'area_update-payloads_why': 'Setup/installer files left behind after an update. Usually safe to delete; anything from the last three days may still be pending.',
      area_downloads: 'Downloads',
      area_downloads_why: 'Your own downloads. This plugin never touches them.',
      area_documents: 'Documents',
      area_documents_why: 'Your own documents. This plugin never touches them.',
      area_pictures: 'Pictures',
      area_pictures_why: 'Your own pictures. This plugin never touches them.',
      area_videos: 'Videos',
      area_videos_why: 'Your own videos. This plugin never touches them.',
      area_desktop: 'Desktop',
      area_desktop_why: 'Files sitting on your desktop. This plugin never touches them.',
      planTitle: 'Suggested plan',
      planHint: 'Ordered by gain against cost: the zero-risk part first, then the one deliberate operation, then what only you can decide.',
      planNow: 'Reclaimable now',
      planRun: 'Run this step',
      planRunning: 'Running…',
      planCopy: 'Copy command',
      planCopied: 'Copied',
      'plan_code_reclaim-safe': 'Clean pure caches',
      'plan_code_reclaim-safe_detail': '{n} target(s): {ids}. No data lost, rebuilt on next use.',
      'plan_code_reclaim-caution': 'Clean caches that rebuild',
      'plan_code_reclaim-caution_detail': '{n} target(s): {ids}. Expect a slower next start.',
      'plan_code_wsl-compact': 'Compact the WSL virtual disk',
      'plan_code_wsl-compact_detail': 'The image only ever grows; compacting keeps every file. WSL must be shut down first.',
      'plan_code_elevation-clean': 'Windows folders that need elevation',
      'plan_code_elevation-clean_detail': '{n} target(s): {ids}. These refuse a normal token, so they are not counted as reclaimable now.',
      'plan_code_winsxs-cleanup': 'Service the Windows component store',
      'plan_code_winsxs-cleanup_detail': 'Needs an elevated prompt; drops superseded components only.',
      'plan_code_hibernate-off': 'Turn off hibernation',
      'plan_code_hibernate-off_detail': 'Frees the hibernation file; hibernate and fast startup stop working.',
      'plan_code_app-review': 'Program worth reviewing',
      'plan_code_app-review_detail': '{name} ({scope}) uses {bytes}. Uninstall it if unused, never delete the folder.',
      'plan_code_move-folder': 'Move a folder to another drive',
      'plan_code_move-folder_detail': '{folder} to {drive} ({free} free): use Properties > Location, do not cut and paste.',
      'plan_code_pressure': 'Drive nearly full',
      'plan_code_pressure_detail': '{drive} has only {free} of {total} left. Work through the steps above, then re-assess.',
      planScopeLocal: 'user scope',
      planScopeRoaming: 'machine scope',
      settingsTitle: 'Disk Cleaner',
      settingsOpen: 'Plugin settings',
      settingsBack: 'Back',
      settingsGroupDisplay: 'Entry and visibility',
      settingsHint: 'Changes apply immediately and survive a page reload.',
      cfgPlacement: 'Panel entry',
      placementAll: 'Everywhere',
      placementSidebar: 'Sidebar only',
      placementSettings: 'Settings page only',
      cfgGroupBehavior: 'Cleaning',
      cfgDefaultPick: 'Preselect after a scan',
      pickSafe: 'Safe targets only',
      pickAll: 'Safe and caution',
      pickNone: 'Nothing',
      cfgConfirm: 'Ask before deleting',
      confirmAlways: 'Always ask',
      confirmNever: 'Never ask',
    };

    const CSS = `
      .dsc-root { box-sizing: border-box; height: 100%; overflow-y: auto; padding: 16px 20px 32px; font-size: 13px; color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-base); }
      .dsc-head { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
      .dsc-head-spacer { margin-left: auto; }
      .dsc-head-btn { box-sizing: border-box; display: inline-flex; align-items: center; gap: 6px; font: inherit; font-size: 12px; line-height: 1; padding: 6px 11px; border-radius: 999px; cursor: pointer; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary); white-space: nowrap; }
      .dsc-head-btn:hover { color: var(--dsw-alias-label-primary); border-color: var(--dsw-alias-border-l1); }
      .dsc-head h1 { margin: 0; font-size: 16px; font-weight: 600; line-height: 24px; }
      .dsc-head-sub { color: var(--dsw-alias-label-secondary); font-size: 12px; }
      .dsc-card { box-sizing: border-box; background: var(--dsw-alias-bg-layer-1); border: 1px solid var(--dsw-alias-border-l2); border-radius: 10px; padding: 12px 14px; margin-bottom: 12px; }
      .dsc-card-title { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; font-weight: 600; }
      .dsc-drives { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(200px, 100%), 1fr)); gap: 10px 18px; }
      .dsc-drive-label { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; font-size: 12px; margin-bottom: 4px; }
      .dsc-drive-label b { font-size: 13px; }
      .dsc-drive-label span { color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; }
      .dsc-bar { height: 6px; border-radius: 3px; background: var(--dsw-alias-bg-layer-2); overflow: hidden; }
      .dsc-bar-fill { height: 100%; border-radius: 3px; background: var(--dsw-alias-brand-primary); transition: width .25s ease; }
      .dsc-bar-fill.dsc-warn { background: var(--dsw-alias-state-warn-primary); }
      .dsc-bar-fill.dsc-crit { background: var(--dsw-alias-state-error-primary); }
      .dsc-chips { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-bottom: 10px; }
      .dsc-chips-label { color: var(--dsw-alias-label-secondary); font-size: 12px; margin-right: 2px; }
      .dsc-chip { font: inherit; font-size: 12px; line-height: 1; padding: 5px 10px; border-radius: 999px; cursor: pointer; border: 1px solid var(--dsw-alias-border-l2); background: transparent; color: var(--dsw-alias-label-secondary); }
      .dsc-chip:hover:not(.dsc-chip-active) { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-layer-2); }
      .dsc-chip-active { border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary); font-weight: 600; }
      .dsc-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 10px; }
      .dsc-btn { font: inherit; font-size: 12px; line-height: 1; padding: 6px 12px; border-radius: 7px; cursor: pointer; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); }
      .dsc-btn:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-2); }
      .dsc-btn:disabled { opacity: .5; cursor: default; }
      .dsc-btn-primary { background: var(--dsw-alias-brand-primary); border-color: transparent; color: var(--dsw-alias-bg-base); font-weight: 600; }
      .dsc-btn-primary:hover:not(:disabled) { filter: brightness(1.08); }
      .dsc-btn-danger { border-color: var(--dsw-alias-state-error-primary); color: var(--dsw-alias-state-error-primary); }
      .dsc-btn-danger:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-2); }
      .dsc-spacer { flex: 1; }
      .dsc-total { color: var(--dsw-alias-label-secondary); font-size: 12px; font-variant-numeric: tabular-nums; }
      .dsc-total b { color: var(--dsw-alias-label-primary); font-size: 13px; }
      .dsc-list { display: flex; flex-direction: column; gap: 2px; }
      .dsc-row { display: flex; align-items: center; gap: 10px; padding: 7px 8px; border-radius: 7px; cursor: pointer; }
      .dsc-row:hover { background: var(--dsw-alias-bg-layer-2); }
      .dsc-row input { margin: 0; accent-color: var(--dsw-alias-brand-primary); }
      .dsc-row-name { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 2px; }
      .dsc-row-label { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .dsc-row-hint { color: var(--dsw-alias-label-secondary); font-size: 11px; }
      .dsc-legend { display: flex; flex-direction: column; gap: 6px; border-top: 1px solid var(--dsw-alias-border-l2); margin-top: 10px; padding-top: 10px; }
      .dsc-legend-row { display: flex; align-items: flex-start; gap: 8px; color: var(--dsw-alias-label-secondary); font-size: 11px; line-height: 16px; }
      .dsc-legend-row > span:last-child { flex: 1; min-width: 0; }
      .dsc-badge { flex: none; font-size: 10px; line-height: 16px; padding: 0 6px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l2); color: var(--dsw-alias-label-secondary); }
      .dsc-badge.dsc-badge-caution { border-color: var(--dsw-alias-state-warn-primary); color: var(--dsw-alias-state-warn-primary); }
      .dsc-size { flex: none; min-width: 72px; text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
      .dsc-size.dsc-idle { color: var(--dsw-alias-label-secondary); font-weight: 400; }
      .dsc-empty { color: var(--dsw-alias-label-secondary); padding: 18px 4px; text-align: center; line-height: 1.7; }
      .dsc-notice { margin-top: 10px; padding: 8px 10px; border-radius: 7px; font-size: 12px; line-height: 1.6; background: var(--dsw-alias-bg-layer-2); }
      .dsc-notice.dsc-ok { border-left: 3px solid var(--dsw-alias-state-success-primary); }
      .dsc-notice.dsc-err { border-left: 3px solid var(--dsw-alias-state-error-primary); color: var(--dsw-alias-state-error-primary); }
      .dsc-audit-hint { color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 1.7; margin: -4px 0 10px; }
      .dsc-plan { margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--dsw-alias-border-l2); }
      .dsc-plan-step { display: flex; flex-direction: column; gap: 6px; padding: 10px 0; border-bottom: 1px solid var(--dsw-alias-border-l2); }
      .dsc-plan-step:last-child { border-bottom: 0; }
      .dsc-plan-head { display: flex; align-items: baseline; gap: 8px; }
      .dsc-plan-index { flex: none; width: 18px; height: 18px; border-radius: 999px; background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary); font-size: 11px; line-height: 18px; text-align: center; font-variant-numeric: tabular-nums; }
      .dsc-plan-title { flex: 1; min-width: 0; font-weight: 600; }
      .dsc-plan-size { flex: none; font-variant-numeric: tabular-nums; color: var(--dsw-alias-label-secondary); }
      .dsc-plan-detail { color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 1.7; padding-left: 26px; }
      .dsc-plan-cmd { display: flex; align-items: flex-start; gap: 8px; padding-left: 26px; }
      .dsc-plan-cmd pre { flex: 1; min-width: 0; margin: 0; padding: 8px 10px; border-radius: 7px; background: var(--dsw-alias-bg-layer-1); border: 1px solid var(--dsw-alias-border-l2); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11px; line-height: 1.7; overflow-x: auto; white-space: pre; }
      .dsc-plan-step .dsc-btn { align-self: flex-start; margin-left: 26px; }
      .dsc-audit-group { margin-top: 12px; }
      .dsc-audit-group:first-of-type { margin-top: 4px; }
      .dsc-audit-group-title { font-size: 11px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--dsw-alias-label-secondary); margin-bottom: 4px; }
      .dsc-audit-row { display: flex; align-items: baseline; gap: 10px; padding: 6px 8px; border-radius: 7px; }
      .dsc-audit-row:hover { background: var(--dsw-alias-bg-layer-2); }
      .dsc-openable { cursor: pointer; }
      .dsc-openable:hover .dsc-audit-label { text-decoration: underline; text-decoration-color: var(--dsw-alias-border-l1); text-underline-offset: 3px; }
      .dsc-openable:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
      .dsc-audit-name { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
      .dsc-audit-label { font-weight: 600; }
      .dsc-audit-why { color: var(--dsw-alias-label-secondary); font-size: 11px; line-height: 16px; }
      .dsc-audit-size { flex: none; min-width: 72px; text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
      .dsc-settings { display: flex; flex-direction: column; gap: 12px; }
      .dsc-settings .dsc-card { margin: 0; }
      .dsc-embedded { border-top: 1px solid var(--dsw-alias-border-l2); padding-top: 12px; }
      .dsc-embedded > .dsc-root { height: auto; padding: 0; background: transparent; }
      .dsc-cfg-group + .dsc-cfg-group { border-top: .5px solid var(--dsw-alias-border-l2); margin-top: 18px; padding-top: 18px; }
      .dsc-cfg-group-title { color: var(--dsw-alias-label-primary); font-size: 16px; font-weight: 600; line-height: 24px; letter-spacing: .01em; }
      .dsc-cfg-row { display: flex; align-items: center; gap: 8px; padding: 8px 0; }
      .dsc-cfg-label { flex: 1; min-width: 0; color: var(--dsw-alias-label-primary); font-size: 14px; font-weight: 400; }
      .dsc-cfg-pick { position: relative; display: inline-flex; flex: none; }
      .dsc-cfg-select { appearance: none; -webkit-appearance: none; box-sizing: border-box; height: 36px; max-width: 220px; padding: 0 34px 0 14px; border: none; border-radius: 18px; background: var(--dsw-alias-bg-module-platform, var(--dsw-alias-bg-layer-2)); color: var(--dsw-alias-label-primary); font: inherit; font-size: 14px; line-height: 22px; cursor: pointer; }
      .dsc-cfg-select:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
      .dsc-cfg-chevron { position: absolute; top: 50%; right: 13px; transform: translateY(-50%); pointer-events: none; color: var(--dsw-alias-label-secondary); display: inline-flex; }
    `;

    function insertStyles(css) {
      const el = document.createElement('style');
      el.dataset.plugin = PANEL_ID;
      el.textContent = css;
      document.head.appendChild(el);
      return () => {
        if (el.parentNode) el.parentNode.removeChild(el);
      };
    }

    function formatBytes(bytes) {
      if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
      const units = ['B', 'KB', 'MB', 'GB', 'TB'];
      let value = bytes;
      let unit = 0;
      while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit += 1;
      }
      return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
    }

    /** A translated target name, falling back to the raw catalog id. */
    function targetName(t, id) {
      const key = `target_${id}`;
      const label = t(key);
      return label === key ? id : label;
    }

    async function call(action, payload) {
      const response = await fetch(ROUTE, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, ...(payload || {}) }),
      });
      let data;
      try {
        data = await response.json();
      } catch {
        throw new Error(`HTTP ${response.status}`);
      }
      if (!response.ok || !data || data.ok !== true) {
        throw new Error((data && data.error) || `HTTP ${response.status}`);
      }
      return data;
    }

    /**
     * State that outlives the panel. Switching to another plugin unmounts this component,
     * so plain useState throws away a scan the user just waited 46 seconds for. The store
     * lives at module scope, which the plugin factory keeps alive for the whole session.
     */
    const store = new Map();

    function usePersistent(key, initial) {
      const [value, setValue] = useState(() => {
        if (store.has(key)) return store.get(key);
        return typeof initial === 'function' ? initial() : initial;
      });
      const latest = useRef(value);
      latest.current = value;
      const set = useCallback(
        (next) => {
          const resolved = typeof next === 'function' ? next(latest.current) : next;
          store.set(key, resolved);
          setValue(resolved);
        },
        [key],
      );
      return [value, set];
    }

    /**
     * Where the entry lives: the sidebar rail (default) or this plugin's own settings
     * page. Persisted in localStorage rather than the module Map because the choice has
     * to survive a reload, which a module-scope Map does not.
     */
    function makePref(key, allowed, fallback) {
      const read = () => {
        try {
          const saved = window.localStorage.getItem(key);
          return allowed.includes(saved) ? saved : fallback;
        } catch {
          return fallback;
        }
      };
      return {
        value: read(),
        listeners: new Set(),
        get() {
          return this.value;
        },
        set(next) {
          if (!allowed.includes(next) || next === this.value) return;
          this.value = next;
          try {
            window.localStorage.setItem(key, next);
          } catch {
            /* private mode: the choice just does not outlive the reload */
          }
          for (const listener of this.listeners) listener();
        },
        subscribe(listener) {
          this.listeners.add(listener);
          return () => this.listeners.delete(listener);
        },
      };
    }

    // v2: the entry became three-way, so the old two-way key is retired instead of
    // being misread (its "sidebar" meant "sidebar plus settings page").
    const placement = makePref('dsc.placement.v2', ['all', 'sidebar', 'settings'], 'all');
    const defaultPick = makePref('dsc.pick', ['safe', 'all', 'none'], 'safe');
    const confirmFirst = makePref('dsc.confirm', ['always', 'never'], 'always');

    /**
     * Register slot entries only while `wanted()` holds, and tear them down when it stops.
     * A slot cannot be registered conditionally, so the choice is expressed by mounting and
     * disposing the injections on every change of mind.
     */
    function bindWhile(wanted, make) {
      let live = false;
      let stops = [];
      let queued = false;
      const sync = () => {
        queued = false;
        const want = wanted();
        if (want === live) return;
        live = want;
        if (want) stops = make().filter((stop) => typeof stop === 'function');
        else for (const stop of stops.splice(0)) stop();
      };
      // Deferred: the toggle is clicked inside the very section it disposes, so the
      // registration must outlive the event handler that asked for the change.
      const schedule = () => {
        if (queued) return;
        queued = true;
        queueMicrotask(sync);
      };
      sync();
      const off = placement.subscribe(schedule);
      return () => {
        off();
        for (const stop of stops.splice(0)) stop();
      };
    }

    function useTranslate(locale) {
      const [active, setActive] = useState(() => (locale ? locale.getSnapshot().active : 'en'));
      useEffect(() => {
        if (!locale) return undefined;
        setActive(locale.getSnapshot().active);
        return locale.subscribe(() => setActive(locale.getSnapshot().active));
      }, [locale]);
      return useMemo(() => {
        if (!locale) return (key) => key;
        const bound = locale.bind(NS);
        return (key) => {
          const value = typeof bound === 'function' ? bound(key) : undefined;
          return typeof value === 'string' ? value : key;
        };
      }, [locale, active]);
    }

    /** Why a row is safe or needs care, in one line the user can act on. */
    function riskWhy(t, row) {
      if (row.risk !== 'caution') return t('why_safe');
      const key = 'why_' + (row.note || 'rebuild');
      const text = t(key);
      if (text === key) return t('why_rebuild');
      return text.replace('{n}', String(row.minAgeDays || 1));
    }

    /**
     * The host measures areas and sends an English label and reason; the dictionary carries
     * a translation per area id and falls back to what the host sent when it has none, so a
     * newly added area shows up in English instead of disappearing.
     */
    function areaText(t, area, suffix) {
      const key = `area_${area.id}${suffix}`;
      const text = t(key);
      return text === key ? (suffix === '' ? area.label : area.why) : text;
    }

    function DriveBar({ drive, t }) {
      const ratio = drive.total > 0 ? drive.used / drive.total : 0;
      const level = ratio >= 0.92 ? ' dsc-crit' : ratio >= 0.8 ? ' dsc-warn' : '';
      return h(
        'div',
        null,
        h(
          'div',
          { className: 'dsc-drive-label' },
          h(
            'b',
            null,
            drive.root,
            h(
              'span',
              { style: { color: 'var(--dsw-alias-label-secondary)', fontWeight: 400, marginLeft: 6 } },
              `${Math.round(ratio * 100)}%`,
            ),
          ),
          h('span', null, `${formatBytes(drive.free)} ${t('free')}`),
        ),
        h('div', { className: 'dsc-bar', role: 'presentation' }, h('div', { className: `dsc-bar-fill${level}`, style: { width: `${Math.min(100, Math.round(ratio * 100))}%` } })),
      );
    }

    function Cleaner({ locale, embedded }) {
      const t = useTranslate(locale);
      // Settings live behind a header button, the way dsh-context does it: one obvious
      // affordance on the page the user already has open, rather than a settings tab
      // they have to find first.
      const [showSettings, setShowSettings] = useState(false);
      const [drives, setDrives] = usePersistent('drives', []);
      const [drive, setDrive] = usePersistent('drive', '');
      const [rows, setRows] = usePersistent('rows', null);
      const [picked, setPicked] = usePersistent('picked', () => new Set());
      const [busy, setBusy] = useState('');
      const [notice, setNotice] = usePersistent('notice', null);
      const [error, setError] = usePersistent('error', '');

      useEffect(() => {
        if (drives.length > 0) return undefined;
        let alive = true;
        call('overview')
          .then((data) => {
            if (!alive) return;
            setDrives(Array.isArray(data.drives) ? data.drives : []);
          })
          .catch(() => {
            /* the panel still works without the drive summary */
          });
        return () => {
          alive = false;
        };
      }, [drives.length, setDrives]);

      const scan = useCallback(async () => {
        setBusy('scan');
        setError('');
        setNotice(null);
        try {
          const data = await call('scan', drive === '' ? undefined : { drive });
          const targets = Array.isArray(data.targets) ? data.targets : [];
          setRows(targets);
          const want = defaultPick.get();
          const preselect =
            want === 'none'
              ? []
              : targets.filter((row) => row.bytes > 0 && (want === 'all' || row.risk === 'safe')).map((row) => row.id);
          setPicked(new Set(preselect));
        } catch (err) {
          setError(`${t('scanError')}: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
          setBusy('');
        }
      }, [t, drive]);

      /** Rows measured for another volume are stale, so they go away with the switch. */
      const pickDrive = (root) => {
        setDrive(root);
        setRows(null);
        setPicked(new Set());
        setNotice(null);
        setError('');
      };

      const toggle = (id) => {
        setPicked((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
      };

      const pickAll = (on) => {
        if (!shown) return;
        setPicked(on ? new Set(shown.filter((row) => row.bytes > 0).map((row) => row.id)) : new Set());
      };

      const runClean = async () => {
        if (!rows || picked.size === 0) return;
        if (confirmFirst.get() === 'always' && !window.confirm(t('cleanConfirm'))) return;
        const ids = shown.filter((row) => picked.has(row.id)).map((row) => row.id);
        setBusy('clean');
        setError('');
        setNotice(null);
        try {
          const data = await call('clean', drive === '' ? { ids, confirm: true } : { ids, drive, confirm: true });
          const results = Array.isArray(data.results) ? data.results : [];
          const bytes = results.reduce((sum, item) => sum + (item.bytes || 0), 0);
          const files = results.reduce((sum, item) => sum + (item.removed || 0), 0);
          const failed = results.reduce((sum, item) => sum + (item.failed || 0), 0);
          setNotice({
            kind: 'ok',
            text: `${t('done')} ${formatBytes(bytes)} · ${files} ${t('files')}${failed > 0 ? ` · ${t('failed')} ${failed} (${t('failedHint')})` : ''}`,
          });
          await scan();
        } catch (err) {
          setError(`${t('cleanError')}: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
          setBusy('');
        }
      };

      const shown = rows && drive !== '' ? rows.filter((row) => row.pathCount > 0) : rows;
      const totalBytes = shown ? shown.reduce((sum, row) => sum + (row.bytes || 0), 0) : 0;
      const pickedBytes = shown ? shown.reduce((sum, row) => sum + (picked.has(row.id) ? row.bytes || 0 : 0), 0) : 0;

      return h(
        'div',
        { className: 'dsc-root' },
        h(
          'div',
          { className: 'dsc-head' },
          h('h1', null, t('title')),
          h('span', { className: 'dsc-head-sub' }, showSettings ? null : t('reclaimable')),
          embedded ? null : h('span', { className: 'dsc-head-spacer' }),
          embedded
            ? null
            : h(
                'button',
                {
                  type: 'button',
                  className: 'dsc-head-btn',
                  'aria-pressed': showSettings,
                  onClick: () => setShowSettings((open) => !open),
                },
                h(IconGear, null),
                showSettings ? t('settingsBack') : t('settingsOpen'),
              ),
        ),
        showSettings
          ? h(SettingsOptions, { t })
          : [
        drives.length > 0
          ? h(
              'section',
              { className: 'dsc-card' },
              h('div', { className: 'dsc-card-title' }, t('drives')),
              h('div', { className: 'dsc-drives' }, drives.map((drive) => h(DriveBar, { key: drive.root, drive, t }))),
            )
          : null,
        h(
          'section',
          { className: 'dsc-card' },
          drives.length > 1
            ? h(
                'div',
                { className: 'dsc-chips' },
                h('span', { className: 'dsc-chips-label' }, t('driveLabel')),
                ['', ...drives.map((item) => item.root)].map((root) =>
                  h(
                    'button',
                    {
                      key: root === '' ? '__all' : root,
                      type: 'button',
                      className: `dsc-chip${drive === root ? ' dsc-chip-active' : ''}`,
                      'aria-pressed': drive === root,
                      onClick: () => pickDrive(root),
                      disabled: busy !== '',
                    },
                    root === '' ? t('allDrives') : root,
                  ),
                ),
              )
            : null,
          h(
            'div',
            { className: 'dsc-toolbar' },
            h(
              'button',
              { type: 'button', className: 'dsc-btn dsc-btn-primary', onClick: scan, disabled: busy !== '' },
              busy === 'scan' ? t('scanning') : rows ? t('rescan') : t('scan'),
            ),
            rows
              ? h(
                  'button',
                  { type: 'button', className: 'dsc-btn', onClick: () => pickAll(true), disabled: busy !== '' },
                  t('selectAll'),
                )
              : null,
            rows
              ? h(
                  'button',
                  { type: 'button', className: 'dsc-btn', onClick: () => pickAll(false), disabled: busy !== '' },
                  t('clearAll'),
                )
              : null,
            h('span', { className: 'dsc-spacer' }),
            rows
              ? h(
                  'span',
                  { className: 'dsc-total' },
                  `${t('reclaimable')} `,
                  h('b', null, formatBytes(totalBytes)),
                  picked.size > 0 ? ` · ${t('selected')} ${formatBytes(pickedBytes)}` : '',
                )
              : null,
            rows
              ? h(
                  'button',
                  {
                    type: 'button',
                    className: 'dsc-btn dsc-btn-danger',
                    onClick: runClean,
                    disabled: busy !== '' || picked.size === 0,
                  },
                  busy === 'clean' ? t('cleaning') : t('clean'),
                )
              : null,
          ),
          error ? h('div', { className: 'dsc-notice dsc-err' }, error) : null,
          notice ? h('div', { className: `dsc-notice dsc-${notice.kind}` }, notice.text) : null,
          shown === null
            ? h('div', { className: 'dsc-empty' }, t('nothingYet'))
            : shown.length === 0
              ? h('div', { className: 'dsc-empty' }, t('noTargets'))
              : h(
                  'div',
                  { className: 'dsc-list' },
                  shown.map((row) =>
                    h(
                      'label',
                      { key: row.id, className: 'dsc-row' },
                      h('input', {
                        type: 'checkbox',
                        checked: picked.has(row.id),
                        disabled: busy !== '' || row.bytes === 0,
                        onChange: () => toggle(row.id),
                      }),
                      h(
                        'span',
                        { className: 'dsc-row-name' },
                        h('span', { className: 'dsc-row-label' }, targetName(t, row.id)),
                        h(
                          'span',
                          { className: 'dsc-row-hint' },
                          `${t('pathCount').replace('{n}', String(row.pathCount))} · ${riskWhy(t, row)}`,
                        ),
                      ),
                      h(
                        'span',
                        {
                          className: `dsc-badge${row.risk === 'caution' ? ' dsc-badge-caution' : ''}`,
                          title: riskWhy(t, row),
                        },
                        t(row.risk === 'caution' ? 'risky' : 'safe'),
                      ),
                      h('span', { className: `dsc-size${row.bytes > 0 ? '' : ' dsc-idle'}` }, formatBytes(row.bytes)),
                    ),
                  ),
                ),
          h(
            'div',
            { className: 'dsc-legend' },
            h(
              'div',
              { className: 'dsc-legend-row' },
              h('span', { className: 'dsc-badge' }, t('safe')),
              h('span', null, t('legendSafe')),
            ),
            h(
              'div',
              { className: 'dsc-legend-row' },
              h('span', { className: 'dsc-badge dsc-badge-caution' }, t('risky')),
              h('span', null, t('legendCaution')),
            ),
          ),
        ),
        h(Audit, { t }),
            ],
      );
    }

    /**
     * The plan turns the numbers into an order of operations. Steps that this plugin can
     * actually perform get a button; the rest show the exact command, because "compact
     * your WSL disk" without the command is not something a user can act on.
     */
    function Plan({ plan, t, onRan, busy }) {
      const [copied, setCopied] = useState('');

      if (!plan || !Array.isArray(plan.steps) || plan.steps.length === 0) return null;

      const copy = (code, command) => {
        const done = () => {
          setCopied(code);
          setTimeout(() => setCopied(''), 2000);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(command).then(done, () => {});
        }
      };

      return h(
        'div',
        { className: 'dsc-plan' },
        h('div', { className: 'dsc-audit-group-title' }, t('planTitle')),
        h('p', { className: 'dsc-audit-hint' }, t('planHint')),
        plan.reclaimNow > 0
          ? h('div', { className: 'dsc-toolbar' }, h('span', { className: 'dsc-total' }, `${t('planNow')} `, h('b', null, formatBytes(plan.reclaimNow))))
          : null,
        plan.steps.map((step, index) => {
          const runnable = step.code === 'reclaim-safe' || step.code === 'reclaim-caution';
          const detailKey = `plan_code_${step.code}_detail`;
          const detail = t(detailKey)
            .replace('{n}', String(step.count || 0))
            .replace('{ids}', (step.ids || []).join(', '))
            .replace('{name}', step.name || '')
            .replace('{scope}', step.scope === 'local' ? t('planScopeLocal') : t('planScopeRoaming'))
            .replace('{folder}', step.folder || '')
            .replace('{drive}', step.drive || '')
            .replace('{bytes}', formatBytes(step.bytes || 0))
            .replace('{free}', formatBytes(step.free || 0))
            .replace('{total}', formatBytes(step.total || 0));
          return h(
            'div',
            { className: 'dsc-plan-step', key: `${step.code}/${index}` },
            h(
              'div',
              { className: 'dsc-plan-head' },
              h('span', { className: 'dsc-plan-index' }, String(index + 1)),
              h('span', { className: 'dsc-plan-title' }, t(`plan_code_${step.code}`)),
              h('span', { className: 'dsc-plan-size' }, formatBytes(step.bytes || 0)),
            ),
            h('div', { className: 'dsc-plan-detail' }, detail),
            step.command
              ? h(
                  'div',
                  { className: 'dsc-plan-cmd' },
                  h('pre', null, step.command),
                  h(
                    'button',
                    { type: 'button', className: 'dsc-btn', onClick: () => copy(step.code, step.command) },
                    copied === step.code ? t('planCopied') : t('planCopy'),
                  ),
                )
              : null,
            runnable
              ? h(
                  'button',
                  { type: 'button', className: 'dsc-btn dsc-btn-danger', disabled: busy, onClick: () => onRan(step) },
                  busy ? t('planRunning') : t('planRun'),
                )
              : null,
          );
        }),
      );
    }

    /**
     * The space a cleaner cannot touch. Everything here is measured only — there is no
     * action that removes it — because "delete Program Files" is not a feature.
     */
    function Audit({ t }) {
      const [data, setData] = usePersistent('audit', null);
      const [busy, setBusy] = useState(false);
      const [error, setError] = usePersistent('auditError', '');
      // Where the last click opened: 24px of feedback beats a silent no-op on Windows,
      // which sometimes takes a second to raise the Explorer window.
      const [opened, setOpened] = useState('');

      const run = useCallback(async (force) => {
        setBusy(true);
        setError('');
        try {
          const result = await call('audit', force === true ? { force: true } : {});
          setData(result);
        } catch (err) {
          setError(`${t('auditError')}: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
          setBusy(false);
        }
      }, [t, setData, setError]);

      // Coming back to a panel that already has a result: refresh it silently, so the
      // numbers are current without making the user press the button again.
      const refresh = useRef(run);
      refresh.current = run;
      useEffect(() => {
        if (store.get('audit') === undefined || store.get('audit') === null) return;
        refresh.current();
      }, []);

      const areas = data && Array.isArray(data.areas) ? data.areas : [];
      const apps = data && Array.isArray(data.largestApps) ? data.largestApps : [];
      const total = areas.reduce((sum, area) => sum + (area.bytes || 0), 0);

      /**
       * Open one measured location in Explorer. The host rebuilds the path from the area
       * (or scope + name) it measured, so nothing here can hand it a path of our choosing.
       */
      const revealAt = async (payload) => {
        setError('');
        try {
          const result = await call('reveal', payload);
          setOpened(result && result.revealed ? result.revealed : '');
        } catch (err) {
          setError(`${t('auditError')}: ${err instanceof Error ? err.message : String(err)}`);
        }
      };

      /** A row that has somewhere to open gets click and right-click; one without stays plain. */
      const openable = (payload) => {
        const open = (event) => {
          event.preventDefault();
          revealAt(payload);
        };
        return {
          className: 'dsc-audit-row dsc-openable',
          role: 'button',
          tabIndex: 0,
          title: t('auditOpen'),
          onClick: open,
          onContextMenu: open,
          onKeyDown: (event) => {
            if (event.key === 'Enter' || event.key === ' ') open(event);
          },
        };
      };

      /** Run a plan step the plugin is allowed to run, then re-measure so the plan is honest. */
      const runStep = async (step) => {
        if (confirmFirst.get() === 'always' && !window.confirm(t('cleanConfirm'))) return;
        setBusy(true);
        setError('');
        try {
          await call('clean', { ids: step.ids, confirm: true });
          const result = await call('audit');
          setData(result);
        } catch (err) {
          setError(`${t('auditError')}: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
          setBusy(false);
        }
      };
      const GROUPS = [
        ['system', 'auditGroupSystem'],
        ['app', 'auditGroupApp'],
        ['personal', 'auditGroupPersonal'],
      ];

      return h(
        'section',
        { className: 'dsc-card' },
        h(
          'div',
          { className: 'dsc-card-title' },
          t('auditTitle'),
          h('span', { className: 'dsc-spacer' }),
          data && data.cached ? h('span', { className: 'dsc-total' }, t('auditCached')) : null,
          h(
            'button',
            { type: 'button', className: 'dsc-btn', onClick: () => run(true), disabled: busy },
            busy ? t('auditRunning') : data ? t('auditRescan') : t('auditRun'),
          ),
        ),
        h('p', { className: 'dsc-audit-hint' }, t('auditHint')),
        error ? h('div', { className: 'dsc-notice dsc-err' }, error) : null,
        opened ? h('div', { className: 'dsc-audit-hint' }, `${t('auditOpened')} ${opened}`) : null,
        busy && !data ? h('div', { className: 'dsc-empty' }, t('auditCold')) : null,
        data
          ? [
              h(
                'div',
                { className: 'dsc-toolbar' },
                h('span', { className: 'dsc-total' }, `${t('auditTotal')} `, h('b', null, formatBytes(total))),
              ),
              ...GROUPS.map(([group, key]) => {
                const list = areas.filter((area) => area.group === group);
                if (list.length === 0) return null;
                return h(
                  'div',
                  { className: 'dsc-audit-group', key: group },
                  h('div', { className: 'dsc-audit-group-title' }, t(key)),
                  list.map((area) =>
                    h(
                      'div',
                      { key: area.id, ...openable({ area: area.id, index: 0 }) },
                      h(
                        'span',
                        { className: 'dsc-audit-name' },
                        h('span', { className: 'dsc-audit-label' }, areaText(t, area, '')),
                        h('span', { className: 'dsc-audit-why' }, areaText(t, area, '_why')),
                      ),
                      h('span', { className: 'dsc-audit-size' }, formatBytes(area.bytes)),
                    ),
                  ),
                );
              }),
              apps.length > 0
                ? h(
                    'div',
                    { className: 'dsc-audit-group' },
                    h('div', { className: 'dsc-audit-group-title' }, t('auditTop')),
                    apps.map((app) =>
                      h(
                        'div',
                        { key: `${app.scope}/${app.name}`, ...openable({ scope: app.scope, name: app.name }) },
                        h(
                          'span',
                          { className: 'dsc-audit-name' },
                          h('span', { className: 'dsc-audit-label' }, app.name),
                          h(
                            'span',
                            { className: 'dsc-audit-why' },
                            `${app.scope === 'local' ? t('auditScopeLocal') : t('auditScopeRoaming')} · ${app.files} ${t('files')}`,
                          ),
                        ),
                        h('span', { className: 'dsc-audit-size' }, formatBytes(app.bytes)),
                      ),
                    ),
                  )
                : null,
              h(Plan, { plan: data.plan, t, busy, onRan: runStep }),
            ]
          : null,
      );
    }

    function IconGear() {
      return h(
        'svg',
        {
          viewBox: '0 0 24 24',
          width: 14,
          height: 14,
          'aria-hidden': true,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.8,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        },
        h('circle', { cx: 12, cy: 12, r: 3 }),
        h('path', {
          d: 'M12 2.8l1.4 2.3 2.6-.6.6 2.6 2.3 1.4-1.4 2.3 1.4 2.3-2.3 1.4-.6 2.6-2.6-.6L12 20.2l-1.4-2.3-2.6.6-.6-2.6L5.1 14.5l1.4-2.3-1.4-2.3 2.3-1.4.6-2.6 2.6.6z',
        }),
      );
    }

    function usePrefValue(pref) {
      const [value, setValue] = useState(() => pref.get());
      useEffect(() => pref.subscribe(() => setValue(pref.get())), []);
      return value;
    }

    function PrefRow({ labelKey, value, options, onChange, t }) {
      return h(
        'div',
        { className: 'dsc-cfg-row' },
        h('span', { className: 'dsc-cfg-label' }, t(labelKey)),
        h(
          'span',
          { className: 'dsc-cfg-pick' },
          h(
            'select',
            {
              className: 'dsc-cfg-select',
              value,
              'aria-label': t(labelKey),
              onChange: (event) => onChange(event.target.value),
            },
            options.map(([id, key]) => h('option', { key: id, value: id }, t(key))),
          ),
          h(
            'span',
            { className: 'dsc-cfg-chevron', 'aria-hidden': true },
            h(
              'svg',
              { width: 12, height: 12, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.4, strokeLinecap: 'round', strokeLinejoin: 'round' },
              h('path', { d: 'M6 9l6 6 6-6' }),
            ),
          ),
        ),
      );
    }

    /** The settings themselves: one implementation feeding the plugin page, the settings
     * section and the in-panel view, so the three entry points can never drift apart. */
    function ConfigRows({ t }) {
      const where = usePrefValue(placement);
      const pick = usePrefValue(defaultPick);
      const confirm = usePrefValue(confirmFirst);
      return h(
        'div',
        null,
        h(
          'section',
          { className: 'dsc-cfg-group', role: 'group', 'aria-label': t('settingsGroupDisplay') },
          h('div', { className: 'dsc-cfg-group-title' }, t('settingsGroupDisplay')),
          h(PrefRow, {
            t,
            labelKey: 'cfgPlacement',
            value: where,
            options: [
              ['all', 'placementAll'],
              ['sidebar', 'placementSidebar'],
              ['settings', 'placementSettings'],
            ],
            onChange: (next) => placement.set(next),
          }),
        ),
        h(
          'section',
          { className: 'dsc-cfg-group', role: 'group', 'aria-label': t('cfgGroupBehavior') },
          h('div', { className: 'dsc-cfg-group-title' }, t('cfgGroupBehavior')),
          h(PrefRow, {
            t,
            labelKey: 'cfgDefaultPick',
            value: pick,
            options: [
              ['safe', 'pickSafe'],
              ['all', 'pickAll'],
              ['none', 'pickNone'],
            ],
            onChange: (next) => defaultPick.set(next),
          }),
          h(PrefRow, {
            t,
            labelKey: 'cfgConfirm',
            value: confirm,
            options: [
              ['always', 'confirmAlways'],
              ['never', 'confirmNever'],
            ],
            onChange: (next) => confirmFirst.set(next),
          }),
        ),
      );
    }

    /** The plugin page's own configuration card, rendered by the shell on the bundle page.
     * `view: 'summary'` asks for a one-liner, so the rows only render for `page`. */
    function BundleConfig({ locale, view }) {
      const t = useTranslate(locale);
      if (view === 'summary') return null;
      return h('div', { className: 'dsc-cfg' }, h(ConfigRows, { t }));
    }

    /** The plugin's own settings, shown in place of the cleaner body. */
    function SettingsOptions({ t }) {
      return h(
        'section',
        { className: 'dsc-card' },
        h(ConfigRows, { t }),
        h('div', { className: 'dsc-audit-hint', style: { marginTop: '10px' } }, t('settingsHint')),
      );
    }

    /** The plugin's own settings page: where the entry lives, plus the panel in place. */
    function SettingsSection({ locale }) {
      const t = useTranslate(locale);
      const [where, setWhere] = useState(() => placement.get());
      useEffect(() => placement.subscribe(() => setWhere(placement.get())), []);

      return h(
        'div',
        { className: 'dsc-settings' },
        h(SettingsOptions, { t }),
        // Embedded rather than linked: hiding the sidebar icon would otherwise leave the
        // panel with no way back, so this mode carries the whole cleaner itself.
        where === 'settings' ? h('div', { className: 'dsc-embedded' }, h(Cleaner, { locale, embedded: true })) : null,
      );
    }

    function PanelIcon({ size }) {
      const px = typeof size === 'number' ? size : 16;
      return h(
        'svg',
        {
          viewBox: '0 0 24 24',
          width: px,
          height: px,
          'aria-hidden': true,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.7,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        },
        h('ellipse', { cx: 12, cy: 6, rx: 7, ry: 3 }),
        h('path', { d: 'M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6' }),
        h('path', { d: 'M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3' }),
      );
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        const locale = ctx.get('locale');
        if (locale) {
          ctx.effect(() => locale.register(NS, 'zh', zh), 'dsh-disk-cleaner: locale zh');
          ctx.effect(() => locale.register(NS, 'en', en), 'dsh-disk-cleaner: locale en');
        }
        ctx.effect(() => insertStyles(CSS), 'dsh-disk-cleaner: styles');

        const label = () => {
          if (!locale) return 'Disk Cleaner';
          const bound = locale.bind(NS);
          const value = typeof bound === 'function' ? bound('open') : undefined;
          return typeof value === 'string' ? value : 'Disk Cleaner';
        };

        // The sidebar icon is the opt-out: hiding it leaves the panel reachable from the
        // settings page, so the plugin never becomes unreachable from inside the app.
        ctx.effect(
          () =>
            bindWhile(
              () => placement.get() !== 'settings',
              () => [
                ctx.slots.inject('sidebar.panellist', () =>
                  ctx.slots.register(
                    { name: 'sidebar.panellist', id: PANEL_ID, order: 50, label },
                    (props) => h(PanelIcon, { size: props && props.size }),
                  ),
                ),
              ],
            ),
          'dsh-disk-cleaner: sidebar entry',
        );

        ctx.slots.inject('main', () =>
          ctx.slots.register({ name: 'main', key: PANEL_ID }, () => h(Cleaner, { locale })),
        );

        ctx.effect(
          () =>
            bindWhile(
              () => placement.get() !== 'sidebar',
              () => [
                ctx.slots.inject('settings.section', () =>
                  ctx.slots.register(
                    {
                      name: 'settings.section',
                      id: PANEL_ID,
                      order: 30,
                      label: () => {
                        if (!locale) return 'Disk Cleaner';
                        const bound = locale.bind(NS);
                        const value = typeof bound === 'function' ? bound('settingsTitle') : undefined;
                        return typeof value === 'string' ? value : 'Disk Cleaner';
                      },
                    },
                    () => h(SettingsSection, { locale }),
                  ),
                ),
              ],
            ),
          'dsh-disk-cleaner: settings section',
        );

        // The bundle's own configuration, rendered on its page in the plugin manager.
        ctx.slots.inject('plugins.bundle.config', () =>
          ctx.slots.register({ name: 'plugins.bundle.config', key: PANEL_ID }, (props) =>
            h(BundleConfig, { locale, view: props && props.view }),
          ),
        );
      },
    };
  },
});
