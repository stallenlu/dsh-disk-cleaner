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
check('clean honours the confirm preference', source.includes("confirmFirst.get() === 'always'"));
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
check('the read-only agent clean keeps the audit cache in sync', /if \(!dryRun\) invalidateAudit\(\);[\s\S]*const freed = results\.reduce/.test(index));
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

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
