(function () {
  'use strict';
  if (document.getElementById('gso-root')) return;

  // ── Browser compat ──────────────────────────────────────────────────────────
  const store = (
    (globalThis.chrome && globalThis.chrome.storage) ? globalThis.chrome.storage :
    (globalThis.browser && globalThis.browser.storage) ? globalThis.browser.storage : null
  );
  const runtime = (
    (globalThis.chrome && globalThis.chrome.runtime) ? globalThis.chrome.runtime :
    (globalThis.browser && globalThis.browser.runtime) ? globalThis.browser.runtime : null
  );
  if (!store) return;

  // ── State ───────────────────────────────────────────────────────────────────
  let folders = [];
  let drag = null; // { repoId, folderId, el }
  let saveTimer = null;

  // ── Utils ───────────────────────────────────────────────────────────────────
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2);

  function schedSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => store.local.set({ folders }).catch(() => {}), 300);
  }

  function mkEl(tag, cls, text) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  function svgPath(d, size = 16) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', size); svg.setAttribute('height', size);
    svg.setAttribute('viewBox', '0 0 16 16'); svg.setAttribute('fill', 'currentColor');
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', d); svg.appendChild(p);
    return svg;
  }

  // ── Storage ─────────────────────────────────────────────────────────────────
  async function loadData() {
    try {
      const r = await store.local.get(['folders']);
      folders = r.folders && r.folders.length
        ? r.folders
        : [{ id: 'default', name: 'Tous mes repos', collapsed: false, repos: [] }];
    } catch {
      folders = [{ id: 'default', name: 'Tous mes repos', collapsed: false, repos: [] }];
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const findF = id => folders.find(f => f.id === id);
  const repoOf = repoId => folders.find(f => f.repos.some(r => r.id === repoId));

  // ── Page detection ───────────────────────────────────────────────────────────
  function isDash() {
    const p = location.pathname.replace(/\/$/, '') || '/';
    return p === '/' || p === '/dashboard' || p.startsWith('/dashboard/');
  }

  function getCurRepo() {
    const m = location.pathname.match(/^\/([^/]+\/[^/]+)/);
    if (!m) return null;
    const excl = new Set(['settings','explore','marketplace','orgs','notifications',
      'login','signup','about','features','enterprise','pricing','topics',
      'trending','collections','events','sponsors','readme']);
    if (excl.has(m[1].split('/')[0])) return null;
    const parts = m[1].split('/');
    if (parts.length < 2 || !parts[1]) return null;
    return { id: m[1], name: m[1], url: 'https://github.com/' + m[1] };
  }

  // ── GitHub DOM ───────────────────────────────────────────────────────────────
  function findGHSidebar() {
    if (!isDash()) return null;
    for (const sel of [
      '[data-target="feed.dashboardSidebar"]',
      'aside.dashboard-sidebar',
      '[class*="dashboard-sidebar"]',
    ]) {
      const el = document.querySelector(sel);
      if (el && el.offsetParent !== null) return el;
    }
    const lc = document.querySelector('.Layout > .Layout-sidebar:first-child');
    if (lc) {
      const a = lc.querySelector('aside') || lc;
      if (a.offsetParent !== null) return a;
    }
    return null;
  }

  // Hide GitHub's native "Top Repositories" list so ours replaces it
  function hideNativeRepos(sidebar) {
    const targets = [
      () => sidebar.querySelector('.js-repos-container'),
      () => sidebar.querySelector('[data-hpc]'),
      () => {
        const el = document.getElementById('dashboard-sidebar-top-repositories');
        if (el) return el;
        const frame = sidebar.querySelector('turbo-frame');
        if (frame) return frame;
        return null;
      },
      () => {
        // Find by heading text "Top repositories"
        for (const h of sidebar.querySelectorAll('h2, h3, [class*="heading"], span')) {
          if (/top\s+repo|recent\s+repo/i.test(h.textContent.trim())) {
            let el = h.parentElement;
            while (el && el !== sidebar) {
              if (el.tagName === 'SECTION' || el.tagName === 'ASIDE' ||
                  (el.children.length >= 2)) return el;
              el = el.parentElement;
            }
          }
        }
        return null;
      },
    ];
    for (const fn of targets) {
      try {
        const el = fn();
        if (el && !el.closest('#gso-root')) {
          el.style.display = 'none';
          el.dataset.gsoHidden = '1';
          return;
        }
      } catch { /* continue */ }
    }
  }

  // ── Scrape + import native GitHub repo list ──────────────────────────────────
  // GitHub marks repo links with data-hovercard-type="repository".
  // The list lives in a <turbo-frame> loaded AFTER the sidebar, so we observe.

  function doImport() {
    const links = document.querySelectorAll('a[data-hovercard-type="repository"]');
    if (!links.length) return false;

    const known = new Set(folders.flatMap(f => f.repos.map(r => r.id)));
    const inbox = folders[0];
    let added = false;
    const seen = new Set();

    for (const a of links) {
      const href = a.getAttribute('href') || '';
      const m = href.match(/^\/([^/?#]+\/[^/?#]+)\/?$/);
      if (!m) continue;
      const id = m[1];
      if (seen.has(id) || known.has(id)) continue;
      seen.add(id);
      inbox.repos.push({ id, name: id, url: 'https://github.com/' + id, addedAt: Date.now() });
      added = true;
    }
    if (added) { schedSave(); render(); }
    return true;
  }

  function hideNativeRepoSection() {
    // 1. turbo-frame whose src points to the top-repos endpoint
    for (const f of document.querySelectorAll('turbo-frame[src]')) {
      if (f.src.includes('top_repositories') || f.src.includes('my_top_repositories')) {
        f.style.display = 'none'; return;
      }
    }
    // 2. Find the nearest shared ancestor of all repo links and hide it
    const links = [...document.querySelectorAll('a[data-hovercard-type="repository"]')];
    if (!links.length) return;
    let ancestor = links[0].parentElement;
    while (ancestor && ancestor.tagName !== 'BODY') {
      if (ancestor.querySelectorAll('a[data-hovercard-type="repository"]').length === links.length) {
        // Walk one more level up to include the "Top repositories" heading
        const parent = ancestor.parentElement;
        if (parent && parent.tagName !== 'BODY') ancestor = parent;
        break;
      }
      ancestor = ancestor.parentElement;
    }
    if (ancestor && ancestor.tagName !== 'BODY') ancestor.style.display = 'none';
  }

  function findShowMoreBtn() {
    for (const el of document.querySelectorAll('a, button')) {
      if (el.closest('#gso-root')) continue;
      if (!el.offsetParent) continue; // not visible
      if (/show\s+more/i.test(el.textContent.trim())) return el;
    }
    return null;
  }

  function waitForAndImportRepos() {
    let lastCount = 0;

    function step() {
      const links = document.querySelectorAll('a[data-hovercard-type="repository"]');

      // Import any newly visible repos
      if (links.length > lastCount) {
        lastCount = links.length;
        doImport();
      }

      // If there's a "Show more" button, click it and let the observer catch the result
      const btn = findShowMoreBtn();
      if (btn) { btn.click(); return false; }

      // No button left → done
      if (links.length > 0) { hideNativeRepoSection(); return true; }
      return false;
    }

    if (step()) return;

    const obs = new MutationObserver(() => { if (step()) obs.disconnect(); });
    obs.observe(document.body, { childList: true, subtree: true });
    // Safety timeout: import whatever is there and hide
    setTimeout(() => { obs.disconnect(); doImport(); hideNativeRepoSection(); }, 15000);
  }

  // ── Drag & Drop ──────────────────────────────────────────────────────────────

  function clearDragUI() {
    document.querySelectorAll('.gso-merge-over').forEach(el => el.classList.remove('gso-merge-over'));
    document.querySelectorAll('.gso-drop-over').forEach(el => el.classList.remove('gso-drop-over'));
    document.querySelectorAll('.gso-drop-line').forEach(el => el.remove());
  }

  function onDragStart(e, repoId, folderId, el) {
    drag = { repoId, folderId, el };
    el.classList.add('gso-dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', repoId);
  }

  function onDragEnd() {
    drag && drag.el.classList.remove('gso-dragging');
    clearDragUI();
    drag = null;
  }

  // Dragging a repo over ANOTHER repo from a different folder → Discord folder creation
  function onDragOverRepo(e, targetId, targetFolderId, _targetEl) {
    if (!drag || drag.repoId === targetId) return;
    if (drag.folderId === targetFolderId) return; // same folder: let list handle reorder
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    clearDragUI();
    _targetEl.classList.add('gso-merge-over');
  }

  function onDropOnRepo(e, targetId, targetFolderId, _targetEl) {
    if (!drag || drag.repoId === targetId) return;
    if (drag.folderId === targetFolderId) return;
    e.preventDefault();
    e.stopPropagation();

    const srcF = findF(drag.folderId);
    const tgtF = findF(targetFolderId);
    if (!srcF || !tgtF) { onDragEnd(); return; }

    const draggedRepo = srcF.repos.find(r => r.id === drag.repoId);
    const targetRepo = tgtF.repos.find(r => r.id === targetId);
    if (!draggedRepo || !targetRepo) { onDragEnd(); return; }

    // Remove both repos from their folders
    srcF.repos = srcF.repos.filter(r => r.id !== drag.repoId);
    tgtF.repos = tgtF.repos.filter(r => r.id !== targetId);

    // Create a new folder with both, inserted right after tgtF
    const newF = { id: uid(), name: 'Nouveau dossier', collapsed: false, repos: [targetRepo, draggedRepo] };
    const tgtIdx = folders.indexOf(tgtF);
    folders.splice(tgtIdx + 1, 0, newF);

    schedSave();
    const savedDrag = drag;
    onDragEnd();
    render();

    // Auto-trigger rename on the new folder
    requestAnimationFrame(() => {
      const nameEl = document.querySelector(`[data-folder-id="${newF.id}"] .gso-folder-name`);
      if (nameEl) inlineRename(nameEl, newF.name, v => { newF.name = v; schedSave(); render(); });
      void savedDrag; // suppress lint
    });
  }

  // Dragging over a folder list → reorder or move into folder
  function onDragOverList(e, _folderId, listEl) {
    if (!drag) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    listEl.classList.add('gso-drop-over');

    // Drop line indicator
    listEl.querySelectorAll('.gso-drop-line').forEach(l => l.remove());
    const items = [...listEl.querySelectorAll('.gso-repo-item:not(.gso-dragging)')];
    let placed = false;
    for (const item of items) {
      const { top, height } = item.getBoundingClientRect();
      if (e.clientY < top + height / 2) {
        const line = mkEl('div', 'gso-drop-line');
        item.before(line);
        placed = true;
        break;
      }
    }
    if (!placed) {
      const line = mkEl('div', 'gso-drop-line');
      listEl.appendChild(line);
    }
  }

  function onDragLeaveList(e, listEl) {
    if (!listEl.contains(e.relatedTarget)) {
      listEl.classList.remove('gso-drop-over');
      listEl.querySelectorAll('.gso-drop-line').forEach(l => l.remove());
    }
  }

  function onDropOnList(e, folderId, listEl) {
    e.preventDefault();
    listEl.classList.remove('gso-drop-over');
    if (!drag) return;

    const srcF = findF(drag.folderId);
    const dstF = findF(folderId);
    if (!srcF || !dstF) { onDragEnd(); return; }

    const origIdx = srcF.repos.findIndex(r => r.id === drag.repoId);
    if (origIdx === -1) { onDragEnd(); return; }

    const [repo] = srcF.repos.splice(origIdx, 1);

    // Find insert position from the drop line
    const line = listEl.querySelector('.gso-drop-line');
    let insertAt = dstF.repos.length;
    if (line) {
      let count = 0;
      for (const child of listEl.children) {
        if (child === line) break;
        if (child.classList.contains('gso-repo-item')) count++;
      }
      insertAt = count;
      line.remove();
    }
    if (drag.folderId === folderId && insertAt > origIdx) insertAt--;
    dstF.repos.splice(insertAt, 0, repo);

    schedSave();
    onDragEnd();
    render();
  }

  // ── Inline rename ────────────────────────────────────────────────────────────
  function inlineRename(el, current, onSave) {
    const inp = mkEl('input', 'gso-rename-inp');
    inp.value = current;
    el.textContent = '';
    el.appendChild(inp);
    inp.focus(); inp.select();
    let done = false;
    const commit = () => {
      if (done) return; done = true;
      const v = inp.value.trim();
      if (v) onSave(v); else render();
    };
    const abort = () => { if (done) return; done = true; render(); };
    inp.addEventListener('blur', commit);
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      if (e.key === 'Escape') { e.preventDefault(); abort(); }
    });
  }

  // ── Repo item ────────────────────────────────────────────────────────────────
  function buildRepo(repo, folder) {
    const item = mkEl('div', 'gso-repo-item');
    item.dataset.id = repo.id;
    item.draggable = true;

    const cur = getCurRepo();
    if (cur && cur.id === repo.id) item.classList.add('gso-active');

    // 6-dot drag grip
    const grip = mkEl('span', 'gso-grip');
    grip.innerHTML = '<svg width="10" height="14" viewBox="0 0 10 16" fill="currentColor">'
      + '<circle cx="3" cy="4" r="1.3"/><circle cx="7" cy="4" r="1.3"/>'
      + '<circle cx="3" cy="8" r="1.3"/><circle cx="7" cy="8" r="1.3"/>'
      + '<circle cx="3" cy="12" r="1.3"/><circle cx="7" cy="12" r="1.3"/></svg>';

    const owner = repo.id.split('/')[0];
    const ico = mkEl('span', 'gso-ico');
    const avatar = mkEl('img', 'gso-avatar');
    avatar.src = `https://github.com/${owner}.png?size=32`;
    avatar.alt = owner;
    avatar.width = 16;
    avatar.height = 16;
    ico.appendChild(avatar);

    const link = mkEl('a', 'gso-repo-link');
    link.href = repo.url;
    link.textContent = repo.name.includes('/') ? repo.name.split('/')[1] : repo.name;
    link.title = repo.name;
    link.addEventListener('click', e => { e.preventDefault(); location.href = repo.url; });

    // Delete button
    const del = mkEl('button', 'gso-ico-btn gso-del');
    del.title = 'Retirer du dossier';
    del.appendChild(svgPath(
      'M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z',
      12));
    del.addEventListener('click', e => {
      e.stopPropagation();
      folder.repos = folder.repos.filter(r => r.id !== repo.id);
      schedSave(); render();
    });

    // Drag events — only intercept cross-folder drags (for folder creation)
    item.addEventListener('dragstart', e => onDragStart(e, repo.id, folder.id, item));
    item.addEventListener('dragend', onDragEnd);
    item.addEventListener('dragover', e => onDragOverRepo(e, repo.id, folder.id, item));
    item.addEventListener('dragleave', () => item.classList.remove('gso-merge-over'));
    item.addEventListener('drop', e => onDropOnRepo(e, repo.id, folder.id, item));

    item.append(grip, ico, link, del);
    return item;
  }

  // ── Folder ───────────────────────────────────────────────────────────────────
  function buildFolder(folder, idx) {
    const wrap = mkEl('div', 'gso-folder');
    wrap.dataset.folderId = folder.id;

    const hdr = mkEl('div', 'gso-folder-hdr');

    const arrow = mkEl('span', 'gso-arrow' + (folder.collapsed ? '' : ' open'));
    arrow.appendChild(svgPath(
      'M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z',
      12));

    const folderIco = mkEl('span', 'gso-ico gso-folder-ico');
    folderIco.appendChild(svgPath(
      'M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25v-8.5A1.75 1.75 0 0 0 14.25 3H7.5a.25.25 0 0 1-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1Z',
      14));

    const nameEl = mkEl('span', 'gso-folder-name', folder.name);
    nameEl.title = 'Double-clic pour renommer';
    nameEl.addEventListener('dblclick', e => {
      e.stopPropagation();
      inlineRename(nameEl, folder.name, v => { folder.name = v; schedSave(); render(); });
    });

    const badge = mkEl('span', 'gso-badge', String(folder.repos.length));

    const menuBtn = mkEl('button', 'gso-ico-btn gso-menu-btn');
    menuBtn.title = 'Options';
    menuBtn.appendChild(svgPath(
      'M8 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM1.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm13 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z'));

    menuBtn.addEventListener('click', e => { e.stopPropagation(); showCtxMenu(menuBtn, folder, idx); });

    hdr.append(arrow, folderIco, nameEl, badge, menuBtn);
    hdr.addEventListener('click', () => {
      folder.collapsed = !folder.collapsed;
      schedSave(); render();
    });

    const list = mkEl('div', 'gso-folder-list' + (folder.collapsed ? ' collapsed' : ''));
    folder.repos.forEach(r => list.appendChild(buildRepo(r, folder)));
    if (!folder.repos.length) {
      list.appendChild(mkEl('div', 'gso-empty', 'Déposez un repo ici…'));
    }

    list.addEventListener('dragover', e => onDragOverList(e, folder.id, list));
    list.addEventListener('dragleave', e => onDragLeaveList(e, list));
    list.addEventListener('drop', e => onDropOnList(e, folder.id, list));

    wrap.append(hdr, list);
    return wrap;
  }

  // ── Context menu ─────────────────────────────────────────────────────────────
  function showCtxMenu(anchor, folder, idx) {
    document.getElementById('gso-ctx')?.remove();
    const menu = mkEl('div', 'gso-ctx');
    menu.id = 'gso-ctx';
    const r = anchor.getBoundingClientRect();
    Object.assign(menu.style, { position: 'fixed', top: r.bottom + 4 + 'px', left: r.left + 'px' });

    const items = [
      {
        label: 'Renommer', fn: () => {
          menu.remove();
          const el = document.querySelector(`[data-folder-id="${folder.id}"] .gso-folder-name`);
          if (el) inlineRename(el, folder.name, v => { folder.name = v; schedSave(); render(); });
        }
      },
      {
        label: '↑ Monter', disabled: idx === 0, fn: () => {
          menu.remove();
          [folders[idx - 1], folders[idx]] = [folders[idx], folders[idx - 1]];
          schedSave(); render();
        }
      },
      {
        label: '↓ Descendre', disabled: idx >= folders.length - 1, fn: () => {
          menu.remove();
          [folders[idx], folders[idx + 1]] = [folders[idx + 1], folders[idx]];
          schedSave(); render();
        }
      },
      {
        label: 'Supprimer', danger: true, fn: () => {
          menu.remove();
          if (folder.repos.length && !confirm(`Supprimer "${folder.name}" et ses ${folder.repos.length} repo(s) ?`)) return;
          folders = folders.filter(f => f.id !== folder.id);
          schedSave(); render();
        }
      },
    ];

    items.forEach(({ label, fn, disabled, danger }) => {
      const btn = mkEl('button',
        'gso-ctx-item' + (danger ? ' danger' : '') + (disabled ? ' disabled' : ''),
        label);
      if (!disabled) btn.addEventListener('click', fn);
      menu.appendChild(btn);
    });

    document.body.appendChild(menu);
    const close = e => {
      if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', close); }
    };
    setTimeout(() => document.addEventListener('click', close), 0);
  }

  // ── Add modal ────────────────────────────────────────────────────────────────
  function showAddModal(repo) {
    document.getElementById('gso-modal')?.remove();
    const modal = mkEl('div'); modal.id = 'gso-modal';
    const overlay = mkEl('div', 'gso-overlay');
    overlay.addEventListener('click', () => modal.remove());
    const box = mkEl('div', 'gso-modal-box');

    const title = mkEl('div', 'gso-modal-title');
    let manualInp = null;

    if (repo) {
      title.innerHTML = `Ajouter <strong>${repo.name.split('/')[1] || repo.name}</strong> dans…`;
      box.appendChild(title);
    } else {
      title.textContent = 'Ajouter un repo';
      const wrap = mkEl('div', 'gso-inp-wrap');
      const pfx = mkEl('span', 'gso-inp-pfx', 'github.com/');
      manualInp = mkEl('input', 'gso-inp');
      manualInp.placeholder = 'owner/repo';
      manualInp.type = 'text';
      wrap.append(pfx, manualInp);
      box.append(title, wrap);
    }

    const list = mkEl('div', 'gso-modal-list');
    const curFid = repo ? (repoOf(repo.id) || {}).id : null;

    folders.forEach(f => {
      const item = mkEl('div', 'gso-modal-item' + (f.id === curFid ? ' active' : ''));
      const check = mkEl('span', 'gso-modal-check', f.id === curFid ? '✓' : '');
      const name = mkEl('span', '', f.name);
      const cnt = mkEl('span', 'gso-badge', String(f.repos.length));
      item.append(check, name, cnt);
      item.addEventListener('click', () => {
        const tgt = repo || getManualRepo(manualInp);
        if (!tgt) return;
        if (f.id === curFid) { modal.remove(); return; }
        const sf = curFid ? findF(curFid) : null;
        if (sf) sf.repos = sf.repos.filter(r => r.id !== tgt.id);
        if (!f.repos.some(r => r.id === tgt.id))
          f.repos.push({ id: tgt.id, name: tgt.name, url: tgt.url, addedAt: Date.now() });
        schedSave(); render(); modal.remove();
      });
      list.appendChild(item);
    });
    box.appendChild(list);

    const nfRow = mkEl('div', 'gso-modal-nf');
    const nfInp = mkEl('input', 'gso-inp'); nfInp.placeholder = 'Nouveau dossier…';
    const nfBtn = mkEl('button', 'gso-btn-primary', 'Créer');
    nfBtn.addEventListener('click', () => {
      const name = nfInp.value.trim();
      if (!name) return;
      const tgt = repo || getManualRepo(manualInp);
      if (!tgt) return;
      const cf = curFid ? findF(curFid) : null;
      if (cf) cf.repos = cf.repos.filter(r => r.id !== tgt.id);
      folders.push({ id: uid(), name, collapsed: false, repos: [{ id: tgt.id, name: tgt.name, url: tgt.url, addedAt: Date.now() }] });
      schedSave(); render(); modal.remove();
    });
    nfRow.append(nfInp, nfBtn);
    box.appendChild(nfRow);

    const cancelBtn = mkEl('button', 'gso-btn-cancel', 'Annuler');
    cancelBtn.addEventListener('click', () => modal.remove());
    box.appendChild(cancelBtn);

    modal.append(overlay, box);
    document.body.appendChild(modal);
    (manualInp || nfInp).focus();
  }

  function getManualRepo(inp) {
    if (!inp) return null;
    const raw = inp.value.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\/$/, '');
    const m = raw.match(/^([^/]+\/[^/]+)/);
    if (!m) { inp.style.borderColor = 'var(--color-danger-fg)'; inp.focus(); return null; }
    return { id: m[1], name: m[1], url: 'https://github.com/' + m[1] };
  }

  // ── Build root section ────────────────────────────────────────────────────────
  function buildSection() {
    const root = mkEl('div'); root.id = 'gso-root';

    // Header
    const hdr = mkEl('div', 'gso-hdr');
    const left = mkEl('div', 'gso-hdr-left');

    const chevBtn = mkEl('button', 'gso-ico-btn gso-collapse-btn');
    chevBtn.title = 'Réduire';
    const chev = svgPath('M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z', 12);
    chev.classList.add('gso-chev');
    chev.style.transform = 'rotate(90deg)'; // start expanded
    chevBtn.appendChild(chev);

    const titleEl = mkEl('span', 'gso-hdr-title', 'Mes repos');
    left.append(chevBtn, titleEl);

    const addBtn = mkEl('button', 'gso-ico-btn gso-add-btn');
    addBtn.title = 'Ajouter un repo';
    addBtn.appendChild(svgPath('M7.75 2a.75.75 0 0 1 .75.75V7h4.25a.75.75 0 0 1 0 1.5H8.5v4.25a.75.75 0 0 1-1.5 0V8.5H2.75a.75.75 0 0 1 0-1.5H7V2.75A.75.75 0 0 1 7.75 2Z'));
    addBtn.addEventListener('click', () => showAddModal(getCurRepo()));
    hdr.append(left, addBtn);

    const body = mkEl('div', 'gso-body'); body.id = 'gso-body';

    const footer = mkEl('div', 'gso-footer');
    const nfBtn = mkEl('button', 'gso-btn-new-folder');
    const plusSvg = svgPath('M7.75 2a.75.75 0 0 1 .75.75V7h4.25a.75.75 0 0 1 0 1.5H8.5v4.25a.75.75 0 0 1-1.5 0V8.5H2.75a.75.75 0 0 1 0-1.5H7V2.75A.75.75 0 0 1 7.75 2Z', 12);
    nfBtn.append(plusSvg, document.createTextNode(' Nouveau dossier'));
    nfBtn.addEventListener('click', () => {
      const name = prompt('Nom du dossier :');
      if (!name || !name.trim()) return;
      folders.push({ id: uid(), name: name.trim(), collapsed: false, repos: [] });
      schedSave(); render();
    });
    footer.appendChild(nfBtn);

    // Collapse toggle
    let collapsed = false;
    chevBtn.addEventListener('click', e => {
      e.stopPropagation();
      collapsed = !collapsed;
      body.style.display = collapsed ? 'none' : '';
      footer.style.display = collapsed ? 'none' : '';
      chev.style.transform = collapsed ? '' : 'rotate(90deg)';
    });

    root.append(hdr, body, footer);
    return root;
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  function render() {
    const body = document.getElementById('gso-body');
    if (!body) return;
    body.innerHTML = '';
    folders.forEach((f, i) => body.appendChild(buildFolder(f, i)));
    const cur = getCurRepo();
    if (cur) {
      const el = document.querySelector(`.gso-repo-item[data-id="${CSS.escape(cur.id)}"]`);
      if (el) el.classList.add('gso-active');
    }
  }

  // ── Injection ─────────────────────────────────────────────────────────────────
  function inject(sidebar) {
    if (document.getElementById('gso-root')) return;
    sidebar.prepend(buildSection());
    render();
    waitForAndImportRepos();
  }

  function waitForSidebar() {
    const s = findGHSidebar();
    if (s) { inject(s); return; }
    const obs = new MutationObserver(() => {
      const s2 = findGHSidebar();
      if (s2) { obs.disconnect(); inject(s2); }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => obs.disconnect(), 15000);
  }

  function reinject() {
    const existing = document.getElementById('gso-root');
    if (existing) {
      if (!isDash()) existing.remove();
      else {
        // Re-hide native repos in case of turbo navigation
        const s = findGHSidebar();
        if (s) hideNativeRepos(s);
        render();
      }
    } else {
      waitForSidebar();
    }
  }

  // ── Events ────────────────────────────────────────────────────────────────────
  store.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.folders) return;
    folders = changes.folders.newValue || [];
    render();
  });

  if (runtime) {
    runtime.onMessage.addListener(msg => {
      if (msg.action === 'PREFERENCES_UPDATED') render();
    });
  }

  window.addEventListener('popstate', reinject);
  document.addEventListener('turbo:load', reinject);
  document.addEventListener('pjax:end', reinject);

  const titleEl = document.querySelector('title');
  if (titleEl) {
    new MutationObserver(() => {
      const cur = getCurRepo();
      document.querySelectorAll('.gso-repo-item.gso-active').forEach(el => el.classList.remove('gso-active'));
      if (cur) {
        const el = document.querySelector(`.gso-repo-item[data-id="${CSS.escape(cur.id)}"]`);
        if (el) el.classList.add('gso-active');
      }
    }).observe(titleEl, { childList: true });
  }

  // ── Init ──────────────────────────────────────────────────────────────────────
  (async () => {
    await loadData();
    waitForSidebar();
  })();
})();
