(function () {
  if (document.getElementById("gso-sidebar")) return;

  let folders = [];
  let preferences = { startCollapsed: false, filterByOrg: false };
  let dragState = { folderId: null, repoId: null, element: null };
  let dropIndicator = null;
  let saveTimer = null;

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  function getCurrentRepo() {
    const match = location.pathname.match(/^\/([^/]+\/[^/]+)/);
    if (!match) return null;
    const excluded = ["settings", "explore", "marketplace", "orgs", "notifications", "login", "signup", "about", "features", "enterprise", "pricing", "topics", "trending", "collections", "events", "sponsors", "readme"];
    const owner = match[1].split("/")[0];
    if (excluded.includes(owner)) return null;
    const parts = match[1].split("/");
    if (parts.length < 2 || !parts[1]) return null;
    return {
      id: match[1],
      name: match[1],
      url: "https://github.com/" + match[1]
    };
  }

  function debounce(fn, delay) {
    return function (...args) {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  async function loadData() {
    try {
      const result = await chrome.storage.local.get(["folders", "preferences"]);
      folders = result.folders || [{ id: "default", name: "Favoris", collapsed: false, repos: [] }];
      preferences = result.preferences || { startCollapsed: false, filterByOrg: false };
    } catch (e) {
      folders = [{ id: "default", name: "Favoris", collapsed: false, repos: [] }];
    }
  }

  const debouncedSave = debounce(async function () {
    try {
      await chrome.storage.local.set({ folders });
    } catch (e) {}
  }, 300);

  function saveData() {
    debouncedSave();
  }

  function getRepoFolder(repoId) {
    for (const folder of folders) {
      if (folder.repos.some(r => r.id === repoId)) return folder.id;
    }
    return null;
  }

  function findFolder(folderId) {
    return folders.find(f => f.id === folderId);
  }

  function createDropIndicator() {
    const el = document.createElement("div");
    el.className = "gso-drop-indicator";
    return el;
  }

  function clearDropIndicators() {
    document.querySelectorAll(".gso-drop-indicator").forEach(el => el.remove());
  }

  function handleDragStart(e, folderId, repoId) {
    dragState = { folderId, repoId, element: e.currentTarget };
    e.currentTarget.classList.add("gso-dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", repoId);
  }

  function handleDragEnd() {
    if (dragState.element) dragState.element.classList.remove("gso-dragging");
    clearDropIndicators();
    document.querySelectorAll(".gso-repo-list").forEach(el => el.classList.remove("gso-drag-over"));
    dragState = { folderId: null, repoId: null, element: null };
  }

  function handleDragOver(e, listEl) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    listEl.classList.add("gso-drag-over");
    clearDropIndicators();

    const repoItems = listEl.querySelectorAll(".gso-repo-item:not(.gso-dragging)");
    let inserted = false;
    for (const item of repoItems) {
      const rect = item.getBoundingClientRect();
      if (e.clientY < rect.top + rect.height / 2) {
        dropIndicator = createDropIndicator();
        item.parentNode.insertBefore(dropIndicator, item);
        inserted = true;
        break;
      }
    }
    if (!inserted) {
      dropIndicator = createDropIndicator();
      listEl.appendChild(dropIndicator);
    }
  }

  function handleDragLeave(e, listEl) {
    if (!listEl.contains(e.relatedTarget)) {
      listEl.classList.remove("gso-drag-over");
      clearDropIndicators();
    }
  }

  function handleDrop(e, targetFolderId, listEl) {
    e.preventDefault();
    listEl.classList.remove("gso-drag-over");
    if (!dragState.repoId) return;

    const sourceFolder = findFolder(dragState.folderId);
    const targetFolder = findFolder(targetFolderId);
    if (!sourceFolder || !targetFolder) { clearDropIndicators(); return; }

    const repoIdx = sourceFolder.repos.findIndex(r => r.id === dragState.repoId);
    if (repoIdx === -1) { clearDropIndicators(); return; }

    const [repo] = sourceFolder.repos.splice(repoIdx, 1);
    const indicator = listEl.querySelector(".gso-drop-indicator");
    let insertIdx = targetFolder.repos.length;

    if (indicator) {
      let count = 0;
      for (const child of listEl.children) {
        if (child === indicator) break;
        if (child.classList.contains("gso-repo-item")) count++;
      }
      insertIdx = count;
    }

    if (dragState.folderId === targetFolderId && insertIdx > repoIdx) insertIdx--;
    targetFolder.repos.splice(insertIdx, 0, repo);
    clearDropIndicators();
    saveData();
    rerenderAll();
  }

  function moveRepo(folderId, repoId, direction) {
    const folder = findFolder(folderId);
    if (!folder) return;
    const idx = folder.repos.findIndex(r => r.id === repoId);
    if (idx === -1) return;
    const newIdx = direction === "up" ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= folder.repos.length) return;
    [folder.repos[idx], folder.repos[newIdx]] = [folder.repos[newIdx], folder.repos[idx]];
    saveData();
    rerenderAll();
  }

  function moveFolder(folderId, direction) {
    const idx = folders.findIndex(f => f.id === folderId);
    if (idx === -1) return;
    const newIdx = direction === "up" ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= folders.length) return;
    [folders[idx], folders[newIdx]] = [folders[newIdx], folders[idx]];
    saveData();
    rerenderAll();
  }

  function deleteRepo(folderId, repoId) {
    const folder = findFolder(folderId);
    if (!folder) return;
    folder.repos = folder.repos.filter(r => r.id !== repoId);
    saveData();
    rerenderAll();
  }

  function deleteFolder(folderId) {
    folders = folders.filter(f => f.id !== folderId);
    saveData();
    rerenderAll();
  }

  function toggleFolder(folderId) {
    const folder = findFolder(folderId);
    if (!folder) return;
    folder.collapsed = !folder.collapsed;
    saveData();
    rerenderAll();
  }

  function startInlineRename(el, currentName, onSave) {
    const input = document.createElement("input");
    input.className = "gso-inline-input";
    input.value = currentName;
    el.textContent = "";
    el.appendChild(input);
    input.focus();
    input.select();

    let saved = false;

    function save() {
      if (saved) return;
      saved = true;
      const val = input.value.trim();
      if (val) onSave(val);
      else rerenderAll();
    }

    function cancel() {
      if (saved) return;
      saved = true;
      rerenderAll();
    }

    input.addEventListener("blur", save);
    input.addEventListener("keydown", e => {
      if (e.key === "Enter") { e.preventDefault(); save(); }
      if (e.key === "Escape") { e.preventDefault(); cancel(); }
    });
  }

  function showManualAddModal() {
    const existing = document.getElementById("gso-modal");
    if (existing) existing.remove();

    const modal = document.createElement("div");
    modal.id = "gso-modal";
    modal.setAttribute("role", "dialog");

    const overlay = document.createElement("div");
    overlay.className = "gso-modal-overlay";
    overlay.addEventListener("click", () => modal.remove());

    const box = document.createElement("div");
    box.className = "gso-modal-box";

    const title = document.createElement("div");
    title.className = "gso-modal-title";
    title.textContent = "Ajouter un repo";
    box.appendChild(title);

    const repoInputWrap = document.createElement("div");
    repoInputWrap.className = "gso-manual-input-wrap";

    const prefix = document.createElement("span");
    prefix.className = "gso-manual-prefix";
    prefix.textContent = "github.com/";

    const repoInput = document.createElement("input");
    repoInput.className = "gso-modal-input";
    repoInput.placeholder = "owner/repo";
    repoInput.type = "text";
    repoInput.style.flex = "1";

    repoInputWrap.append(prefix, repoInput);
    box.appendChild(repoInputWrap);

    const folderLabel = document.createElement("div");
    folderLabel.className = "gso-manual-label";
    folderLabel.textContent = "Dans le dossier :";
    box.appendChild(folderLabel);

    const folderSelect = document.createElement("select");
    folderSelect.className = "gso-manual-select";
    folders.forEach(f => {
      const opt = document.createElement("option");
      opt.value = f.id;
      opt.textContent = f.name;
      folderSelect.appendChild(opt);
    });
    box.appendChild(folderSelect);

    const confirmBtn = document.createElement("button");
    confirmBtn.className = "gso-modal-create-btn";
    confirmBtn.style.width = "100%";
    confirmBtn.style.marginTop = "10px";
    confirmBtn.textContent = "Ajouter";
    confirmBtn.addEventListener("click", () => {
      const raw = repoInput.value.trim().replace(/^https?:\/\/github\.com\//, "").replace(/\/$/, "");
      const match = raw.match(/^([^/]+\/[^/]+)/);
      if (!match) {
        repoInput.style.borderColor = "var(--color-danger-fg, #cf222e)";
        repoInput.focus();
        return;
      }
      const repoId = match[1];
      const folder = findFolder(folderSelect.value) || folders[0];
      if (!folder) { modal.remove(); return; }
      if (!folder.repos.some(r => r.id === repoId)) {
        folder.repos.push({ id: repoId, name: repoId, url: "https://github.com/" + repoId, addedAt: Date.now() });
      }
      saveData();
      rerenderAll();
      modal.remove();
    });
    box.appendChild(confirmBtn);

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "gso-modal-cancel";
    cancelBtn.style.marginTop = "6px";
    cancelBtn.textContent = "Annuler";
    cancelBtn.addEventListener("click", () => modal.remove());
    box.appendChild(cancelBtn);

    modal.append(overlay, box);
    document.body.appendChild(modal);
    repoInput.focus();
  }

  function showAddModal(repo) {
    const existing = document.getElementById("gso-modal");
    if (existing) existing.remove();

    const modal = document.createElement("div");
    modal.id = "gso-modal";
    modal.setAttribute("role", "dialog");

    const overlay = document.createElement("div");
    overlay.className = "gso-modal-overlay";
    overlay.addEventListener("click", () => modal.remove());

    const box = document.createElement("div");
    box.className = "gso-modal-box";

    const title = document.createElement("div");
    title.className = "gso-modal-title";
    const strong = document.createElement("strong");
    strong.textContent = repo.name;
    title.append("Ajouter ", strong, " à...");
    box.appendChild(title);

    const list = document.createElement("div");
    list.className = "gso-modal-list";
    const currentFolderId = getRepoFolder(repo.id);

    folders.forEach(folder => {
      const item = document.createElement("div");
      item.className = "gso-modal-folder-item";
      if (folder.id === currentFolderId) item.classList.add("gso-modal-folder-active");

      const check = document.createElement("span");
      check.className = "gso-modal-check";
      check.textContent = folder.id === currentFolderId ? "✓" : "";

      const name = document.createElement("span");
      name.textContent = folder.name;

      const count = document.createElement("span");
      count.className = "gso-modal-count";
      count.textContent = folder.repos.length;

      item.append(check, name, count);
      item.addEventListener("click", () => {
        if (folder.id === currentFolderId) { modal.remove(); return; }
        if (currentFolderId) {
          const src = findFolder(currentFolderId);
          if (src) src.repos = src.repos.filter(r => r.id !== repo.id);
        }
        if (!folder.repos.some(r => r.id === repo.id)) {
          folder.repos.push({ id: repo.id, name: repo.name, url: repo.url, addedAt: Date.now() });
        }
        saveData();
        rerenderAll();
        modal.remove();
      });

      list.appendChild(item);
    });

    box.appendChild(list);

    const newFolderRow = document.createElement("div");
    newFolderRow.className = "gso-modal-new-folder";

    const newInput = document.createElement("input");
    newInput.className = "gso-modal-input";
    newInput.placeholder = "Nouveau dossier...";
    newInput.type = "text";

    const newBtn = document.createElement("button");
    newBtn.className = "gso-modal-create-btn";
    newBtn.textContent = "Créer";
    newBtn.addEventListener("click", () => {
      const name = newInput.value.trim();
      if (!name) return;
      if (currentFolderId) {
        const src = findFolder(currentFolderId);
        if (src) src.repos = src.repos.filter(r => r.id !== repo.id);
      }
      const newFolder = {
        id: generateId(), name, collapsed: false,
        repos: [{ id: repo.id, name: repo.name, url: repo.url, addedAt: Date.now() }]
      };
      folders.push(newFolder);
      saveData();
      rerenderAll();
      modal.remove();
    });

    newFolderRow.append(newInput, newBtn);
    box.appendChild(newFolderRow);

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "gso-modal-cancel";
    cancelBtn.textContent = "Annuler";
    cancelBtn.addEventListener("click", () => modal.remove());
    box.appendChild(cancelBtn);

    modal.append(overlay, box);
    document.body.appendChild(modal);
    newInput.focus();
  }

  function buildRepoEl(repo, folder) {
    const el = document.createElement("div");
    el.className = "gso-repo-item";
    el.dataset.repoId = repo.id;
    el.draggable = true;

    const currentRepo = getCurrentRepo();
    if (currentRepo && currentRepo.id === repo.id) el.classList.add("gso-repo-active");

    const grip = document.createElement("span");
    grip.className = "gso-grip";
    grip.textContent = "⠿";
    grip.title = "Drag pour réordonner";

    const link = document.createElement("a");
    link.href = repo.url;
    link.className = "gso-repo-link";
    link.title = repo.name;
    link.textContent = repo.name;
    link.addEventListener("click", e => {
      e.preventDefault();
      window.location.href = repo.url;
    });

    const actions = document.createElement("div");
    actions.className = "gso-repo-actions";

    const upBtn = document.createElement("button");
    upBtn.className = "gso-btn-icon";
    upBtn.title = "Monter";
    upBtn.textContent = "↑";
    upBtn.addEventListener("click", e => { e.stopPropagation(); moveRepo(folder.id, repo.id, "up"); });

    const downBtn = document.createElement("button");
    downBtn.className = "gso-btn-icon";
    downBtn.title = "Descendre";
    downBtn.textContent = "↓";
    downBtn.addEventListener("click", e => { e.stopPropagation(); moveRepo(folder.id, repo.id, "down"); });

    const delBtn = document.createElement("button");
    delBtn.className = "gso-btn-icon gso-btn-danger";
    delBtn.title = "Supprimer";
    delBtn.textContent = "✕";
    delBtn.addEventListener("click", e => {
      e.stopPropagation();
      el.classList.add("gso-fade-out");
      el.addEventListener("animationend", () => deleteRepo(folder.id, repo.id), { once: true });
    });

    actions.append(upBtn, downBtn, delBtn);

    el.addEventListener("dragstart", e => handleDragStart(e, folder.id, repo.id));
    el.addEventListener("dragend", handleDragEnd);

    el.append(grip, link, actions);
    return el;
  }

  function buildFolderEl(folder, idx) {
    const el = document.createElement("div");
    el.className = "gso-folder";
    el.dataset.folderId = folder.id;

    const header = document.createElement("div");
    header.className = "gso-folder-header";

    const arrow = document.createElement("span");
    arrow.className = "gso-folder-arrow" + (folder.collapsed ? "" : " gso-arrow-open");
    arrow.textContent = "▶";

    const nameEl = document.createElement("span");
    nameEl.className = "gso-folder-name";
    nameEl.textContent = folder.name;
    nameEl.title = "Double-clic pour renommer";
    nameEl.addEventListener("dblclick", e => {
      e.stopPropagation();
      startInlineRename(nameEl, folder.name, newName => {
        folder.name = newName;
        saveData();
        rerenderAll();
      });
    });

    const badge = document.createElement("span");
    badge.className = "gso-folder-badge";
    badge.textContent = folder.repos.length;

    const menuBtn = document.createElement("button");
    menuBtn.className = "gso-btn-icon gso-folder-menu-btn";
    menuBtn.title = "Options";
    menuBtn.textContent = "⋮";
    menuBtn.addEventListener("click", e => {
      e.stopPropagation();
      showFolderMenu(menuBtn, folder, idx);
    });

    header.append(arrow, nameEl, badge, menuBtn);
    header.addEventListener("click", () => toggleFolder(folder.id));

    const list = document.createElement("div");
    list.className = "gso-repo-list" + (folder.collapsed ? " gso-hidden" : "");
    list.dataset.folderId = folder.id;

    folder.repos.forEach(repo => list.appendChild(buildRepoEl(repo, folder)));

    if (folder.repos.length === 0) {
      const empty = document.createElement("div");
      empty.className = "gso-empty-folder";
      empty.textContent = "Aucun repo";
      list.appendChild(empty);
    }

    list.addEventListener("dragover", e => handleDragOver(e, list));
    list.addEventListener("dragleave", e => handleDragLeave(e, list));
    list.addEventListener("drop", e => handleDrop(e, folder.id, list));

    el.append(header, list);
    return el;
  }

  function showFolderMenu(anchor, folder, idx) {
    const existing = document.getElementById("gso-folder-menu");
    if (existing) existing.remove();

    const menu = document.createElement("div");
    menu.id = "gso-folder-menu";
    menu.className = "gso-context-menu";

    const anchorRect = anchor.getBoundingClientRect();
    menu.style.top = (anchorRect.bottom + 4) + "px";
    menu.style.left = anchorRect.left + "px";

    const items = [
      {
        label: "Renommer",
        action: () => {
          menu.remove();
          const nameEl = document.querySelector(`[data-folder-id="${folder.id}"] .gso-folder-name`);
          if (nameEl) {
            startInlineRename(nameEl, folder.name, newName => {
              folder.name = newName;
              saveData();
              rerenderAll();
            });
          }
        }
      },
      {
        label: "↑ Monter",
        action: () => { menu.remove(); moveFolder(folder.id, "up"); },
        disabled: idx === 0
      },
      {
        label: "↓ Descendre",
        action: () => { menu.remove(); moveFolder(folder.id, "down"); },
        disabled: idx === folders.length - 1
      },
      {
        label: "Supprimer",
        action: () => {
          menu.remove();
          if (folder.repos.length > 0 && !confirm(`Supprimer "${folder.name}" et ses ${folder.repos.length} repo(s) ?`)) return;
          deleteFolder(folder.id);
        },
        danger: true
      }
    ];

    items.forEach(item => {
      const btn = document.createElement("button");
      btn.className = "gso-context-menu-item" + (item.danger ? " gso-danger" : "") + (item.disabled ? " gso-disabled" : "");
      btn.textContent = item.label;
      if (!item.disabled) btn.addEventListener("click", item.action);
      menu.appendChild(btn);
    });

    document.body.appendChild(menu);

    function closeMenu(e) {
      if (!menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener("click", closeMenu);
      }
    }
    setTimeout(() => document.addEventListener("click", closeMenu), 0);
  }

  function updateActiveRepo() {
    document.querySelectorAll(".gso-repo-item").forEach(el => el.classList.remove("gso-repo-active"));
    const currentRepo = getCurrentRepo();
    if (currentRepo) {
      const active = document.querySelector(`.gso-repo-item[data-repo-id="${CSS.escape(currentRepo.id)}"]`);
      if (active) active.classList.add("gso-repo-active");
    }
  }

  function rerenderAll() {
    const sidebar = document.getElementById("gso-sidebar");
    if (!sidebar) return;
    const body = sidebar.querySelector(".gso-body");
    if (!body) return;
    body.innerHTML = "";
    folders.forEach((folder, idx) => body.appendChild(buildFolderEl(folder, idx)));
    updateActiveRepo();
  }

  function findGitHubSidebar() {
    const selectors = [
      '[data-target="feed.dashboardSidebar"]',
      'aside.dashboard-sidebar',
      '[class*="dashboard-sidebar"]',
      '.Layout-sidebar aside',
      '.Layout-sidebar',
      'aside[aria-label]',
      'aside',
    ];
    for (const sel of selectors) {
      const candidates = document.querySelectorAll(sel);
      for (const el of candidates) {
        if (el && !el.closest("#gso-sidebar") && el.offsetParent !== null) return el;
      }
    }
    return null;
  }

  function buildGSOSection() {
    const section = document.createElement("div");
    section.id = "gso-sidebar";
    if (preferences.startCollapsed) section.classList.add("gso-sidebar-collapsed");

    const header = document.createElement("div");
    header.className = "gso-header";

    const headerLeft = document.createElement("div");
    headerLeft.className = "gso-header-left";

    const collapseBtn = document.createElement("button");
    collapseBtn.className = "gso-collapse-btn";
    collapseBtn.title = "Réduire/Agrandir";
    collapseBtn.textContent = preferences.startCollapsed ? "▸" : "▾";
    collapseBtn.addEventListener("click", e => {
      e.stopPropagation();
      section.classList.toggle("gso-sidebar-collapsed");
      collapseBtn.textContent = section.classList.contains("gso-sidebar-collapsed") ? "▸" : "▾";
    });

    const title = document.createElement("span");
    title.className = "gso-title";
    title.textContent = "My Repos";

    headerLeft.append(collapseBtn, title);

    const addBtn = document.createElement("button");
    addBtn.className = "gso-btn-add";
    addBtn.title = "Ajouter le repo courant";
    addBtn.textContent = "+";
    addBtn.addEventListener("click", () => {
      const repo = getCurrentRepo();
      if (!repo) {
        showManualAddModal();
        return;
      }
      showAddModal(repo);
    });

    header.append(headerLeft, addBtn);

    const body = document.createElement("div");
    body.className = "gso-body";
    folders.forEach((folder, idx) => body.appendChild(buildFolderEl(folder, idx)));

    const footer = document.createElement("div");
    footer.className = "gso-footer";

    const newFolderBtn = document.createElement("button");
    newFolderBtn.className = "gso-btn-new-folder";
    newFolderBtn.textContent = "+ Nouveau dossier";
    newFolderBtn.addEventListener("click", () => {
      const name = prompt("Nom du dossier :");
      if (!name || !name.trim()) return;
      folders.push({ id: generateId(), name: name.trim(), collapsed: false, repos: [] });
      saveData();
      rerenderAll();
    });

    footer.appendChild(newFolderBtn);
    section.append(header, body, footer);
    return section;
  }

  function injectIntoSidebar(ghSidebar) {
    if (document.getElementById("gso-sidebar")) return;

    const section = buildGSOSection();

    const firstChild = ghSidebar.firstElementChild;
    if (firstChild) {
      ghSidebar.insertBefore(section, firstChild);
    } else {
      ghSidebar.appendChild(section);
    }

    updateActiveRepo();
  }

  function waitForSidebar() {
    const sidebar = findGitHubSidebar();
    if (sidebar) {
      injectIntoSidebar(sidebar);
      return;
    }

    const observer = new MutationObserver(() => {
      const s = findGitHubSidebar();
      if (s) {
        observer.disconnect();
        injectIntoSidebar(s);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 15000);
  }

  function reinjectIfNeeded() {
    if (document.getElementById("gso-sidebar")) {
      updateActiveRepo();
    } else {
      waitForSidebar();
    }
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.folders) {
      folders = changes.folders.newValue || [];
      rerenderAll();
    }
    if (changes.preferences) {
      preferences = changes.preferences.newValue || preferences;
    }
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "PREFERENCES_UPDATED") {
      chrome.storage.local.get(["preferences"]).then(result => {
        preferences = result.preferences || preferences;
      });
    }
  });

  const titleEl = document.querySelector("title");
  if (titleEl) {
    const titleObserver = new MutationObserver(() => updateActiveRepo());
    titleObserver.observe(titleEl, { childList: true });
  }

  window.addEventListener("popstate", reinjectIfNeeded);
  document.addEventListener("turbo:load", reinjectIfNeeded);
  document.addEventListener("pjax:end", reinjectIfNeeded);

  async function init() {
    await loadData();
    waitForSidebar();
  }

  init();
})();
