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
const signupSubmitBtn = document.getElementById("signupSubmitBtn");
const authModeLoginBtn = document.getElementById("authModeLogin");
const authModeSignupBtn = document.getElementById("authModeSignup");
const appShell = document.getElementById("appShell");
const userChip = document.getElementById("userChip");
const userChipName = document.getElementById("userChipName");
const logoutBtn = document.getElementById("logoutBtn");

let authMode = "login"; // "login" | "signup"
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
  const activeBtn = authMode === "signup" ? signupSubmitBtn : loginSubmitBtn;
  const idleBtn = authMode === "signup" ? loginSubmitBtn : signupSubmitBtn;

  activeBtn.disabled = busy;
  idleBtn.disabled = true;

  loginSubmitBtn.textContent = busy && authMode === "login" ? "Logging in…" : "Log in";
  signupSubmitBtn.textContent = busy && authMode === "signup" ? "Creating account…" : "Create account";
}

function setAuthMode(mode) {
  authMode = mode === "signup" ? "signup" : "login";
  const isSignup = authMode === "signup";

  authModeLoginBtn.classList.toggle("is-active", !isSignup);
  authModeSignupBtn.classList.toggle("is-active", isSignup);
  authModeLoginBtn.setAttribute("aria-selected", (!isSignup).toString());
  authModeSignupBtn.setAttribute("aria-selected", isSignup.toString());

  // Keep forms fully separate in the DOM visibility so password managers
  // don't see new-password fields while logging in.
  loginForm.hidden = isSignup;
  signupForm.hidden = !isSignup;

  // Disable fields in the hidden form so password managers ignore them.
  for (const el of loginForm.elements) el.disabled = isSignup;
  for (const el of signupForm.elements) el.disabled = !isSignup;

  loginLead.textContent = isSignup
    ? "Create an account with your name, email, and password."
    : "Log in with your email to open the sales board.";

  // Carry email across modes for convenience
  if (isSignup && loginEmailInput.value && !signupEmailInput.value) {
    signupEmailInput.value = loginEmailInput.value;
  }
  if (!isSignup && signupEmailInput.value && !loginEmailInput.value) {
    loginEmailInput.value = signupEmailInput.value;
  }

  setAuthMessage();
  setAuthBusy(false);

  requestAnimationFrame(() => {
    if (isSignup) signupNameInput.focus();
    else loginEmailInput.focus();
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
    ? { id: user.id, email: user.email || "", name: user.name || "" }
    : null;
  if (currentUser) {
    showAppShell();
  } else {
    showLoginScreen();
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
  } catch (err) {
    console.error(err);
    setAuthMessage({ error: "Something went wrong. Please try again." });
  } finally {
    setAuthBusy(false);
  }
}

async function handleSignupSubmit(e) {
  e.preventDefault();
  if (authBusy) return;

  const auth = window.MHN_AUTH;
  if (!auth?.isConfigured?.()) {
    setAuthMessage({
      error: "Supabase is not configured. Add your project URL and anon key in config.js.",
    });
    return;
  }

  const name = signupNameInput.value;
  const email = signupEmailInput.value;
  const password = signupPasswordInput.value;
  const confirm = signupConfirmInput.value;

  setAuthMessage();

  if (password !== confirm) {
    setAuthMessage({ error: "Passwords do not match." });
    signupConfirmInput.focus();
    return;
  }

  setAuthBusy(true);
  try {
    const result = await auth.signUp({ name, email, password });

    if (!result.ok) {
      setAuthMessage({ error: result.error || "Authentication failed." });
      return;
    }

    if (result.needsEmailConfirmation) {
      loginEmailInput.value = email;
      loginPasswordInput.value = "";
      signupPasswordInput.value = "";
      signupConfirmInput.value = "";
      setAuthMode("login");
      loginAuthError.textContent = "Account created. Check your email to confirm, then log in.";
      loginAuthError.hidden = false;
      loginAuthError.classList.add("is-info");
      return;
    }

    await offerSavePassword(email, password, name);
    applyAuthUser(result.user);
    await startApp();
  } catch (err) {
    console.error(err);
    setAuthMessage({ error: "Something went wrong. Please try again." });
  } finally {
    setAuthBusy(false);
  }
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
  if (result?.deals && Array.isArray(result.deals)) {
    deals = result.deals;
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
  if (result?.wroteToCloud) {
    // Quiet on routine saves; only celebrate reconnect / pending flush.
    if (result.rehydrated) {
      showSyncStatus("Reconnected — saved to cloud");
    }
  }
}

function saveDeals() {
  // Ignore stale realtime echoes while our write is in flight, so a just-dropped
  // card isn't immediately snapped back to its old stage.
  suppressRemoteRefreshUntil = Date.now() + 1500;
  pendingRemoteRefresh = false;
  const api = window.MHN_DB;
  if (api?.saveDealsAsync) {
    api.saveDealsAsync(deals).then(applySaveResult).catch((err) => {
      console.error(err);
      showSyncStatus(
        `Could not sync to cloud — changes kept locally${syncErrorDetail(err)}`,
        true,
        true
      );
    });
  } else {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(deals));
  }
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
  if (meta.source === "local-pending-synced") {
    showSyncStatus("Pending local changes uploaded to Supabase");
    return;
  }
  showSyncStatus("Synced with Supabase");
}

async function refreshDealsFromRemote() {
  const api = window.MHN_DB;
  if (!api?.isRemote || !api.loadDealsAsync) return;
  if (Date.now() < suppressRemoteRefreshUntil) return;
  // Never rebuild the board mid-drag; queue the update until the drag ends.
  if (dragState) {
    pendingRemoteRefresh = true;
    return;
  }
  try {
    syncingFromRemote = true;
    deals = await api.loadDealsAsync();
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
  for (const deal of deals) {
    if (
      deal.stage === "committed" &&
      deal.implementationDays &&
      !deal.committedAt
    ) {
      deal.committedAt = startOfDay(new Date(deal.createdAt || Date.now())).getTime();
      changed = true;
    } else if (deal.committedAt) {
      const normalized = startOfDay(new Date(deal.committedAt)).getTime();
      if (normalized !== deal.committedAt) {
        deal.committedAt = normalized;
        changed = true;
      }
    }

    // Every deal keeps an automatic first note stamped at its creation time.
    const created = deal.createdAt;
    if (created) {
      const notes = deal.notes || [];
      if (!notes.some((note) => note.createdAt === created)) {
        deal.notes = [makeDealCreationNote(created), ...notes];
        changed = true;
      }
    }

    if (!Array.isArray(deal.tasks)) {
      deal.tasks = [];
      changed = true;
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
      }
    }
  }

  if (ensureBoardOrders()) changed = true;

  // Never push migration fixes from a write-blocked origin (avoids stale local→cloud)
  if (changed && persist && window.MHN_DB?.cloudWriteEnabled) saveDeals();
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

/** Assign missing boardOrder values so column order is stable and rearrangeable. */
function ensureBoardOrders() {
  let changed = false;
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
        changed = true;
      }
    });
  }

  return changed;
}

function nextBoardOrder(stage) {
  const list = getStageDeals(stage);
  if (!list.length) return 0;
  return Math.max(...list.map((d) => d.boardOrder ?? 0)) + 1;
}

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

function getFieldMatches(fieldKey, query, { trackDismissed = false, activeOnly = false } = {}) {
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
      entry = { name: value, hasActive: false, hasDismissed: false };
      byValue.set(key, entry);
    }
    if (deal.stage === "dismissed") entry.hasDismissed = true;
    else entry.hasActive = true;
  }

  return [...byValue.values()]
    .filter(({ name }) => name.toLowerCase().includes(q))
    .map(({ name, hasActive, hasDismissed }) => ({
      name,
      dismissed: trackDismissed && hasDismissed && !hasActive,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 8);
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
  });
  state.listEl.innerHTML = "";
  state.activeIndex = -1;

  if (!matches.length) {
    closeFieldSuggestions(fieldKey);
    return;
  }

  for (const { name, dismissed } of matches) {
    const item = document.createElement("li");
    item.className = "combobox-suggestion";
    item.role = "option";
    item.dataset.value = name;

    const label = document.createElement("span");
    label.className = "combobox-suggestion-name";
    label.appendChild(highlightSuggestionMatch(name, query));
    item.appendChild(label);

    if (dismissed) {
      const badge = document.createElement("span");
      badge.className = "combobox-suggestion-dismissed";
      badge.textContent = "(Dismissed)";
      item.appendChild(document.createTextNode(" "));
      item.appendChild(badge);
    }

    item.addEventListener("mousedown", (e) => {
      e.preventDefault();
      selectFieldSuggestion(fieldKey, name);
    });
    state.listEl.appendChild(item);
  }

  state.listEl.hidden = false;
  state.input.setAttribute("aria-expanded", "true");
}

function setupFieldSuggestions(fieldKey, { trackDismissed = false } = {}) {
  const input = form.elements[fieldKey];
  const listEl = document.getElementById(`${fieldKey}Suggestions`);
  if (!input || !listEl) return;

  fieldSuggestionState.set(fieldKey, {
    input,
    listEl,
    activeIndex: -1,
    trackDismissed,
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

setupFieldSuggestions("company", { trackDismissed: true });
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

/* ------------------------------ Search ------------------------- */

const searchBubble = document.getElementById("searchBubble");
const searchInput = document.getElementById("searchInput");
const searchClearBtn = document.getElementById("searchClearBtn");

const SEARCH_FIELDS = [
  { source: "board", input: searchInput, bubble: searchBubble, clearBtn: searchClearBtn, listId: "searchSuggestions" },
  { source: "pipeline", input: pipelineSearchInput, bubble: pipelineSearchBubble, clearBtn: pipelineSearchClearBtn, listId: "pipelineSearchSuggestions" },
  { source: "tasks", input: tasksSearchInput, bubble: tasksSearchBubble, clearBtn: tasksSearchClearBtn, listId: "tasksSearchSuggestions" },
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
  const matches = getFieldMatches("company", query, { activeOnly: true });
  state.listEl.innerHTML = "";
  state.activeIndex = -1;

  if (!matches.length) {
    closeSearchSuggestions(source);
    return;
  }

  for (const { name } of matches) {
    const item = document.createElement("li");
    item.className = "combobox-suggestion";
    item.role = "option";
    item.dataset.value = name;

    const label = document.createElement("span");
    label.className = "combobox-suggestion-name";
    label.appendChild(highlightSuggestionMatch(name, query));
    item.appendChild(label);

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
  saveDeals();
  render();
}

function renderBoard() {
  boardEl.innerHTML = "";
  const visibleDeals = getFilteredDeals();
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

function renderPipeline() {
  const { start: periodStart, end: periodEnd, span } = getPipelinePeriodRange();
  const periodEndDate = getPipelinePeriodEnd();
  const deals = getPipelineDeals();

  pipelinePeriodLabel.textContent = `${formatMonthDay(pipelineState.periodStart)} – ${formatMonthDay(new Date(periodEndDate.getTime() - MS_DAY))}`;
  pipelinePeriodLength.value = String(pipelineState.periodMonths);

  pipelineAxisEl.innerHTML = "";
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
  }

  const today = startOfDay(new Date()).getTime();
  if (today >= periodStart && today < periodEnd) {
    const todayTick = document.createElement("div");
    todayTick.className = "pipeline-tick pipeline-tick-today";
    todayTick.style.left = `${((today - periodStart) / span) * 100}%`;
    todayTick.innerHTML = `<span class="pipeline-tick-label">Today</span>`;
    pipelineAxisEl.appendChild(todayTick);
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
    bar.style.left = `${left}%`;
    bar.style.width = `${width}%`;
    bar.style.top = `${deal._pipelineRow * PIPELINE_ROW_HEIGHT + PIPELINE_BAR_TOP}px`;
    bar.title = `${deal.company} · ${deal.implementationDays} days · ${formatMonthDay(new Date(barStart))} – ${formatMonthDay(new Date(barEnd - MS_DAY))}`;

    const text = document.createElement("span");
    text.className = "pipeline-bar-text";

    const label = document.createElement("span");
    label.className = "pipeline-bar-label";
    label.textContent = deal.company;

    const duration = document.createElement("span");
    duration.className = "pipeline-bar-duration";
    duration.textContent = `${deal.implementationDays} days`;

    text.append(label, duration);
    bar.append(text);
    bar.addEventListener("click", () => openModal({ deal }));
    pipelineRowsEl.appendChild(bar);
  }
}

function shiftPipelinePeriod(direction) {
  pipelineState.periodStart = addMonths(pipelineState.periodStart, direction);
  render();
}

function renderColumn(stage, visibleDeals) {
  const stageDeals = visibleDeals
    .filter((d) => d.stage === stage.id)
    .sort(compareBoardOrder);
  const total = stageDeals.reduce((sum, d) => sum + (Number(d.value) || 0), 0);
  const filtersActive = hasActiveFilters();

  const col = document.createElement("section");
  col.className = "column";
  col.dataset.stage = stage.id;

  const header = document.createElement("div");
  header.className = "column-header";

  const title = document.createElement("h2");
  title.className = "column-title";
  title.textContent = stage.label;

  const count = document.createElement("span");
  count.className = "column-count";
  count.textContent = stageDeals.length;

  const canCreateInStage = stage.id === "prospects" || stage.id === "interested";

  header.append(title, count);

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

  if (stageDeals.length === 0) {
    const hint = document.createElement("div");
    hint.className = "empty-hint";
    hint.textContent = (filtersActive || searchQuery) ? "No matching deals" : "Drop deals here";
    body.appendChild(hint);
  } else {
    for (const deal of stageDeals) {
      body.appendChild(renderCard(deal));
    }
  }

  const footer = document.createElement("div");
  footer.className = "column-footer";
  footer.innerHTML = `<span class="total-label">Total</span><span class="total-value">${fmtEuro.format(total)}</span>`;

  col.append(header, body, footer);
  return col;
}

function renderCard(deal) {
  const card = document.createElement("article");
  card.className = "card";
  card.dataset.id = deal.id;

  const company = document.createElement("h3");
  company.className = "card-company";
  company.textContent = deal.company;

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
  if (deal.tool) {
    const tag = document.createElement("span");
    tag.className = "tag tag-tool";
    tag.textContent = deal.tool;
    tags.appendChild(tag);
  }
  if (deal.implementationDays && deal.committedAt) {
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

  card.append(company);
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
    openModal({ deal });
  });

  attachCardPointerDrag(card, deal);

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
      insertBeforeId: before ? card.dataset.id : (card.nextElementSibling?.dataset?.id || null),
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
  saveDeals();
  render();
}

function attachCardPointerDrag(card, deal) {
  card.addEventListener("pointerdown", (e) => {
    if (e.button != null && e.button !== 0) return;
    if (e.isPrimary === false) return;
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
  reorderDeal(pendingCommitDeal, "committed", null);
  saveDeals();
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
  saveDeals();
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
  saveDeals();
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

  // Keep local cache in sync, then explicitly delete the one cloud row.
  // Sequence matters: delete may need hydration from a reconnecting save.
  if (api?.saveDealsAsync) {
    api
      .saveDealsAsync(deals)
      .then(async (result) => {
        applySaveResult(result);
        if (api.deleteDealAsync) {
          try {
            const del = await api.deleteDealAsync(id);
            if (del?.writeBlocked && del.reason === "not-hydrated") {
              showSyncStatus(
                "Offline — deal removed locally; cloud delete pending reconnect.",
                true,
                true
              );
            }
          } catch (err) {
            console.error(err);
            showSyncStatus(
              `Could not delete deal from cloud${syncErrorDetail(err)}`,
              true,
              true
            );
          }
        }
      })
      .catch((err) => {
        console.error(err);
        showSyncStatus(
          `Could not sync to cloud — changes kept locally${syncErrorDetail(err)}`,
          true,
          true
        );
      });
  } else {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(deals));
  }

  finishUi();
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  if (modalReadOnly) return;

  const data = {
    company: form.elements.company.value.trim(),
    contact: form.elements.contact.value.trim(),
    phone: form.elements.phone.value.trim(),
    email: form.elements.email.value.trim(),
    industry: form.elements.industry.value.trim(),
    tool: form.elements.tool.value.trim(),
    value: Number(form.elements.value.value) || 0,
    owner: form.elements.owner.value.trim(),
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
  } else {
    const createdAt = Date.now();
    deals.push({
      id: crypto.randomUUID(),
      stage: createStage,
      createdAt,
      ...data,
      boardOrder: nextBoardOrder(createStage),
      notes: [makeDealCreationNote(createdAt), ...(data.notes || [])],
      tasks: data.tasks || [],
    });
  }

  saveDeals();
  render();
  closeModal();
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

document.getElementById("newDealBtn").addEventListener("click", () => openModal());
document.getElementById("modalCloseBtn").addEventListener("click", closeModal);
document.getElementById("cancelBtn").addEventListener("click", closeModal);
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!dismissOverlay.hidden) closeDismissModal();
  else if (!commitOverlay.hidden) closeCommitModal();
  else if (!overlay.hidden) closeModal();
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
      currentUser = { id: user.id, email: user.email || "", name: user.name || "" };
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
      if (!overlay.hidden || !commitOverlay.hidden || !dismissOverlay.hidden) return;
      refreshDealsFromRemote();
    });
  }
}

authModeLoginBtn.addEventListener("click", () => setAuthMode("login"));
authModeSignupBtn.addEventListener("click", () => setAuthMode("signup"));
loginForm.addEventListener("submit", handleLoginSubmit);
signupForm.addEventListener("submit", handleSignupSubmit);
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
