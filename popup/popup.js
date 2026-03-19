(async function () {
  let folders = [];
  let preferences = { position: "right", startCollapsed: false, filterByOrg: false };

  function showToast(msg, type = "success") {
    const toast = document.getElementById("popup-toast");
    toast.textContent = msg;
    toast.className = "popup-toast popup-toast-visible popup-toast-" + type;
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      toast.className = "popup-toast";
    }, 2500);
  }

  async function loadData() {
    try {
      const result = await chrome.storage.local.get(["folders", "preferences"]);
      folders = result.folders || [];
      preferences = result.preferences || { position: "right", startCollapsed: false, filterByOrg: false };
    } catch (e) {
      console.error("[GSO popup] loadData:", e);
    }
  }

  async function savePreferences() {
    try {
      await chrome.storage.local.set({ preferences });
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.id) {
        chrome.tabs.sendMessage(tab.id, { action: "PREFERENCES_UPDATED" }).catch(() => {});
      }
    } catch (e) {
      console.error("[GSO popup] savePreferences:", e);
    }
  }

  function updateStats() {
    const totalRepos = folders.reduce((sum, f) => sum + f.repos.length, 0);
    document.getElementById("stat-repos").textContent = totalRepos;
    document.getElementById("stat-folders").textContent = folders.length;
  }

  function applyPreferences() {
    const posGroup = document.getElementById("toggle-position");
    posGroup.querySelectorAll(".toggle-option").forEach(btn => {
      btn.classList.toggle("toggle-option-active", btn.dataset.value === preferences.position);
    });
    document.getElementById("pref-start-collapsed").checked = preferences.startCollapsed;
    document.getElementById("pref-filter-org").checked = preferences.filterByOrg;
  }

  function bindPreferences() {
    const posGroup = document.getElementById("toggle-position");
    posGroup.querySelectorAll(".toggle-option").forEach(btn => {
      btn.addEventListener("click", async () => {
        preferences.position = btn.dataset.value;
        applyPreferences();
        await savePreferences();
      });
    });

    document.getElementById("pref-start-collapsed").addEventListener("change", async e => {
      preferences.startCollapsed = e.target.checked;
      await savePreferences();
    });

    document.getElementById("pref-filter-org").addEventListener("change", async e => {
      preferences.filterByOrg = e.target.checked;
      await savePreferences();
    });
  }

  function exportData() {
    const payload = JSON.stringify({ folders, exportedAt: Date.now() }, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "github-sidebar-organizer-export.json";
    a.click();
    URL.revokeObjectURL(url);
    showToast("Export téléchargé !");
  }

  function validateImport(data) {
    if (!data || typeof data !== "object") return false;
    if (!Array.isArray(data.folders)) return false;
    for (const folder of data.folders) {
      if (!folder.id || !folder.name || !Array.isArray(folder.repos)) return false;
      for (const repo of folder.repos) {
        if (!repo.id || !repo.name || !repo.url) return false;
      }
    }
    return true;
  }

  async function importData(file) {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!validateImport(data)) {
        showToast("Fichier JSON invalide", "error");
        return;
      }
      const merge = confirm("Fusionner avec les données existantes ?\n\nOK = Fusionner\nAnnuler = Remplacer");
      if (merge) {
        const existingIds = new Set(folders.map(f => f.id));
        for (const folder of data.folders) {
          if (existingIds.has(folder.id)) {
            const existing = folders.find(f => f.id === folder.id);
            const existingRepoIds = new Set(existing.repos.map(r => r.id));
            for (const repo of folder.repos) {
              if (!existingRepoIds.has(repo.id)) existing.repos.push(repo);
            }
          } else {
            folders.push(folder);
          }
        }
      } else {
        folders = data.folders;
      }
      await chrome.storage.local.set({ folders });
      updateStats();
      showToast("Import réussi !");
    } catch (e) {
      showToast("Erreur lors de l'import", "error");
      console.error("[GSO popup] import error:", e);
    }
  }

  async function clearAll() {
    if (!confirm("Supprimer tous les dossiers et repos ? Cette action est irréversible.")) return;
    folders = [{ id: "default", name: "Favoris", collapsed: false, repos: [] }];
    await chrome.storage.local.set({ folders });
    updateStats();
    showToast("Données effacées.");
  }

  await loadData();
  updateStats();
  applyPreferences();
  bindPreferences();

  document.getElementById("btn-export").addEventListener("click", exportData);

  document.getElementById("btn-import").addEventListener("click", () => {
    document.getElementById("import-file").click();
  });

  document.getElementById("import-file").addEventListener("change", e => {
    const file = e.target.files[0];
    if (file) importData(file);
    e.target.value = "";
  });

  document.getElementById("btn-clear").addEventListener("click", clearAll);
})();
