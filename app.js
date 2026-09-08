/* ============================================================
   Ops Tracker — app logic
   Reads/writes data.json straight to a GitHub repo via the
   Contents API, so edits are shared with everyone who has the
   page open (after they reload / on next fetch).
   ============================================================ */

const ROLE_KEYS = ['cho', 'crsm', 'csm', 'ccm', 'wpo', 'des'];
const STATUS_CLASS = s => (s || '').replace(/\s+/g, '-');
const CONFIG_KEY = 'opsTrackerGh';

let clients = [];
let sha = null;          // current data.json blob sha (for GitHub writes)
let ghConfig = null;     // { owner, repo, token, branch }
let editingId = null;    // client._id currently open in drawer, or 'new'
let sort = { key: 'name', dir: 1 };
let filters = { status: '__all', role: '', search: '' };

const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

/* ---------------- boot ---------------- */

document.addEventListener('DOMContentLoaded', () => {
  ghConfig = loadConfig();
  wireStaticEvents();
  refreshSyncBadge();
  fetchData();
  measureTopbar();
  window.addEventListener('resize', measureTopbar);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(measureTopbar);
  }
});

function measureTopbar() {
  const bar = document.querySelector('.topbar');
  if (!bar) return;
  // run twice: once now, once after layout settles (fonts/filters wrap)
  const set = () => document.documentElement.style.setProperty('--topbar-h', bar.getBoundingClientRect().height + 'px');
  set();
  requestAnimationFrame(set);
}

function loadConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function saveConfig(cfg) {
  ghConfig = cfg;
  localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
}

function clearConfig() {
  ghConfig = null;
  localStorage.removeItem(CONFIG_KEY);
}

/* ---------------- data loading ---------------- */

async function fetchData() {
  setSync('busy', 'Loading…');
  if (ghConfig && ghConfig.token) {
    try {
      const res = await ghApi('GET', 'data.json');
      const bytes = Uint8Array.from(atob(res.content.replace(/\n/g, '')), c => c.charCodeAt(0));
      const text = new TextDecoder('utf-8').decode(bytes);
      clients = JSON.parse(text).map(withId);
      sha = res.sha;
      setSync('ok', `Connected · ${ghConfig.owner}/${ghConfig.repo}`);
      afterDataLoaded();
      return;
    } catch (err) {
      console.error(err);
      setSync('err', 'Could not reach GitHub — showing local copy');
      // fall through to local file as a read-only fallback
    }
  } else {
    setSync('idle', 'Not connected — view only');
  }

  try {
    const local = await fetch('data.json', { cache: 'no-store' }).then(r => r.json());
    clients = local.map(withId);
    sha = null;
    afterDataLoaded();
  } catch (err) {
    console.error(err);
    toast('Could not load data.json', 'err');
    clients = [];
    afterDataLoaded();
  }
}

let idCounter = 1;
function withId(c) {
  if (!c._id) c._id = 'c' + (idCounter++);
  return c;
}

function afterDataLoaded() {
  populateRoleFilter();
  renderTable();
}

/* ---------------- GitHub API ---------------- */

async function ghApi(method, path, body) {
  const url = `https://api.github.com/repos/${ghConfig.owner}/${ghConfig.repo}/contents/${path}` +
    (ghConfig.branch ? `?ref=${encodeURIComponent(ghConfig.branch)}` : '');
  const opts = {
    method,
    headers: {
      'Authorization': `Bearer ${ghConfig.token}`,
      'Accept': 'application/vnd.github+json',
    },
  };
  if (body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`GitHub API ${res.status}: ${detail}`);
  }
  return res.json();
}

function toBase64Utf8(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  bytes.forEach(b => bin += String.fromCharCode(b));
  return btoa(bin);
}

async function persistToGitHub(commitMessage) {
  if (!ghConfig || !ghConfig.token) {
    toast('Connect to GitHub to save changes', 'err');
    openTokenModal();
    return false;
  }
  setSync('busy', 'Saving…');
  const cleaned = clients.map(({ _id, ...rest }) => rest);
  const content = toBase64Utf8(JSON.stringify(cleaned, null, 2));
  const body = {
    message: commitMessage || 'Update Ops Tracker via web app',
    content,
    branch: ghConfig.branch || undefined,
  };
  if (sha) body.sha = sha;
  try {
    const res = await ghApi('PUT', 'data.json', body);
    sha = res.content.sha;
    setSync('ok', `Connected · ${ghConfig.owner}/${ghConfig.repo}`);
    toast('Saved to GitHub', 'ok');
    return true;
  } catch (err) {
    console.error(err);
    setSync('err', 'Save failed');
    toast('Save failed — check your token still has write access', 'err');
    return false;
  }
}

/* ---------------- rendering ---------------- */

function renderTable() {
  const tbody = $('#tbody');
  tbody.innerHTML = '';

  const filtered = clients.filter(c => {
    if (filters.status !== '__all' && c.status !== filters.status) return false;
    if (filters.role && !ROLE_KEYS.some(k => c[k] === filters.role)) return false;
    if (filters.search) {
      const hay = [c.name, c.industry, c.packages, ...ROLE_KEYS.map(k => c[k])]
        .join(' ').toLowerCase();
      if (!hay.includes(filters.search.toLowerCase())) return false;
    }
    return true;
  });

  filtered.sort((a, b) => {
    let av = (a[sort.key] || '').toString().toLowerCase();
    let bv = (b[sort.key] || '').toString().toLowerCase();
    if (av < bv) return -1 * sort.dir;
    if (av > bv) return 1 * sort.dir;
    return 0;
  });

  $('#countPill').textContent = `${filtered.length} of ${clients.length} clients`;
  $('#emptyState').style.display = filtered.length ? 'none' : 'block';

  const soonCutoff = Date.now() + 1000 * 60 * 60 * 24 * 60; // 60 days

  filtered.forEach(c => {
    const tr = document.createElement('tr');
    tr.className = 'row';
    tr.dataset.id = c._id;

    const endTime = c.contractEnd ? new Date(c.contractEnd).getTime() : null;
    const soon = endTime && endTime < soonCutoff;

    tr.innerHTML = `
      <td class="col-client">
        <span class="status-bar" style="background:var(--${statusVar(c.status)})"></span>
        <span class="client-name">${escapeHtml(c.name || 'Untitled')}</span>
        ${c.industry ? `<span class="client-industry">${escapeHtml(c.industry)}</span>` : ''}
      </td>
      ${ROLE_KEYS.map(k => `<td class="${personClass(c[k])}">${escapeHtml(c[k] || '—')}</td>`).join('')}
      <td class="person">${escapeHtml(c.packages || '—')}</td>
      <td><span class="status-tag ${STATUS_CLASS(c.status)}"><span class="dot"></span>${escapeHtml(c.status || '—')}</span></td>
      <td class="col-ends ${soon ? 'soon' : ''}">${formatDate(c.contractEnd)}</td>
    `;
    tr.addEventListener('click', () => openDrawer(c._id));
    tbody.appendChild(tr);
  });
}

function personClass(v) {
  if (!v) return 'person empty';
  if (/^NO /.test(v)) return 'person flag';
  return 'person';
}

function statusVar(status) {
  if (status === 'Active') return 'active';
  if (status === 'Contract Ending') return 'ending';
  if (status === 'Paused') return 'paused';
  return 'line';
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit', day: 'numeric' });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}

function populateRoleFilter() {
  const names = new Set();
  clients.forEach(c => ROLE_KEYS.forEach(k => {
    if (c[k] && !/^NO /.test(c[k])) names.add(c[k]);
  }));
  const sel = $('#roleFilter');
  const current = sel.value;
  sel.innerHTML = '<option value="">Assigned to: anyone</option>' +
    Array.from(names).sort().map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
  sel.value = current;
}

/* ---------------- drawer (add / edit) ---------------- */

function openDrawer(id) {
  editingId = id;
  const c = id === 'new' ? blankClient() : clients.find(x => x._id === id);
  if (!c) return;

  $('#drawerEyebrow').textContent = id === 'new' ? 'New client' : 'Editing client';
  $('#f_name').value = c.name || '';
  ROLE_KEYS.forEach(k => $(`#f_${k}`).value = c[k] || '');
  $('#f_status').value = c.status || 'Active';
  $('#f_start').value = c.contractStart || '';
  $('#f_end').value = c.contractEnd || '';
  $('#f_industry').value = c.industry || '';
  $('#f_packages').value = c.packages || '';
  $('#f_hosted').value = c.hosted || '';
  $('#f_closed').value = c.closedWinDate || '';

  $('#deleteBtn').style.display = id === 'new' ? 'none' : 'inline-block';

  $('#scrim').classList.add('open');
  $('#drawer').classList.add('open');
  setTimeout(() => $('#f_name').focus(), 150);
}

function blankClient() {
  return { _id: 'new', name: '', status: 'Active' };
}

function closeDrawer() {
  $('#scrim').classList.remove('open');
  $('#drawer').classList.remove('open');
  editingId = null;
}

function collectForm() {
  const obj = { name: $('#f_name').value.trim() };
  ROLE_KEYS.forEach(k => obj[k] = $(`#f_${k}`).value.trim());
  obj.status = $('#f_status').value;
  obj.contractStart = $('#f_start').value;
  obj.contractEnd = $('#f_end').value;
  obj.industry = $('#f_industry').value.trim();
  obj.packages = $('#f_packages').value.trim();
  obj.hosted = $('#f_hosted').value;
  obj.closedWinDate = $('#f_closed').value;
  return obj;
}

async function handleSave() {
  const data = collectForm();
  if (!data.name) {
    toast('Give this client a name first', 'err');
    return;
  }
  if (editingId === 'new') {
    clients.push(withId(data));
  } else {
    const idx = clients.findIndex(x => x._id === editingId);
    clients[idx] = { ...clients[idx], ...data };
  }
  const ok = await persistToGitHub(`${editingId === 'new' ? 'Add' : 'Update'} ${data.name} — Ops Tracker`);
  if (ok) {
    closeDrawer();
    populateRoleFilter();
    renderTable();
  }
}

async function handleDelete() {
  if (editingId === 'new' || !editingId) return;
  const c = clients.find(x => x._id === editingId);
  if (!confirm(`Remove "${c.name}" from the tracker?`)) return;
  clients = clients.filter(x => x._id !== editingId);
  const ok = await persistToGitHub(`Remove ${c.name} — Ops Tracker`);
  if (ok) {
    closeDrawer();
    populateRoleFilter();
    renderTable();
  } else {
    // revert on failure
    clients.push(c);
  }
}

/* ---------------- token modal ---------------- */

function openTokenModal() {
  if (ghConfig) {
    $('#ownerInput').value = ghConfig.owner || '';
    $('#repoInput').value = ghConfig.repo || '';
    $('#tokenInput').value = ghConfig.token || '';
  }
  $('#tokenErr').classList.remove('show');
  $('#tokenModal').classList.remove('hidden');
}

function closeTokenModal() {
  $('#tokenModal').classList.add('hidden');
}

async function handleTokenSave() {
  const owner = $('#ownerInput').value.trim();
  const repo = $('#repoInput').value.trim();
  const token = $('#tokenInput').value.trim();
  if (!owner || !repo || !token) {
    $('#tokenErr').textContent = 'Fill in the owner, repo, and token.';
    $('#tokenErr').classList.add('show');
    return;
  }
  const testConfig = { owner, repo, token, branch: '' };
  const prevConfig = ghConfig;
  ghConfig = testConfig;
  try {
    const res = await ghApi('GET', 'data.json');
    saveConfig(testConfig);
    closeTokenModal();
    toast('Connected to GitHub', 'ok');
    fetchData();
  } catch (err) {
    console.error(err);
    ghConfig = prevConfig;
    $('#tokenErr').textContent = "Couldn't read data.json from that repo — check the owner/repo spelling and the token's permissions.";
    $('#tokenErr').classList.add('show');
  }
}

/* ---------------- toast / sync badge ---------------- */

function toast(msg, type) {
  const el = document.createElement('div');
  el.className = `toast ${type || ''}`;
  el.textContent = msg;
  $('#toastWrap').appendChild(el);
  setTimeout(() => el.remove(), 3400);
}

function setSync(state, label) {
  const badge = $('#syncState');
  badge.className = `sync-state ${state === 'ok' ? 'ok' : state === 'err' ? 'err' : state === 'busy' ? 'busy' : ''}`;
  $('#syncLabel').textContent = label;
}

function refreshSyncBadge() {
  if (ghConfig && ghConfig.token) {
    $('#connectBtn').textContent = 'Reconnect GitHub';
  }
}

/* ---------------- events ---------------- */

function wireStaticEvents() {
  $$('#statusChips .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      $$('#statusChips .chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      filters.status = chip.dataset.status;
      renderTable();
    });
  });

  $('#roleFilter').addEventListener('change', e => {
    filters.role = e.target.value;
    renderTable();
  });

  $('#searchInput').addEventListener('input', e => {
    filters.search = e.target.value;
    renderTable();
  });

  $$('table.roster thead th').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      if (sort.key === key) sort.dir *= -1; else { sort.key = key; sort.dir = 1; }
      $$('table.roster thead th').forEach(x => x.classList.remove('sorted'));
      th.classList.add('sorted');
      renderTable();
    });
  });

  $('#addBtn').addEventListener('click', () => openDrawer('new'));
  $('#cancelBtn').addEventListener('click', closeDrawer);
  $('#scrim').addEventListener('click', closeDrawer);
  $('#saveBtn').addEventListener('click', handleSave);
  $('#deleteBtn').addEventListener('click', handleDelete);

  $('#connectBtn').addEventListener('click', openTokenModal);
  $('#tokenCancel').addEventListener('click', closeTokenModal);
  $('#tokenSave').addEventListener('click', handleTokenSave);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeDrawer(); closeTokenModal(); }
  });
}
