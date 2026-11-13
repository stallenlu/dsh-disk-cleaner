/**
 * Zero-dependency smoke test: `node smoke.mjs`.
 *
 * It covers the two halves that have branches and that a typo breaks silently:
 *  - The client bundle is executed for real in a throwaway DOM, so the slot lifecycle and
 *    the preference plumbing run their own code rather than being pattern-matched.
 *  - The host half is inspected as text and by calling `apply()` with a throwaway ctx, so
 *    the tool and the route are proven to be registered without walking the disk.
 *
 * Not covered here: anything that needs a real volume (scan/clean/audit take tens of
 * seconds and touch the filesystem) and anything visual. See "验证" in README.md.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => fs.readFileSync(path.join(here, rel), 'utf8');
const source = read('lib/client.js');

let pass = 0;
let fail = 0;
const check = (name, ok, detail) => {
  if (ok) {
    pass += 1;
    console.log(`PASS  ${name}`);
  } else {
    fail += 1;
    console.log(`FAIL  ${name}${detail ? ` (${detail})` : ''}`);
  }
};

/* ------------------------------------------------------------------ client */

const storage = new Map();
const head = { appendChild() {}, removeChild() {} };

let loaded = null;
const window = {
  localStorage: {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
  },
  confirm: () => true,
  __ModuleLoader__: {
    load(mod) {
      loaded = mod;
    },
  },
};

const document = {
  head,
  // injectBaseline() de-duplicates through querySelector; the throwaway DOM has no
  // stylesheet registry, so it simply reports "not injected yet".
  querySelector: () => null,
  createElement: () => ({ dataset: {}, setAttribute() {}, set textContent(v) {} }),
};

const React = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
  useEffect: () => {},
  useCallback: (fn) => fn,
  useMemo: (fn) => fn(),
  useRef: (v) => ({ current: v }),
};

const require = (name) => {
  if (name === 'react') return React;
  throw new Error(`unexpected require: ${name}`);
};

new Function('window', 'document', 'require', source)(window, document, require);
check('client module registered', loaded !== null && loaded.id === 'dsh-disk-cleaner');

const injections = [];
const locales = new Map();

const slots = {
  inject(name, make) {
    const live = make();
    let stopped = false;
    injections.push({ name, get stopped() { return stopped; } });
    return () => {
      stopped = true;
      if (typeof live === 'function') live();
    };
  },
  register(config, component) {
    const entry = { name: config.name, config, component, stopped: false };
    if (typeof component === 'function') entry.render = () => component({});
    injections.push(entry);
    return () => {
      entry.stopped = true;
    };
  },
};

const locale = {
  register: (ns, tag, dict) => {
    locales.set(tag, dict);
    return () => {};
  },
  bind: () => (key) => key,
  getSnapshot: () => ({ active: 'zh' }),
  subscribe: () => () => {},
};

const ctx = {
  get: (name) => (name === 'locale' ? locale : undefined),
  effect: (fn) => {
    fn();
  },
  slots,
};

loaded.factory(require).apply(ctx);

const live = (name) => injections.filter((i) => i.name === name && i.config && !i.stopped);
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const find = (node, pred, out = [], depth = 0) => {
  if (!node || typeof node !== 'object' || depth > 30) return out;
  if (Array.isArray(node)) {
    node.forEach((child) => find(child, pred, out, depth + 1));
    return out;
  }
  if (typeof node.type === 'function') {
    try {
      find(node.type(node.props || {}), pred, out, depth + 1);
    } catch {
      /* a component that cannot render here contributes no nodes */
    }
    return out;
  }
  if (pred(node)) out.push(node);
  for (const child of node.children || []) find(child, pred, out, depth + 1);
  if (node.props && node.props.children) find([].concat(node.props.children), pred, out, depth + 1);
  return out;
};

check('zh dictionary registered', locales.has('zh'));
check('en dictionary registered', locales.has('en'));
const zhKeys = Object.keys(locales.get('zh') || {});
const enKeys = Object.keys(locales.get('en') || {});
check(
  'locale key parity',
  zhKeys.length === enKeys.length && zhKeys.every((k) => enKeys.includes(k)),
  `zh-only ${zhKeys.filter((k) => !enKeys.includes(k))} / en-only ${enKeys.filter((k) => !zhKeys.includes(k))}`,
);

for (const key of ['settingsTitle', 'cfgPlacement', 'cfgDefaultPick', 'cfgConfirm', 'auditTitle', 'planTitle']) {
  check(`key ${key} in both locales`, zhKeys.includes(key) && enKeys.includes(key));
}

check('main entry registered', live('main').length === 1);
check('sidebar entry present by default', live('sidebar.panellist').length === 1);
check('settings section present by default', live('settings.section').length === 1);
check('bundle config registered', live('plugins.bundle.config').length === 1);
check('bundle config keyed by the package name', live('plugins.bundle.config')[0].config.key === 'dsh-disk-cleaner');
check('sidebar id matches main key', live('sidebar.panellist')[0].config.id === live('main')[0].config.key);
check('settings section id matches main key', live('settings.section')[0].config.id === live('main')[0].config.key);

const bundle = live('plugins.bundle.config')[0];
const bundleTree = bundle.render();
check('summary view renders no form', find(bundle.component({ view: 'summary' }), (n) => n.type === 'select').length === 0);

const groups = find(bundleTree, (n) => n.props && n.props.role === 'group');
check('two config groups rendered', groups.length === 2, `found ${groups.length}`);

const selects = find(bundleTree, (n) => n.type === 'select');
check('three preference rows rendered', selects.length === 3, `found ${selects.length}`);

const selectFor = (label) => selects.find((s) => s.props['aria-label'] === label);
check('placement row present', Boolean(selectFor('cfgPlacement')));
check('preselect row present', Boolean(selectFor('cfgDefaultPick')));
check('confirm row present', Boolean(selectFor('cfgConfirm')));
check('placement defaults to everywhere', selectFor('cfgPlacement').props.value === 'all');
check('preselect defaults to safe only', selectFor('cfgDefaultPick').props.value === 'safe');
check('confirm defaults to always ask', selectFor('cfgConfirm').props.value === 'always');

const options = (select) => (select.children || []).flat().filter((c) => c && c.type === 'option');
check('placement offers three modes', options(selectFor('cfgPlacement')).length === 3);
check('preselect offers three modes', options(selectFor('cfgDefaultPick')).length === 3);
check('confirm offers two modes', options(selectFor('cfgConfirm')).length === 2);

const choose = (label, value) => selectFor(label).props.onChange({ target: { value } });

choose('cfgPlacement', 'settings');
await settle();
check('settings mode disposes the sidebar entry', live('sidebar.panellist').length === 0);
check('settings mode keeps the settings section', live('settings.section').length === 1);
check('settings mode keeps the main panel', live('main').length === 1);
check('choice persisted', storage.get('dsc.placement.v2') === 'settings');

choose('cfgPlacement', 'sidebar');
await settle();
check('sidebar mode disposes the settings section', live('settings.section').length === 0);
check('sidebar mode restores the panel entry', live('sidebar.panellist').length === 1);
check('choice persisted back', storage.get('dsc.placement.v2') === 'sidebar');

choose('cfgPlacement', 'all');
await settle();
check('everywhere mode restores both entries', live('sidebar.panellist').length === 1 && live('settings.section').length === 1);
check('choice persisted again', storage.get('dsc.placement.v2') === 'all');

choose('cfgDefaultPick', 'none');
choose('cfgConfirm', 'never');
check('preselect choice persisted', storage.get('dsc.pick') === 'none');
check('confirm choice persisted', storage.get('dsc.confirm') === 'never');

check('scan honours the preselect preference', source.includes('const want = defaultPick.get();'));
check('clean honours the confirm preference', source.includes("confirmFirst.get() !== 'always'"));
check('the settings page reuses the same rows', /function SettingsOptions\(\{ t \}\)[\s\S]{0,400}h\(ConfigRows, \{ t \}\)/.test(source));
check('re-run asks the host to skip its cache', source.includes('onClick: () => run(true)') && source.includes("force === true ? { force: true } : {}"));
check('an assessment row opens its folder', source.includes("call('reveal'") && source.includes('dsc-audit-row dsc-openable'));
check('a row opens on click, right click and Enter', /const openable = \(payload\) =>[\s\S]{0,600}onClick: open[\s\S]{0,200}onContextMenu: open[\s\S]{0,300}'Enter'/.test(source));
check('an app folder is opened by scope and name', source.includes('openable({ scope: app.scope, name: app.name })'));

{
  const button = find(live('main')[0].render(), (n) => n.type === 'button' && n.props && n.props.className === 'dsc-head-btn');
  check('panel header offers plugin settings', button.length === 1);
}

/* -------------------------------------------------------------------- host */

const index = read('lib/index.js');
const catalog = read('lib/catalog.js');
const plan = read('lib/plan.js');
const auditSrc = read('lib/audit.js');
const historySrc = read('lib/history.js');

const { apply } = await import(pathToFileURL(path.join(here, 'lib/index.js')).href);
check('host exports apply()', typeof apply === 'function');

let definition;
let route;
const applied = [];
apply({
  effect(fn, label) {
    applied.push(label);
    fn();
  },
  webServer: {
    register(entry) {
      route = entry;
      return () => {};
    },
  },
  tools: {
    register(def) {
      definition = def;
      return () => {};
    },
  },
});
check('route registered under the documented prefix', route?.kind === 'prefix' && route?.path === '/api/disk-cleaner/');
check('tool registered', definition?.name === 'disk_cleaner');
check(
  'tool accepts the five documented actions',
  JSON.stringify(definition.parameters.properties.action.enum) === JSON.stringify(['overview', 'scan', 'clean', 'audit', 'reveal']),
);
check('tool needs no id for overview', JSON.stringify(definition.parameters.required) === JSON.stringify(['action']));
check('tool description warns audit is read-only', /read-only: it never removes anything/.test(definition.description));
check('every effect is labelled', applied.every((label) => typeof label === 'string' && label.startsWith('dsh-disk-cleaner:')));
check('tool output schema matches its string reply', definition.output.schema.type === 'string' && typeof (await definition.execute({ action: 'overview' })) === 'string');
check('the read-only agent clean keeps the audit cache in sync', /if \(!dryRun\) \{[\s\S]*?invalidateAudit\(\);[\s\S]*?const freed = results\.reduce/.test(index));
check('orphan target descriptions state the real 30-day rule, not four signals / two years',
  /30 days/.test(catalog) && /30 days/.test(index) && /QQGuild data folder/.test(source) &&
  !/four independent signals|over two years|no Start-menu shortcut|two years/.test(catalog + index + source));

const ids = [...catalog.matchAll(/^\s{4}id: '([a-z-]+)',$/gm)].map((m) => m[1]);
check('catalog has the documented 32 targets', ids.length === 32, `got ${ids.length}`);
check('every catalog id has a client label', ids.every((id) => zhKeys.includes(`target_${id}`) && enKeys.includes(`target_${id}`)));
const groupMap = catalog.slice(catalog.indexOf('const GROUP_OF'), catalog.indexOf('const CATALOG = ['));
const grouped = new Set([...groupMap.matchAll(/^\s+'?([a-z-]+)'?: '[a-z]+',$/gm)].map((m) => m[1]));
check('every catalog id is filed under a group', ids.every((id) => grouped.has(id)), `missing: ${ids.filter((id) => !grouped.has(id)).join(',')}`);
const groupKeys = [...new Set([...groupMap.matchAll(/: '([a-z]+)',$/gm)].map((m) => m[1]))];
check('every group has a label in both languages', groupKeys.length > 1 && groupKeys.every((key) => zhKeys.includes(`group_${key}`) && enKeys.includes(`group_${key}`)), `groups: ${groupKeys.join(',')}`);
{
  // Run the real grouping function out of the bundle rather than assert on its text.
  const start = source.indexOf('const GROUP_ORDER =');
  const end = source.indexOf('function riskWhy', start);
  const groupRows = new Function(`${source.slice(start, end)}; return groupRows;`)();
  const folded = groupRows([
    { id: 'a', group: 'dev', bytes: 10 },
    { id: 'b', group: 'dev', bytes: 5 },
    { id: 'c', group: 'system', bytes: 0 },
    { id: 'd', group: 'nonsense', bytes: 1 },
  ]);
  check('grouping keeps a fixed order, not a size order', folded.map((g) => g.key).join(',') === 'system,dev,other');
  check('grouping totals each section', folded.find((g) => g.key === 'dev').bytes === 15);
  check('an unknown group falls into other', folded.find((g) => g.key === 'other').rows[0].id === 'd');
  check('an empty section is the one that starts folded', folded.filter((g) => g.bytes === 0).map((g) => g.key).join(',') === 'system');
}
{
  // Fold/unfold driven by the real helpers, on real section objects. The regression this
  // guards against was the head handing `toggleGroup` a bare key, so nothing was stored.
  const start = source.indexOf('const GROUP_ORDER =');
  const end = source.indexOf('function riskWhy', start);
  const groupRows = new Function(`${source.slice(start, end)}; return groupRows;`)();
  const live = () => groupRows([
    { id: 'a', group: 'system', bytes: 200 },
    { id: 'b', group: 'dev', bytes: 0 },
  ]);
  const isFolded = (t, section) =>
    typeof t[section.key] === 'boolean' ? t[section.key] : section.bytes === 0;
  const click = (t, section) => ({ ...t, [section.key]: !isFolded(t, section) });

  let toggled = {};
  let section = live().find((g) => g.key === 'system');
  check('a group with bytes starts open', isFolded(toggled, section) === false);
  toggled = click(toggled, section);
  check('one click folds the group it belongs to', isFolded(toggled, section) === true);
  check('the fold map holds only the group that was clicked', Object.keys(toggled).join(',') === 'system');
  toggled = click(toggled, section);
  check('a second click unfolds it again', isFolded(toggled, section) === false);
}
check(
  'a group head toggles its own section',
  /onClick: \(\) => toggleGroup\(section\)/.test(source) && !/toggleGroup\(section\.key\)/.test(source),
);
check('select all skips the folded sections', /visibleRows\(\)\.filter/.test(source));
check('the panel folds the group list', /function groupRows\(rows\)/.test(source) && /aria-expanded/.test(source) && /section\.bytes === 0/.test(source));
check('every note code has an explanation', ['why_safe', 'why_in-use', 'why_rebuild', 'why_elevation', 'why_pending-update', 'why_rollback', 'why_superseded', 'why_history', 'why_duplicate', 'why_database-backup', 'why_orphan'].every((k) => zhKeys.includes(k) && enKeys.includes(k)));
const areaIds = [...auditSrc.matchAll(/^\s{6}id: '([a-z-]+)',$/gm)].map((m) => m[1]);
check('every assessment area has a translated label and reason', areaIds.length > 0 && areaIds.every((id) => zhKeys.includes(`area_${id}`) && zhKeys.includes(`area_${id}_why`) && enKeys.includes(`area_${id}`) && enKeys.includes(`area_${id}_why`)), `areas: ${areaIds.join(',')}`);
check('a reveal request names an area, never a path', index.includes("action === 'reveal'") && auditSrc.includes('export function areaPaths') && !/revealPath[\s\S]{0,200}payload\.path/.test(index));
check('no caller may pass a raw path', !/parameters[\s\S]{0,400}paths/.test(index) && catalog.includes('Callers select catalog ids'));
check(
  'a dry run reports what a real run would delete, not the folder size',
  catalog.includes('export async function measurePath(abs, cutoff)') &&
    (catalog.match(/await measurePath\(abs, cutoff\)/g) ?? []).length === 2,
  `${(catalog.match(/await measurePath\(abs, cutoff\)/g) ?? []).length} cutoff-aware call sites`,
);
check(
  'an age-limited row also names the folder size',
  catalog.includes('totalBytes') && index.includes('totalBytes: target.totalBytes') && source.includes('row.totalBytes'),
  'scan must carry totalBytes through to the row, or an `aged` target reads as empty',
);

const codes = [...new Set([...plan.matchAll(/code: '([a-z-]+)'/g)].map((m) => m[1]))];
check('plan emits the documented 9 step codes', codes.length === 9, `got ${codes.length}`);
check('every plan code has zh title and detail', codes.every((c) => zhKeys.includes(`plan_code_${c}`) && zhKeys.includes(`plan_code_${c}_detail`)));
check('every plan code has host title and detail', codes.every((c) => index.includes(`'${c}':`)));
check(
  'elevation steps are never counted as reclaimable now',
  plan.includes("reclaimable.filter((row) => row.note !== 'elevation')") && plan.includes("reclaimable.filter((row) => row.note === 'elevation'"),
);
const auditImport = /import \{([^}]*)\} from '\.\/catalog\.js';/.exec(auditSrc);
check('audit imports measuring only, never the deleter', Boolean(auditImport) && !/\bclean\b/.test(auditImport[1]), auditImport?.[1].trim());

const pkg = JSON.parse(read('package.json'));
check('package lists every runtime file', ['lib/index.js', 'lib/client.js', 'lib/catalog.js', 'lib/audit.js', 'lib/plan.js'].every((f) => pkg.files.includes(f)));

// --- 1.6.3: the delete-safety regressions ------------------------------------------------
check(
  'the recycle bin is never filed as a safe, preselected target',
  /id: 'recycle-bin',[\s\S]{0,200}?risk: 'caution'/.test(catalog) &&
    !/id: 'recycle-bin',[\s\S]{0,200}?risk: 'safe'/.test(catalog) &&
    /const IRREVERSIBLE = new Set\(\['recycle-bin'\]\)/.test(source),
  'emptying the recycle bin cannot be undone, so it must not sit under "safe" or in "select all"',
);
check(
  'no target skips the boundary check by naming no root',
  /const roots = declared\.length > 0 \? declared : \[path\.parse/.test(catalog) &&
    catalog
      .split(/\n  \{\n/)
      .filter((block) => /roots: \[\]/.test(block))
      .every((block) => /id: 'recycle-bin'/.test(block)),
  'an empty roots list used to disable `within` entirely; only the recycle bin, which spans volumes, may declare none',
);
check(
  'preselection and select-all both exclude irreversible targets',
  /!IRREVERSIBLE\.has\(row\.id\)/.test(source) &&
    (source.match(/!IRREVERSIBLE\.has\(row\.id\)/g) ?? []).length >= 2,
);
check(
  'every confirm box names the targets and the total, in a dialog the page draws',
  source.includes("t('cleanConfirmList')") &&
    source.includes("t('cleanConfirmIrreversible')") &&
    source.includes('function ConfirmDialog(') &&
    !/window\.confirm\(/.test(source) &&
    (source.match(/h\(ConfirmDialog, \{/g) ?? []).length === 2,
  'window.confirm is drawn by the browser outside the page, so it ignores the dark theme; ' +
    'both the main button and a plan step must ask through the panel dialog',
);
check(
  'a clean that left files behind is not reported as a green success',
  /const kind = failed > 0 \? 'warn' : 'ok'/.test(source) && /\.dsc-notice\.dsc-warn/.test(source),
);
check(
  'a truncated walk says so instead of claiming exact totals',
  catalog.includes('truncated: stack.length > 0') &&
    catalog.includes('truncated = truncated || size.truncated === true') &&
    index.includes('truncated: target.truncated === true') &&
    source.includes("t('truncatedHint')"),
);
check(
  'measure and purge count entries in the same unit',
  /let seen = 0;\n  while \(stack\.length > 0 && seen < MAX_ENTRIES\)/.test(catalog) && /seen \+= 1;/.test(catalog),
);
check(
  'a refused directory removal is counted, a legitimately full one is not',
  /code === 'ENOTEMPTY' \|\| code === 'EEXIST'/.test(catalog) && /blocked \+= 1/.test(catalog),
);
check(
  'the dry run applies the same too-broad guard as the real run',
  (catalog.match(/if \(tooBroad\(abs\)\) \{/g) ?? []).length === 2,
  'an estimate that skips the guard promises bytes the delete will refuse',
);
check(
  'the orphan target is named for what it actually measures',
  !/已卸载程序的残留数据|Leftover data from an uninstalled app|已卸载程序残留|Data from uninstalled apps/.test(source) &&
    source.includes('QQ') ,
  'it only ever measures the QQGuild folder',
);
check('the version badge and package agree', pkg.version === '1.6.10');

check(
  'the harness keeps its own renderer caches out of every target',
  !/subdirs\(path\.join\(roaming, '@deepseek-ai', 'dsh-desktop'\)/.test(catalog) &&
    /const hostOwned = \(\) => \{/.test(catalog) &&
    /if \(owned\.some\(\(root\) =>/.test(catalog),
  'emptying them makes the live page rebuild and reload itself mid-clean',
);

check(
  'a path inside the running host is refused even if a target asks for it',
  /const owned = hostOwned\(\);/.test(catalog) &&
    /within\(candidate, root\)\)\) continue;/.test(catalog),
  'the exclusion belongs in resolveTargets so one definition cannot reintroduce it',
);

check(
  'a dry run is one click away and never sends confirm',
  /const runClean = \(dry\) => \{/.test(source) &&
    /const body = isDry \? \{ ids \} : \{ ids, confirm: true \};/.test(source) &&
    /onClick: \(\) => runClean\(true\)/.test(source) &&
    /onClick: \(\) => runClean\(false\)/.test(source),
  'the panel must be able to ask what a delete would free before doing it',
);

check(
  'the dialog lists the targets itself, so the sentence holds no catalog ids or bullet text',
  source.includes("className: 'dsc-dialog-list'") &&
    source.includes("list.map((line, index) => h('li',") &&
    !source.includes('{list}'),
  'the template used to splice a newline-joined blob into one sentence; the list is markup now',
);

check(
  'the confirmation is painted with the panel tokens, not by the platform',
  source.includes('.dsc-overlay { position: fixed;') &&
    source.includes('.dsc-dialog { box-sizing: border-box;') &&
    /background: var\(--dsb-surface\)/.test(source) &&
    /border: 1px solid var\(--dsb-line-strong\)/.test(source) &&
    !/window\.confirm\(/.test(source),
  'window.confirm ignores color-scheme and the baseline tokens, so a dark panel gets a white box',
);

check(
  'the confirmation can be dismissed without deleting anything',
  /if \(event\.key === 'Escape'\)/.test(source) &&
    source.includes("className: 'dsc-overlay', role: 'presentation', onClick: onNo") &&
    /className: 'dsc-btn dsc-btn-danger', onClick: onYes/.test(source),
  'Escape, the overlay and the cancel button must all leave the files alone',
);

check(
  'the destructive button does not take focus, so a stray Enter cannot delete',
  source.includes('function ConfirmDialog(') &&
    !/autoFocus/.test(source) &&
    source.includes("role: 'dialog'") &&
    source.includes("'aria-modal': 'true'"),
);

check(
  'a dry run never claims it freed anything',
  /if \(isDry\) \{[\s\S]{0,320}t\('dryRunHint'\)[\s\S]{0,320}return;/.test(source) &&
    /dryRunHint: '/.test(source),
  'the dry-run banner must say nothing was deleted',
);

check(
  'the notice a clean sets survives the rescan that follows it',
  /await scan\(\{ keepNotice: true \}\);/.test(source) &&
    /if \(!keepNotice\) setNotice\(null\);/.test(source),
  'rescanning used to erase the result the user just asked for',
);

check(
  'plan steps name targets in words, never catalog ids',
  !source.includes("(step.ids || []).join(', ')") &&
    source.includes('(step.ids || []).map((id) => targetName(t, id))'),
  'the panel must not print npm-cache, chrome-cache, pip-cache at the user',
);

check(
  'an empty plan says so instead of rendering nothing',
  /if \(plan.steps.length === 0\)/.test(source) &&
    /planEmpty: '/.test(source) &&
    /t\('planEmpty'\)/.test(source),
  'nothing worth doing is a conclusion, not a blank',
);

check(
  'route errors carry a stable code the panel can translate',
  /const coded = \(code, message\) => \{/.test(index) &&
    /coded\('unknown-target'/.test(index) &&
    /coded\('no-targets'/.test(index) &&
    /code: typeof error\?\.code === 'string' \? error\.code : 'internal'/.test(index) &&
    /function describeError\(t, err\) \{/.test(source) &&
    /if \(data && typeof data\.code === 'string'\) error\.code = data\.code;/.test(source),
  'a Chinese panel must not print "origin rejected" or "unknown target: x"',
);

check(
  'every route error code has both a Chinese and an English sentence',
  ['method-not-allowed', 'origin-rejected', 'bad-ids', 'too-many-ids', 'unknown-target', 'unknown-drive', 'drive-not-mounted', 'no-targets', 'unknown-action', 'internal'].every(
    (code) => source.includes(`'err_${code}': `),
  ),
  'an untranslated code falls back to the English message',
);

check(
  'a real clean writes one history line and the panel can read it back',
  /import \{ appendRun, readRuns \} from '\.\/history\.js';/.test(index) &&
    /if \(action === 'history'\) return \{ runs: readRuns\(50\) \};/.test(index) &&
    /appendRun\(\{/.test(index) &&
    /export function appendRun/.test(historySrc) &&
    /export function readRuns/.test(historySrc) &&
    /historyTitle: '/.test(source) &&
    /function History\(\{ t \}\)/.test(source) &&
    /h\(History, \{ t \}\)/.test(source),
  'history must survive the tab, and be exportable',
);

check(
  'history never throws into the clean path',
  /try \{/.test(historySrc) &&
    /catch/.test(historySrc) &&
    !/throw /.test(historySrc),
  'the bytes are already gone; failing to log them must not look like a failed clean',
);

check(
  'scan bounds its own concurrency instead of walking every target at once',
  /const SCAN_CONCURRENCY = \d+;/.test(catalog) &&
    /const worker = async \(\) => \{/.test(catalog) &&
    !/await Promise\.all\(targets\.map/.test(catalog),
  '32 volumes at once stalls a spinning disk and the antivirus',
);

check(
  'a system target under SystemRoot is read from SystemRoot, not from C:',
  (catalog.match(/env\('SystemRoot'\)/g) ?? []).length === 2 &&
    !/C:\\+Windows\\+Temp/.test(catalog),
  'the boundary check already trusted SystemRoot; the paths have to agree',
);

check(
  'a request without an Origin is refused unless it arrived on loopback',
  /const LOOPBACK_HOSTS = new Set\(/.test(index) &&
    /const APP_SCHEME = 'dsh-app:\/\/';/.test(index) &&
    /function fromLoopback\(req\)/.test(index) &&
    /req\.socket\.remoteAddress/.test(index) &&
    /if \(!fromLoopback\(req\)\) return false;/.test(index) &&
    /if \(origin\.startsWith\(APP_SCHEME\)\) return true;/.test(index) &&
    !/return origin === `http:\/\/${host}` \|\| origin === `https:\/\/${host}`;/.test(index),
  'the desktop shell posts from dsh-app://, and a stripped Origin can still be the panel itself',
);

check(
  'the panel carries dsh-design-baseline (full mode: css inlined, root tagged, tokens only)',
  />>> dsh-design-baseline v/.test(source) &&
    /const BASELINE_CSS = "/.test(source) &&
    /const injectBaseline = /.test(source) &&
    /className: 'dsc-root dsb-root'/.test(source) &&
    /injectBaseline\(document, PANEL_ID\)/.test(source),
  'baseline stylesheet, root class and injector must all be present',
);

check(
  'no colour reaches for a raw host token outside the baseline block',
  (() => {
    const from = source.indexOf('// >>> dsh-design-baseline');
    const to = source.indexOf('// <<< dsh-design-baseline');
    if (from < 0 || to < from) return false;
    return !/--dsw-alias-[a-z0-9-]+/.test(source.slice(0, from) + source.slice(to));
  })(),
  'panel css must go through --dsb-* so the host theme is followed',
);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
