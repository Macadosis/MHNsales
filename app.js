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

let deals = [];
let currentUser = null; // { name: string }
let editingId = null;   // deal being edited in the modal (null = creating)
let modalReadOnly = false; // when true the modal shows a deal but blocks edits
let createStage = "prospects"; // stage a new deal is created into
let pendingCommitDeal = null; // deal awaiting implementation days before moving to Committed
let openFilterKey = null;
let activeTab = "board";
let modalNotes = [];
let modalPanel = "details";
let syncingFromRemote = false;
let appStarted = false;

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
const modalEl = overlay.querySelector(".modal");
const cancelBtn = document.getElementById("cancelBtn");
const activityComposer = modalPanelActivity.querySelector(".activity-composer");
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

function saveDeals() {
  // Ignore stale realtime echoes while our write is in flight, so a just-dropped
  // card isn't immediately snapped back to its old stage.
  suppressRemoteRefreshUntil = Date.now() + 1500;
  pendingRemoteRefresh = false;
  const api = window.MHN_DB;
  if (api?.saveDealsAsync) {
    api.saveDealsAsync(deals).then((result) => {
      if (result?.writeBlocked) {
        // Local-only save — cloud intentionally untouched
        return;
      }
    }).catch((err) => {
      console.error(err);
      showSyncStatus("Could not sync to cloud — changes kept locally", true);
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

function addMonths(date, count) {
  return new Date(date.getFullYear(), date.getMonth() + count, 1);
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

function getFieldMatches(fieldKey, query, { trackDismissed = false } = {}) {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const byValue = new Map();
  for (const deal of deals) {
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

function applySearch(value) {
  searchQuery = value.trim().toLowerCase();
  const hasQuery = searchQuery.length > 0;
  searchBubble.classList.toggle("has-query", hasQuery);
  searchClearBtn.hidden = !hasQuery;
  // Debounce board re-render so typing doesn't fight the caret / keyboard on iOS.
  clearTimeout(applySearch._timer);
  applySearch._timer = setTimeout(() => render(), 80);
}

searchInput.addEventListener("input", () => applySearch(searchInput.value));
searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && searchInput.value) {
    e.stopPropagation();
    searchInput.value = "";
    applySearch("");
  }
});
searchClearBtn.addEventListener("click", () => {
  searchInput.value = "";
  applySearch("");
  searchInput.focus();
});

function isMobileViewport() {
  return window.matchMedia("(max-width: 720px)").matches;
}

function scrollSearchIntoView() {
  const row = searchBubble.closest(".toolbar-scroll");
  if (!row) return;
  const rowRect = row.getBoundingClientRect();
  const bubbleRect = searchBubble.getBoundingClientRect();
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

function expandSearch() {
  searchBubble.classList.add("is-expanded");
  if (document.activeElement !== searchInput) {
    searchInput.focus({ preventScroll: true });
  }
  // After the bubble finishes expanding, bring it fully into the toolbar viewport.
  setTimeout(scrollSearchIntoView, 220);
}

searchInput.addEventListener("focus", expandSearch);
searchInput.addEventListener("blur", () => {
  if (!searchInput.value) searchBubble.classList.remove("is-expanded");
});

searchBubble.addEventListener("pointerdown", (e) => {
  // On mobile the field is icon-only until tapped; expand and focus it.
  if (isMobileViewport() && !searchBubble.classList.contains("is-expanded")) {
    e.preventDefault();
    expandSearch();
  }
});

/* ------------------------------ Rendering ---------------------- */

function render() {
  lastRenderedSignature = JSON.stringify(deals);
  if (activeTab === "board") {
    renderFilters(filtersEl, clearFiltersBtn);
    renderBoard();
  } else if (activeTab === "pipeline") {
    renderFilters(pipelineFiltersEl, pipelineClearFiltersBtn);
    renderPipeline();
  } else if (activeTab === "history") {
    renderHistory();
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

function setModalPanel(panel) {
  modalPanel = panel;
  const isDetails = panel === "details";

  modalPanelDetails.hidden = !isDetails;
  modalPanelActivity.hidden = isDetails;

  document.querySelectorAll(".modal-tab").forEach((tab) => {
    const active = tab.dataset.modalTab === panel;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", active ? "true" : "false");
  });

  // Notes rendered while the panel was hidden report scrollHeight 0, which
  // collapses their textareas. Re-render now that the panel is visible so the
  // saved text is measured and shown correctly.
  if (!isDetails) {
    renderActivityNotes();
  }
}

function noteWasEdited(note) {
  return Boolean(note.updatedAt && note.updatedAt > note.createdAt);
}

function updateActivityNoteTime(note, timeEl) {
  timeEl.dateTime = new Date(note.createdAt).toISOString();
  timeEl.textContent = formatNoteTimestamp(note.createdAt);
  if (noteWasEdited(note)) {
    timeEl.textContent += ` · edited ${formatNoteTimestamp(note.updatedAt)}`;
  }
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

/* ------------------------------ Modal --------------------------- */

function openModal({ deal = null, stage = "prospects", readOnly = false } = {}) {
  editingId = deal ? deal.id : null;
  modalReadOnly = readOnly && Boolean(deal);
  createStage = stage;
  modalNotes = deal
    ? (deal.notes || []).map((note) => ({ ...note }))
    : [];
  newNoteInput.value = "";
  setModalPanel("details");
  renderActivityNotes();

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
    }
  } else {
    implementationFields.hidden = true;
    form.elements.implementationStart.required = false;
    form.elements.implementationDuration.required = false;
    form.elements.owner.value = getCurrentUserName();
  }

  modalTitle.textContent = modalReadOnly
    ? "View deal"
    : deal
      ? "Edit deal"
      : "New deal";
  saveBtn.textContent = deal ? "Save changes" : "Create deal";
  deleteBtn.hidden = !deal;

  applyModalReadOnly(modalReadOnly);

  overlay.hidden = false;
  if (!modalReadOnly) form.elements.company.focus();
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
  cancelBtn.textContent = isReadOnly ? "Close" : "Cancel";
}

function closeModal() {
  closeAllFieldSuggestions();
  overlay.hidden = true;
  editingId = null;
  modalReadOnly = false;
  applyModalReadOnly(false);
  modalNotes = [];
  newNoteInput.value = "";
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
  // Keep local cache in sync
  if (api?.saveDealsAsync) {
    api.saveDealsAsync(deals).catch((err) => console.error(err));
  } else {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(deals));
  }
  // Explicit single-row cloud delete (never a full-table replace)
  if (api?.deleteDealAsync) {
    api.deleteDealAsync(id).catch((err) => {
      console.error(err);
      showSyncStatus("Could not delete deal from cloud", true);
    });
  }

  render();
  closeDismissModal();
  closeModal();
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
      if (api.isRemote && api.cloudWriteAllowedByOrigin) {
        showSyncStatus("Synced with Supabase");
      } else if (api.isRemote && !api.cloudWriteAllowedByOrigin) {
        showSyncStatus("Cloud read-only — local edits won’t upload", false, true);
      }
    } catch (err) {
      console.error(err);
      deals = loadDeals();
      showSyncStatus("Cloud sync unavailable — using local data", true);
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
