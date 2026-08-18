/* MHN Sales — Board logic: columns, cards, drag & drop, totals, persistence */

const STAGES = [
  { id: "prospects", label: "Prospects" },
  { id: "interested", label: "Interested" },
  { id: "committed", label: "Committed" },
  { id: "paid", label: "Paid" },
  { id: "failed", label: "Failed" },
];

const FILTER_FIELDS = [
  { key: "owner", label: "Owner" },
  { key: "industry", label: "Industry" },
  { key: "tool", label: "Tool" },
];

const INCOMPLETE_FILTER = "__incomplete__";

const STORAGE_KEY = "mhn-sales-deals";
const DEFAULT_VALUE = 10000;
const MS_DAY = 86400000;
const PIPELINE_ROW_HEIGHT = 56;
const PIPELINE_BAR_HEIGHT = 36;
const PIPELINE_BAR_TOP = (PIPELINE_ROW_HEIGHT - PIPELINE_BAR_HEIGHT) / 2;
/** Matches `.pipeline-row-divider` left/right inset so cut-off bars align with the gray lines. */
const PIPELINE_EDGE_INSET = 16;
const TASKS_PIPELINE_ROW_HEIGHT = Math.round(PIPELINE_ROW_HEIGHT * 0.75); // 42
const TASKS_PIPELINE_BAR_HEIGHT = Math.round(PIPELINE_BAR_HEIGHT * 0.75); // 27
const TASKS_PIPELINE_BAR_TOP = (TASKS_PIPELINE_ROW_HEIGHT - TASKS_PIPELINE_BAR_HEIGHT) / 2;

let deals = [];
let currentUser = null; // { name: string }
let editingId = null;   // deal being edited in the modal (null = creating)
let modalReadOnly = false; // when true the modal shows a deal but blocks edits
let createStage = "prospects"; // stage a new deal is created into
let pendingCommitDeal = null; // deal awaiting implementation days before moving to Committed
let openFilterKey = null;
let activeTab = "board";
let modalNotes = [];
let modalTasks = [];
let modalPanel = "details";
let syncingFromRemote = false;
let appStarted = false;
let showCompletedTasks = false;
let tasksViewMode = "list"; // "list" | "pipeline"
const tasksCalendarState = {
  monthStart: null,
  selectedDate: null,
};
const tasksPipelineState = {
  periodMonths: 1,
  anchorDate: null, // window is anchored on this day (defaults to today)
};
const TASKS_PIPELINE_LOOKBACK_DAYS = 7;
const TASKS_PIPELINE_LABEL_MAX = 20;

const pipelineState = {
  periodMonths: 4,
  periodStart: startOfMonth(new Date()),
};

const filters = {
  owner: new Set(),
  industry: new Set(),
  tool: new Set(),
};

let searchQuery = "";
let searchRawValue = "";

const boardEl = document.getElementById("board");
const filtersEl = document.getElementById("filters");
const clearFiltersBtn = document.getElementById("clearFiltersBtn");
const pipelineFiltersEl = document.getElementById("pipelineFilters");
const pipelineClearFiltersBtn = document.getElementById("pipelineClearFiltersBtn");
const pipelinePeriodLabel = document.getElementById("pipelinePeriodLabel");
const pipelinePeriodLength = document.getElementById("pipelinePeriodLength");
const pipelineAxisEl = document.getElementById("pipelineAxis");
const pipelineRowsEl = document.getElementById("pipelineRows");
const overlay = document.getElementById("modalOverlay");
const form = document.getElementById("dealForm");
const modalTitle = document.getElementById("modalTitle");
const saveBtn = document.getElementById("saveBtn");
const deleteBtn = document.getElementById("dismissDealBtn");
const dismissOverlay = document.getElementById("dismissOverlay");
const dismissLead = document.getElementById("dismissLead");
const historyListEl = document.getElementById("historyList");
const historySearchInput = document.getElementById("historySearchInput");
let historySearchQuery = "";

const pauseOverlay = document.getElementById("pauseOverlay");
const pauseTitle = document.getElementById("pauseTitle");
const pauseLead = document.getElementById("pauseLead");
const pauseConfirmBtn = document.getElementById("pauseConfirmBtn");
let pendingPauseDealId = null;
let pauseConfirmAction = "pause"; // "pause" | "unpause"
let showPausedProspectsOnly = false;

const pendingDraftOverlay = document.getElementById("pendingDraftOverlay");
const pendingDraftTitle = document.getElementById("pendingDraftTitle");
const pendingDraftLead = document.getElementById("pendingDraftLead");
const pendingDraftConfirmBtn = document.getElementById("pendingDraftConfirmBtn");
let pendingDraftKind = null; // "note" | "task"

const commitOverlay = document.getElementById("commitOverlay");
const commitForm = document.getElementById("commitForm");
const commitDealName = document.getElementById("commitDealName");
const implementationFields = document.getElementById("implementationFields");
const activityNotesEl = document.getElementById("activityNotes");
const newNoteInput = document.getElementById("newNoteInput");
const modalPanelDetails = document.getElementById("modalPanelDetails");
const modalPanelActivity = document.getElementById("modalPanelActivity");
const modalPanelTasks = document.getElementById("modalPanelTasks");
const dealTasksListEl = document.getElementById("dealTasksList");
const newTaskNameInput = document.getElementById("newTaskNameInput");
const newTaskDueInput = document.getElementById("newTaskDueInput");
const tasksFiltersEl = document.getElementById("tasksFilters");
const tasksClearFiltersBtn = document.getElementById("tasksClearFiltersBtn");
const tasksListEl = document.getElementById("tasksList");
const tasksCalendarEl = document.getElementById("tasksCalendar");
const tasksListTitle = document.getElementById("tasksListTitle");
const tasksListLead = document.getElementById("tasksListLead");
const tasksShowCompletedBtn = document.getElementById("tasksShowCompletedBtn");
const tasksSearchInput = document.getElementById("tasksSearchInput");
const tasksSearchClearBtn = document.getElementById("tasksSearchClearBtn");
const tasksSearchBubble = document.getElementById("tasksSearchBubble");
const pipelineSearchInput = document.getElementById("pipelineSearchInput");
const pipelineSearchClearBtn = document.getElementById("pipelineSearchClearBtn");
const pipelineSearchBubble = document.getElementById("pipelineSearchBubble");
const dashboardFiltersEl = document.getElementById("dashboardFilters");
const dashboardClearFiltersBtn = document.getElementById("dashboardClearFiltersBtn");
const dashboardBodyEl = document.getElementById("dashboardBody");
const dashboardSearchInput = document.getElementById("dashboardSearchInput");
const dashboardSearchClearBtn = document.getElementById("dashboardSearchClearBtn");
const dashboardSearchBubble = document.getElementById("dashboardSearchBubble");
const searchSuggestionState = new Map();
const tasksListLayout = document.getElementById("tasksListLayout");
const tasksPipelineLayout = document.getElementById("tasksPipelineLayout");
const tasksPipelinePeriod = document.getElementById("tasksPipelinePeriod");
const tasksPipelinePeriodLabel = document.getElementById("tasksPipelinePeriodLabel");
const tasksPipelinePeriodLength = document.getElementById("tasksPipelinePeriodLength");
const tasksPipelineAxisEl = document.getElementById("tasksPipelineAxis");
const tasksPipelineRowsEl = document.getElementById("tasksPipelineRows");
const modalEl = overlay.querySelector(".modal");
const cancelBtn = document.getElementById("cancelBtn");
const activityComposer = modalPanelActivity.querySelector(".activity-composer");
const dealTasksComposer = modalPanelTasks.querySelector(".deal-tasks-composer");
const fieldSuggestionState = new Map();

const fmtEuro = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

/* ------------------------------ Auth / session ----------------- */

const loginScreen = document.getElementById("loginScreen");
const loginForm = document.getElementById("loginForm");
const signupForm = document.getElementById("signupForm");
const loginEmailInput = document.getElementById("loginEmailInput");
const loginPasswordInput = document.getElementById("loginPasswordInput");
const signupNameInput = document.getElementById("signupNameInput");
const signupEmailInput = document.getElementById("signupEmailInput");
const signupPasswordInput = document.getElementById("signupPasswordInput");
const signupConfirmInput = document.getElementById("signupConfirmInput");
const loginLead = document.getElementById("loginLead");
const loginAuthError = document.getElementById("loginAuthError");
const signupAuthError = document.getElementById("signupAuthError");
const signupAuthSuccess = document.getElementById("signupAuthSuccess");
const loginSubmitBtn = document.getElementById("loginSubmitBtn");
const appShell = document.getElementById("appShell");
const userChip = document.getElementById("userChip");
const userChipName = document.getElementById("userChipName");
const logoutBtn = document.getElementById("logoutBtn");
const editNameBtn = document.getElementById("editNameBtn");
const editNameMenuBtn = document.getElementById("editNameMenuBtn");
const nameOverlay = document.getElementById("nameOverlay");
const nameForm = document.getElementById("nameForm");
const nameInput = document.getElementById("nameInput");
const nameTitle = document.getElementById("nameTitle");
const nameLead = document.getElementById("nameLead");
const nameCloseBtn = document.getElementById("nameCloseBtn");
const nameCancelBtn = document.getElementById("nameCancelBtn");
const nameSaveBtn = document.getElementById("nameSaveBtn");
const nameAuthError = document.getElementById("nameAuthError");
let namePromptRequired = false;
let nameBusy = false;

let authMode = "login"; // login only — self-signup is disabled
let authBusy = false;

function getCurrentUserName() {
  return currentUser?.name || "";
}

function setAuthMessage({ error = "", success = "" } = {}) {
  loginAuthError.classList.remove("is-info");
  loginAuthError.textContent = error;
  loginAuthError.hidden = !error || authMode !== "login";
  signupAuthError.textContent = error;
  signupAuthError.hidden = !error || authMode !== "signup";
  signupAuthSuccess.textContent = success;
  signupAuthSuccess.hidden = !success;
}

function setAuthBusy(busy) {
  authBusy = busy;
  loginSubmitBtn.disabled = busy;
  loginSubmitBtn.textContent = busy ? "Logging in…" : "Log in";
}

function setAuthMode() {
  authMode = "login";

  loginForm.hidden = false;
  signupForm.hidden = true;

  for (const el of loginForm.elements) el.disabled = false;
  for (const el of signupForm.elements) el.disabled = true;

  loginLead.textContent = "Log in with the email and password provided for your account.";

  setAuthMessage();
  setAuthBusy(false);

  requestAnimationFrame(() => {
    loginEmailInput.focus();
  });
}

function showLoginScreen() {
  document.body.classList.add("is-logged-out");
  appShell.hidden = true;
  loginScreen.hidden = false;
  userChip.hidden = true;
  setAuthBusy(false);
  setAuthMode(authMode);
}

function showAppShell() {
  document.body.classList.remove("is-logged-out");
  loginScreen.hidden = true;
  appShell.hidden = false;
  updateUserChip();
}

function updateUserChip() {
  const name = getCurrentUserName();
  const navUserName = document.getElementById("navUserName");
  if (!name) {
    userChip.hidden = true;
    if (navUserName) {
      navUserName.hidden = true;
      navUserName.textContent = "";
      navUserName.removeAttribute("title");
    }
    return;
  }
  const title = currentUser?.email ? `${name} (${currentUser.email})` : name;
  userChipName.textContent = name;
  userChipName.title = title;
  userChip.hidden = false;
  if (navUserName) {
    navUserName.textContent = name;
    navUserName.title = title;
    navUserName.hidden = false;
  }
}

function applyAuthUser(user) {
  currentUser = user
    ? {
        id: user.id,
        email: user.email || "",
        name: user.name || "",
        needsName: Boolean(user.needsName),
      }
    : null;
  if (currentUser) {
    showAppShell();
  } else {
    namePromptRequired = false;
    if (nameOverlay) nameOverlay.hidden = true;
    showLoginScreen();
  }
}

function setNameMessage(error = "") {
  if (!nameAuthError) return;
  nameAuthError.textContent = error;
  nameAuthError.hidden = !error;
}

function openNameModal({ required = false } = {}) {
  if (!nameOverlay || !nameForm) return;
  namePromptRequired = required;
  setNameMessage();
  nameTitle.textContent = required ? "What’s your name?" : "Edit name";
  nameLead.textContent = required
    ? "This name appears on the board and is used as Owner on deals you create."
    : "This name appears on the board and is used as Owner on deals you create.";
  nameInput.value = currentUser?.needsName ? "" : (currentUser?.name || "");
  nameCloseBtn.hidden = required;
  nameCancelBtn.hidden = required;
  nameOverlay.hidden = false;
  requestAnimationFrame(() => nameInput.focus());
}

function closeNameModal() {
  if (namePromptRequired) return;
  if (nameOverlay) nameOverlay.hidden = true;
  setNameMessage();
  nameBusy = false;
}

function maybePromptProfileName() {
  if (currentUser?.needsName) openNameModal({ required: true });
}

async function handleNameSubmit(e) {
  e.preventDefault();
  if (nameBusy) return;
  const auth = window.MHN_AUTH;
  if (!auth?.updateProfileName) {
    setNameMessage("Could not save your name. Try again.");
    return;
  }

  const nextName = nameInput.value.trim();
  if (!nextName) {
    setNameMessage("Please enter your name.");
    nameInput.focus();
    return;
  }

  nameBusy = true;
  nameSaveBtn.disabled = true;
  nameSaveBtn.textContent = "Saving…";
  setNameMessage();

  try {
    const previousName = currentUser?.name || "";
    const result = await auth.updateProfileName(nextName);
    if (!result.ok) {
      setNameMessage(result.error || "Could not save your name.");
      return;
    }
    applyAuthUser(result.user);
    if (form?.elements?.owner && form.elements.owner.value === previousName) {
      form.elements.owner.value = result.user?.name || nextName;
    }
    namePromptRequired = false;
    nameOverlay.hidden = true;
  } catch (err) {
    console.error(err);
    setNameMessage("Could not save your name. Try again.");
  } finally {
    nameBusy = false;
    nameSaveBtn.disabled = false;
    nameSaveBtn.textContent = "Save name";
  }
}

/** Ask Chromium/Safari (where supported) to save credentials after SPA auth. */
async function offerSavePassword(email, password, name = "") {
  try {
    if (!window.PasswordCredential || !navigator.credentials?.store) return;
    const cred = new PasswordCredential({
      id: String(email || "").trim(),
      password: String(password || ""),
      name: String(name || "").trim() || undefined,
    });
    await navigator.credentials.store(cred);
  } catch (err) {
    // Browser may decline; form autocomplete hints still handle most cases.
    console.debug("Password save offer skipped:", err);
  }
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  if (authBusy) return;

  const auth = window.MHN_AUTH;
  if (!auth?.isConfigured?.()) {
    setAuthMessage({
      error: "Supabase is not configured. Add your project URL and anon key in config.js.",
    });
    return;
  }

  const email = loginEmailInput.value;
  const password = loginPasswordInput.value;
  setAuthMessage();
  setAuthBusy(true);

  try {
    const result = await auth.signIn({ email, password });
    if (!result.ok) {
      setAuthMessage({ error: result.error || "Authentication failed." });
      return;
    }

    await offerSavePassword(email, password, result.user?.name);
    applyAuthUser(result.user);
    await startApp();
    maybePromptProfileName();
  } catch (err) {
    console.error(err);
    setAuthMessage({ error: "Something went wrong. Please try again." });
  } finally {
    setAuthBusy(false);
  }
}

async function handleSignupSubmit(e) {
  e.preventDefault();
}

async function logout() {
  const auth = window.MHN_AUTH;
  setAuthBusy(true);
  try {
    if (auth?.signOut) {
      const result = await auth.signOut();
      if (!result.ok) {
        setAuthMessage({ error: result.error || "Could not log out." });
        showLoginScreen();
        return;
      }
    }
  } catch (err) {
    console.error(err);
  } finally {
    applyAuthUser(null);
    loginPasswordInput.value = "";
    signupPasswordInput.value = "";
    signupConfirmInput.value = "";
    loginAuthError.classList.remove("is-info");
    setAuthBusy(false);
    setAuthMessage();
  }
}

/* ------------------------------ Storage ------------------------ */

function loadDeals() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function syncErrorDetail(err) {
  const detail =
    err?.message ||
    err?.error_description ||
    err?.details ||
    (typeof err === "string" ? err : "");
  return detail ? `: ${String(detail).slice(0, 160)}` : "";
}

function applySaveResult(result) {
  if (result?.rehydrated && result?.deals && Array.isArray(result.deals)) {
    deals = result.deals;
  } else {
    const updates = [
      ...(Array.isArray(result?.written) ? result.written : []),
      ...(Array.isArray(result?.conflicts) ? result.conflicts : []),
    ];
    if (updates.length) {
      const byId = new Map(updates.filter((d) => d?.id).map((d) => [d.id, d]));
      deals = deals.map((d) => (byId.has(d.id) ? byId.get(d.id) : d));
      for (const deal of byId.values()) {
        if (!deals.some((d) => d.id === deal.id)) deals.push(deal);
      }
    } else if (result?.deals && Array.isArray(result.deals)) {
      deals = result.deals;
    }
  }
  if (result?.writeBlocked) {
    if (result.reason === "not-hydrated") {
      showSyncStatus(
        "Offline — pending sync. Changes are local until cloud reconnects.",
        true,
        true
      );
    }
    // origin-blocked: cloud-readonly banner already explains this
    return;
  }
  if (result?.conflict) {
    const n = Array.isArray(result.conflicts) ? result.conflicts.length : 0;
    const editingConflict =
      editingId &&
      Array.isArray(result.conflicts) &&
      result.conflicts.some((d) => d.id === editingId);
    const label = editingConflict
      ? "This deal changed elsewhere. Your form is kept — save again to apply your edits on the latest version."
      : n === 1
        ? "Conflict — that deal changed elsewhere. Loaded the latest version."
        : `Conflict — ${n || "some"} deals changed elsewhere. Loaded the latest versions.`;
    showSyncStatus(label, true, true);
    render();
    return;
  }
  if (result?.wroteToCloud) {
    // Quiet on routine saves; only celebrate reconnect / pending flush.
    if (result.rehydrated) {
      showSyncStatus("Reconnected — saved to cloud");
    }
  }
}

let saveQueue = Promise.resolve();
const saveQueuedIds = new Set();
let saveInFlight = false;

function queueDealIds(affectedDealIds) {
  if (typeof affectedDealIds === "string" && affectedDealIds) {
    saveQueuedIds.add(affectedDealIds);
  } else if (Array.isArray(affectedDealIds)) {
    for (const id of affectedDealIds) {
      if (id) saveQueuedIds.add(id);
    }
  }
}

async function flushQueuedSaves() {
  const api = window.MHN_DB;
  while (saveQueuedIds.size) {
    const ids = [...saveQueuedIds];
    saveQueuedIds.clear();
    const toWrite = deals.filter((d) => ids.includes(d.id));
    saveInFlight = true;
    try {
      if (api?.upsertDealsAsync) {
        const result = await api.upsertDealsAsync(toWrite, deals);
        applySaveResult(result);
      } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(deals));
      }
    } catch (err) {
      console.error(err);
      showSyncStatus(
        `Could not sync to cloud — changes kept locally${syncErrorDetail(err)}`,
        true,
        true
      );
    } finally {
      saveInFlight = false;
    }
  }
  if (pendingRemoteRefresh) {
    pendingRemoteRefresh = false;
    await refreshDealsFromRemote();
  }
}

/**
 * Persist local cache and upsert only the affected deal row(s).
 * Saves are serialized so two rapid edits cannot send the same version.
 * @param {string|string[]|null} affectedDealIds changed deal id(s); omit only for local-only cache write
 */
function saveDeals(affectedDealIds) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(deals));
  } catch {
    /* ignore quota / private mode */
  }
  // Ignore our own realtime echo while a write is in flight.
  suppressRemoteRefreshUntil = Date.now() + 400;
  queueDealIds(affectedDealIds);
  saveQueue = saveQueue.then(flushQueuedSaves).catch((err) => {
    console.error(err);
  });
}

function showSyncStatus(message, isError = false, sticky = false) {
  let el = document.getElementById("syncStatus");
  if (!el) {
    el = document.createElement("div");
    el.id = "syncStatus";
    el.className = "sync-status";
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.toggle("is-error", isError);
  el.classList.toggle("is-info", !isError && sticky);
  el.hidden = false;
  clearTimeout(showSyncStatus._timer);
  if (!sticky) {
    showSyncStatus._timer = setTimeout(() => {
      el.hidden = true;
    }, isError ? 5000 : 2500);
  }
}

function showCloudReadOnlyBanner() {
  if (document.getElementById("cloudReadOnlyBanner")) return;
  const banner = document.createElement("div");
  banner.id = "cloudReadOnlyBanner";
  banner.className = "cloud-readonly-banner";
  banner.innerHTML =
    "<strong>Local / preview mode</strong> — cloud data is read-only here. " +
    "Use the <a href=\"https://macadosis.github.io/MHNsales/\" target=\"_blank\" rel=\"noopener\">GitHub Pages app</a> " +
    "to create or edit live deals.";
  const topbar = document.querySelector(".topbar");
  if (topbar) topbar.insertAdjacentElement("afterend", banner);
  else document.body.prepend(banner);
}

let lastRenderedSignature = null;
let pendingRemoteRefresh = false;
let suppressRemoteRefreshUntil = 0;
let pendingRemoteRefreshTimer = 0;

function schedulePendingRemoteRefresh() {
  clearTimeout(pendingRemoteRefreshTimer);
  const wait = Math.max(0, suppressRemoteRefreshUntil - Date.now()) + 30;
  pendingRemoteRefreshTimer = setTimeout(() => {
    if (!pendingRemoteRefresh || saveInFlight || saveQueuedIds.size || dragState) return;
    pendingRemoteRefresh = false;
    refreshDealsFromRemote();
  }, wait);
}

function showLoadSyncStatus(api) {
  if (!api?.isRemote) return;
  if (!api.cloudWriteAllowedByOrigin) {
    showSyncStatus("Cloud read-only — local edits won’t upload", false, true);
    return;
  }
  const meta = api.lastLoadMeta || {};
  if (!api.cloudHydrated || meta.source === "local-fallback") {
    showSyncStatus(
      "Cloud unavailable — using local data. Edits won’t upload until reconnect.",
      true,
      true
    );
    return;
  }
  if (meta.source === "local-pending" || api.hasPendingSync || meta.flushError) {
    showSyncStatus(
      "Pending sync — local changes could not be uploaded. Kept locally.",
      true,
      true
    );
    return;
  }
  if (meta.source === "local-pending-conflict") {
    showSyncStatus(
      "Conflict while syncing — some deals were reloaded from the cloud.",
      true,
      true
    );
    return;
  }
  if (meta.source === "local-pending-synced") {
    showSyncStatus("Pending local changes uploaded to Supabase");
    return;
  }
  showSyncStatus("Synced with Supabase");
}

async function refreshDealsFromRemote() {
  const api = window.MHN_DB;
  if (!api?.isRemote || !api.loadDealsAsync) return;
  if (saveInFlight || saveQueuedIds.size) {
    pendingRemoteRefresh = true;
    return;
  }
  if (Date.now() < suppressRemoteRefreshUntil) {
    pendingRemoteRefresh = true;
    schedulePendingRemoteRefresh();
    return;
  }
  // Never rebuild the board mid-drag; queue the update until the drag ends.
  if (dragState) {
    pendingRemoteRefresh = true;
    return;
  }
  try {
    syncingFromRemote = true;
    const incoming = await api.loadDealsAsync();
    const editingOpen = Boolean(editingId && overlay && !overlay.hidden);
    if (editingOpen) {
      const before = deals.find((d) => d.id === editingId);
      const after = incoming.find((d) => d.id === editingId);
      const beforeVer = Number(before?.version) || 0;
      const afterVer = Number(after?.version) || 0;
      if (before && after && afterVer !== beforeVer) {
        showSyncStatus(
          "This deal changed elsewhere. Your form is kept — save to apply your edits on the latest version, or close without saving to take theirs.",
          true,
          true
        );
      } else if (before && !after) {
        showSyncStatus(
          "This deal was removed or changed elsewhere while you were editing.",
          true,
          true
        );
      }
    }
    deals = incoming;
    migrateDeals({ persist: Boolean(api.cloudWriteEnabled) });
    const meta = api.lastLoadMeta || {};
    if (meta.source === "local-pending" || meta.flushError || api.hasPendingSync) {
      showSyncStatus(
        "Pending sync — local changes could not be uploaded. Kept locally.",
        true,
        true
      );
    }
    // Skip the (destructive) re-render when nothing actually changed, so a
    // hovered card isn't torn down and rebuilt by realtime echo events.
    const signature = JSON.stringify(deals);
    if (signature !== lastRenderedSignature) {
      lastRenderedSignature = signature;
      render();
    }
  } catch (err) {
    console.error(err);
  } finally {
    syncingFromRemote = false;
  }
}

const DEAL_CREATION_NOTE_TEXT = "Deal card created";

function makeDealCreationNote(timestamp) {
  return {
    id: crypto.randomUUID(),
    text: DEAL_CREATION_NOTE_TEXT,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function migrateDeals({ persist = true } = {}) {
  let changed = false;
  const changedIds = new Set();
  for (const deal of deals) {
    if (
      deal.stage === "committed" &&
      deal.implementationDays &&
      !deal.committedAt
    ) {
      deal.committedAt = startOfDay(new Date(deal.createdAt || Date.now())).getTime();
      changed = true;
      changedIds.add(deal.id);
    } else if (deal.committedAt) {
      const normalized = startOfDay(new Date(deal.committedAt)).getTime();
      if (normalized !== deal.committedAt) {
        deal.committedAt = normalized;
        changed = true;
        changedIds.add(deal.id);
      }
    }

    // Every deal keeps an automatic first note stamped at its creation time.
    const created = deal.createdAt;
    if (created) {
      const notes = deal.notes || [];
      if (!notes.some((note) => note.createdAt === created)) {
        deal.notes = [makeDealCreationNote(created), ...notes];
        changed = true;
        changedIds.add(deal.id);
      }
    }

    if (!Array.isArray(deal.tasks)) {
      deal.tasks = [];
      changed = true;
      changedIds.add(deal.id);
    } else {
      const cleaned = [];
      let tasksChanged = false;
      for (const raw of deal.tasks) {
        const task = normalizeTask(raw);
        if (!task.text || task.dueAt == null) {
          tasksChanged = true;
          continue;
        }
        if (Number(raw.dueAt) !== task.dueAt) tasksChanged = true;
        cleaned.push(task);
      }
      if (cleaned.length !== deal.tasks.length) tasksChanged = true;
      if (tasksChanged) {
        deal.tasks = cleaned;
        changed = true;
        changedIds.add(deal.id);
      }
    }
  }

  const boardOrderIds = ensureBoardOrders();
  if (boardOrderIds.length) {
    changed = true;
    for (const id of boardOrderIds) changedIds.add(id);
  }

  // Never push migration fixes from a write-blocked origin (avoids stale local→cloud)
  if (changed && persist && window.MHN_DB?.cloudWriteEnabled) {
    saveDeals([...changedIds]);
  }
}

function compareBoardOrder(a, b) {
  const ao = a.boardOrder;
  const bo = b.boardOrder;
  if (ao != null && bo != null && ao !== bo) return ao - bo;
  if (ao != null && bo == null) return -1;
  if (ao == null && bo != null) return 1;
  return (a.createdAt || 0) - (b.createdAt || 0);
}

function getStageDeals(stage, { excludeId } = {}) {
  return deals
    .filter(
      (d) =>
        !d.dismissedAt &&
        d.stage === stage &&
        d.id !== excludeId
    )
    .sort(compareBoardOrder);
}

/** Paused deals always live under Prospects. */
function ensurePausedDealsInProspects() {
  const changedIds = [];
  for (const deal of deals) {
    if (!isDealPaused(deal) || deal.stage === "dismissed" || deal.dismissedAt) continue;
    if (deal.stage !== "prospects") {
      deal.stage = "prospects";
      changedIds.push(deal.id);
    }
  }
  return changedIds;
}

/** Assign missing boardOrder values so column order is stable and rearrangeable. */
function ensureBoardOrders() {
  const changedIds = ensurePausedDealsInProspects();
  const byStage = new Map();

  for (const deal of deals) {
    if (deal.dismissedAt) continue;
    const stage = deal.stage || "prospects";
    if (!byStage.has(stage)) byStage.set(stage, []);
    byStage.get(stage).push(deal);
  }

  for (const list of byStage.values()) {
    list.sort(compareBoardOrder);
    list.forEach((deal, index) => {
      if (deal.boardOrder !== index) {
        deal.boardOrder = index;
        changedIds.push(deal.id);
      }
    });
  }

  return changedIds;
}

function nextBoardOrder(stage) {
  const list = getStageDeals(stage);
  if (!list.length) return 0;
  return Math.max(...list.map((d) => d.boardOrder ?? 0)) + 1;
}

/** @returns {string[]} ids of deals whose stage/boardOrder changed */
function reorderDeal(deal, targetStage, insertBeforeId) {
  const siblings = getStageDeals(targetStage, { excludeId: deal.id });
  let insertAt = siblings.length;
  if (insertBeforeId) {
    const idx = siblings.findIndex((d) => d.id === insertBeforeId);
    if (idx >= 0) insertAt = idx;
  }
  siblings.splice(insertAt, 0, deal);
  deal.stage = targetStage;
  siblings.forEach((d, i) => {
    d.boardOrder = i;
  });
  return siblings.map((d) => d.id);
}

function initPipelinePeriod() {
  const committed = deals.filter(
    (deal) => deal.committedAt && deal.stage === "committed"
  );
  if (!committed.length) return;
  const earliest = Math.min(...committed.map((deal) => deal.committedAt));
  pipelineState.periodStart = startOfMonth(new Date(earliest));
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function toDateInputValue(timestamp) {
  const date = startOfDay(new Date(timestamp));
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateInput(value) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return startOfDay(new Date(year, month - 1, day)).getTime();
}

function formatShortDate(timestamp) {
  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function toTitleCase(value) {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) =>
      word
        .split("-")
        .map((part) => {
          if (!part) return part;
          return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
        })
        .join("-")
    )
    .join(" ");
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

if (!tasksCalendarState.monthStart) {
  tasksCalendarState.monthStart = startOfMonth(new Date());
}
if (!tasksPipelineState.anchorDate) {
  tasksPipelineState.anchorDate = startOfDay(new Date());
}

function addMonths(date, count) {
  return new Date(date.getFullYear(), date.getMonth() + count, 1);
}

function addDays(date, days) {
  return startOfDay(new Date(date.getFullYear(), date.getMonth(), date.getDate() + days));
}

/** Shift by calendar months while keeping the day-of-month when possible. */
function shiftDateByMonths(date, months) {
  const source = startOfDay(date);
  const targetMonth = source.getMonth() + months;
  const target = new Date(source.getFullYear(), targetMonth, source.getDate());
  // Clamp overflow (e.g. Jan 31 + 1 month) to the last day of the target month.
  if (target.getDate() !== source.getDate()) {
    return startOfDay(new Date(source.getFullYear(), targetMonth + 1, 0));
  }
  return startOfDay(target);
}

function formatMonthDay(date) {
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric" });
}

function formatMonthLabel(date) {
  return date.toLocaleDateString("en-US", { month: "long" });
}

/* ------------------------------ Filters ------------------------ */

function hasActiveFilters() {
  return FILTER_FIELDS.some(({ key }) => filters[key].size > 0);
}

function getFilterOptions(key) {
  return [...new Set(
    getActiveDeals()
      .map((deal) => (deal[key] || "").trim())
      .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b));
}

function hasIncompleteValues(key) {
  return getActiveDeals().some((deal) => !(deal[key] || "").trim());
}

function getActiveDeals() {
  return deals.filter((deal) => deal.stage !== "dismissed");
}

function isDealPaused(deal) {
  return Boolean(deal?.pausedAt);
}

function nextCardSiblingId(el) {
  let sib = el?.nextElementSibling;
  while (sib) {
    if (sib.classList?.contains("card") && sib.dataset?.id) return sib.dataset.id;
    sib = sib.nextElementSibling;
  }
  return null;
}

function getDismissedDeals() {
  return deals
    .filter((deal) => deal.stage === "dismissed")
    .sort((a, b) => (b.dismissedAt || 0) - (a.dismissedAt || 0));
}

function getFilteredDismissedDeals() {
  const q = historySearchQuery.trim().toLowerCase();
  const dismissed = getDismissedDeals();
  if (!q) return dismissed;
  return dismissed.filter((deal) =>
    (deal.company || "").toLowerCase().includes(q)
  );
}

function getFieldMatches(
  fieldKey,
  query,
  { trackDismissed = false, trackPaused = false, activeOnly = false } = {}
) {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const byValue = new Map();
  for (const deal of deals) {
    if (activeOnly && deal.stage === "dismissed") continue;
    const value = (deal[fieldKey] || "").trim();
    if (!value) continue;
    const key = value.toLowerCase();
    let entry = byValue.get(key);
    if (!entry) {
      entry = {
        name: value,
        hasActive: false,
        hasDismissed: false,
        hasPaused: false,
        hasUnpaused: false,
      };
      byValue.set(key, entry);
    }
    if (deal.stage === "dismissed") {
      entry.hasDismissed = true;
    } else {
      entry.hasActive = true;
      if (isDealPaused(deal)) entry.hasPaused = true;
      else entry.hasUnpaused = true;
    }
  }

  return [...byValue.values()]
    .filter(({ name }) => name.toLowerCase().includes(q))
    .map(({ name, hasActive, hasDismissed, hasPaused, hasUnpaused }) => ({
      name,
      dismissed: trackDismissed && hasDismissed && !hasActive,
      paused: trackPaused && hasPaused && !hasUnpaused,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 8);
}

function appendSuggestionStatusBadge(item, { dismissed = false, paused = false } = {}) {
  if (dismissed) {
    const badge = document.createElement("span");
    badge.className = "combobox-suggestion-dismissed";
    badge.textContent = "(Dismissed)";
    item.appendChild(document.createTextNode(" "));
    item.appendChild(badge);
    return;
  }
  if (paused) {
    const badge = document.createElement("span");
    badge.className = "combobox-suggestion-paused";
    badge.textContent = "(Paused)";
    item.appendChild(document.createTextNode(" "));
    item.appendChild(badge);
  }
}

function highlightSuggestionMatch(name, query) {
  const q = query.trim();
  const idx = name.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return document.createTextNode(name);

  const fragment = document.createDocumentFragment();
  if (idx > 0) fragment.appendChild(document.createTextNode(name.slice(0, idx)));
  const strong = document.createElement("strong");
  strong.textContent = name.slice(idx, idx + q.length);
  fragment.appendChild(strong);
  if (idx + q.length < name.length) {
    fragment.appendChild(document.createTextNode(name.slice(idx + q.length)));
  }
  return fragment;
}

function closeFieldSuggestions(fieldKey) {
  const state = fieldSuggestionState.get(fieldKey);
  if (!state) return;
  state.listEl.hidden = true;
  state.listEl.innerHTML = "";
  state.activeIndex = -1;
  state.input.setAttribute("aria-expanded", "false");
}

function closeAllFieldSuggestions() {
  for (const fieldKey of fieldSuggestionState.keys()) {
    closeFieldSuggestions(fieldKey);
  }
}

function selectFieldSuggestion(fieldKey, name) {
  const state = fieldSuggestionState.get(fieldKey);
  if (!state) return;
  state.input.value = name;
  closeFieldSuggestions(fieldKey);
  state.input.focus();
}

function highlightFieldSuggestion(fieldKey, index) {
  const state = fieldSuggestionState.get(fieldKey);
  if (!state) return;
  const items = state.listEl.querySelectorAll(".combobox-suggestion");
  items.forEach((el, i) => el.classList.toggle("is-active", i === index));
  if (items[index]) items[index].scrollIntoView({ block: "nearest" });
  state.activeIndex = index;
}

function renderFieldSuggestions(fieldKey) {
  const state = fieldSuggestionState.get(fieldKey);
  if (!state) return;

  const query = state.input.value;
  const matches = getFieldMatches(fieldKey, query, {
    trackDismissed: state.trackDismissed,
    trackPaused: state.trackPaused,
  });
  state.listEl.innerHTML = "";
  state.activeIndex = -1;

  if (!matches.length) {
    closeFieldSuggestions(fieldKey);
    return;
  }

  for (const { name, dismissed, paused } of matches) {
    const item = document.createElement("li");
    item.className = "combobox-suggestion";
    item.role = "option";
    item.dataset.value = name;

    const label = document.createElement("span");
    label.className = "combobox-suggestion-name";
    label.appendChild(highlightSuggestionMatch(name, query));
    item.appendChild(label);
    appendSuggestionStatusBadge(item, { dismissed, paused });

    item.addEventListener("mousedown", (e) => {
      e.preventDefault();
      selectFieldSuggestion(fieldKey, name);
    });
    state.listEl.appendChild(item);
  }

  state.listEl.hidden = false;
  state.input.setAttribute("aria-expanded", "true");
}

function setupFieldSuggestions(fieldKey, { trackDismissed = false, trackPaused = false } = {}) {
  const input = form.elements[fieldKey];
  const listEl = document.getElementById(`${fieldKey}Suggestions`);
  if (!input || !listEl) return;

  fieldSuggestionState.set(fieldKey, {
    input,
    listEl,
    activeIndex: -1,
    trackDismissed,
    trackPaused,
  });

  input.addEventListener("input", () => renderFieldSuggestions(fieldKey));
  input.addEventListener("blur", () => {
    setTimeout(() => closeFieldSuggestions(fieldKey), 150);
  });
  input.addEventListener("keydown", (e) => {
    const state = fieldSuggestionState.get(fieldKey);
    const items = state.listEl.querySelectorAll(".combobox-suggestion");
    const isOpen = !state.listEl.hidden && items.length > 0;

    if (e.key === "ArrowDown" && isOpen) {
      e.preventDefault();
      highlightFieldSuggestion(
        fieldKey,
        Math.min(state.activeIndex + 1, items.length - 1)
      );
    } else if (e.key === "ArrowUp" && isOpen) {
      e.preventDefault();
      highlightFieldSuggestion(fieldKey, Math.max(state.activeIndex - 1, 0));
    } else if (e.key === "Enter" && isOpen && state.activeIndex >= 0) {
      e.preventDefault();
      selectFieldSuggestion(fieldKey, items[state.activeIndex].dataset.value);
    } else if (e.key === "Escape" && isOpen) {
      e.preventDefault();
      closeFieldSuggestions(fieldKey);
    }
  });
}

setupFieldSuggestions("company", { trackDismissed: true, trackPaused: true });
setupFieldSuggestions("industry");
setupFieldSuggestions("tool");
setupFieldSuggestions("owner");

function matchesFilters(deal) {
  return FILTER_FIELDS.every(({ key }) => {
    const selected = filters[key];
    if (selected.size === 0) return true;
    const value = (deal[key] || "").trim();
    if (!value) return selected.has(INCOMPLETE_FILTER);
    return selected.has(value);
  });
}

function matchesSearch(deal) {
  if (!searchQuery) return true;
  return (deal.company || "").toLowerCase().includes(searchQuery);
}

function getFilteredDeals() {
  return getActiveDeals().filter((deal) => matchesFilters(deal) && matchesSearch(deal));
}

function toggleFilterValue(key, value, checked) {
  if (checked) filters[key].add(value);
  else filters[key].delete(value);
  render();
}

function clearFilters() {
  for (const { key } of FILTER_FIELDS) filters[key].clear();
  openFilterKey = null;
  render();
}

function closeFilterMenus() {
  openFilterKey = null;
  document.querySelectorAll(".filter-menu").forEach((menu) => {
    menu.hidden = true;
  });
  document.querySelectorAll(".filter-trigger").forEach((trigger) => {
    trigger.classList.remove("is-open");
  });
  document.querySelectorAll(".toolbar-scroll").forEach((row) => {
    row.classList.remove("is-menu-open");
  });
}

function renderFilters(containerEl, clearBtn) {
  containerEl.innerHTML = "";

  for (const { key, label } of FILTER_FIELDS) {
    const options = getFilterOptions(key);
    const selectedCount = filters[key].size;

    const dropdown = document.createElement("div");
    dropdown.className = "filter-dropdown";
    dropdown.dataset.filter = key;

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "filter-trigger";
    trigger.classList.toggle("has-selection", selectedCount > 0);
    trigger.classList.toggle("is-active", selectedCount > 0);
    trigger.classList.toggle("is-open", openFilterKey === key);

    const triggerLabel = document.createElement("span");
    triggerLabel.className = "filter-trigger-label";
    triggerLabel.textContent = selectedCount > 0 ? `${label} (${selectedCount})` : label;

    const chevron = document.createElement("span");
    chevron.className = "filter-chevron";
    chevron.textContent = "▾";

    trigger.append(triggerLabel, chevron);

    const menu = document.createElement("div");
    menu.className = "filter-menu";
    menu.hidden = openFilterKey !== key;

    const showIncomplete =
      hasIncompleteValues(key) || filters[key].has(INCOMPLETE_FILTER);

    if (options.length === 0 && !showIncomplete) {
      const empty = document.createElement("div");
      empty.className = "filter-empty";
      empty.textContent = `No ${label.toLowerCase()} values yet`;
      menu.appendChild(empty);
    } else {
      if (showIncomplete) {
        const optionLabel = document.createElement("label");
        optionLabel.className = "filter-option filter-option-incomplete";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = filters[key].has(INCOMPLETE_FILTER);

        const text = document.createElement("span");
        text.textContent = "Incomplete";

        checkbox.addEventListener("change", () => {
          toggleFilterValue(key, INCOMPLETE_FILTER, checkbox.checked);
        });

        optionLabel.append(checkbox, text);
        menu.appendChild(optionLabel);
      }

      for (const option of options) {
        const optionLabel = document.createElement("label");
        optionLabel.className = "filter-option";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = filters[key].has(option);

        const text = document.createElement("span");
        text.textContent = option;

        checkbox.addEventListener("change", () => {
          toggleFilterValue(key, option, checkbox.checked);
        });

        optionLabel.append(checkbox, text);
        menu.appendChild(optionLabel);
      }
    }

    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      openFilterKey = openFilterKey === key ? null : key;
      renderFilters(containerEl, clearBtn);
    });

    menu.addEventListener("click", (e) => e.stopPropagation());

    dropdown.append(trigger, menu);
    containerEl.appendChild(dropdown);
  }

  clearBtn.hidden = !hasActiveFilters();
  const scrollRow = containerEl.closest(".toolbar-scroll");
  if (scrollRow) {
    scrollRow.classList.toggle("is-menu-open", openFilterKey !== null);
  }
  scrollClearFiltersIntoView(clearBtn);
}

document.addEventListener("click", closeFilterMenus);
clearFiltersBtn.addEventListener("click", clearFilters);
pipelineClearFiltersBtn.addEventListener("click", clearFilters);
dashboardClearFiltersBtn.addEventListener("click", clearFilters);

/* ------------------------------ Search ------------------------- */

const searchBubble = document.getElementById("searchBubble");
const searchInput = document.getElementById("searchInput");
const searchClearBtn = document.getElementById("searchClearBtn");

const SEARCH_FIELDS = [
  { source: "board", input: searchInput, bubble: searchBubble, clearBtn: searchClearBtn, listId: "searchSuggestions" },
  { source: "pipeline", input: pipelineSearchInput, bubble: pipelineSearchBubble, clearBtn: pipelineSearchClearBtn, listId: "pipelineSearchSuggestions" },
  { source: "tasks", input: tasksSearchInput, bubble: tasksSearchBubble, clearBtn: tasksSearchClearBtn, listId: "tasksSearchSuggestions" },
  { source: "dashboard", input: dashboardSearchInput, bubble: dashboardSearchBubble, clearBtn: dashboardSearchClearBtn, listId: "dashboardSearchSuggestions" },
].filter((field) => field.input);

function applySearch(value, { source, skipSuggestions = false } = {}) {
  searchRawValue = value;
  searchQuery = value.trim().toLowerCase();
  const hasQuery = searchQuery.length > 0;

  for (const field of SEARCH_FIELDS) {
    if (field.source === source) continue;
    if (field.input.value !== searchRawValue) field.input.value = searchRawValue;
    updateSearchClearUi(field.bubble, field.clearBtn, hasQuery);
    if (hasQuery && isMobileViewport() && field.bubble) {
      field.bubble.classList.add("is-expanded", "is-expanded-settled");
    } else if (!hasQuery && field.bubble && document.activeElement !== field.input) {
      field.bubble.classList.remove("is-expanded", "is-expanded-settled");
    }
  }

  const activeField = SEARCH_FIELDS.find((f) => f.source === source);
  if (activeField) {
    updateSearchClearUi(activeField.bubble, activeField.clearBtn, hasQuery);
  }

  if (!skipSuggestions && source) {
    renderSearchSuggestions(source);
  } else if (skipSuggestions) {
    closeAllSearchSuggestions();
  }

  // Debounce board re-render so typing doesn't fight the caret / keyboard on iOS.
  clearTimeout(applySearch._timer);
  applySearch._timer = setTimeout(() => render(), 80);
}

function updateSearchClearUi(bubble, clearBtn, hasQuery) {
  if (!bubble || !clearBtn) return;
  bubble.classList.toggle("has-query", hasQuery);
  // Keep the clear control in layout; only toggle visibility so the bubble never grows.
  clearBtn.hidden = false;
  clearBtn.style.visibility = hasQuery ? "visible" : "hidden";
  clearBtn.setAttribute("aria-hidden", hasQuery ? "false" : "true");
  clearBtn.tabIndex = hasQuery ? 0 : -1;
}

function syncSearchInputsFromState() {
  const hasQuery = searchQuery.length > 0;
  for (const field of SEARCH_FIELDS) {
    if (field.input.value !== searchRawValue) field.input.value = searchRawValue;
    updateSearchClearUi(field.bubble, field.clearBtn, hasQuery);
    if (hasQuery && isMobileViewport() && field.bubble) {
      field.bubble.classList.add("is-expanded", "is-expanded-settled");
    }
  }
}

function setSearchSuggestionsOpen(source, isOpen) {
  const state = searchSuggestionState.get(source);
  if (!state) return;
  const scrollRow = state.input.closest(".toolbar-scroll");
  if (scrollRow) scrollRow.classList.toggle("is-suggestions-open", isOpen);
}

function closeSearchSuggestions(source) {
  const state = searchSuggestionState.get(source);
  if (!state) return;
  state.listEl.hidden = true;
  state.listEl.innerHTML = "";
  state.activeIndex = -1;
  state.input.setAttribute("aria-expanded", "false");
  setSearchSuggestionsOpen(source, false);
}

function closeAllSearchSuggestions() {
  for (const source of searchSuggestionState.keys()) {
    closeSearchSuggestions(source);
  }
}

function highlightSearchSuggestion(source, index) {
  const state = searchSuggestionState.get(source);
  if (!state) return;
  const items = state.listEl.querySelectorAll(".combobox-suggestion");
  items.forEach((el, i) => el.classList.toggle("is-active", i === index));
  if (items[index]) items[index].scrollIntoView({ block: "nearest" });
  state.activeIndex = index;
}

function selectSearchSuggestion(source, name) {
  const state = searchSuggestionState.get(source);
  if (!state) return;
  state.input.value = name;
  closeSearchSuggestions(source);
  applySearch(name, { source, skipSuggestions: true });
  state.input.focus({ preventScroll: true });
}

function renderSearchSuggestions(source) {
  const state = searchSuggestionState.get(source);
  if (!state) return;

  const query = state.input.value;
  const matches = getFieldMatches("company", query, {
    activeOnly: true,
    trackPaused: true,
  });
  state.listEl.innerHTML = "";
  state.activeIndex = -1;

  if (!matches.length) {
    closeSearchSuggestions(source);
    return;
  }

  for (const { name, paused } of matches) {
    const item = document.createElement("li");
    item.className = "combobox-suggestion";
    item.role = "option";
    item.dataset.value = name;

    const label = document.createElement("span");
    label.className = "combobox-suggestion-name";
    label.appendChild(highlightSuggestionMatch(name, query));
    item.appendChild(label);
    appendSuggestionStatusBadge(item, { paused });

    item.addEventListener("mousedown", (e) => {
      e.preventDefault();
      selectSearchSuggestion(source, name);
    });
    state.listEl.appendChild(item);
  }

  state.listEl.hidden = false;
  state.input.setAttribute("aria-expanded", "true");
  setSearchSuggestionsOpen(source, true);
}

function setupSearchSuggestions(source) {
  const field = SEARCH_FIELDS.find((f) => f.source === source);
  if (!field) return;
  const listEl = document.getElementById(field.listId);
  if (!listEl) return;

  searchSuggestionState.set(source, {
    input: field.input,
    listEl,
    activeIndex: -1,
  });

  field.input.addEventListener("blur", () => {
    setTimeout(() => closeSearchSuggestions(source), 150);
  });
}

function wireSearchField(source) {
  const field = SEARCH_FIELDS.find((f) => f.source === source);
  if (!field) return;

  setupSearchSuggestions(source);

  field.input.addEventListener("input", () => applySearch(field.input.value, { source }));
  field.input.addEventListener("keydown", (e) => {
    const state = searchSuggestionState.get(source);
    const items = state?.listEl.querySelectorAll(".combobox-suggestion") || [];
    const isOpen = state && !state.listEl.hidden && items.length > 0;

    if (e.key === "ArrowDown" && isOpen) {
      e.preventDefault();
      highlightSearchSuggestion(source, Math.min(state.activeIndex + 1, items.length - 1));
      return;
    }
    if (e.key === "ArrowUp" && isOpen) {
      e.preventDefault();
      highlightSearchSuggestion(source, Math.max(state.activeIndex - 1, 0));
      return;
    }
    if (e.key === "Enter" && isOpen && state.activeIndex >= 0) {
      e.preventDefault();
      selectSearchSuggestion(source, items[state.activeIndex].dataset.value);
      return;
    }
    if (e.key === "Escape") {
      if (isOpen) {
        e.preventDefault();
        e.stopPropagation();
        closeSearchSuggestions(source);
        return;
      }
      if (field.input.value) {
        e.stopPropagation();
        field.input.value = "";
        applySearch("", { source, skipSuggestions: true });
      }
    }
  });

  if (field.clearBtn) {
    field.clearBtn.addEventListener("click", () => {
      field.input.value = "";
      applySearch("", { source, skipSuggestions: true });
      field.input.focus({ preventScroll: true });
    });
  }

  if (field.bubble) {
    field.input.addEventListener("focus", () => expandSearch(field));
    field.input.addEventListener("blur", () => {
      if (!field.input.value) {
        field.bubble.classList.remove("is-expanded", "is-expanded-settled");
        if (field.clearBtn) field.clearBtn.style.visibility = "hidden";
      }
    });
    field.bubble.addEventListener("pointerdown", (e) => {
      if (isMobileViewport() && !field.bubble.classList.contains("is-expanded")) {
        e.preventDefault();
        expandSearch(field);
      }
    });
  }
}

function isMobileViewport() {
  return window.matchMedia("(max-width: 720px)").matches;
}

function scrollSearchIntoView(bubble) {
  if (!bubble) return;
  const row = bubble.closest(".toolbar-scroll");
  if (!row) return;
  const rowRect = row.getBoundingClientRect();
  const bubbleRect = bubble.getBoundingClientRect();
  const pad = 12;
  if (bubbleRect.right > rowRect.right - pad) {
    row.scrollBy({ left: bubbleRect.right - rowRect.right + pad, behavior: "smooth" });
  } else if (bubbleRect.left < rowRect.left + pad) {
    row.scrollBy({ left: bubbleRect.left - rowRect.left - pad, behavior: "smooth" });
  }
}

/** Keep the clear-filters chip fully visible inside the horizontal toolbar. */
function scrollClearFiltersIntoView(clearBtn) {
  if (!clearBtn || clearBtn.hidden) return;
  const row = clearBtn.closest(".toolbar-scroll");
  if (!row) return;
  requestAnimationFrame(() => {
    const rowRect = row.getBoundingClientRect();
    const btnRect = clearBtn.getBoundingClientRect();
    const pad = 12;
    if (btnRect.right > rowRect.right - pad) {
      row.scrollBy({ left: btnRect.right - rowRect.right + pad, behavior: "smooth" });
    } else if (btnRect.left < rowRect.left + pad) {
      row.scrollBy({ left: btnRect.left - rowRect.left - pad, behavior: "smooth" });
    }
  });
}

function expandSearch(field) {
  if (!field?.bubble) return;
  field.bubble.classList.add("is-expanded");
  if (field.clearBtn) {
    field.clearBtn.hidden = false;
    if (!field.input.value) {
      field.clearBtn.style.visibility = "hidden";
      field.clearBtn.tabIndex = -1;
    }
  }
  if (document.activeElement !== field.input) {
    field.input.focus({ preventScroll: true });
  }
  clearTimeout(expandSearch._settleTimer);
  expandSearch._settleTimer = setTimeout(() => {
    field.bubble.classList.add("is-expanded-settled");
    scrollSearchIntoView(field.bubble);
  }, 220);
}

for (const field of SEARCH_FIELDS) {
  wireSearchField(field.source);
}

/* ------------------------------ Rendering ---------------------- */

function render() {
  lastRenderedSignature = JSON.stringify(deals);
  syncSearchInputsFromState();
  if (activeTab === "board") {
    renderFilters(filtersEl, clearFiltersBtn);
    renderBoard();
  } else if (activeTab === "pipeline") {
    renderFilters(pipelineFiltersEl, pipelineClearFiltersBtn);
    renderPipeline();
  } else if (activeTab === "dashboard") {
    renderFilters(dashboardFiltersEl, dashboardClearFiltersBtn);
    renderDashboard();
  } else if (activeTab === "history") {
    renderHistory();
  } else if (activeTab === "tasks") {
    renderFilters(tasksFiltersEl, tasksClearFiltersBtn);
    renderTasksView();
  }
}

function renderHistory() {
  historyListEl.innerHTML = "";
  const allDismissed = getDismissedDeals();
  const dismissed = getFilteredDismissedDeals();
  const hasQuery = historySearchQuery.trim().length > 0;

  if (!allDismissed.length) {
    const empty = document.createElement("p");
    empty.className = "history-empty";
    empty.textContent = "No dismissed deals yet.";
    historyListEl.appendChild(empty);
    return;
  }

  if (!dismissed.length) {
    const empty = document.createElement("p");
    empty.className = "history-empty";
    empty.textContent = hasQuery
      ? "No dismissed deals match that company name."
      : "No dismissed deals yet.";
    historyListEl.appendChild(empty);
    return;
  }

  for (const deal of dismissed) {
    historyListEl.appendChild(renderHistoryItem(deal));
  }
}

function renderHistoryItem(deal) {
  const item = document.createElement("article");
  item.className = "history-item";
  item.tabIndex = 0;
  item.setAttribute("role", "button");
  item.setAttribute("aria-label", `View ${deal.company || "deal"} (read only)`);
  item.addEventListener("click", () => openModal({ deal, readOnly: true }));
  item.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openModal({ deal, readOnly: true });
    }
  });

  const main = document.createElement("div");
  main.className = "history-item-main";

  const company = document.createElement("h3");
  company.className = "history-company";
  company.textContent = deal.company || "Untitled deal";

  const meta = document.createElement("p");
  meta.className = "history-meta";
  meta.textContent = [deal.contact, deal.email || deal.phone, deal.owner]
    .filter(Boolean)
    .join(" · ");

  const tags = document.createElement("div");
  tags.className = "history-tags";
  if (deal.industry) {
    const tag = document.createElement("span");
    tag.className = "tag tag-industry";
    tag.textContent = deal.industry;
    tags.appendChild(tag);
  }
  if (deal.tool) {
    const tag = document.createElement("span");
    tag.className = "tag tag-tool";
    tag.textContent = deal.tool;
    tags.appendChild(tag);
  }

  main.appendChild(company);
  if (meta.textContent) main.appendChild(meta);
  if (tags.childElementCount) main.appendChild(tags);

  const aside = document.createElement("div");
  aside.className = "history-item-aside";

  const date = document.createElement("time");
  date.className = "history-date";
  if (deal.dismissedAt) {
    date.dateTime = new Date(deal.dismissedAt).toISOString();
    date.textContent = `Dismissed ${formatShortDate(deal.dismissedAt)}`;
  } else {
    date.textContent = "Dismissed";
  }

  const restoreBtn = document.createElement("button");
  restoreBtn.type = "button";
  restoreBtn.className = "btn btn-ghost btn-sm";
  restoreBtn.textContent = "Restore to Prospects";
  restoreBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    restoreDealToProspects(deal.id);
  });

  aside.append(date, restoreBtn);
  item.append(main, aside);
  return item;
}

function restoreDealToProspects(dealId) {
  const deal = deals.find((d) => d.id === dealId);
  if (!deal || deal.stage !== "dismissed") return;
  deal.stage = "prospects";
  delete deal.dismissedAt;
  delete deal.pausedAt;
  deal.boardOrder = nextBoardOrder("prospects");
  saveDeals(deal.id);
  render();
}

function openPauseConfirm(deal) {
  if (!deal?.id) return;
  pendingPauseDealId = deal.id;
  pauseConfirmAction = isDealPaused(deal) ? "unpause" : "pause";
  syncPauseConfirmUi(deal);
  pauseOverlay.hidden = false;
}

function syncPauseConfirmUi(deal) {
  const name = deal?.company ? ` “${deal.company}”` : "";
  const pausing = pauseConfirmAction === "pause";
  pauseTitle.textContent = pausing ? "Pause deal" : "Unpause deal";
  pauseLead.textContent = pausing
    ? `Are you sure you want to pause this deal${name}? It will stay in Prospects until you unpause it.`
    : `Are you sure you want to unpause this deal${name}? It will return to the active Prospects list.`;
  pauseConfirmBtn.textContent = pausing ? "Yes, pause" : "Yes, unpause";
}

function closePauseModal() {
  pauseOverlay.hidden = true;
  pendingPauseDealId = null;
  pauseConfirmAction = "pause";
}

function confirmPauseAction() {
  if (!pendingPauseDealId) return;
  const deal = deals.find((d) => d.id === pendingPauseDealId);
  if (!deal) {
    closePauseModal();
    return;
  }

  if (pauseConfirmAction === "pause") {
    pauseDeal(deal);
  } else {
    unpauseDeal(deal);
  }
  closePauseModal();
}

function pauseDeal(deal) {
  if (!deal || deal.stage === "dismissed") return;
  deal.pausedAt = Date.now();
  if (deal.stage !== "prospects") {
    deal.boardOrder = nextBoardOrder("prospects");
    deal.stage = "prospects";
  }
  saveDeals(deal.id);
  render();
}

function unpauseDeal(deal) {
  if (!deal || !isDealPaused(deal)) return;
  delete deal.pausedAt;
  deal.stage = "prospects";
  const stillPaused = getActiveDeals().some((d) => isDealPaused(d));
  if (!stillPaused) showPausedProspectsOnly = false;
  saveDeals(deal.id);
  render();
}

function togglePausedProspectsView() {
  showPausedProspectsOnly = !showPausedProspectsOnly;
  render();
}

function clearPausedProspectsView() {
  if (!showPausedProspectsOnly) return;
  showPausedProspectsOnly = false;
  render();
}

function renderBoard() {
  boardEl.innerHTML = "";
  const visibleDeals = getFilteredDeals();
  if (!visibleDeals.some((d) => isDealPaused(d))) {
    showPausedProspectsOnly = false;
  }
  for (const stage of STAGES) {
    boardEl.appendChild(renderColumn(stage, visibleDeals));
  }
  // Wait for layout so we only enable vertical scroll when cards actually overflow.
  requestAnimationFrame(() => {
    syncColumnBodyScrolling();
    requestAnimationFrame(syncColumnBodyScrolling);
  });
}

/** Enable overflow scroll on a column body only when its cards don't fit. */
function syncColumnBodyScrolling() {
  boardEl.querySelectorAll(".column-body").forEach((body) => {
    // Clear inline overflow so class-based CSS can take over cleanly.
    body.style.overflowY = "";
    const canScroll = body.scrollHeight > body.clientHeight + 1;
    body.classList.toggle("is-scrollable", canScroll);
    if (!canScroll) body.scrollTop = 0;
  });
}

window.addEventListener("resize", () => {
  if (activeTab === "board") syncColumnBodyScrolling();
});

/* ------------------------------ Touch overscroll guard (iOS) ---- */

let touchScrollGuard = null;

function columnBodyCanScroll(body, dy) {
  if (!body?.classList.contains("is-scrollable")) return false;
  const atTop = body.scrollTop <= 0;
  const atBottom = body.scrollTop + body.clientHeight >= body.scrollHeight - 1;
  if (dy > 0 && atTop) return false;
  if (dy < 0 && atBottom) return false;
  return true;
}

document.addEventListener(
  "touchstart",
  (e) => {
    if (e.touches.length !== 1) {
      touchScrollGuard = null;
      return;
    }
    const t = e.touches[0];
    const el = document.elementFromPoint(t.clientX, t.clientY);
    const body = el?.closest?.(".column-body") || null;
    const board = el?.closest?.(".board") || null;
    touchScrollGuard = {
      x: t.clientX,
      y: t.clientY,
      body,
      board,
      scrollable: Boolean(body?.classList.contains("is-scrollable")),
    };
  },
  { passive: true, capture: true }
);

document.addEventListener(
  "touchend",
  () => {
    touchScrollGuard = null;
  },
  { passive: true, capture: true }
);

document.addEventListener(
  "touchcancel",
  () => {
    touchScrollGuard = null;
  },
  { passive: true, capture: true }
);

function getPipelineDeals() {
  return getFilteredDeals().filter(
    (deal) =>
      deal.stage === "committed" &&
      deal.committedAt &&
      deal.implementationDays > 0
  );
}

function getPipelinePeriodEnd() {
  return addMonths(pipelineState.periodStart, pipelineState.periodMonths);
}

function getPipelinePeriodRange() {
  const start = pipelineState.periodStart.getTime();
  const end = getPipelinePeriodEnd().getTime();
  return { start, end, span: end - start };
}

function assignPipelineRows(deals) {
  const sorted = [...deals].sort(
    (a, b) => getImplementationStart(a) - getImplementationStart(b)
  );
  const rowEnds = [];

  for (const deal of sorted) {
    const start = getImplementationStart(deal);
    const end = getImplementationEnd(deal);
    let row = 0;
    while (row < rowEnds.length && rowEnds[row] > start) row += 1;
    if (row === rowEnds.length) rowEnds.push(0);
    rowEnds[row] = end;
    deal._pipelineRow = row;
    deal._pipelineStart = start;
    deal._pipelineEnd = end;
  }

  return rowEnds.length;
}

function getImplementationStart(deal) {
  return startOfDay(new Date(deal.committedAt)).getTime();
}

function getImplementationEnd(deal) {
  return getImplementationStart(deal) + deal.implementationDays * MS_DAY;
}

function getDealEndMs(deal) {
  return getImplementationEnd(deal) - MS_DAY;
}

function getMonthRevenue(deals, monthStart, monthEnd) {
  const monthStartMs = monthStart.getTime();
  const monthEndMs = monthEnd.getTime();

  return deals.reduce((sum, deal) => {
    const endMs = getDealEndMs(deal);
    if (endMs >= monthStartMs && endMs < monthEndMs) {
      return sum + (Number(deal.value) || 0);
    }
    return sum;
  }, 0);
}

function formatMonthYear(date) {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function resolvePipelineTodayOverlaps(today, monthTicks) {
  const todayTick = pipelineAxisEl.querySelector(".pipeline-tick-today");
  const todayLabel = todayTick?.querySelector(".pipeline-tick-label");
  if (!todayLabel) return;

  const pad = 8;
  const todayRect = todayLabel.getBoundingClientRect();
  const todayLeft = todayRect.left - pad;
  const todayRight = todayRect.right + pad;
  const todayMid = (todayRect.left + todayRect.right) / 2;

  for (const { tick, monthStart, monthEnd } of monthTicks) {
    const label = tick.querySelector(".pipeline-tick-label");
    const revenue = tick.querySelector(".pipeline-tick-revenue");
    const inThisMonth = today >= monthStart.getTime() && today < monthEnd.getTime();
    const rel = inThisMonth
      ? (today - monthStart.getTime()) / (monthEnd.getTime() - monthStart.getTime())
      : null;

    for (const el of [label, revenue]) {
      if (!el) continue;
      el.style.transform = "";
      el.classList.remove("is-shifted-left", "is-shifted-right");
    }

    // Prefer a layout rule when today sits inside this month column.
    if (inThisMonth && rel != null) {
      if (rel < 0.42 && label) {
        // Today near the start — keep month name to the right of TODAY.
        const labelRect = label.getBoundingClientRect();
        const shift = Math.max(0, todayRight - labelRect.left);
        if (shift > 0) {
          label.style.transform = `translateX(${shift}px)`;
          label.classList.add("is-shifted-right");
        }
      } else if (rel > 0.58 && revenue) {
        // Today near the end — keep revenue to the left of TODAY.
        const revenueRect = revenue.getBoundingClientRect();
        const shift = Math.max(0, revenueRect.right - todayLeft);
        if (shift > 0) {
          revenue.style.transform = `translateX(-${shift}px)`;
          revenue.classList.add("is-shifted-left");
        }
      } else {
        // Today mid-month — push whichever gray text collides away from TODAY.
        pushPipelineAxisTextClear(label, todayLeft, todayRight, todayMid);
        pushPipelineAxisTextClear(revenue, todayLeft, todayRight, todayMid);
      }
      continue;
    }

    // Adjacent months: clear any leftover collision (e.g. prior month revenue).
    pushPipelineAxisTextClear(label, todayLeft, todayRight, todayMid);
    pushPipelineAxisTextClear(revenue, todayLeft, todayRight, todayMid);
  }
}

function pushPipelineAxisTextClear(el, todayLeft, todayRight, todayMid) {
  if (!el) return;
  const r = el.getBoundingClientRect();
  const overlaps = r.left < todayRight && r.right > todayLeft;
  if (!overlaps) return;

  const elMid = (r.left + r.right) / 2;
  if (elMid <= todayMid) {
    const shift = Math.max(0, r.right - todayLeft);
    if (shift > 0) {
      el.style.transform = `translateX(-${shift}px)`;
      el.classList.add("is-shifted-left");
    }
  } else {
    const shift = Math.max(0, todayRight - r.left);
    if (shift > 0) {
      el.style.transform = `translateX(${shift}px)`;
      el.classList.add("is-shifted-right");
    }
  }
}

function hidePipelineTooltip() {
  const tip = document.getElementById("pipelineTooltip");
  if (tip) {
    tip.hidden = true;
    delete tip.dataset.tipKey;
  }
}

function showPipelineTooltip(bar, deal, barStart, barEnd, event) {
  let tip = document.getElementById("pipelineTooltip");
  if (!tip) {
    tip = document.createElement("div");
    tip.id = "pipelineTooltip";
    tip.className = "pipeline-tooltip";
    tip.setAttribute("role", "tooltip");
    document.body.appendChild(tip);
  }

  const tipKey = `${deal.id}:${barStart}:${barEnd}`;
  if (tip.dataset.tipKey !== tipKey) {
    tip.dataset.tipKey = tipKey;
    tip.innerHTML = "";

    const title = document.createElement("div");
    title.className = "pipeline-tooltip-title";
    title.textContent = deal.company || "Untitled deal";
    tip.appendChild(title);

    const rows = [
      deal.tool ? ["Tool", deal.tool] : null,
      ["Duration", `${deal.implementationDays} days`],
      [
        "Dates",
        `${formatMonthDay(new Date(barStart))} – ${formatMonthDay(new Date(barEnd - MS_DAY))}`,
      ],
    ].filter(Boolean);

    for (const [label, value] of rows) {
      const row = document.createElement("div");
      row.className = "pipeline-tooltip-row";

      const labelEl = document.createElement("span");
      labelEl.className = "pipeline-tooltip-label";
      labelEl.textContent = label;

      const valueEl = document.createElement("span");
      valueEl.className = "pipeline-tooltip-value";
      valueEl.textContent = value;

      row.append(labelEl, valueEl);
      tip.appendChild(row);
    }
  }

  tip.hidden = false;

  const rect = bar.getBoundingClientRect();
  const tipWidth = tip.offsetWidth || 220;
  const tipHeight = tip.offsetHeight || 96;
  const pointerX = Number.isFinite(event?.clientX) ? event.clientX : rect.left + rect.width / 2;
  const pointerY = Number.isFinite(event?.clientY) ? event.clientY : rect.top;
  let left = pointerX - tipWidth / 2;
  let top = pointerY - tipHeight - 12;
  left = Math.max(8, Math.min(left, window.innerWidth - tipWidth - 8));
  if (top < 8) top = pointerY + 16;
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
}

function renderPipeline() {
  hidePipelineTooltip();
  const { start: periodStart, end: periodEnd, span } = getPipelinePeriodRange();
  const periodEndDate = getPipelinePeriodEnd();
  const deals = getPipelineDeals();

  pipelinePeriodLabel.textContent = `${formatMonthDay(pipelineState.periodStart)} – ${formatMonthDay(new Date(periodEndDate.getTime() - MS_DAY))}`;
  pipelinePeriodLength.value = String(pipelineState.periodMonths);

  pipelineAxisEl.innerHTML = "";
  const monthTicks = [];
  for (let i = 0; i < pipelineState.periodMonths; i += 1) {
    const monthStart = addMonths(pipelineState.periodStart, i);
    const monthEnd = addMonths(monthStart, 1);
    const revenue = getMonthRevenue(deals, monthStart, monthEnd);
    const left = ((monthStart.getTime() - periodStart) / span) * 100;
    const width = ((monthEnd.getTime() - monthStart.getTime()) / span) * 100;

    const tick = document.createElement("div");
    tick.className = "pipeline-tick";
    tick.style.left = `${left}%`;
    tick.style.width = `${width}%`;

    const label = document.createElement("span");
    label.className = "pipeline-tick-label";
    label.textContent = formatMonthLabel(monthStart);

    const revenueEl = document.createElement("span");
    revenueEl.className = "pipeline-tick-revenue";
    revenueEl.title = `Estimated revenue from deals ending in ${formatMonthYear(monthStart)}`;
    revenueEl.textContent = fmtEuro.format(revenue);

    tick.append(label, revenueEl);
    pipelineAxisEl.appendChild(tick);
    monthTicks.push({ tick, monthStart, monthEnd, left, width });
  }

  const today = startOfDay(new Date()).getTime();
  if (today >= periodStart && today < periodEnd) {
    const todayTick = document.createElement("div");
    todayTick.className = "pipeline-tick pipeline-tick-today";
    todayTick.style.left = `${((today - periodStart) / span) * 100}%`;
    todayTick.innerHTML = `<span class="pipeline-tick-label">Today</span>`;
    pipelineAxisEl.appendChild(todayTick);
    requestAnimationFrame(() => resolvePipelineTodayOverlaps(today, monthTicks));
  }

  pipelineRowsEl.innerHTML = "";
  const rowCount = Math.max(assignPipelineRows(deals), 1);
  pipelineRowsEl.style.height = `${rowCount * PIPELINE_ROW_HEIGHT}px`;

  for (let i = 0; i < pipelineState.periodMonths; i += 1) {
    const gridLine = document.createElement("div");
    gridLine.className = "pipeline-gridline";
    gridLine.style.left = `${((addMonths(pipelineState.periodStart, i).getTime() - periodStart) / span) * 100}%`;
    pipelineRowsEl.appendChild(gridLine);
  }

  for (let row = 1; row < rowCount; row += 1) {
    const divider = document.createElement("div");
    divider.className = "pipeline-row-divider";
    divider.style.top = `${row * PIPELINE_ROW_HEIGHT}px`;
    pipelineRowsEl.appendChild(divider);
  }

  if (today >= periodStart && today < periodEnd) {
    const todayLine = document.createElement("div");
    todayLine.className = "pipeline-today-line";
    todayLine.style.left = `${((today - periodStart) / span) * 100}%`;
    pipelineRowsEl.appendChild(todayLine);
  }

  if (deals.length === 0) {
    const empty = document.createElement("div");
    empty.className = "pipeline-empty";
    empty.textContent = hasActiveFilters()
      ? "No matching committed deals in this period"
      : "No committed deals yet — drag a deal to Committed on the Board";
    pipelineRowsEl.appendChild(empty);
    return;
  }

  for (const deal of deals) {
    const barStart = deal._pipelineStart;
    const barEnd = deal._pipelineEnd;

    if (barEnd <= periodStart || barStart >= periodEnd) continue;

    const visibleStart = Math.max(barStart, periodStart);
    const visibleEnd = Math.min(barEnd, periodEnd);
    const left = ((visibleStart - periodStart) / span) * 100;
    const width = ((visibleEnd - visibleStart) / span) * 100;

    const bar = document.createElement("button");
    bar.type = "button";
    bar.className = "pipeline-bar";
    const continuesStart = barStart < periodStart;
    const continuesEnd = barEnd > periodEnd;
    if (continuesStart) bar.classList.add("continues-start");
    if (continuesEnd) bar.classList.add("continues-end");
    bar.style.top = `${deal._pipelineRow * PIPELINE_ROW_HEIGHT + PIPELINE_BAR_TOP}px`;

    if (continuesStart && continuesEnd) {
      bar.style.left = `${PIPELINE_EDGE_INSET}px`;
      bar.style.right = `${PIPELINE_EDGE_INSET}px`;
      bar.style.width = "auto";
    } else if (continuesEnd) {
      bar.style.left = `${left}%`;
      bar.style.right = `${PIPELINE_EDGE_INSET}px`;
      bar.style.width = "auto";
    } else if (continuesStart) {
      bar.style.left = `${PIPELINE_EDGE_INSET}px`;
      bar.style.width = `calc(${left + width}% - ${PIPELINE_EDGE_INSET}px)`;
    } else {
      bar.style.left = `${left}%`;
      bar.style.width = `${width}%`;
    }

    const text = document.createElement("span");
    text.className = "pipeline-bar-text";

    const label = document.createElement("span");
    label.className = "pipeline-bar-label";

    const companyName = document.createElement("span");
    companyName.className = "pipeline-bar-company";
    companyName.textContent = deal.company;
    label.appendChild(companyName);

    if (deal.tool) {
      const tool = document.createElement("span");
      tool.className = "pipeline-bar-tool";
      tool.textContent = deal.tool;
      label.appendChild(tool);
    }

    const duration = document.createElement("span");
    duration.className = "pipeline-bar-duration";
    duration.textContent = `${deal.implementationDays} days`;

    text.append(label, duration);
    bar.append(text);
    bar.addEventListener("mouseenter", (e) => showPipelineTooltip(bar, deal, barStart, barEnd, e));
    bar.addEventListener("mousemove", (e) => showPipelineTooltip(bar, deal, barStart, barEnd, e));
    bar.addEventListener("mouseleave", hidePipelineTooltip);
    bar.addEventListener("focus", () => showPipelineTooltip(bar, deal, barStart, barEnd));
    bar.addEventListener("blur", hidePipelineTooltip);
    bar.addEventListener("click", () => openModal({ deal }));
    pipelineRowsEl.appendChild(bar);
  }

  requestAnimationFrame(() => fitPipelineBarLabels());
}

function fitPipelineBarLabels() {
  pipelineRowsEl.querySelectorAll(".pipeline-bar").forEach((bar) => {
    const duration = bar.querySelector(".pipeline-bar-duration");
    if (!duration) return;
    duration.hidden = false;
    // Keep duration only when the bubble is wide enough to show it with padding.
    const minForDuration = duration.scrollWidth + 36;
    if (bar.clientWidth < minForDuration) duration.hidden = true;
  });
}

function shiftPipelinePeriod(direction) {
  pipelineState.periodStart = addMonths(pipelineState.periodStart, direction);
  render();
}

function renderColumn(stage, visibleDeals) {
  // Paused deals always belong under Prospects, even if stage drifted.
  const activeDeals = visibleDeals
    .filter((d) => d.stage === stage.id && !isDealPaused(d))
    .sort(compareBoardOrder);
  const pausedDeals =
    stage.id === "prospects"
      ? visibleDeals.filter((d) => isDealPaused(d)).sort(compareBoardOrder)
      : [];
  const pausedView =
    stage.id === "prospects" && showPausedProspectsOnly && pausedDeals.length > 0;
  const shownDeals = pausedView ? pausedDeals : activeDeals;
  const activeTotal = activeDeals.reduce((sum, d) => sum + (Number(d.value) || 0), 0);
  const pausedTotal = pausedDeals.reduce((sum, d) => sum + (Number(d.value) || 0), 0);
  const includingPausedTotal = activeTotal + pausedTotal;
  const total = pausedView ? pausedTotal : activeTotal;
  const filtersActive = hasActiveFilters();

  const col = document.createElement("section");
  col.className = "column";
  col.dataset.stage = stage.id;

  const header = document.createElement("div");
  header.className = "column-header";

  const titleGroup = document.createElement("div");
  titleGroup.className = "column-heading";

  const title = document.createElement("h2");
  title.className = "column-title";
  title.textContent = stage.label;
  if (stage.id === "prospects" && pausedView) {
    title.classList.add("is-muted");
    title.title = "Show active prospects";
    title.style.cursor = "pointer";
    title.addEventListener("click", clearPausedProspectsView);
  }

  const count = document.createElement("span");
  count.className = "column-count";
  count.textContent = activeDeals.length;
  if (stage.id === "prospects" && pausedView) {
    count.classList.add("is-muted");
    count.title = "Show active prospects";
    count.style.cursor = "pointer";
    count.addEventListener("click", clearPausedProspectsView);
  }

  titleGroup.append(title, count);
  header.appendChild(titleGroup);

  const canCreateInStage = stage.id === "prospects" || stage.id === "interested";

  if (stage.id === "prospects" && pausedDeals.length > 0) {
    const pausedToggle = document.createElement("button");
    pausedToggle.type = "button";
    pausedToggle.className = "column-paused-toggle";
    if (pausedView) pausedToggle.classList.add("is-active");
    pausedToggle.title = pausedView ? "Show active prospects" : "Show paused deals only";
    pausedToggle.setAttribute("aria-pressed", pausedView ? "true" : "false");

    const pausedLabel = document.createElement("span");
    pausedLabel.className = "column-paused-label";
    pausedLabel.textContent = "Paused";

    const pausedCount = document.createElement("span");
    pausedCount.className = "column-count column-paused-count";
    pausedCount.textContent = pausedDeals.length;

    pausedToggle.append(pausedLabel, pausedCount);
    pausedToggle.addEventListener("click", togglePausedProspectsView);
    header.appendChild(pausedToggle);
  }

  if (canCreateInStage) {
    const addBtn = document.createElement("button");
    addBtn.className = "column-add";
    addBtn.title = `Add deal to ${stage.label}`;
    addBtn.textContent = "+";
    addBtn.addEventListener("click", () => openModal({ stage: stage.id }));
    header.appendChild(addBtn);
  }

  const body = document.createElement("div");
  body.className = "column-body";

  if (shownDeals.length === 0) {
    const hint = document.createElement("div");
    hint.className = "empty-hint";
    if (pausedView) {
      hint.textContent = "No paused deals";
    } else {
      hint.textContent = (filtersActive || searchQuery) ? "No matching deals" : "Drop deals here";
    }
    body.appendChild(hint);
  } else {
    for (const deal of shownDeals) {
      body.appendChild(renderCard(deal));
    }
  }

  const footer = document.createElement("div");
  footer.className = "column-footer";

  const totalLabel = document.createElement("span");
  totalLabel.className = "total-label";
  totalLabel.textContent = "Total";

  const totalRight = document.createElement("div");
  totalRight.className = "total-right";

  if (stage.id === "prospects" && pausedDeals.length > 0 && !pausedView) {
    const including = document.createElement("span");
    including.className = "total-including-paused";
    including.textContent = `(including paused ${fmtEuro.format(includingPausedTotal)})`;
    totalRight.appendChild(including);
  }

  const totalValue = document.createElement("span");
  totalValue.className = "total-value";
  totalValue.textContent = fmtEuro.format(total);
  totalRight.appendChild(totalValue);

  footer.append(totalLabel, totalRight);

  col.append(header, body, footer);
  return col;
}

function renderCard(deal) {
  const card = document.createElement("article");
  card.className = "card";
  card.dataset.id = deal.id;
  if (isDealPaused(deal)) card.classList.add("is-paused");

  const pauseBtn = document.createElement("button");
  pauseBtn.type = "button";
  pauseBtn.className = "card-pause-btn";
  pauseBtn.setAttribute("aria-label", isDealPaused(deal) ? "Unpause deal" : "Pause deal");
  pauseBtn.innerHTML = isDealPaused(deal)
    ? `<svg class="card-pause-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6"/><polygon points="10,8 17,12 10,16" fill="currentColor"/></svg>`
    : `<svg class="card-pause-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="8.5" y="8" width="2.2" height="8" rx="0.6" fill="currentColor"/><rect x="13.3" y="8" width="2.2" height="8" rx="0.6" fill="currentColor"/></svg>`;

  const tip = document.createElement("span");
  tip.className = "card-pause-tip";
  tip.textContent = isDealPaused(deal) ? "Unpause deal" : "Pause deal";
  pauseBtn.appendChild(tip);

  pauseBtn.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
  });
  pauseBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    openPauseConfirm(deal);
  });

  const company = document.createElement("h3");
  company.className = "card-company";

  const companyName = document.createElement("span");
  companyName.className = "card-company-name";
  companyName.textContent = deal.company;
  company.appendChild(companyName);

  if (deal.tool) {
    const tool = document.createElement("span");
    tool.className = "card-company-tool";
    tool.textContent = deal.tool;
    company.appendChild(tool);
  }

  const meta = document.createElement("p");
  meta.className = "card-meta";
  meta.textContent = [deal.contact, deal.email || deal.phone].filter(Boolean).join(" · ");

  const tags = document.createElement("div");
  tags.className = "card-tags";
  if (deal.industry) {
    const tag = document.createElement("span");
    tag.className = "tag tag-industry";
    tag.textContent = deal.industry;
    tags.appendChild(tag);
  }
  if (deal.implementationDays && deal.committedAt && !isDealPaused(deal)) {
    const impl = document.createElement("span");
    impl.className = "tag tag-impl";
    impl.textContent = `${formatShortDate(deal.committedAt)} · ${deal.implementationDays} days`;
    tags.appendChild(impl);
  }

  const row = document.createElement("div");
  row.className = "card-row";

  const value = document.createElement("span");
  value.className = "card-value";
  value.textContent = fmtEuro.format(Number(deal.value) || 0);
  row.appendChild(value);

  if (deal.owner) {
    const owner = document.createElement("span");
    owner.className = "card-owner";
    owner.textContent = deal.owner;
    owner.title = deal.owner;
    row.appendChild(owner);
  }

  card.append(pauseBtn, company);
  if (meta.textContent) card.append(meta);
  if (tags.childElementCount) card.append(tags);
  card.append(row);

  card.addEventListener("click", (e) => {
    if (card.dataset.suppressClick === "1") {
      e.preventDefault();
      e.stopPropagation();
      delete card.dataset.suppressClick;
      return;
    }
    if (e.target.closest(".card-pause-btn")) return;
    openModal({ deal });
  });

  attachCardPointerDrag(card, deal);

  return card;
}

/* ------------------------------ Dashboard ---------------------- */

const DISMISSED_STAGE = { id: "dismissed", label: "Dismissed" };

/* Approximate success rate: deals that said yes over every deal that reached a
   decision. Failed deals are excluded — they never got a yes or a no. */
const SUCCESS_WON_STAGES = ["committed", "paid"];
const SUCCESS_CONSIDERED_STAGES = ["prospects", "interested", "dismissed", "committed", "paid"];

function sumDealValue(list) {
  return list.reduce((sum, deal) => sum + (Number(deal.value) || 0), 0);
}

function getDismissedDealsMatchingFilters() {
  return getDismissedDeals().filter((deal) => matchesFilters(deal) && matchesSearch(deal));
}

function formatShare(part, total) {
  if (!total) return "0%";
  const pct = (part / total) * 100;
  if (pct > 0 && pct < 1) return "<1%";
  return `${Math.round(pct)}%`;
}

function getDashboardStats() {
  const active = getFilteredDeals();
  const dismissedDeals = getDismissedDealsMatchingFilters();

  const stages = [...STAGES, DISMISSED_STAGE].map(({ id, label }) => {
    const stageDeals =
      id === DISMISSED_STAGE.id ? dismissedDeals : active.filter((deal) => deal.stage === id);
    return { id, label, count: stageDeals.length, value: sumDealValue(stageDeals) };
  });

  const countByStage = new Map(stages.map((stage) => [stage.id, stage.count]));
  const sumStages = (ids) => ids.reduce((sum, id) => sum + (countByStage.get(id) || 0), 0);

  const won = sumStages(SUCCESS_WON_STAGES);
  const considered = sumStages(SUCCESS_CONSIDERED_STAGES);

  return {
    activeStages: stages.filter((stage) => stage.id !== DISMISSED_STAGE.id),
    dismissed: stages.find((stage) => stage.id === DISMISSED_STAGE.id),
    activeCount: active.length,
    activeValue: sumDealValue(active),
    won,
    considered,
    successRate: considered ? (won / considered) * 100 : null,
  };
}

function dashEl(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function dashCard(modifier) {
  return dashEl("section", `dash-card ${modifier}`);
}

function dashFigure(count) {
  const figure = dashEl("div", "dash-figure");
  figure.append(
    dashEl("span", "dash-figure-value", String(count)),
    dashEl("span", "dash-figure-unit", count === 1 ? "card" : "cards")
  );
  return figure;
}

function renderDashboard() {
  dashboardBodyEl.innerHTML = "";
  const stats = getDashboardStats();
  const totalCards = stats.activeCount + stats.dismissed.count;

  if (!totalCards) {
    const narrowed = hasActiveFilters() || searchQuery;
    dashboardBodyEl.appendChild(
      dashEl(
        "p",
        "dash-empty",
        narrowed
          ? "No deals match the current filters."
          : "No deals yet — create one on the Board and the numbers will show up here."
      )
    );
    return;
  }

  const grid = dashEl("div", "dashboard-grid");
  const side = dashEl("div", "dashboard-side");
  side.append(renderDashDismissedCard(stats, totalCards), renderDashSuccessCard(stats));
  grid.append(renderDashActiveCard(stats), side);
  dashboardBodyEl.appendChild(grid);
}

function renderDashActiveCard(stats) {
  const card = dashCard("dash-card-hero");

  const head = dashEl("header", "dash-card-head");
  head.append(
    dashEl("h2", "dash-label", "Active deal cards"),
    dashEl("span", "dash-card-note", fmtEuro.format(stats.activeValue))
  );

  card.append(head, dashFigure(stats.activeCount), renderDashStageBar(stats));

  const list = dashEl("ul", "dash-stage-list");
  for (const stage of stats.activeStages) {
    list.appendChild(renderDashStageRow(stage, stats.activeCount));
  }
  card.appendChild(list);

  return card;
}

function renderDashStageBar(stats) {
  const bar = dashEl("div", "dash-bar");
  bar.setAttribute("role", "img");
  bar.setAttribute(
    "aria-label",
    stats.activeStages.map((stage) => `${stage.label}: ${stage.count}`).join(", ")
  );

  for (const stage of stats.activeStages) {
    if (!stage.count) continue;
    const segment = dashEl("span", "dash-bar-seg");
    segment.dataset.stage = stage.id;
    segment.style.flexGrow = String(stage.count);
    segment.title = `${stage.label} — ${stage.count} (${formatShare(stage.count, stats.activeCount)})`;
    bar.appendChild(segment);
  }

  return bar;
}

function renderDashStageRow(stage, total) {
  const item = dashEl("li", "dash-stage");
  item.dataset.stage = stage.id;

  const dot = dashEl("span", "dash-dot");
  const track = dashEl("div", "dash-stage-track");
  const fill = dashEl("span", "dash-stage-fill");
  fill.style.width = total ? `${(stage.count / total) * 100}%` : "0%";
  track.appendChild(fill);

  item.append(
    dot,
    dashEl("span", "dash-stage-label", stage.label),
    track,
    dashEl("span", "dash-stage-count", String(stage.count)),
    dashEl("span", "dash-stage-share", formatShare(stage.count, total)),
    dashEl("span", "dash-stage-value", fmtEuro.format(stage.value))
  );
  return item;
}

function renderDashDismissedCard(stats, totalCards) {
  const card = dashCard("dash-card-dismissed");
  card.dataset.stage = DISMISSED_STAGE.id;

  const head = dashEl("header", "dash-card-head");
  head.append(
    dashEl("h2", "dash-label", "Dismissed deals"),
    dashEl("span", "dash-card-note", fmtEuro.format(stats.dismissed.value))
  );

  const track = dashEl("div", "dash-stage-track");
  const fill = dashEl("span", "dash-stage-fill");
  fill.style.width = `${(stats.dismissed.count / totalCards) * 100}%`;
  track.appendChild(fill);

  card.append(
    head,
    dashFigure(stats.dismissed.count),
    track,
    dashEl(
      "p",
      "dash-note",
      `${formatShare(stats.dismissed.count, totalCards)} of all ${totalCards} deal cards ever created.`
    )
  );
  return card;
}

function renderDashSuccessCard(stats) {
  const card = dashCard("dash-card-success");

  const head = dashEl("header", "dash-card-head");
  head.append(dashEl("h2", "dash-label", "Approx. success rate"));

  const donut = dashEl("div", "dash-donut");
  donut.style.setProperty("--pct", String(stats.successRate ?? 0));
  donut.append(
    dashEl(
      "span",
      "dash-donut-value",
      stats.successRate === null ? "—" : formatShare(stats.won, stats.considered)
    )
  );

  const donutWrap = dashEl("div", "dash-donut-wrap");
  const legend = dashEl("div", "dash-donut-legend");
  legend.append(
    dashEl("span", "dash-donut-won", `${stats.won} won`),
    dashEl("span", "dash-donut-total", `of ${stats.considered} decided`)
  );
  donutWrap.append(donut, legend);

  card.append(
    head,
    donutWrap,
    dashEl(
      "p",
      "dash-note",
      "Won = Committed + Paid. Decided = Prospects + Interested + Dismissed + Committed + Paid. Failed deals are left out."
    )
  );
  return card;
}

/* ------------------------------ Drag & drop -------------------- */

const DRAG_HOLD_MS = 180;
const DRAG_MOVE_CANCEL_PX = 28;
const DRAG_MOUSE_ACTIVATE_PX = 6;
const DRAG_SCROLL_EDGE = 52;
const DRAG_SCROLL_SPEED = 14;

let dragState = null;

function clearDropIndicators() {
  document
    .querySelectorAll(".card.drop-before, .card.drop-after, .column-body.is-drop-active")
    .forEach((el) => {
      el.classList.remove("drop-before", "drop-after", "is-drop-active");
    });
}

function cleanupDrag() {
  if (!dragState) return;
  if (dragState.timer) clearTimeout(dragState.timer);
  if (dragState.scrollRaf) cancelAnimationFrame(dragState.scrollRaf);
  if (dragState.sourceEl) {
    dragState.sourceEl.classList.remove("is-drag-source", "dragging", "is-drag-pending");
  }
  removeDragGhost();
  clearDropIndicators();
  document.body.classList.remove("is-card-dragging");
  dragState = null;
  // A remote update may have arrived while dragging — apply it now.
  if (pendingRemoteRefresh) {
    pendingRemoteRefresh = false;
    refreshDealsFromRemote();
  }
}

function createDragGhost(card, clientX, clientY) {
  // Defensive: never leave a stray ghost behind from a previous drag.
  document.querySelectorAll(".card-drag-ghost").forEach((el) => el.remove());
  const rect = card.getBoundingClientRect();
  const ghost = card.cloneNode(true);
  ghost.classList.add("card-drag-ghost");
  ghost.classList.remove("is-drag-source", "dragging", "is-drag-pending", "drop-before", "drop-after");
  ghost.style.width = `${rect.width}px`;
  ghost.style.height = `${rect.height}px`;
  document.body.appendChild(ghost);
  dragState.ghost = ghost;
  dragState.ghostOffsetX = clientX - rect.left;
  dragState.ghostOffsetY = clientY - rect.top;
  moveDragGhost(clientX, clientY);
}

function moveDragGhost(clientX, clientY) {
  const ghost = dragState?.ghost;
  if (!ghost) return;
  const x = clientX - dragState.ghostOffsetX;
  const y = clientY - dragState.ghostOffsetY;
  ghost.style.transform = `translate(${x}px, ${y}px) scale(1.04)`;
}

function removeDragGhost() {
  if (dragState?.ghost) {
    dragState.ghost = null;
  }
  document.querySelectorAll(".card-drag-ghost").forEach((el) => el.remove());
}

function getDropTargetAt(clientX, clientY) {
  // Hide the floating ghost so it can't steal hit-testing (Safari can still
  // report pointer-events:none clones under elementsFromPoint in some cases).
  const ghost = dragState?.ghost;
  const prevVisibility = ghost ? ghost.style.visibility : "";
  if (ghost) ghost.style.visibility = "hidden";

  const stack = document.elementsFromPoint(clientX, clientY);
  if (ghost) ghost.style.visibility = prevVisibility;

  let card = null;
  let column = null;
  for (const el of stack) {
    if (el.classList?.contains("card-drag-ghost")) continue;
    if (el.closest?.(".card-drag-ghost")) continue;
    if (
      !card &&
      el.classList?.contains("card") &&
      !el.classList.contains("is-drag-source")
    ) {
      card = el;
    }
    if (!column && el.classList?.contains("column")) {
      column = el;
    }
    if (!column && el.classList?.contains("column-body")) {
      column = el.closest(".column");
    }
    if (card && column) break;
  }
  if (!column) return null;

  const stage = column.dataset.stage;
  if (card) {
    const rect = card.getBoundingClientRect();
    const before = clientY < rect.top + rect.height / 2;
    return {
      stage,
      insertBeforeId: before ? card.dataset.id : nextCardSiblingId(card),
      indicatorCard: card,
      before,
    };
  }

  return { stage, insertBeforeId: null, indicatorCard: null, before: false };
}

function updateDropIndicators(target) {
  clearDropIndicators();
  if (dragState) dragState.dropTarget = target || null;
  if (!target) return;
  // Highlight the whole placeholder the card is currently hovering over.
  const body = document.querySelector(`.column[data-stage="${target.stage}"] .column-body`);
  if (body) body.classList.add("is-drop-active");
  // Plus a precise insertion line when hovering over an existing card.
  if (target.indicatorCard) {
    target.indicatorCard.classList.add(target.before ? "drop-before" : "drop-after");
  }
}

/**
 * Returns a signed scroll delta that grows smoothly the deeper the pointer sits
 * inside an edge zone (0 in the middle, up to ±DRAG_SCROLL_SPEED at the very edge).
 */
function edgeScrollDelta(pos, min, max) {
  const zone = DRAG_SCROLL_EDGE;
  if (pos < min + zone) {
    const factor = Math.min(1, (min + zone - pos) / zone);
    return -DRAG_SCROLL_SPEED * factor * factor;
  }
  if (pos > max - zone) {
    const factor = Math.min(1, (pos - (max - zone)) / zone);
    return DRAG_SCROLL_SPEED * factor * factor;
  }
  return 0;
}

function autoScrollDuringDrag(clientX, clientY) {
  if (!dragState?.activated) return;

  const boardRect = boardEl.getBoundingClientRect();
  const dx = edgeScrollDelta(clientX, boardRect.left, boardRect.right);
  if (dx) boardEl.scrollLeft += dx;

  // Vertical scroll on whichever column body the pointer is currently over.
  const stack = document.elementsFromPoint(clientX, clientY);
  const body = stack.find((el) => el.classList?.contains("column-body"));
  if (body) {
    const rect = body.getBoundingClientRect();
    const dy = edgeScrollDelta(clientY, rect.top, rect.bottom);
    if (dy) body.scrollTop += dy;
  }

  if (dx || body) {
    moveDragGhost(dragState.lastX, dragState.lastY);
    updateDropIndicators(getDropTargetAt(dragState.lastX, dragState.lastY));
  }

  dragState.scrollRaf = requestAnimationFrame(() => {
    if (!dragState?.activated) return;
    autoScrollDuringDrag(dragState.lastX, dragState.lastY);
  });
}

function activateDrag() {
  if (!dragState || dragState.activated) return;
  dragState.activated = true;
  dragState.sourceEl.classList.remove("is-drag-pending");
  dragState.sourceEl.classList.add("is-drag-source", "dragging");
  document.body.classList.add("is-card-dragging");
  try {
    dragState.sourceEl.setPointerCapture(dragState.pointerId);
  } catch {
    /* ignore */
  }
  try {
    navigator.vibrate?.(12);
  } catch {
    /* ignore */
  }
  createDragGhost(dragState.sourceEl, dragState.lastX, dragState.lastY);
  updateDropIndicators(getDropTargetAt(dragState.lastX, dragState.lastY));
  autoScrollDuringDrag(dragState.lastX, dragState.lastY);
}

function commitDragDrop(clientX, clientY) {
  if (!dragState?.activated) return;
  const deal = deals.find((d) => d.id === dragState.dealId);
  if (!deal) return;

  // Prefer the last highlighted target (what the user saw), then re-probe.
  const target = dragState.dropTarget || getDropTargetAt(clientX, clientY);
  if (!target?.stage) return;

  if (target.stage === "committed" && deal.stage !== "committed") {
    openCommitModal(deal);
    return;
  }

  const ordered = getStageDeals(deal.stage);
  const oldIndex = ordered.findIndex((d) => d.id === deal.id);
  const nextId = ordered[oldIndex + 1]?.id || null;
  if (deal.stage === target.stage && target.insertBeforeId === nextId) return;

  reorderDeal(deal, target.stage, target.insertBeforeId);
  // Paused deals live in Prospects; leaving that column clears the pause.
  if (isDealPaused(deal) && deal.stage !== "prospects") {
    delete deal.pausedAt;
  }
  saveDeals(getStageDeals(target.stage).map((d) => d.id));
  render();
}

function attachCardPointerDrag(card, deal) {
  card.addEventListener("pointerdown", (e) => {
    if (e.button != null && e.button !== 0) return;
    if (e.isPrimary === false) return;
    if (e.target.closest(".card-pause-btn")) return;
    if (dragState) cleanupDrag();

    dragState = {
      dealId: deal.id,
      pointerId: e.pointerId,
      pointerType: e.pointerType || "mouse",
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      activated: false,
      sourceEl: card,
      timer: null,
      scrollRaf: null,
      dropTarget: null,
      ghost: null,
    };

    const isTouch = dragState.pointerType === "touch" || dragState.pointerType === "pen";
    if (isTouch) {
      card.classList.add("is-drag-pending");
      dragState.timer = setTimeout(activateDrag, DRAG_HOLD_MS);
    }
  });
}

document.addEventListener("pointermove", (e) => {
  if (!dragState || e.pointerId !== dragState.pointerId) return;

  dragState.lastX = e.clientX;
  dragState.lastY = e.clientY;
  const dist = Math.hypot(e.clientX - dragState.startX, e.clientY - dragState.startY);

  if (!dragState.activated) {
    if (dragState.pointerType === "mouse") {
      if (dist >= DRAG_MOUSE_ACTIVATE_PX) activateDrag();
    } else if (dist >= DRAG_MOVE_CANCEL_PX) {
      cleanupDrag();
    }
    return;
  }

  e.preventDefault();
  moveDragGhost(e.clientX, e.clientY);
  updateDropIndicators(getDropTargetAt(e.clientX, e.clientY));
}, { passive: false });

document.addEventListener("pointerup", (e) => {
  if (!dragState || e.pointerId !== dragState.pointerId) return;
  const { activated, sourceEl } = dragState;
  const x = Number.isFinite(e.clientX) ? e.clientX : dragState.lastX;
  const y = Number.isFinite(e.clientY) ? e.clientY : dragState.lastY;
  dragState.lastX = x;
  dragState.lastY = y;
  if (activated) commitDragDrop(x, y);
  cleanupDrag();
  if (activated && sourceEl) {
    sourceEl.dataset.suppressClick = "1";
    setTimeout(() => {
      delete sourceEl.dataset.suppressClick;
    }, 0);
  }
});

document.addEventListener("pointercancel", (e) => {
  if (!dragState || e.pointerId !== dragState.pointerId) return;
  cleanupDrag();
});

/* --------------------------- Commit modal ----------------------- */

function openCommitModal(deal) {
  pendingCommitDeal = deal;
  commitDealName.textContent = deal.company;
  commitForm.reset();
  commitForm.elements.startDate.value = deal.committedAt
    ? toDateInputValue(deal.committedAt)
    : toDateInputValue(Date.now());
  if (deal.implementationDays) {
    commitForm.elements.days.value = deal.implementationDays;
  }
  commitOverlay.hidden = false;
  commitForm.elements.startDate.focus();
}

function closeCommitModal() {
  commitOverlay.hidden = true;
  pendingCommitDeal = null;
}

commitForm.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!pendingCommitDeal) return;

  const startDate = parseDateInput(commitForm.elements.startDate.value);
  const days = Number(commitForm.elements.days.value);
  if (!startDate || !days || days < 1) return;

  pendingCommitDeal.committedAt = startDate;
  pendingCommitDeal.implementationDays = days;
  delete pendingCommitDeal.pausedAt;
  reorderDeal(pendingCommitDeal, "committed", null);
  saveDeals(getStageDeals("committed").map((d) => d.id));
  render();
  closeCommitModal();
});

document.getElementById("commitCloseBtn").addEventListener("click", closeCommitModal);
document.getElementById("commitCancelBtn").addEventListener("click", closeCommitModal);
commitOverlay.addEventListener("click", (e) => {
  if (e.target === commitOverlay) closeCommitModal();
});

function formatNoteTimestamp(timestamp) {
  return new Date(timestamp).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatTaskDueDate(timestamp) {
  return new Date(timestamp).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function isTaskOverdue(task, now = Date.now()) {
  if (!task || task.done || task.dueAt == null) return false;
  return task.dueAt < startOfDay(new Date(now)).getTime();
}

function normalizeTask(task) {
  const dueRaw = task?.dueAt;
  const dueAt =
    dueRaw == null || dueRaw === ""
      ? null
      : Number(dueRaw);
  return {
    id: task.id || crypto.randomUUID(),
    text: (task.text || "").trim(),
    dueAt: Number.isFinite(dueAt) ? dueAt : null,
    done: Boolean(task.done),
    completedAt: task.completedAt ?? null,
    createdAt: Number(task.createdAt) || Date.now(),
    updatedAt: task.updatedAt == null ? null : Number(task.updatedAt),
  };
}

function serializeModalTasks() {
  return modalTasks
    .map((task) => normalizeTask(task))
    .filter((task) => task.text && task.dueAt != null);
}

function setModalPanel(panel) {
  modalPanel = panel;

  modalPanelDetails.hidden = panel !== "details";
  modalPanelActivity.hidden = panel !== "activity";
  modalPanelTasks.hidden = panel !== "tasks";

  document.querySelectorAll(".modal-tab").forEach((tab) => {
    const active = tab.dataset.modalTab === panel;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", active ? "true" : "false");
  });

  // Content rendered while a panel was hidden reports scrollHeight 0.
  // Re-render now that the panel is visible so text is measured correctly.
  if (panel === "activity") {
    renderActivityNotes();
  } else if (panel === "tasks") {
    renderDealTasks();
  }
}

function noteWasEdited(note) {
  return Boolean(note.updatedAt && note.updatedAt > note.createdAt);
}

function taskWasEdited(task) {
  return Boolean(task.updatedAt && task.updatedAt > task.createdAt);
}

function updateActivityNoteTime(note, timeEl) {
  timeEl.dateTime = new Date(note.createdAt).toISOString();
  timeEl.textContent = formatNoteTimestamp(note.createdAt);
  if (noteWasEdited(note)) {
    timeEl.textContent += ` · edited ${formatNoteTimestamp(note.updatedAt)}`;
  }
}

function updateDealTaskMeta(task, metaEl) {
  const dueLabel = task.dueAt != null ? formatTaskDueDate(task.dueAt) : "No date";
  let text = dueLabel;
  if (task.done) text += " · completed";
  else if (isTaskOverdue(task)) text += " · overdue";
  if (taskWasEdited(task)) text += ` · edited ${formatNoteTimestamp(task.updatedAt)}`;
  metaEl.textContent = text;
}

function resizeActivityNote(textarea) {
  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight}px`;

  if (document.activeElement === textarea) return;

  const lines = textarea.value.split("\n");
  const longest = Math.max(...lines.map((line) => line.length), 1);
  const chars = Math.min(Math.max(longest, 8), 52);
  textarea.style.width = `${chars}ch`;
}

function renderActivityNotes() {
  activityNotesEl.innerHTML = "";

  if (!modalNotes.length) {
    const empty = document.createElement("p");
    empty.className = "activity-empty";
    empty.textContent = "No notes yet. Add the first one below.";
    activityNotesEl.appendChild(empty);
    return;
  }

  const sorted = [...modalNotes].sort((a, b) => b.createdAt - a.createdAt);

  for (const note of sorted) {
    const card = document.createElement("article");
    card.className = "activity-note";
    card.dataset.noteId = note.id;

    const time = document.createElement("time");
    time.className = "activity-note-time";

    const textarea = document.createElement("textarea");
    textarea.className = "note-textarea";
    textarea.rows = 1;
    textarea.value = note.text;
    textarea.readOnly = modalReadOnly;
    textarea.setAttribute("aria-label", "Note text");

    const initialText = note.text;
    updateActivityNoteTime(note, time);

    textarea.addEventListener("input", () => {
      note.text = textarea.value;
      if (textarea.value !== initialText) {
        note.updatedAt = Date.now();
      }
      updateActivityNoteTime(note, time);
      resizeActivityNote(textarea);
    });
    textarea.addEventListener("focus", () => {
      textarea.style.width = "100%";
      resizeActivityNote(textarea);
    });
    textarea.addEventListener("blur", () => {
      if (textarea.value !== initialText && !noteWasEdited(note)) {
        note.updatedAt = Date.now();
        updateActivityNoteTime(note, time);
      }
      resizeActivityNote(textarea);
    });

    card.append(time, textarea);
    activityNotesEl.appendChild(card);
    resizeActivityNote(textarea);
  }
}

function addActivityNote() {
  const text = newNoteInput.value.trim();
  if (!text) {
    newNoteInput.focus();
    return;
  }

  modalNotes.push({
    id: crypto.randomUUID(),
    text,
    createdAt: Date.now(),
    updatedAt: null,
  });
  newNoteInput.value = "";
  renderActivityNotes();
}

function renderDealTasks() {
  dealTasksListEl.innerHTML = "";

  const visible = [...modalTasks].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return (a.dueAt || 0) - (b.dueAt || 0);
  });

  if (!visible.length) {
    const empty = document.createElement("p");
    empty.className = "deal-tasks-empty";
    empty.textContent = "No tasks yet. Add the first one below.";
    dealTasksListEl.appendChild(empty);
    return;
  }

  for (const task of visible) {
    const card = document.createElement("article");
    card.className = "deal-task";
    card.dataset.taskId = task.id;
    if (task.done) card.classList.add("is-done");
    if (isTaskOverdue(task)) card.classList.add("is-overdue");

    const top = document.createElement("div");
    top.className = "deal-task-top";

    const completeBtn = document.createElement("button");
    completeBtn.type = "button";
    completeBtn.className = "task-complete-btn";
    completeBtn.setAttribute("aria-pressed", task.done ? "true" : "false");
    completeBtn.setAttribute("aria-label", task.done ? "Mark task incomplete" : "Complete task");
    completeBtn.disabled = modalReadOnly;
    completeBtn.addEventListener("click", () => {
      task.done = !task.done;
      task.completedAt = task.done ? Date.now() : null;
      task.updatedAt = Date.now();
      renderDealTasks();
    });

    const fields = document.createElement("div");
    fields.className = "deal-task-fields";

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "task-name-input deal-task-name";
    nameInput.value = task.text || "";
    nameInput.defaultValue = task.text || "";
    nameInput.readOnly = modalReadOnly;
    nameInput.setAttribute("aria-label", "Task name");
    // Keep task editors out of deal-form constraint validation / reset ownership quirks.
    nameInput.setAttribute("form", "mhn-task-composer-unbound");
    const initialText = task.text || "";

    const dueInput = document.createElement("input");
    dueInput.type = "date";
    dueInput.className = "deal-task-due";
    dueInput.value = task.dueAt != null ? toDateInputValue(task.dueAt) : "";
    dueInput.defaultValue = dueInput.value;
    dueInput.readOnly = modalReadOnly;
    dueInput.disabled = modalReadOnly;
    dueInput.setAttribute("aria-label", "Task due date");
    dueInput.setAttribute("form", "mhn-task-composer-unbound");
    const initialDue = dueInput.value;

    const meta = document.createElement("p");
    meta.className = "deal-task-meta";
    updateDealTaskMeta(task, meta);

    nameInput.addEventListener("input", () => {
      task.text = nameInput.value;
      if (nameInput.value !== initialText) task.updatedAt = Date.now();
      updateDealTaskMeta(task, meta);
    });
    nameInput.addEventListener("blur", () => {
      if (nameInput.value !== initialText && !taskWasEdited(task)) {
        task.updatedAt = Date.now();
        updateDealTaskMeta(task, meta);
      }
    });

    dueInput.addEventListener("change", () => {
      const nextDue = parseDateInput(dueInput.value);
      if (nextDue == null) {
        dueInput.value = initialDue;
        dueInput.blur();
        return;
      }
      task.dueAt = nextDue;
      if (dueInput.value !== initialDue) task.updatedAt = Date.now();
      card.classList.toggle("is-overdue", isTaskOverdue(task));
      updateDealTaskMeta(task, meta);
      // Close the native date picker immediately after a choice.
      dueInput.blur();
    });

    fields.append(nameInput, dueInput, meta);
    top.append(completeBtn, fields);
    card.append(top);
    dealTasksListEl.appendChild(card);
  }
}

function addDealTask() {
  if (modalReadOnly) return;
  const text = newTaskNameInput.value.trim();
  const dueAt = parseDateInput(newTaskDueInput.value);
  if (!text) {
    newTaskNameInput.focus();
    return;
  }
  if (dueAt == null) {
    newTaskDueInput.focus();
    return;
  }

  modalTasks.push({
    id: crypto.randomUUID(),
    text,
    dueAt,
    done: false,
    completedAt: null,
    createdAt: Date.now(),
    updatedAt: null,
  });
  newTaskNameInput.value = "";
  newTaskDueInput.value = "";
  renderDealTasks();
  newTaskNameInput.focus();
}

/* ------------------------------ Tasks view ---------------------- */

function getAllTaskEntries({ includeCompleted = showCompletedTasks } = {}) {
  const entries = [];
  for (const deal of getFilteredDeals()) {
    for (const task of deal.tasks || []) {
      if (!task?.text || task.dueAt == null) continue;
      if (!includeCompleted && task.done) continue;
      entries.push({ deal, task: normalizeTask(task) });
    }
  }
  entries.sort((a, b) => {
    if (a.task.done !== b.task.done) return a.task.done ? 1 : -1;
    if (a.task.dueAt !== b.task.dueAt) return a.task.dueAt - b.task.dueAt;
    return (a.task.createdAt || 0) - (b.task.createdAt || 0);
  });
  return entries;
}

function getTasksForSelectedDate(entries) {
  if (tasksCalendarState.selectedDate == null) return entries;
  return entries.filter((entry) => entry.task.dueAt === tasksCalendarState.selectedDate);
}

function setDealTaskDone(dealId, taskId, done) {
  const deal = deals.find((d) => d.id === dealId);
  if (!deal) return;
  if (!Array.isArray(deal.tasks)) deal.tasks = [];
  const task = deal.tasks.find((t) => t.id === taskId);
  if (!task) return;
  task.done = done;
  task.completedAt = done ? Date.now() : null;
  task.updatedAt = Date.now();
  saveDeals(dealId);
  render();
}

function renderTasksCalendar(entries) {
  tasksCalendarEl.innerHTML = "";

  const monthStart = tasksCalendarState.monthStart || startOfMonth(new Date());
  const monthLabel = monthStart.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const header = document.createElement("div");
  header.className = "tasks-cal-header";

  const prevBtn = document.createElement("button");
  prevBtn.type = "button";
  prevBtn.className = "period-nav";
  prevBtn.setAttribute("aria-label", "Previous month");
  prevBtn.textContent = "‹";
  prevBtn.addEventListener("click", () => {
    tasksCalendarState.monthStart = addMonths(monthStart, -1);
    renderTasksView();
  });

  const nextBtn = document.createElement("button");
  nextBtn.type = "button";
  nextBtn.className = "period-nav";
  nextBtn.setAttribute("aria-label", "Next month");
  nextBtn.textContent = "›";
  nextBtn.addEventListener("click", () => {
    tasksCalendarState.monthStart = addMonths(monthStart, 1);
    renderTasksView();
  });

  const title = document.createElement("span");
  title.className = "tasks-cal-month";
  title.textContent = monthLabel;

  header.append(prevBtn, title, nextBtn);

  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.className = "btn btn-ghost btn-sm tasks-cal-clear";
  clearBtn.textContent = "All dates";
  clearBtn.hidden = tasksCalendarState.selectedDate == null;
  clearBtn.addEventListener("click", () => {
    tasksCalendarState.selectedDate = null;
    renderTasksView();
  });

  const weekdayRow = document.createElement("div");
  weekdayRow.className = "tasks-cal-weekdays";
  for (const label of ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]) {
    const cell = document.createElement("span");
    cell.textContent = label;
    weekdayRow.appendChild(cell);
  }

  const grid = document.createElement("div");
  grid.className = "tasks-cal-grid";

  const year = monthStart.getFullYear();
  const month = monthStart.getMonth();
  const firstDay = new Date(year, month, 1);
  // Monday-first offset
  const startOffset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStart = startOfDay(new Date()).getTime();

  const dueCounts = new Map();
  for (const { task } of entries) {
    if (task.dueAt == null) continue;
    dueCounts.set(task.dueAt, (dueCounts.get(task.dueAt) || 0) + 1);
  }

  for (let i = 0; i < startOffset; i++) {
    const empty = document.createElement("span");
    empty.className = "tasks-cal-day is-empty";
    grid.appendChild(empty);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateTs = startOfDay(new Date(year, month, day)).getTime();
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tasks-cal-day";
    btn.textContent = String(day);
    if (dateTs === todayStart) btn.classList.add("is-today");
    if (tasksCalendarState.selectedDate === dateTs) btn.classList.add("is-selected");
    if (dueCounts.has(dateTs)) {
      btn.classList.add("has-tasks");
      btn.title = `${dueCounts.get(dateTs)} task${dueCounts.get(dateTs) === 1 ? "" : "s"}`;
    }
    btn.addEventListener("click", () => {
      tasksCalendarState.selectedDate =
        tasksCalendarState.selectedDate === dateTs ? null : dateTs;
      renderTasksView();
    });
    grid.appendChild(btn);
  }

  tasksCalendarEl.append(header, clearBtn, weekdayRow, grid);
}

function renderTasksView() {
  const allEntries = getAllTaskEntries();

  tasksShowCompletedBtn.setAttribute("aria-pressed", showCompletedTasks ? "true" : "false");
  tasksShowCompletedBtn.textContent = showCompletedTasks ? "Hide completed" : "Show completed";
  tasksShowCompletedBtn.classList.toggle("is-active", showCompletedTasks);

  document.querySelectorAll(".tasks-view-btn").forEach((btn) => {
    const active = btn.dataset.tasksView === tasksViewMode;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-pressed", active ? "true" : "false");
  });

  const isPipeline = tasksViewMode === "pipeline";
  if (tasksListLayout) tasksListLayout.hidden = isPipeline;
  if (tasksPipelineLayout) tasksPipelineLayout.hidden = !isPipeline;
  if (tasksPipelinePeriod) tasksPipelinePeriod.hidden = !isPipeline;

  if (isPipeline) {
    renderTasksPipeline(allEntries);
    return;
  }

  const entries = getTasksForSelectedDate(allEntries);

  if (tasksCalendarState.selectedDate != null) {
    tasksListTitle.textContent = formatTaskDueDate(tasksCalendarState.selectedDate);
    tasksListLead.textContent = showCompletedTasks
      ? "Tasks due on this day, including completed."
      : "Open tasks due on this day.";
  } else {
    tasksListTitle.textContent = "Tasks";
    tasksListLead.textContent = showCompletedTasks
      ? "All tasks sorted by due date."
      : "Open tasks sorted by due date.";
  }

  renderTasksCalendar(allEntries);

  tasksListEl.innerHTML = "";

  if (!entries.length) {
    const empty = document.createElement("p");
    empty.className = "tasks-empty";
    const filtersActive = hasActiveFilters() || searchQuery;
    if (tasksCalendarState.selectedDate != null) {
      empty.textContent = "No tasks on this date.";
    } else if (filtersActive) {
      empty.textContent = "No tasks match the current filters.";
    } else {
      empty.textContent = showCompletedTasks
        ? "No tasks yet. Add tasks from a deal’s Tasks tab."
        : "No open tasks. Add tasks from a deal’s Tasks tab.";
    }
    tasksListEl.appendChild(empty);
    return;
  }

  for (const { deal, task } of entries) {
    tasksListEl.appendChild(renderTaskCard(deal, task));
  }
}

function getTasksPipelineAnchor() {
  return startOfDay(tasksPipelineState.anchorDate || new Date());
}

function getTasksPipelinePeriodRange() {
  const anchor = getTasksPipelineAnchor();
  const start = addDays(anchor, -TASKS_PIPELINE_LOOKBACK_DAYS).getTime();
  const end = shiftDateByMonths(anchor, tasksPipelineState.periodMonths).getTime();
  return {
    start,
    end,
    span: Math.max(end - start, MS_DAY),
    anchor: anchor.getTime(),
  };
}

function getOverlappingMonthStarts(rangeStartMs, rangeEndMs) {
  const months = [];
  let cursor = startOfMonth(new Date(rangeStartMs));
  while (cursor.getTime() < rangeEndMs) {
    months.push(new Date(cursor));
    cursor = addMonths(cursor, 1);
  }
  return months;
}

function getISOWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / MS_DAY + 1) / 7);
}

function startOfISOWeek(date) {
  const d = startOfDay(date);
  const day = d.getDay(); // 0 Sun … 6 Sat
  const offset = day === 0 ? -6 : 1 - day; // Monday-start
  return addDays(d, offset);
}

function renderTasksPipelineScale(periodStart, periodEnd, span) {
  const scale = document.createElement("div");
  scale.className = "tasks-pipeline-axis-scale";
  scale.setAttribute("aria-hidden", "true");

  if (tasksPipelineState.periodMonths <= 1) {
    // Day markers for the one-month view.
    let cursor = startOfDay(new Date(periodStart));
    while (cursor.getTime() < periodEnd) {
      const ts = cursor.getTime();
      const left = ((ts - periodStart) / span) * 100;
      const tick = document.createElement("span");
      tick.className = "tasks-pipeline-scale-tick tasks-pipeline-scale-day";
      tick.style.left = `${left}%`;
      tick.textContent = String(cursor.getDate());
      scale.appendChild(tick);
      cursor = addDays(cursor, 1);
    }
  } else {
    // Week markers for multi-month views (ISO week numbers).
    const seen = new Set();
    let cursor = startOfISOWeek(new Date(periodStart));
    while (cursor.getTime() < periodEnd) {
      const weekStart = cursor.getTime();
      const weekNo = getISOWeekNumber(cursor);
      const key = `${cursor.getFullYear()}-W${weekNo}`;
      if (!seen.has(key)) {
        seen.add(key);
        const leftMs = Math.max(weekStart, periodStart);
        const left = ((leftMs - periodStart) / span) * 100;
        const tick = document.createElement("span");
        tick.className = "tasks-pipeline-scale-tick tasks-pipeline-scale-week";
        tick.style.left = `${left}%`;
        tick.textContent = `week ${weekNo}`;
        scale.appendChild(tick);
      }
      cursor = addDays(cursor, 7);
    }
  }

  return scale;
}

function truncateTaskPipelineLabel(text) {
  const value = (text || "").trim();
  if (value.length <= TASKS_PIPELINE_LABEL_MAX) return value;
  return `${value.slice(0, TASKS_PIPELINE_LABEL_MAX)}...`;
}

/** Days from today to the task due date: +2 future, 0 today, -3 past. */
function formatTaskDayOffset(dueAt) {
  const today = startOfDay(new Date()).getTime();
  const due = startOfDay(new Date(dueAt)).getTime();
  const days = Math.round((due - today) / MS_DAY);
  if (days > 0) return `+${days}`;
  return String(days);
}

/** Estimate how far a fit-content task bar extends in timeline ms. */
function estimateTaskBarWidthMs(entry, span, rowWidthPx) {
  const labelLen = Math.max(1, truncateTaskPipelineLabel(entry.task.text).length);
  const offsetLen = formatTaskDayOffset(entry.task.dueAt).length;
  // Rough match to CSS: chars + padding + day-offset badge, against the visible rows width.
  const approxPx = labelLen * 8.5 + offsetLen * 6.5 + 52;
  const widthMs = (approxPx / Math.max(rowWidthPx, 1)) * span;
  const gapMs = (8 / Math.max(rowWidthPx, 1)) * span; // small breathing room
  return Math.max(MS_DAY, widthMs) + gapMs;
}

/**
 * Pack tasks into rows using each bar's visual footprint (not just due date),
 * so fit-content bubbles don't overlap on the same row.
 */
function assignTaskPipelineRows(entries, span, rowWidthPx = 720) {
  const sorted = [...entries].sort((a, b) => a.task.dueAt - b.task.dueAt);
  const rowEnds = [];

  for (const entry of sorted) {
    const start = entry.task.dueAt;
    const end = start + estimateTaskBarWidthMs(entry, span, rowWidthPx);
    let row = 0;
    while (row < rowEnds.length && rowEnds[row] > start) row += 1;
    if (row === rowEnds.length) rowEnds.push(0);
    rowEnds[row] = end;
    entry._pipelineRow = row;
    entry._pipelineStart = start;
    entry._pipelineEnd = end;
  }

  return rowEnds.length;
}

/** After items are in the DOM, re-pack from measured widths so nothing overlaps. */
function relayoutTaskPipelineBars() {
  const items = [...tasksPipelineRowsEl.querySelectorAll(".tasks-pipeline-item")];
  if (!items.length) return;

  const rowWidthPx = Math.max(tasksPipelineRowsEl.clientWidth || 720, 1);
  const placed = []; // { row, leftPx, rightPx }

  // Sort left-to-right so earlier dues claim upper rows first.
  items.sort((a, b) => (parseFloat(a.style.left) || 0) - (parseFloat(b.style.left) || 0));

  for (const item of items) {
    const leftPct = parseFloat(item.style.left) || 0;
    const leftPx = (leftPct / 100) * rowWidthPx;
    const widthPx = Math.max(item.offsetWidth, 1);
    const rightPx = leftPx + widthPx + 8; // 8px gap

    let row = 0;
    while (
      placed.some(
        (entry) => entry.row === row && entry.leftPx < rightPx && leftPx < entry.rightPx
      )
    ) {
      row += 1;
    }

    placed.push({ row, leftPx, rightPx });
    item.style.top = `${row * TASKS_PIPELINE_ROW_HEIGHT + TASKS_PIPELINE_BAR_TOP}px`;
    item.dataset.pipelineRow = String(row);
  }

  const rowCount = placed.reduce((max, entry) => Math.max(max, entry.row + 1), 1);
  const finalRows = Math.max(rowCount, 2);
  tasksPipelineRowsEl.style.height = `${finalRows * TASKS_PIPELINE_ROW_HEIGHT}px`;

  // Rebuild row dividers to match the final packed height.
  tasksPipelineRowsEl.querySelectorAll(".tasks-pipeline-row-divider").forEach((el) => el.remove());
  for (let row = 1; row < finalRows; row += 1) {
    const divider = document.createElement("div");
    divider.className = "tasks-pipeline-row-divider";
    divider.style.top = `${row * TASKS_PIPELINE_ROW_HEIGHT}px`;
    tasksPipelineRowsEl.appendChild(divider);
  }
}

function getMonthTaskCount(entries, monthStart, monthEnd) {
  const monthStartMs = monthStart.getTime();
  const monthEndMs = monthEnd.getTime();
  return entries.reduce((count, { task }) => {
    if (task.dueAt >= monthStartMs && task.dueAt < monthEndMs) return count + 1;
    return count;
  }, 0);
}

function shiftTasksPipelinePeriod(directionMonths) {
  tasksPipelineState.anchorDate = shiftDateByMonths(
    getTasksPipelineAnchor(),
    directionMonths
  );
  if (activeTab === "tasks") renderTasksView();
  else render();
}

function setTasksViewMode(mode) {
  if (mode !== "list" && mode !== "pipeline") return;
  hideTasksPipelineTooltip();
  tasksViewMode = mode;
  if (mode === "pipeline") {
    // Opening pipeline always recenters on today so the lookback + forward span is clear.
    tasksPipelineState.anchorDate = startOfDay(new Date());
  }
  if (activeTab === "tasks") renderTasksView();
}

function hideTasksPipelineTooltip() {
  const tip = document.getElementById("tasksPipelineTooltip");
  if (tip) tip.hidden = true;
}

function showTasksPipelineTooltip(bar, deal, task) {
  let tip = document.getElementById("tasksPipelineTooltip");
  if (!tip) {
    tip = document.createElement("div");
    tip.id = "tasksPipelineTooltip";
    tip.className = "tasks-pipeline-tooltip";
    tip.setAttribute("role", "tooltip");
    document.body.appendChild(tip);
  }

  const owner = (deal.owner || "").trim() || "Unassigned";
  const company = (deal.company || "").trim() || "Untitled deal";
  tip.innerHTML = "";

  const title = document.createElement("div");
  title.className = "tasks-pipeline-tooltip-title";
  title.textContent = task.text;

  const dealRow = document.createElement("div");
  dealRow.className = "tasks-pipeline-tooltip-row";
  dealRow.innerHTML = `<span class="tasks-pipeline-tooltip-label">Deal</span>`;
  const dealVal = document.createElement("span");
  dealVal.textContent = company;
  dealRow.appendChild(dealVal);

  const ownerRow = document.createElement("div");
  ownerRow.className = "tasks-pipeline-tooltip-row";
  ownerRow.innerHTML = `<span class="tasks-pipeline-tooltip-label">Owner</span>`;
  const ownerVal = document.createElement("span");
  ownerVal.textContent = owner;
  ownerRow.appendChild(ownerVal);

  const dueRow = document.createElement("div");
  dueRow.className = "tasks-pipeline-tooltip-row";
  dueRow.innerHTML = `<span class="tasks-pipeline-tooltip-label">Due</span>`;
  const dueVal = document.createElement("span");
  dueVal.textContent = formatTaskDueDate(task.dueAt);
  dueRow.appendChild(dueVal);

  tip.append(title, dealRow, ownerRow, dueRow);
  tip.hidden = false;

  const rect = bar.getBoundingClientRect();
  const tipWidth = tip.offsetWidth || 220;
  const tipHeight = tip.offsetHeight || 96;
  let left = rect.left + rect.width / 2 - tipWidth / 2;
  let top = rect.top - tipHeight - 10;
  left = Math.max(8, Math.min(left, window.innerWidth - tipWidth - 8));
  if (top < 8) top = rect.bottom + 10;
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
}

function renderTasksPipeline(entries) {
  hideTasksPipelineTooltip();

  const { start: periodStart, end: periodEnd, span } = getTasksPipelinePeriodRange();

  tasksPipelinePeriodLabel.textContent = `${formatMonthDay(new Date(periodStart))} – ${formatMonthDay(new Date(periodEnd - MS_DAY))}`;
  tasksPipelinePeriodLength.value = String(tasksPipelineState.periodMonths);

  const visibleEntries = entries.filter((entry) => {
    const due = entry.task.dueAt;
    return Number.isFinite(due) && due >= periodStart && due < periodEnd;
  });

  const months = getOverlappingMonthStarts(periodStart, periodEnd);

  tasksPipelineAxisEl.innerHTML = "";
  tasksPipelineAxisEl.classList.toggle(
    "is-day-scale",
    tasksPipelineState.periodMonths <= 1
  );
  tasksPipelineAxisEl.classList.toggle(
    "is-week-scale",
    tasksPipelineState.periodMonths > 1
  );

  const monthsRow = document.createElement("div");
  monthsRow.className = "tasks-pipeline-axis-months";

  for (const monthStart of months) {
    const monthEnd = addMonths(monthStart, 1);
    const visibleStart = Math.max(monthStart.getTime(), periodStart);
    const visibleEnd = Math.min(monthEnd.getTime(), periodEnd);
    if (visibleEnd <= visibleStart) continue;

    const count = getMonthTaskCount(entries, monthStart, monthEnd);
    const left = ((visibleStart - periodStart) / span) * 100;
    const width = ((visibleEnd - visibleStart) / span) * 100;

    const tick = document.createElement("div");
    tick.className = "tasks-pipeline-tick";
    tick.style.left = `${left}%`;
    tick.style.width = `${width}%`;

    const label = document.createElement("span");
    label.className = "tasks-pipeline-tick-label";
    label.textContent = formatMonthLabel(monthStart);

    const countEl = document.createElement("span");
    countEl.className = "tasks-pipeline-tick-count";
    countEl.title = `${count} task${count === 1 ? "" : "s"} due in ${formatMonthYear(monthStart)}`;
    countEl.textContent = count === 0 ? "—" : `${count} task${count === 1 ? "" : "s"}`;

    tick.append(label, countEl);
    monthsRow.appendChild(tick);
  }

  const today = startOfDay(new Date()).getTime();
  const todayInPeriod = today >= periodStart && today < periodEnd;
  if (todayInPeriod) {
    const todayPct = ((today - periodStart) / span) * 100;
    const todayTick = document.createElement("div");
    todayTick.className = "tasks-pipeline-tick tasks-pipeline-tick-today";
    todayTick.style.left = `${todayPct}%`;
    todayTick.innerHTML = `<span class="tasks-pipeline-tick-label">Today</span>`;
    monthsRow.appendChild(todayTick);
  }

  tasksPipelineAxisEl.append(
    monthsRow,
    renderTasksPipelineScale(periodStart, periodEnd, span)
  );

  tasksPipelineRowsEl.innerHTML = "";
  const rowWidthPx = Math.max(
    tasksPipelineLayout?.clientWidth || tasksPipelineRowsEl.clientWidth || 720,
    720
  );
  const rowCount = Math.max(
    assignTaskPipelineRows(visibleEntries, span, rowWidthPx),
    1
  );
  tasksPipelineRowsEl.style.height = `${Math.max(rowCount, 2) * TASKS_PIPELINE_ROW_HEIGHT}px`;

  for (const monthStart of months) {
    const monthMs = monthStart.getTime();
    if (monthMs <= periodStart || monthMs >= periodEnd) continue;
    const gridLine = document.createElement("div");
    gridLine.className = "tasks-pipeline-gridline";
    gridLine.style.left = `${((monthMs - periodStart) / span) * 100}%`;
    tasksPipelineRowsEl.appendChild(gridLine);
  }

  for (let row = 1; row < Math.max(rowCount, 2); row += 1) {
    const divider = document.createElement("div");
    divider.className = "tasks-pipeline-row-divider";
    divider.style.top = `${row * TASKS_PIPELINE_ROW_HEIGHT}px`;
    tasksPipelineRowsEl.appendChild(divider);
  }

  if (todayInPeriod) {
    const todayPct = ((today - periodStart) / span) * 100;
    const todayLine = document.createElement("div");
    todayLine.className = "tasks-pipeline-today-line";
    todayLine.style.left = `${todayPct}%`;
    // Line only — the axis already shows the Today label.
    tasksPipelineRowsEl.appendChild(todayLine);
  }

  if (!visibleEntries.length) {
    const empty = document.createElement("div");
    empty.className = "tasks-pipeline-empty";
    const filtersActive = hasActiveFilters() || searchQuery;
    empty.textContent = filtersActive
      ? "No matching tasks in this period"
      : showCompletedTasks
        ? "No tasks in this period — add tasks from a deal’s Tasks tab"
        : "No open tasks in this period";
    tasksPipelineRowsEl.appendChild(empty);
    return;
  }

  for (const entry of visibleEntries) {
    const { deal, task } = entry;
    const left = ((entry._pipelineStart - periodStart) / span) * 100;

    const item = document.createElement("div");
    item.className = "tasks-pipeline-item";
    item.style.left = `${left}%`;
    item.style.top = `${entry._pipelineRow * TASKS_PIPELINE_ROW_HEIGHT + TASKS_PIPELINE_BAR_TOP}px`;

    const dayOffset = document.createElement("span");
    dayOffset.className = "tasks-pipeline-day-offset";
    dayOffset.textContent = formatTaskDayOffset(task.dueAt);

    const bar = document.createElement("button");
    bar.type = "button";
    bar.className = "tasks-pipeline-bar";
    if (task.done) bar.classList.add("is-done");
    if (isTaskOverdue(task)) bar.classList.add("is-overdue");
    bar.setAttribute(
      "aria-label",
      `${task.text}, ${deal.company || "Untitled deal"}, due ${formatTaskDueDate(task.dueAt)}`
    );

    const text = document.createElement("span");
    text.className = "tasks-pipeline-bar-text";

    const label = document.createElement("span");
    label.className = "tasks-pipeline-bar-label";
    label.textContent = truncateTaskPipelineLabel(task.text);

    text.append(label);
    bar.append(text);
    bar.addEventListener("mouseenter", () => showTasksPipelineTooltip(bar, deal, task));
    bar.addEventListener("mousemove", () => showTasksPipelineTooltip(bar, deal, task));
    bar.addEventListener("mouseleave", hideTasksPipelineTooltip);
    bar.addEventListener("focus", () => showTasksPipelineTooltip(bar, deal, task));
    bar.addEventListener("blur", hideTasksPipelineTooltip);
    bar.addEventListener("click", () => {
      hideTasksPipelineTooltip();
      openModal({ deal, initialPanel: "tasks", focusTaskId: task.id });
    });

    item.append(dayOffset, bar);
    tasksPipelineRowsEl.appendChild(item);
  }

  // Measure real bubble widths and push colliding tasks onto lower rows.
  requestAnimationFrame(() => relayoutTaskPipelineBars());
}

function renderTaskCard(deal, task) {
  const card = document.createElement("article");
  card.className = "task-card";
  if (task.done) card.classList.add("is-done");
  if (isTaskOverdue(task)) card.classList.add("is-overdue");

  const main = document.createElement("div");
  main.className = "task-card-main";

  const completeBtn = document.createElement("button");
  completeBtn.type = "button";
  completeBtn.className = "task-complete-btn";
  completeBtn.setAttribute("aria-pressed", task.done ? "true" : "false");
  completeBtn.setAttribute("aria-label", task.done ? "Mark task incomplete" : "Complete task");
  completeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    setDealTaskDone(deal.id, task.id, !task.done);
  });

  const body = document.createElement("div");
  body.className = "task-card-body";

  const name = document.createElement("h3");
  name.className = "task-card-name";
  name.textContent = task.text;

  const company = document.createElement("p");
  company.className = "task-card-company";
  company.textContent = deal.company || "Untitled deal";

  const meta = document.createElement("p");
  meta.className = "task-card-meta";
  const bits = [formatTaskDueDate(task.dueAt)];
  if (deal.owner) bits.push(deal.owner);
  if (task.done) bits.push("Completed");
  else if (isTaskOverdue(task)) bits.push("Overdue");
  meta.textContent = bits.join(" · ");

  body.append(name, company, meta);
  main.append(completeBtn, body);

  const openBtn = document.createElement("button");
  openBtn.type = "button";
  openBtn.className = "btn btn-ghost btn-sm";
  openBtn.textContent = "Edit";
  openBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    openModal({ deal, initialPanel: "tasks", focusTaskId: task.id });
  });

  card.append(main, openBtn);
  card.addEventListener("click", () =>
    openModal({ deal, initialPanel: "tasks", focusTaskId: task.id })
  );
  card.tabIndex = 0;
  card.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openModal({ deal, initialPanel: "tasks", focusTaskId: task.id });
    }
  });

  return card;
}

/* ------------------------------ Modal --------------------------- */

function openModal({
  deal = null,
  stage = "prospects",
  readOnly = false,
  initialPanel = "details",
  focusTaskId = null,
} = {}) {
  editingId = deal ? deal.id : null;
  modalReadOnly = readOnly && Boolean(deal);
  createStage = stage;
  modalNotes = deal
    ? (deal.notes || []).map((note) => ({ ...note }))
    : [];
  modalTasks = deal
    ? (deal.tasks || []).map((task) => normalizeTask(task))
    : [];

  // Reset first so later-rendered task inputs are not wiped back to empty defaults.
  form.reset();
  form.elements.value.value = deal ? deal.value : DEFAULT_VALUE;

  if (deal) {
    form.elements.company.value = deal.company || "";
    form.elements.contact.value = deal.contact || "";
    form.elements.phone.value = deal.phone || "";
    form.elements.email.value = deal.email || "";
    form.elements.industry.value = deal.industry || "";
    form.elements.tool.value = deal.tool || "";
    form.elements.owner.value = deal.owner || "";

    const showImplementation = deal.stage === "committed";
    implementationFields.hidden = !showImplementation;
    form.elements.implementationStart.required = showImplementation;
    form.elements.implementationDuration.required = showImplementation;

    if (showImplementation) {
      form.elements.implementationStart.value = deal.committedAt
        ? toDateInputValue(deal.committedAt)
        : "";
      form.elements.implementationDuration.value = deal.implementationDays || "";
    } else {
      form.elements.implementationStart.value = "";
      form.elements.implementationDuration.value = "";
    }
  } else {
    implementationFields.hidden = true;
    form.elements.implementationStart.required = false;
    form.elements.implementationDuration.required = false;
    form.elements.implementationStart.value = "";
    form.elements.implementationDuration.value = "";
    form.elements.owner.value = getCurrentUserName();
  }

  newNoteInput.value = "";
  newTaskNameInput.value = "";
  newTaskDueInput.value = "";
  setModalPanel(initialPanel);
  renderActivityNotes();
  renderDealTasks();

  modalTitle.textContent = modalReadOnly
    ? "View deal"
    : deal
      ? "Edit deal"
      : "New deal";
  saveBtn.textContent = deal ? "Save changes" : "Create deal";
  deleteBtn.hidden = !deal;

  applyModalReadOnly(modalReadOnly);

  overlay.hidden = false;

  if (focusTaskId) {
    const taskCard = dealTasksListEl.querySelector(`[data-task-id="${focusTaskId}"]`);
    const taskNameInput = taskCard?.querySelector(".deal-task-name");
    if (taskNameInput && !modalReadOnly) {
      taskCard.scrollIntoView({ block: "nearest" });
      taskNameInput.focus();
      taskNameInput.select?.();
    }
  } else if (!modalReadOnly && initialPanel === "details") {
    form.elements.company.focus();
  } else if (!modalReadOnly && initialPanel === "tasks" && !modalTasks.length) {
    newTaskNameInput.focus();
  }
}

function applyModalReadOnly(isReadOnly) {
  modalEl.classList.toggle("is-readonly", isReadOnly);

  for (const el of form.elements) {
    if (el.tagName === "BUTTON") continue;
    if (el.type === "checkbox" || el.type === "radio") {
      el.disabled = isReadOnly;
    } else {
      el.readOnly = isReadOnly;
    }
  }

  saveBtn.hidden = isReadOnly;
  deleteBtn.hidden = isReadOnly || !editingId;
  activityComposer.hidden = isReadOnly;
  dealTasksComposer.hidden = isReadOnly;
  newTaskNameInput.readOnly = isReadOnly;
  newTaskDueInput.disabled = isReadOnly;
  cancelBtn.textContent = isReadOnly ? "Close" : "Cancel";
}

function closeModal() {
  closeAllFieldSuggestions();
  closePendingDraftModal();
  overlay.hidden = true;
  editingId = null;
  modalReadOnly = false;
  applyModalReadOnly(false);
  modalNotes = [];
  modalTasks = [];
  newNoteInput.value = "";
  newTaskNameInput.value = "";
  newTaskDueInput.value = "";
  setModalPanel("details");
}

function openDismissModal() {
  if (!editingId) return;
  const deal = deals.find((d) => d.id === editingId);
  const name = deal?.company ? ` “${deal.company}”` : "";
  dismissLead.textContent = `Are you sure you want to dismiss this deal${name}?`;
  dismissOverlay.hidden = false;
}

function closeDismissModal() {
  dismissOverlay.hidden = true;
}

function dismissDeal() {
  if (!editingId) return;
  const deal = deals.find((d) => d.id === editingId);
  if (!deal) return;
  deal.stage = "dismissed";
  deal.dismissedAt = Date.now();
  delete deal.pausedAt;
  saveDeals(deal.id);
  render();
  closeDismissModal();
  closeModal();
}

historySearchInput.addEventListener("input", () => {
  historySearchQuery = historySearchInput.value;
  if (activeTab === "history") renderHistory();
});

function permanentlyDeleteDeal() {
  if (!editingId) return;
  const id = editingId;
  deals = deals.filter((d) => d.id !== id);

  const api = window.MHN_DB;
  const finishUi = () => {
    render();
    closeDismissModal();
    closeModal();
  };

  // Local cache + single-row cloud delete (never a full-table rewrite).
  if (api?.deleteDealAsync) {
    api
      .deleteDealAsync(id, deals)
      .then((result) => {
        if (result?.writeBlocked && result.reason === "not-hydrated") {
          showSyncStatus(
            "Offline — deal removed locally; cloud delete pending reconnect.",
            true,
            true
          );
        }
      })
      .catch((err) => {
        console.error(err);
        showSyncStatus(
          `Could not delete deal from cloud${syncErrorDetail(err)}`,
          true,
          true
        );
      });
  } else {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(deals));
  }

  finishUi();
}

function hasPendingNoteDraft() {
  return Boolean(newNoteInput?.value.trim());
}

function hasPendingTaskDraft() {
  return Boolean(newTaskNameInput?.value.trim());
}

function closePendingDraftModal() {
  if (!pendingDraftOverlay) return;
  pendingDraftOverlay.hidden = true;
  pendingDraftKind = null;
}

function openPendingDraftModal(kind) {
  pendingDraftKind = kind;
  if (kind === "task") {
    pendingDraftTitle.textContent = "Unadded task";
    pendingDraftLead.textContent =
      "You wrote a task name that hasn’t been added yet. Add it before saving this deal?";
    pendingDraftConfirmBtn.textContent = "Yes, add task";
  } else {
    pendingDraftTitle.textContent = "Unadded note";
    pendingDraftLead.textContent =
      "You wrote a note that hasn’t been added yet. Add it before saving this deal?";
    pendingDraftConfirmBtn.textContent = "Yes, add note";
  }
  pendingDraftOverlay.hidden = false;
}

function confirmPendingDraft() {
  if (pendingDraftKind === "note") {
    addActivityNote();
    if (hasPendingNoteDraft()) return;
    closePendingDraftModal();
    if (hasPendingTaskDraft()) {
      openPendingDraftModal("task");
      return;
    }
    saveDealFromForm();
    return;
  }

  if (pendingDraftKind === "task") {
    if (newTaskDueInput && parseDateInput(newTaskDueInput.value) == null) {
      newTaskDueInput.value = toDateInputValue(Date.now());
    }
    addDealTask();
    if (hasPendingTaskDraft()) {
      closePendingDraftModal();
      setModalPanel("tasks");
      if (parseDateInput(newTaskDueInput?.value) == null) newTaskDueInput?.focus();
      else newTaskNameInput?.focus();
      return;
    }
    closePendingDraftModal();
    saveDealFromForm();
  }
}

function saveDealFromForm() {
  const data = {
    company: toTitleCase(form.elements.company.value),
    contact: toTitleCase(form.elements.contact.value),
    phone: form.elements.phone.value.trim(),
    email: form.elements.email.value.trim(),
    industry: toTitleCase(form.elements.industry.value),
    tool: toTitleCase(form.elements.tool.value),
    value: Number(form.elements.value.value) || 0,
    owner: toTitleCase(form.elements.owner.value),
    notes: modalNotes
      .map((note) => ({
        id: note.id,
        text: note.text.trim(),
        createdAt: note.createdAt,
        updatedAt: noteWasEdited(note) ? note.updatedAt : note.createdAt,
      }))
      .filter((note) => note.text),
    tasks: serializeModalTasks().map((task) => ({
      ...task,
      updatedAt: taskWasEdited(task) ? task.updatedAt : task.createdAt,
    })),
  };

  if (editingId) {
    const deal = deals.find((d) => d.id === editingId);
    Object.assign(deal, data);

    if (deal.stage === "committed") {
      const startDate = parseDateInput(form.elements.implementationStart.value);
      const days = Number(form.elements.implementationDuration.value);
      if (!startDate || !days || days < 1) return;
      deal.committedAt = startDate;
      deal.implementationDays = days;
    }
    saveDeals(deal.id);
  } else {
    const createdAt = Date.now();
    const newDeal = {
      id: crypto.randomUUID(),
      stage: createStage,
      createdAt,
      ...data,
      boardOrder: nextBoardOrder(createStage),
      notes: [makeDealCreationNote(createdAt), ...(data.notes || [])],
      tasks: data.tasks || [],
    };
    deals.push(newDeal);
    saveDeals(newDeal.id);
  }

  render();
  closeModal();
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  if (modalReadOnly) return;
  if (hasPendingNoteDraft()) {
    openPendingDraftModal("note");
    return;
  }
  if (hasPendingTaskDraft()) {
    openPendingDraftModal("task");
    return;
  }
  saveDealFromForm();
});

document.querySelectorAll(".modal-tab").forEach((tab) => {
  tab.addEventListener("click", () => setModalPanel(tab.dataset.modalTab));
});
document.getElementById("addNoteBtn").addEventListener("click", addActivityNote);
document.getElementById("addTaskBtn").addEventListener("click", addDealTask);
newTaskNameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    addDealTask();
  }
});
if (newTaskDueInput) {
  newTaskDueInput.addEventListener("change", () => {
    // Dismiss the native date picker as soon as a date is chosen.
    newTaskDueInput.blur();
  });
}
if (tasksShowCompletedBtn) {
  tasksShowCompletedBtn.addEventListener("click", () => {
    showCompletedTasks = !showCompletedTasks;
    if (activeTab === "tasks") renderTasksView();
  });
}
if (tasksClearFiltersBtn) {
  tasksClearFiltersBtn.addEventListener("click", clearFilters);
}

document.querySelectorAll(".tasks-view-btn").forEach((btn) => {
  btn.addEventListener("click", () => setTasksViewMode(btn.dataset.tasksView));
});

const tasksPipelinePrevBtn = document.getElementById("tasksPipelinePrevBtn");
const tasksPipelineNextBtn = document.getElementById("tasksPipelineNextBtn");
if (tasksPipelinePrevBtn) {
  tasksPipelinePrevBtn.addEventListener("click", () => {
    shiftTasksPipelinePeriod(-tasksPipelineState.periodMonths);
  });
}
if (tasksPipelineNextBtn) {
  tasksPipelineNextBtn.addEventListener("click", () => {
    shiftTasksPipelinePeriod(tasksPipelineState.periodMonths);
  });
}
if (tasksPipelinePeriodLength) {
  tasksPipelinePeriodLength.addEventListener("change", () => {
    tasksPipelineState.periodMonths = Number(tasksPipelinePeriodLength.value) || 1;
    tasksPipelineState.anchorDate = startOfDay(new Date());
    if (activeTab === "tasks") renderTasksView();
  });
}
if (tasksPipelineLayout) {
  tasksPipelineLayout.addEventListener(
    "scroll",
    () => hideTasksPipelineTooltip(),
    { passive: true }
  );
}

deleteBtn.addEventListener("click", openDismissModal);

document.getElementById("dismissConfirmBtn").addEventListener("click", dismissDeal);
document.getElementById("dismissCancelBtn").addEventListener("click", closeDismissModal);
document.getElementById("dismissCloseBtn").addEventListener("click", closeDismissModal);
document.getElementById("deleteForeverBtn").addEventListener("click", permanentlyDeleteDeal);
dismissOverlay.addEventListener("click", (e) => {
  if (e.target === dismissOverlay) closeDismissModal();
});

pauseConfirmBtn.addEventListener("click", confirmPauseAction);
document.getElementById("pauseCancelBtn").addEventListener("click", closePauseModal);
document.getElementById("pauseCloseBtn").addEventListener("click", closePauseModal);
pauseOverlay.addEventListener("click", (e) => {
  if (e.target === pauseOverlay) closePauseModal();
});

document.getElementById("pendingDraftConfirmBtn").addEventListener("click", confirmPendingDraft);
document.getElementById("pendingDraftCancelBtn").addEventListener("click", closePendingDraftModal);
document.getElementById("pendingDraftCloseBtn").addEventListener("click", closePendingDraftModal);
pendingDraftOverlay.addEventListener("click", (e) => {
  if (e.target === pendingDraftOverlay) closePendingDraftModal();
});

document.getElementById("newDealBtn").addEventListener("click", () => openModal());
document.getElementById("modalCloseBtn").addEventListener("click", closeModal);
document.getElementById("cancelBtn").addEventListener("click", closeModal);
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!pendingDraftOverlay.hidden) closePendingDraftModal();
  else if (!pauseOverlay.hidden) closePauseModal();
  else if (!dismissOverlay.hidden) closeDismissModal();
  else if (!commitOverlay.hidden) closeCommitModal();
  else if (!overlay.hidden) closeModal();
  else if (!importOverlay.hidden) closeImportModal();
});

/* -------------------- Import prospects (Excel / CSV) ------------------- */

const SHEETJS_SRC = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
const IMPORT_MAX_ROWS = 300;
const IMPORT_MAX_FILE_BYTES = 5 * 1024 * 1024;
const IMPORT_CHUNK_SIZE = 25;

const IMPORT_COLUMNS = [
  {
    key: "company",
    label: "Company name",
    aliases: ["company", "account", "organisation", "organization", "business", "firm", "prospect", "ettevote", "nimi"],
  },
  {
    key: "contact",
    label: "Contact name",
    aliases: ["contact", "contact person", "person", "kontakt", "kontaktisik"],
  },
  {
    key: "phone",
    label: "Phone",
    aliases: ["phone number", "telephone", "tel", "mobile", "telefon"],
  },
  {
    key: "email",
    label: "Email",
    aliases: ["e mail", "email address", "mail", "e post"],
  },
  {
    key: "industry",
    label: "Industry",
    aliases: ["sector", "vertical", "valdkond", "tegevusala"],
  },
  {
    key: "tool",
    label: "Tool",
    aliases: ["product", "service", "toode", "teenus"],
  },
  {
    key: "owner",
    label: "Owner",
    aliases: ["deal owner", "sales owner", "sales rep", "responsible", "assignee", "omanik", "vastutaja"],
  },
  {
    key: "brief",
    label: "Brief",
    aliases: ["note", "notes", "description", "comment", "comments", "summary", "background", "kirjeldus", "markus"],
  },
  {
    key: "value",
    label: "Sales value",
    aliases: ["value", "deal value", "amount", "revenue", "vaartus", "summa"],
  },
];

/** Legal-form words ignored when deciding whether two company names are the same. */
const COMPANY_SUFFIX_WORDS = new Set([
  "ou", "as", "uab", "sia", "ab", "oy", "oyj", "aps", "asa", "ehf",
  "ltd", "limited", "llc", "llp", "lp", "inc", "incorporated", "corp", "corporation",
  "company", "co", "plc",
  "gmbh", "mbh", "ag", "kg", "kgaa", "ug", "se", "gbr", "ohg",
  "bv", "nv", "cv", "vof", "sa", "sas", "sarl", "srl", "spa", "sl", "slu",
  "kft", "zoo", "sp", "doo", "ead", "ood", "eood", "tov",
]);

const importOverlay = document.getElementById("importOverlay");
const importLocalWarning = document.getElementById("importLocalWarning");
const importDropZone = document.getElementById("importDropZone");
const importFileInput = document.getElementById("importFileInput");
const importFileError = document.getElementById("importFileError");
const importFileNameEl = document.getElementById("importFileName");
const importSummaryEl = document.getElementById("importSummary");
const importPreviewBody = document.getElementById("importPreviewBody");
const importSelectAll = document.getElementById("importSelectAll");
const importConfirmBtn = document.getElementById("importConfirmBtn");
const importProgressEl = document.getElementById("importProgress");
const importProgressBar = document.getElementById("importProgressBar");
const importProgressLabel = document.getElementById("importProgressLabel");
const importResultEl = document.getElementById("importResult");
const importUndoBtn = document.getElementById("importUndoBtn");
const importSteps = {
  file: document.getElementById("importStepFile"),
  preview: document.getElementById("importStepPreview"),
  result: document.getElementById("importStepResult"),
};

let importRows = [];
let importTruncated = false;
let importBusy = false;
let lastImport = null; // { ids: string[], count: number }
let sheetJsPromise = null;

function normalizeHeaderKey(raw) {
  return String(raw ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const IMPORT_HEADER_LOOKUP = new Map();
for (const column of IMPORT_COLUMNS) {
  IMPORT_HEADER_LOOKUP.set(normalizeHeaderKey(column.label), column.key);
  for (const alias of column.aliases) {
    IMPORT_HEADER_LOOKUP.set(normalizeHeaderKey(alias), column.key);
  }
}

/** "Acme Holding OÜ" and "acme holding" collapse to the same key. */
function normalizeCompanyKey(name) {
  const words = String(name || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  while (words.length > 1 && COMPANY_SUFFIX_WORDS.has(words[words.length - 1])) {
    words.pop();
  }
  return words.join(" ");
}

/** Reuse the spelling already on the board so the Owner filter doesn't fragment. */
function resolveImportOwner(raw) {
  const value = String(raw || "").trim();
  if (!value) return getCurrentUserName();
  const target = value.toLowerCase();
  for (const deal of deals) {
    const existing = (deal.owner || "").trim();
    if (existing && existing.toLowerCase() === target) return existing;
  }
  return value;
}

function parseImportValue(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  let cleaned = text.replace(/[^0-9.,-]/g, "");
  if (!cleaned) return null;

  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    // Rightmost separator is the decimal point; the other one groups thousands.
    const decimal = lastComma > lastDot ? "," : ".";
    const grouping = decimal === "," ? "." : ",";
    cleaned = cleaned.split(grouping).join("").replace(decimal, ".");
  } else if (lastComma > -1) {
    const decimals = cleaned.length - lastComma - 1;
    cleaned = decimals === 3 ? cleaned.split(",").join("") : cleaned.replace(",", ".");
  }

  const number = Number(cleaned);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function looksLikeEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

function countDigits(value) {
  return (String(value).match(/\d/g) || []).length;
}

function loadSheetJs() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (!sheetJsPromise) {
    sheetJsPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = SHEETJS_SRC;
      script.async = true;
      script.onload = () =>
        window.XLSX ? resolve(window.XLSX) : reject(new Error("Spreadsheet reader did not load"));
      script.onerror = () => reject(new Error("Spreadsheet reader could not be downloaded"));
      document.head.appendChild(script);
    }).catch((err) => {
      sheetJsPromise = null;
      throw err;
    });
  }
  return sheetJsPromise;
}

function detectCsvDelimiter(line) {
  const counts = [",", ";", "\t"].map((sep) => {
    let count = 0;
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') quoted = !quoted;
      else if (ch === sep && !quoted) count++;
    }
    return { sep, count };
  });
  counts.sort((a, b) => b.count - a.count);
  return counts[0].count ? counts[0].sep : ",";
}

function parseCsvText(text) {
  const clean = text.replace(/^\uFEFF/, "");
  const firstBreak = clean.search(/\r?\n/);
  const delimiter = detectCsvDelimiter(firstBreak < 0 ? clean : clean.slice(0, firstBreak));

  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch !== '"') field += ch;
      else if (clean[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = false;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") field += ch;
  }
  row.push(field);
  rows.push(row);
  return rows;
}

async function readSheetRows(file) {
  const isCsv = /\.csv$/i.test(file.name || "") || file.type === "text/csv";
  let XLSX = null;
  try {
    XLSX = await loadSheetJs();
  } catch (err) {
    console.warn("SheetJS unavailable:", err);
    if (!isCsv) {
      throw new Error(
        "Could not load the spreadsheet reader. Check your connection, or save the file as .csv and try again."
      );
    }
  }

  if (!XLSX) return parseCsvText(await file.text());

  const book = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  const sheetName = book.SheetNames?.[0];
  const sheet = sheetName ? book.Sheets[sheetName] : null;
  if (!sheet) throw new Error("That file has no sheets to read.");
  // raw:false keeps phone numbers, leading zeros and dates as the text you see in Excel.
  // blankrows:true keeps row numbers aligned with the spreadsheet.
  return XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: true, defval: "", raw: false });
}

function importCellText(value) {
  if (value == null) return "";
  if (value instanceof Date) return toDateInputValue(value.getTime());
  return String(value).replace(/\s+/g, " ").trim();
}

function buildImportRows(rawRows) {
  const table = (rawRows || []).map((row) => (Array.isArray(row) ? row.map(importCellText) : []));
  const headerIndex = table.findIndex((row) => row.some((cell) => cell));
  if (headerIndex < 0) throw new Error("That file looks empty.");

  const mapping = new Map();
  const mapped = new Set();
  table[headerIndex].forEach((cell, index) => {
    const key = IMPORT_HEADER_LOOKUP.get(normalizeHeaderKey(cell));
    if (key && !mapped.has(key)) {
      mapping.set(index, key);
      mapped.add(key);
    }
  });

  if (!mapped.has("company")) {
    throw new Error(
      "No “Company name” column in the first row. Rename that column, or download the template."
    );
  }

  const rows = [];
  let truncated = false;
  for (let i = headerIndex + 1; i < table.length; i++) {
    const cells = table[i];
    if (!cells.some((cell) => cell)) continue;
    if (rows.length >= IMPORT_MAX_ROWS) {
      truncated = true;
      break;
    }
    const values = {};
    for (const [index, key] of mapping) values[key] = cells[index] || "";
    rows.push({
      rowNumber: i + 1,
      values,
      value: parseImportValue(values.value),
      errors: [],
      warnings: [],
      duplicate: null,
      status: "new",
      include: true,
    });
  }

  return { rows, truncated };
}

function classifyImportRows(rows) {
  const existing = new Map();
  for (const deal of deals) {
    const key = normalizeCompanyKey(deal.company);
    if (!key) continue;
    const entry = existing.get(key) || { active: null, dismissed: null };
    if (deal.stage === "dismissed") entry.dismissed = entry.dismissed || deal;
    else entry.active = entry.active || deal;
    existing.set(key, entry);
  }

  const seenInFile = new Map();
  for (const row of rows) {
    row.errors = [];
    row.warnings = [];
    row.duplicate = null;

    if (!row.values.company) row.errors.push("Missing company name");
    if (row.values.email && !looksLikeEmail(row.values.email)) {
      row.warnings.push("Email looks invalid");
    }
    if (row.values.phone && countDigits(row.values.phone) < 6) {
      row.warnings.push("Phone looks incomplete");
    }
    if (row.values.value && row.value == null) {
      row.warnings.push("Unreadable value — using €10,000");
    }

    const key = normalizeCompanyKey(row.values.company);
    if (key) {
      const earlierRow = seenInFile.get(key);
      if (earlierRow) {
        row.duplicate = { kind: "file", row: earlierRow };
      } else {
        const entry = existing.get(key);
        if (entry?.active) row.duplicate = { kind: "board", deal: entry.active };
        else if (entry?.dismissed) row.duplicate = { kind: "history", deal: entry.dismissed };
        seenInFile.set(key, row.rowNumber);
      }
    }

    row.status = row.errors.length ? "error" : row.duplicate ? "duplicate" : "new";
    row.include = row.status === "new";
  }
  return rows;
}

function importStatusLabel(row) {
  if (row.status === "error") return "Error";
  if (row.status === "duplicate") return "Duplicate";
  return row.warnings.length ? "Check" : "New";
}

function importStatusDetail(row) {
  if (row.errors.length) return row.errors.join(" · ");
  const parts = [];
  if (row.duplicate?.kind === "file") {
    parts.push(`Same company as row ${row.duplicate.row}`);
  } else if (row.duplicate?.kind === "board") {
    const deal = row.duplicate.deal;
    const stage = STAGES.find((s) => s.id === deal.stage)?.label || deal.stage;
    parts.push(deal.owner ? `Already on the board — ${stage} · ${deal.owner}` : `Already on the board — ${stage}`);
  } else if (row.duplicate?.kind === "history") {
    parts.push("Dismissed earlier — see History");
  }
  parts.push(...row.warnings);
  return parts.join(" · ");
}

function setImportStep(step) {
  for (const [name, el] of Object.entries(importSteps)) {
    if (el) el.hidden = name !== step;
  }
}

function showImportError(message) {
  importFileError.textContent = message || "";
  importFileError.hidden = !message;
}

function importSelectableRows() {
  return importRows.filter((row) => row.status !== "error");
}

function renderImportSummary() {
  const counts = { new: 0, duplicate: 0, error: 0 };
  for (const row of importRows) counts[row.status]++;

  importSummaryEl.innerHTML = "";
  const chips = [
    { cls: "is-new", label: `${counts.new} new`, show: true },
    { cls: "is-duplicate", label: `${counts.duplicate} duplicate${counts.duplicate === 1 ? "" : "s"}`, show: counts.duplicate > 0 },
    { cls: "is-error", label: `${counts.error} error${counts.error === 1 ? "" : "s"}`, show: counts.error > 0 },
  ];
  for (const chip of chips) {
    if (!chip.show) continue;
    const el = document.createElement("span");
    el.className = `import-chip ${chip.cls}`;
    el.textContent = chip.label;
    importSummaryEl.appendChild(el);
  }

  const hints = [];
  if (counts.duplicate) hints.push("Duplicates are unticked — tick one to import it anyway.");
  if (counts.error) hints.push("Rows without a company name cannot be imported.");
  if (importTruncated) hints.push(`Only the first ${IMPORT_MAX_ROWS} rows were read.`);
  if (hints.length) {
    const hint = document.createElement("span");
    hint.className = "import-summary-hint";
    hint.textContent = hints.join(" ");
    importSummaryEl.appendChild(hint);
  }
}

function updateImportConfirmState() {
  const selected = importRows.filter((row) => row.include && row.status !== "error");
  importConfirmBtn.textContent = selected.length
    ? `Import ${selected.length} prospect${selected.length === 1 ? "" : "s"}`
    : "Import";
  importConfirmBtn.disabled = importBusy || !selected.length;

  const selectable = importSelectableRows();
  const checked = selectable.filter((row) => row.include).length;
  importSelectAll.disabled = importBusy || !selectable.length;
  importSelectAll.checked = Boolean(selectable.length) && checked === selectable.length;
  importSelectAll.indeterminate = checked > 0 && checked < selectable.length;
}

function renderImportPreview() {
  importPreviewBody.innerHTML = "";

  for (const row of importRows) {
    const tr = document.createElement("tr");
    tr.className = `import-row is-${row.status}`;

    const checkCell = document.createElement("td");
    checkCell.className = "import-col-check";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = row.include && row.status !== "error";
    checkbox.disabled = row.status === "error";
    checkbox.setAttribute("aria-label", `Import row ${row.rowNumber}`);
    checkbox.addEventListener("change", () => {
      row.include = checkbox.checked;
      tr.classList.toggle("is-excluded", !checkbox.checked);
      updateImportConfirmState();
    });
    checkCell.appendChild(checkbox);
    tr.classList.toggle("is-excluded", !checkbox.checked);

    const rowCell = document.createElement("td");
    rowCell.className = "import-col-row";
    rowCell.textContent = row.rowNumber;

    const companyCell = document.createElement("td");
    const companyName = document.createElement("span");
    companyName.className = "import-company";
    companyName.textContent = row.values.company || "—";
    companyCell.appendChild(companyName);
    const meta = [row.values.email, row.values.phone, row.values.industry, row.values.tool]
      .filter(Boolean)
      .join(" · ");
    if (meta) {
      const metaEl = document.createElement("span");
      metaEl.className = "import-cell-meta";
      metaEl.textContent = meta;
      companyCell.appendChild(metaEl);
    }

    const contactCell = document.createElement("td");
    contactCell.textContent = row.values.contact || "—";

    const ownerCell = document.createElement("td");
    ownerCell.textContent = resolveImportOwner(row.values.owner) || "—";

    const briefCell = document.createElement("td");
    briefCell.className = "import-col-brief";
    if (row.values.brief) {
      briefCell.textContent = row.values.brief;
      briefCell.title = row.values.brief;
    } else {
      briefCell.textContent = "—";
    }

    const statusCell = document.createElement("td");
    const badge = document.createElement("span");
    badge.className = `import-badge is-${row.status}`;
    badge.textContent = importStatusLabel(row);
    statusCell.appendChild(badge);
    const detail = importStatusDetail(row);
    if (detail) {
      const detailEl = document.createElement("span");
      detailEl.className = "import-cell-meta";
      detailEl.textContent = detail;
      statusCell.appendChild(detailEl);
    }

    tr.append(checkCell, rowCell, companyCell, contactCell, ownerCell, briefCell, statusCell);
    importPreviewBody.appendChild(tr);
  }

  renderImportSummary();
  updateImportConfirmState();
}

function setImportProgress(done, total) {
  importProgressEl.hidden = false;
  const percent = total ? Math.round((done / total) * 100) : 0;
  importProgressBar.style.width = `${percent}%`;
  importProgressLabel.textContent = `Uploaded ${done} of ${total}`;
}

function setImportBusy(busy) {
  importBusy = busy;
  for (const id of ["importBackBtn", "importPreviewCancelBtn", "importCloseBtn", "importDoneBtn"]) {
    const btn = document.getElementById(id);
    if (btn) btn.disabled = busy;
  }
  importUndoBtn.disabled = busy;
  importDropZone.classList.toggle("is-busy", busy);
  updateImportConfirmState();
}

async function runImport() {
  if (importBusy) return;
  const rows = importRows.filter((row) => row.include && row.status !== "error");
  if (!rows.length) return;

  setImportBusy(true);
  importConfirmBtn.textContent = "Importing…";

  const baseOrder = nextBoardOrder("prospects");
  const created = rows.map((row, index) => {
    const createdAt = Date.now();
    const notes = [makeDealCreationNote(createdAt)];
    if (row.values.brief) {
      // +1ms so migrateDeals doesn't mistake the brief for the creation note.
      notes.push({
        id: crypto.randomUUID(),
        text: row.values.brief,
        createdAt: createdAt + 1,
        updatedAt: createdAt + 1,
      });
    }
    return {
      id: crypto.randomUUID(),
      company: row.values.company,
      contact: row.values.contact || "",
      phone: row.values.phone || "",
      email: row.values.email || "",
      industry: row.values.industry || "",
      tool: row.values.tool || "",
      value: row.value != null ? row.value : DEFAULT_VALUE,
      owner: resolveImportOwner(row.values.owner),
      stage: "prospects",
      createdAt,
      boardOrder: baseOrder + index,
      notes,
      tasks: [],
    };
  });

  deals.push(...created);
  render();

  const ids = created.map((deal) => deal.id);
  const api = window.MHN_DB;
  let uploaded = 0;
  let syncError = null;

  if (api?.upsertDealsAsync) {
    setImportProgress(0, created.length);
    for (let i = 0; i < created.length; i += IMPORT_CHUNK_SIZE) {
      const chunk = created.slice(i, i + IMPORT_CHUNK_SIZE);
      // Cloud rows are written one by one; keep realtime echoes from rebuilding mid-upload.
      suppressRemoteRefreshUntil = Date.now() + 5000;
      try {
        applySaveResult(await api.upsertDealsAsync(chunk, deals));
      } catch (err) {
        console.error(err);
        syncError = err;
        break;
      }
      uploaded += chunk.length;
      setImportProgress(uploaded, created.length);
    }
  } else {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(deals));
  }

  suppressRemoteRefreshUntil = Date.now() + 1500;
  lastImport = { ids, count: created.length };
  setImportBusy(false);
  importProgressEl.hidden = true;
  render();

  const skipped = importRows.length - created.length;
  showImportResult({ created: created.length, skipped, syncError, uploaded });
}

function showImportResult({ created, skipped, syncError, uploaded }) {
  importResultEl.innerHTML = "";

  const headline = document.createElement("p");
  headline.className = "import-result-headline";
  headline.textContent = `${created} prospect${created === 1 ? "" : "s"} added to Prospects.`;
  importResultEl.appendChild(headline);

  const lines = [];
  if (skipped > 0) {
    lines.push(`${skipped} row${skipped === 1 ? "" : "s"} skipped (duplicates or errors).`);
  }
  const api = window.MHN_DB;
  if (syncError) {
    lines.push(
      `${created - uploaded} card${created - uploaded === 1 ? "" : "s"} could not be uploaded — ` +
        "they are saved locally and will sync when the cloud reconnects."
    );
  } else if (api?.isRemote && api.cloudWriteAllowedByOrigin === false) {
    lines.push("Local / preview mode — the cards were not uploaded to the cloud.");
  } else if (api?.isRemote) {
    lines.push("All cards synced to the cloud.");
  }

  for (const text of lines) {
    const p = document.createElement("p");
    p.className = "import-result-line";
    p.textContent = text;
    importResultEl.appendChild(p);
  }

  importUndoBtn.hidden = !lastImport;
  importUndoBtn.textContent = "Undo this import";
  setImportStep("result");
}

async function undoLastImport() {
  if (!lastImport || importBusy) return;
  const { ids, count } = lastImport;

  setImportBusy(true);
  importUndoBtn.textContent = "Undoing…";

  const removing = new Set(ids);
  deals = deals.filter((deal) => !removing.has(deal.id));
  render();

  const api = window.MHN_DB;
  let failed = 0;
  if (api?.deleteDealAsync) {
    for (const id of ids) {
      suppressRemoteRefreshUntil = Date.now() + 5000;
      try {
        await api.deleteDealAsync(id, deals);
      } catch (err) {
        console.error(err);
        failed++;
      }
    }
  } else {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(deals));
  }

  suppressRemoteRefreshUntil = Date.now() + 1500;
  lastImport = null;
  setImportBusy(false);
  render();
  closeImportModal({ force: true });
  showSyncStatus(
    failed
      ? `Import undone locally — ${failed} card${failed === 1 ? "" : "s"} still pending removal in the cloud.`
      : `Import undone — ${count} card${count === 1 ? "" : "s"} removed.`,
    Boolean(failed),
    Boolean(failed)
  );
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",;\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function downloadImportTemplate() {
  const headers = IMPORT_COLUMNS.map((column) => column.label);
  const example = [
    "Acme GmbH",
    "Jane Doe",
    "+49 170 000 0000",
    "jane@acme.com",
    "Manufacturing",
    "Obsidian",
    getCurrentUserName(),
    "Met at the trade fair — wants a demo after summer.",
    String(DEFAULT_VALUE),
  ];

  try {
    const XLSX = await loadSheetJs();
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([headers, example]), "Prospects");
    const buffer = XLSX.write(book, { type: "array", bookType: "xlsx" });
    downloadBlob(
      "mhn-prospects-template.xlsx",
      new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      })
    );
    return;
  } catch (err) {
    console.warn("Falling back to a CSV template:", err);
  }

  const csv = [headers, example].map((row) => row.map(csvCell).join(",")).join("\r\n");
  downloadBlob(
    "mhn-prospects-template.csv",
    new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" })
  );
}

async function handleImportFile(file) {
  if (!file || importBusy) return;
  showImportError("");

  if (!/\.(xlsx|xlsm|xls|csv)$/i.test(file.name || "")) {
    showImportError("Unsupported file type. Use .xlsx, .xls or .csv.");
    return;
  }
  if (file.size > IMPORT_MAX_FILE_BYTES) {
    showImportError("That file is over 5 MB. Split it into smaller batches.");
    return;
  }

  importDropZone.classList.add("is-busy");
  try {
    const { rows, truncated } = buildImportRows(await readSheetRows(file));
    if (!rows.length) {
      showImportError("No data rows found under the header row.");
      return;
    }
    importRows = classifyImportRows(rows);
    importTruncated = truncated;
    importFileNameEl.textContent = file.name;
    renderImportPreview();
    setImportStep("preview");
  } catch (err) {
    console.error(err);
    showImportError(err?.message || "Could not read that file.");
  } finally {
    importDropZone.classList.remove("is-busy");
    importFileInput.value = "";
  }
}

function resetImportState() {
  importRows = [];
  importTruncated = false;
  lastImport = null;
  importFileInput.value = "";
  importPreviewBody.innerHTML = "";
  importProgressEl.hidden = true;
  importProgressBar.style.width = "0%";
  showImportError("");
  setImportBusy(false);
}

function openImportModal() {
  resetImportState();
  const api = window.MHN_DB;
  importLocalWarning.hidden = !(api?.isRemote && api.cloudWriteAllowedByOrigin === false);
  setImportStep("file");
  importOverlay.hidden = false;
  importDropZone.focus();
}

function closeImportModal({ force = false } = {}) {
  if (importBusy && !force) return;
  importOverlay.hidden = true;
  resetImportState();
  setImportStep("file");
}

document.getElementById("importDealsBtn").addEventListener("click", openImportModal);
document.getElementById("importCloseBtn").addEventListener("click", () => closeImportModal());
document.getElementById("importCancelBtn").addEventListener("click", () => closeImportModal());
document.getElementById("importPreviewCancelBtn").addEventListener("click", () => closeImportModal());
document.getElementById("importDoneBtn").addEventListener("click", () => closeImportModal());
document.getElementById("importTemplateBtn").addEventListener("click", downloadImportTemplate);
document.getElementById("importBackBtn").addEventListener("click", () => {
  if (importBusy) return;
  resetImportState();
  setImportStep("file");
});
importConfirmBtn.addEventListener("click", runImport);
importUndoBtn.addEventListener("click", undoLastImport);

importOverlay.addEventListener("click", (e) => {
  if (e.target === importOverlay) closeImportModal();
});

importSelectAll.addEventListener("change", () => {
  const checked = importSelectAll.checked;
  for (const row of importSelectableRows()) row.include = checked;
  renderImportPreview();
});

importDropZone.addEventListener("click", () => importFileInput.click());
importDropZone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    importFileInput.click();
  }
});
importFileInput.addEventListener("change", () => {
  const file = importFileInput.files?.[0];
  if (file) handleImportFile(file);
});

for (const type of ["dragenter", "dragover"]) {
  importDropZone.addEventListener(type, (e) => {
    e.preventDefault();
    importDropZone.classList.add("is-dragover");
  });
}
for (const type of ["dragleave", "dragend"]) {
  importDropZone.addEventListener(type, () => importDropZone.classList.remove("is-dragover"));
}
importDropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  importDropZone.classList.remove("is-dragover");
  const file = e.dataTransfer?.files?.[0];
  if (file) handleImportFile(file);
});

/* ------------------------------ Tabs ---------------------------- */

const navShell = document.getElementById("navShell");
const navBurgerBtn = document.getElementById("navBurgerBtn");

function closeNavMenu() {
  if (!navShell) return;
  navShell.classList.remove("is-open");
  if (navBurgerBtn) {
    navBurgerBtn.setAttribute("aria-expanded", "false");
    navBurgerBtn.setAttribute("aria-label", "Open navigation menu");
  }
}

function toggleNavMenu() {
  if (!navShell || !navBurgerBtn) return;
  const willOpen = !navShell.classList.contains("is-open");
  navShell.classList.toggle("is-open", willOpen);
  navBurgerBtn.setAttribute("aria-expanded", willOpen ? "true" : "false");
  navBurgerBtn.setAttribute("aria-label", willOpen ? "Close navigation menu" : "Open navigation menu");
}

if (navBurgerBtn) {
  navBurgerBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleNavMenu();
  });
}

document.addEventListener("click", (e) => {
  if (!navShell || !navShell.classList.contains("is-open")) return;
  if (!navShell.contains(e.target)) closeNavMenu();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && navShell?.classList.contains("is-open")) closeNavMenu();
});

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    hideTasksPipelineTooltip();
    hidePipelineTooltip();
    closeAllSearchSuggestions();
    activeTab = tab.dataset.tab;
    document.querySelectorAll(".tab").forEach((t) => {
      t.classList.toggle("is-active", t === tab);
      t.setAttribute("aria-selected", t === tab ? "true" : "false");
    });
    document.querySelectorAll(".view").forEach((v) => {
      v.hidden = v.id !== `view-${activeTab}`;
    });
    closeNavMenu();
    render();
  });
});

/* Prevent pinch-zoom, card-drag scroll theft, and iOS rubber-band bounce */
document.addEventListener("gesturestart", (e) => e.preventDefault());
document.addEventListener("gesturechange", (e) => e.preventDefault());
document.addEventListener("gestureend", (e) => e.preventDefault());
document.addEventListener(
  "touchmove",
  (e) => {
    if (e.touches && e.touches.length > 1) {
      e.preventDefault();
      return;
    }
    if (dragState && dragState.activated) {
      e.preventDefault();
      return;
    }
    if (!touchScrollGuard || e.touches.length !== 1) return;

    const t = e.touches[0];
    const dx = t.clientX - touchScrollGuard.x;
    const dy = t.clientY - touchScrollGuard.y;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    // Clearly horizontal — allow board / toolbar panning.
    if (absX > absY && absX > 8) return;

    // Vertical (or ambiguous) gesture: only allow real column-card scrolling.
    if (columnBodyCanScroll(touchScrollGuard.body, dy)) return;

    // Empty placeholder, column chrome, board padding, scroll edges, etc.
    e.preventDefault();
  },
  { passive: false, capture: true }
);

// Desktop trackpad / wheel: never bounce empty columns or the board vertically.
if (boardEl) {
  boardEl.addEventListener(
    "wheel",
    (e) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return; // horizontal wheel ok
      const body = e.target.closest?.(".column-body");
      if (columnBodyCanScroll(body, -e.deltaY)) return;
      e.preventDefault();
    },
    { passive: false }
  );
}

document.getElementById("pipelinePrevBtn").addEventListener("click", () => {
  shiftPipelinePeriod(-pipelineState.periodMonths);
});
document.getElementById("pipelineNextBtn").addEventListener("click", () => {
  shiftPipelinePeriod(pipelineState.periodMonths);
});
pipelinePeriodLength.addEventListener("change", () => {
  pipelineState.periodMonths = Number(pipelinePeriodLength.value) || 4;
  render();
});

async function bootstrap() {
  const auth = window.MHN_AUTH;

  if (!auth?.isConfigured?.()) {
    showLoginScreen();
    setAuthMessage({
      error: "Supabase is not configured. Add your project URL and anon key in config.js.",
    });
    return;
  }

  try {
    const user = await auth.getCurrentAuthUser();
    if (!user) {
      showLoginScreen();
      return;
    }
    applyAuthUser(user);
    await startApp();
    maybePromptProfileName();
  } catch (err) {
    console.error(err);
    showLoginScreen();
    setAuthMessage({ error: "Could not restore your session. Please log in again." });
  }

  auth.onAuthStateChange((user) => {
    if (!user) {
      applyAuthUser(null);
      return;
    }
    // Keep chip/name in sync if metadata changes; don't restart the app mid-session.
    if (currentUser?.id === user.id) {
      currentUser = {
        id: user.id,
        email: user.email || "",
        name: user.name || "",
        needsName: Boolean(user.needsName),
      };
      updateUserChip();
    }
  });
}

async function startApp() {
  if (appStarted) {
    render();
    return;
  }
  appStarted = true;

  const api = window.MHN_DB;

  // Banner based on origin, even before hydration
  if (api?.isRemote && api.cloudWriteAllowedByOrigin === false) {
    showCloudReadOnlyBanner();
  }

  if (api?.loadDealsAsync) {
    try {
      deals = await api.loadDealsAsync();
      showLoadSyncStatus(api);
    } catch (err) {
      console.error(err);
      deals = loadDeals();
      showSyncStatus(
        "Cloud sync unavailable — using local data. Edits won’t upload until reconnect.",
        true,
        true
      );
    }
  } else {
    deals = loadDeals();
  }

  // Persist migrate fixes only when origin allows writes AND cloud is hydrated
  migrateDeals({ persist: Boolean(api?.cloudWriteEnabled) });
  initPipelinePeriod();
  render();

  if (api?.subscribeToDealChanges) {
    api.subscribeToDealChanges(() => {
      if (syncingFromRemote) return;
      refreshDealsFromRemote();
    });
  }
}

loginForm.addEventListener("submit", handleLoginSubmit);
signupForm.addEventListener("submit", handleSignupSubmit);
nameForm?.addEventListener("submit", handleNameSubmit);
nameCloseBtn?.addEventListener("click", closeNameModal);
nameCancelBtn?.addEventListener("click", closeNameModal);
nameOverlay?.addEventListener("click", (e) => {
  if (e.target === nameOverlay) closeNameModal();
});
editNameBtn?.addEventListener("click", () => openNameModal({ required: false }));
editNameMenuBtn?.addEventListener("click", () => {
  closeNavMenu();
  openNameModal({ required: false });
});
logoutBtn.addEventListener("click", () => {
  logout();
});
document.getElementById("logoutMenuBtn")?.addEventListener("click", () => {
  closeNavMenu();
  logout();
});

Object.assign(window.MHN_AUTH, {
  getCurrentUserName,
  getCurrentUser: () => (currentUser ? { ...currentUser } : null),
});

bootstrap();
