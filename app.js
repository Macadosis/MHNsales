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

const STORAGE_KEY = "mhn-sales-deals";
const DEFAULT_VALUE = 10000;
const MS_DAY = 86400000;
const PIPELINE_ROW_HEIGHT = 56;
const PIPELINE_BAR_HEIGHT = 36;
const PIPELINE_BAR_TOP = (PIPELINE_ROW_HEIGHT - PIPELINE_BAR_HEIGHT) / 2;

let deals = [];
let editingId = null;   // deal being edited in the modal (null = creating)
let modalReadOnly = false; // when true the modal shows a deal but blocks edits
let createStage = "prospects"; // stage a new deal is created into
let pendingCommitDeal = null; // deal awaiting implementation days before moving to Committed
let openFilterKey = null;
let activeTab = "board";
let modalNotes = [];
let modalPanel = "details";
let syncingFromRemote = false;

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

/* ------------------------------ Storage ------------------------ */

function loadDeals() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveDeals() {
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

async function refreshDealsFromRemote() {
  const api = window.MHN_DB;
  if (!api?.isRemote || !api.loadDealsAsync) return;
  try {
    syncingFromRemote = true;
    deals = await api.loadDealsAsync();
    migrateDeals({ persist: Boolean(api.cloudWriteEnabled) });
    render();
  } catch (err) {
    console.error(err);
  } finally {
    syncingFromRemote = false;
  }
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
  }
  // Never push migration fixes from a write-blocked origin (avoids stale local→cloud)
  if (changed && persist && window.MHN_DB?.cloudWriteEnabled) saveDeals();
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
    return selected.has((deal[key] || "").trim());
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

    if (options.length === 0) {
      const empty = document.createElement("div");
      empty.className = "filter-empty";
      empty.textContent = `No ${label.toLowerCase()} values yet`;
      menu.appendChild(empty);
    } else {
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
  render();
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

/* ------------------------------ Rendering ---------------------- */

function render() {
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
}

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
  const stageDeals = visibleDeals.filter((d) => d.stage === stage.id);
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
  attachDropHandlers(col);
  return col;
}

function renderCard(deal) {
  const card = document.createElement("article");
  card.className = "card";
  card.draggable = true;
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

  card.addEventListener("click", () => openModal({ deal }));

  card.addEventListener("dragstart", (e) => {
    e.dataTransfer.setData("text/plain", deal.id);
    e.dataTransfer.effectAllowed = "move";
    requestAnimationFrame(() => card.classList.add("dragging"));
  });
  card.addEventListener("dragend", () => card.classList.remove("dragging"));

  return card;
}

/* ------------------------------ Drag & drop -------------------- */

function moveDeal(deal, stage) {
  deal.stage = stage;
  saveDeals();
  render();
}

function attachDropHandlers(col) {
  col.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    col.classList.add("drag-over");
  });
  col.addEventListener("dragleave", (e) => {
    if (!col.contains(e.relatedTarget)) col.classList.remove("drag-over");
  });
  col.addEventListener("drop", (e) => {
    e.preventDefault();
    col.classList.remove("drag-over");
    const id = e.dataTransfer.getData("text/plain");
    const deal = deals.find((d) => d.id === id);
    if (!deal) return;

    const targetStage = col.dataset.stage;
    if (targetStage === "committed") {
      openCommitModal(deal);
      return;
    }
    if (deal.stage === targetStage) return;
    moveDeal(deal, targetStage);
  });
}

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
  pendingCommitDeal.stage = "committed";
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
  deals = deals.filter((d) => d.id !== editingId);
  saveDeals();
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
    deals.push({
      id: crypto.randomUUID(),
      stage: createStage,
      createdAt: Date.now(),
      ...data,
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
    render();
  });
});

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
  const api = window.MHN_DB;

  if (api?.isRemote && !api.cloudWriteEnabled) {
    showCloudReadOnlyBanner();
  }

  if (api?.loadDealsAsync) {
    try {
      deals = await api.loadDealsAsync();
      if (api.isRemote && api.cloudWriteEnabled) {
        showSyncStatus("Synced with Supabase");
      } else if (api.isRemote && !api.cloudWriteEnabled) {
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

  // Persist migrate fixes only on the deployed write-enabled origin
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

bootstrap();
