/* MHN Sales — Supabase data layer
 *
 * Safety rules:
 * 1) Cloud WRITE only on GitHub Pages (*.github.io) — not file:// or localhost.
 * 2) Cloud writes upsert only the affected deal row(s); permanent delete removes one id.
 *    Never rewrite the entire deals table from a browser snapshot on routine saves.
 * 3) No cloud writes until this session has successfully loaded from Supabase
 *    (prevents empty/stale localStorage from wiping production).
 * 4) Unsynced local mutations are never silently discarded when cloud returns.
 */

const LOCAL_STORAGE_KEY = "mhn-sales-deals";
const PENDING_SYNC_KEY = "mhn-sales-pending-sync";
const PENDING_DELETES_KEY = "mhn-sales-pending-deletes";
const PENDING_UPSERTS_KEY = "mhn-sales-pending-upserts";

function getSupabaseClient() {
  const cfg = window.MHN_CONFIG || {};
  const url = (cfg.supabaseUrl || "").trim();
  const key = (cfg.supabaseAnonKey || "").trim();
  if (!url || !key || url.includes("YOUR_PROJECT") || !window.supabase) {
    return null;
  }
  return window.supabase.createClient(url, key);
}

/** Only the deployed GitHub Pages app may write to Supabase. */
function canWriteToCloud() {
  try {
    const protocol = location.protocol || "";
    const host = (location.hostname || "").toLowerCase();
    if (protocol === "file:") return false;
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") return false;
    if (host.endsWith(".github.io")) return true;
    return false;
  } catch {
    return false;
  }
}

const db = getSupabaseClient();
const cloudWriteAllowedByOrigin = Boolean(db) && canWriteToCloud();
let cloudHydrated = false; // true only after a successful remote fetch this session
/** @type {{ source: string, cloudHydrated: boolean, flushError?: boolean }} */
let lastLoadMeta = { source: "unloaded", cloudHydrated: false };

function hasPendingSync() {
  try {
    return localStorage.getItem(PENDING_SYNC_KEY) === "1";
  } catch {
    return false;
  }
}

function markPendingSync() {
  try {
    localStorage.setItem(PENDING_SYNC_KEY, "1");
  } catch {
    /* ignore quota / private mode */
  }
}

function clearPendingSync() {
  try {
    localStorage.removeItem(PENDING_SYNC_KEY);
  } catch {
    /* ignore */
  }
}

function readIdList(key) {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(raw) ? raw.filter((id) => typeof id === "string" && id) : [];
  } catch {
    return [];
  }
}

function writeIdList(key, ids) {
  try {
    const unique = [...new Set((ids || []).filter(Boolean))];
    if (!unique.length) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(unique));
  } catch {
    /* ignore */
  }
}

function getPendingDeletes() {
  return readIdList(PENDING_DELETES_KEY);
}

function setPendingDeletes(ids) {
  writeIdList(PENDING_DELETES_KEY, ids);
}

function queuePendingDelete(id) {
  if (!id) return;
  const ids = getPendingDeletes();
  if (!ids.includes(id)) {
    ids.push(id);
    setPendingDeletes(ids);
  }
  // A queued delete should not also try to upsert the same row.
  clearPendingUpserts([id]);
  markPendingSync();
}

function clearPendingDelete(id) {
  setPendingDeletes(getPendingDeletes().filter((x) => x !== id));
}

function getPendingUpserts() {
  return readIdList(PENDING_UPSERTS_KEY);
}

function queuePendingUpserts(ids) {
  const list = getPendingUpserts();
  let changed = false;
  for (const id of ids || []) {
    if (!id || list.includes(id)) continue;
    list.push(id);
    changed = true;
  }
  if (changed) {
    writeIdList(PENDING_UPSERTS_KEY, list);
    markPendingSync();
  }
}

function clearPendingUpserts(ids) {
  if (!ids) {
    writeIdList(PENDING_UPSERTS_KEY, []);
    return;
  }
  const remove = new Set(ids);
  writeIdList(
    PENDING_UPSERTS_KEY,
    getPendingUpserts().filter((id) => !remove.has(id))
  );
}

function clearPendingFlagsIfIdle() {
  if (!getPendingUpserts().length && !getPendingDeletes().length) {
    clearPendingSync();
  }
}

async function flushPendingDeletes() {
  const ids = getPendingDeletes();
  for (const id of ids) {
    await deleteDealFromRemote(id);
    clearPendingDelete(id);
  }
}

function msToIso(ms) {
  if (ms == null || ms === "") return null;
  const n = Number(ms);
  if (!Number.isFinite(n)) return null;
  return new Date(n).toISOString();
}

function isoToMs(iso) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

function dealToRow(deal) {
  return {
    id: deal.id,
    company: deal.company || "",
    contact: deal.contact || "",
    phone: deal.phone || "",
    email: deal.email || "",
    industry: deal.industry || "",
    tool: deal.tool || "",
    value: Number(deal.value) || 0,
    owner: deal.owner || "",
    stage: deal.stage || "prospects",
    implementation_days: deal.implementationDays ?? null,
    board_order: deal.boardOrder ?? null,
    committed_at: msToIso(deal.committedAt),
    dismissed_at: msToIso(deal.dismissedAt),
    created_at: msToIso(deal.createdAt) || new Date().toISOString(),
    updated_at: new Date().toISOString(),
    notes: Array.isArray(deal.notes) ? deal.notes : [],
    tasks: Array.isArray(deal.tasks) ? deal.tasks : [],
  };
}

function rowToDeal(row) {
  return {
    id: row.id,
    company: row.company || "",
    contact: row.contact || "",
    phone: row.phone || "",
    email: row.email || "",
    industry: row.industry || "",
    tool: row.tool || "",
    value: Number(row.value) || 0,
    owner: row.owner || "",
    stage: row.stage || "prospects",
    implementationDays: row.implementation_days ?? undefined,
    boardOrder: row.board_order ?? undefined,
    committedAt: isoToMs(row.committed_at) ?? undefined,
    dismissedAt: isoToMs(row.dismissed_at) ?? undefined,
    createdAt: isoToMs(row.created_at) || Date.now(),
    notes: Array.isArray(row.notes) ? row.notes : [],
    tasks: Array.isArray(row.tasks) ? row.tasks : [],
  };
}

function loadLocalDeals() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveLocalDeals(deals) {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(deals));
}

/** Remote deals as base; local (pending) wins on id conflict. */
function mergePreferLocal(local, remote) {
  const byId = new Map();
  for (const deal of remote || []) {
    if (deal?.id) byId.set(deal.id, deal);
  }
  for (const deal of local || []) {
    if (deal?.id) byId.set(deal.id, deal);
  }
  return Array.from(byId.values());
}

function assertCloudWriteAllowed() {
  if (!cloudWriteAllowedByOrigin) {
    throw new Error("Cloud writes are blocked on this origin");
  }
  if (!cloudHydrated) {
    throw new Error("Cloud writes blocked until remote data has loaded");
  }
}

async function fetchRemoteDeals() {
  const { data, error } = await db.from("deals").select("*").order("created_at", { ascending: true });
  if (error) throw error;
  cloudHydrated = true;
  return (data || []).map(rowToDeal);
}

/**
 * Upsert specific deal rows only — never deletes other cloud rows.
 * Strips unknown columns progressively so older schemas still sync
 * (including when both board_order and tasks are missing).
 */
async function upsertDealsToRemote(deals) {
  assertCloudWriteAllowed();
  if (!deals.length) return;
  const omit = new Set();
  const buildRows = () =>
    deals.map((deal) => {
      const row = dealToRow(deal);
      for (const key of omit) delete row[key];
      return row;
    });

  let lastError = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    const rows = buildRows();
    const { error } = await db.from("deals").upsert(rows, { onConflict: "id" });
    if (!error) return;
    lastError = error;
    const msg = error.message || "";
    if (/board_order/i.test(msg) && !omit.has("board_order")) {
      omit.add("board_order");
      continue;
    }
    if (/tasks/i.test(msg) && !omit.has("tasks")) {
      omit.add("tasks");
      continue;
    }
    throw error;
  }
  throw lastError || new Error("Upsert failed after schema compatibility retries");
}

async function deleteDealFromRemote(id) {
  assertCloudWriteAllowed();
  if (!id) return;
  const { error } = await db.from("deals").delete().eq("id", id);
  if (error) throw error;
}

/** Ensure PR1-era pending flag without an id list still flushes safely once. */
function ensurePendingUpsertIds(localDeals) {
  if (!hasPendingSync()) return;
  if (getPendingUpserts().length || getPendingDeletes().length) return;
  queuePendingUpserts((localDeals || []).map((d) => d.id).filter(Boolean));
}

async function flushPendingUpsertsFromLocal(localDeals) {
  ensurePendingUpsertIds(localDeals);
  const pendingIds = new Set(getPendingUpserts());
  const deletes = new Set(getPendingDeletes());
  const toUpsert = (localDeals || []).filter(
    (d) => d?.id && pendingIds.has(d.id) && !deletes.has(d.id)
  );
  if (toUpsert.length) {
    await upsertDealsToRemote(toUpsert);
  }
  clearPendingUpserts([...pendingIds]);
}

/**
 * After a successful remote fetch: either adopt cloud, migrate empty cloud,
 * or preserve/flush pending local mutations so they are never discarded.
 * Pending flush upserts only queued deal ids — not the entire table.
 */
async function resolveHydratedDeals(remote) {
  const local = loadLocalDeals();
  ensurePendingUpsertIds(local);

  if (hasPendingSync() || getPendingDeletes().length || getPendingUpserts().length) {
    const deletes = new Set(getPendingDeletes());
    const merged = mergePreferLocal(local, remote).filter((d) => !deletes.has(d.id));
    try {
      await flushPendingUpsertsFromLocal(merged);
      await flushPendingDeletes();
      clearPendingFlagsIfIdle();
      saveLocalDeals(merged);
      lastLoadMeta = { source: "local-pending-synced", cloudHydrated: true };
      return merged;
    } catch (err) {
      console.error("Failed to flush pending local sync:", err);
      saveLocalDeals(merged);
      lastLoadMeta = { source: "local-pending", cloudHydrated: true, flushError: true };
      return merged;
    }
  }

  if (!remote.length && cloudWriteAllowedByOrigin) {
    if (local.length) {
      // First-run seed only: empty cloud ← local cache.
      await upsertDealsToRemote(local);
      clearPendingUpserts();
      clearPendingSync();
      saveLocalDeals(local);
      lastLoadMeta = { source: "local-migrated", cloudHydrated: true };
      return local;
    }
  }

  saveLocalDeals(remote);
  clearPendingUpserts();
  clearPendingSync();
  lastLoadMeta = { source: "cloud", cloudHydrated: true };
  return remote;
}

async function loadDealsAsync() {
  if (!db) {
    console.warn("Supabase not configured — using localStorage only. Fill in config.js.");
    cloudHydrated = false;
    lastLoadMeta = { source: "local-only", cloudHydrated: false };
    return loadLocalDeals();
  }
  try {
    if (cloudWriteAllowedByOrigin) {
      const remote = await fetchRemoteDeals();
      return await resolveHydratedDeals(remote);
    }
    const remote = await fetchRemoteDeals();
    lastLoadMeta = { source: "cloud-readonly", cloudHydrated: true };
    return remote;
  } catch (err) {
    console.error("Failed to load from Supabase, falling back to localStorage:", err);
    cloudHydrated = false; // refuse cloud writes this session
    lastLoadMeta = { source: "local-fallback", cloudHydrated: false };
    return loadLocalDeals();
  }
}

/**
 * Persist the full local cache, and upsert only the affected deal rows to cloud.
 * @param {object[]} dealsToWrite rows that changed
 * @param {object[]} allDeals full in-memory board (localStorage mirror)
 */
async function upsertDealsAsync(dealsToWrite, allDeals) {
  const cache = Array.isArray(allDeals) ? allDeals : dealsToWrite;
  saveLocalDeals(cache);
  const toWrite = (dealsToWrite || []).filter((d) => d?.id);
  const ids = toWrite.map((d) => d.id);

  if (!db) {
    return { wroteToCloud: false, reason: "no-client" };
  }
  if (!cloudWriteAllowedByOrigin) {
    return { wroteToCloud: false, writeBlocked: true, reason: "origin-blocked" };
  }
  if (!cloudHydrated) {
    queuePendingUpserts(ids);
    try {
      const remote = await fetchRemoteDeals();
      const deletes = new Set(getPendingDeletes());
      const merged = mergePreferLocal(cache, remote).filter((d) => !deletes.has(d.id));
      await flushPendingUpsertsFromLocal(merged);
      await flushPendingDeletes();
      clearPendingFlagsIfIdle();
      saveLocalDeals(merged);
      lastLoadMeta = { source: "local-pending-synced", cloudHydrated: true };
      return { wroteToCloud: true, rehydrated: true, deals: merged };
    } catch (err) {
      console.warn("Skipping cloud save — remote still unavailable:", err);
      return { wroteToCloud: false, writeBlocked: true, reason: "not-hydrated" };
    }
  }

  try {
    if (toWrite.length) {
      await upsertDealsToRemote(toWrite);
      clearPendingUpserts(ids);
    }
    await flushPendingDeletes();
    clearPendingFlagsIfIdle();
    return { wroteToCloud: true };
  } catch (err) {
    console.error("Failed to save to Supabase:", err);
    queuePendingUpserts(ids);
    throw err;
  }
}

/**
 * @deprecated Prefer upsertDealsAsync(changedDeals, allDeals).
 * Accepts either (allDeals) legacy or (changed, all) — never treats a lone
 * full array as "rewrite every cloud row" when a second arg is omitted; queues
 * only the provided changed rows (or none).
 */
async function saveDealsAsync(dealsToWrite, allDeals) {
  if (Array.isArray(allDeals)) {
    return upsertDealsAsync(dealsToWrite || [], allDeals);
  }
  // Legacy single-arg call: local mirror only — do not snapshot-upsert cloud.
  saveLocalDeals(dealsToWrite || []);
  return { wroteToCloud: false, reason: "legacy-local-only" };
}

async function deleteDealAsync(id, allDeals) {
  if (Array.isArray(allDeals)) {
    saveLocalDeals(allDeals);
  }
  if (!db) return { wroteToCloud: false, reason: "no-client" };
  if (!cloudWriteAllowedByOrigin) {
    return { wroteToCloud: false, writeBlocked: true, reason: "origin-blocked" };
  }
  if (!cloudHydrated) {
    queuePendingDelete(id);
    return { wroteToCloud: false, writeBlocked: true, reason: "not-hydrated" };
  }
  try {
    await deleteDealFromRemote(id);
    clearPendingDelete(id);
    clearPendingUpserts([id]);
    clearPendingFlagsIfIdle();
    return { wroteToCloud: true };
  } catch (err) {
    console.error("Failed to delete deal from Supabase:", err);
    queuePendingDelete(id);
    throw err;
  }
}

function subscribeToDealChanges(onChange) {
  if (!db) return () => {};
  const channel = db
    .channel("mhn-deals")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "deals" },
      () => {
        onChange();
      }
    )
    .subscribe();
  return () => {
    db.removeChannel(channel);
  };
}

window.MHN_DB = {
  client: db,
  isRemote: Boolean(db),
  get cloudWriteEnabled() {
    return cloudWriteAllowedByOrigin && cloudHydrated;
  },
  get cloudWriteAllowedByOrigin() {
    return cloudWriteAllowedByOrigin;
  },
  get cloudHydrated() {
    return cloudHydrated;
  },
  get hasPendingSync() {
    return hasPendingSync();
  },
  get lastLoadMeta() {
    return lastLoadMeta;
  },
  loadDealsAsync,
  upsertDealsAsync,
  saveDealsAsync,
  deleteDealAsync,
  subscribeToDealChanges,
};
