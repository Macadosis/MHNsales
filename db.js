/* MHN Sales — Supabase data layer
 *
 * Safety rules:
 * 1) Cloud WRITE only on GitHub Pages (*.github.io) — not file:// or localhost.
 * 2) Never "replace all rows" / mass-delete orphans from a local snapshot.
 *    Saves upsert deals; permanent delete removes one id only.
 * 3) No cloud writes until this session has successfully loaded from Supabase
 *    (prevents empty/stale localStorage from wiping production).
 * 4) Unsynced local mutations are never silently discarded when cloud returns.
 */

const LOCAL_STORAGE_KEY = "mhn-sales-deals";
const PENDING_SYNC_KEY = "mhn-sales-pending-sync";
const PENDING_DELETES_KEY = "mhn-sales-pending-deletes";

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

function getPendingDeletes() {
  try {
    const raw = JSON.parse(localStorage.getItem(PENDING_DELETES_KEY) || "[]");
    return Array.isArray(raw) ? raw.filter((id) => typeof id === "string" && id) : [];
  } catch {
    return [];
  }
}

function setPendingDeletes(ids) {
  try {
    const unique = [...new Set(ids.filter(Boolean))];
    if (!unique.length) localStorage.removeItem(PENDING_DELETES_KEY);
    else localStorage.setItem(PENDING_DELETES_KEY, JSON.stringify(unique));
  } catch {
    /* ignore */
  }
}

function queuePendingDelete(id) {
  if (!id) return;
  const ids = getPendingDeletes();
  if (!ids.includes(id)) {
    ids.push(id);
    setPendingDeletes(ids);
  }
  markPendingSync();
}

function clearPendingDelete(id) {
  setPendingDeletes(getPendingDeletes().filter((x) => x !== id));
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
 * Upsert deals only — never deletes other cloud rows.
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

/**
 * After a successful remote fetch: either adopt cloud, migrate empty cloud,
 * or preserve/flush pending local mutations so they are never discarded.
 */
async function resolveHydratedDeals(remote) {
  if (hasPendingSync() || getPendingDeletes().length) {
    const local = loadLocalDeals();
    const merged = mergePreferLocal(local, remote).filter(
      (d) => !getPendingDeletes().includes(d.id)
    );
    try {
      if (merged.length) {
        await upsertDealsToRemote(merged);
      }
      await flushPendingDeletes();
      clearPendingSync();
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
    const local = loadLocalDeals();
    if (local.length) {
      await upsertDealsToRemote(local);
      clearPendingSync();
      saveLocalDeals(local);
      lastLoadMeta = { source: "local-migrated", cloudHydrated: true };
      return local;
    }
  }

  saveLocalDeals(remote);
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
 * Persist deals.
 * - Always mirrors to localStorage (per-origin).
 * - On Pages: upserts to Supabase only after a successful remote load.
 * - If not yet hydrated, attempts one re-fetch so pending edits can flush
 *   when the cloud comes back (without requiring a full page reload).
 * - Marks pending sync when cloud write is blocked or fails.
 * - Never mass-deletes cloud rows.
 */
async function saveDealsAsync(deals) {
  saveLocalDeals(deals);
  if (!db) {
    return { wroteToCloud: false, reason: "no-client" };
  }
  if (!cloudWriteAllowedByOrigin) {
    return { wroteToCloud: false, writeBlocked: true, reason: "origin-blocked" };
  }
  if (!cloudHydrated) {
    markPendingSync();
    try {
      const remote = await fetchRemoteDeals();
      const merged = mergePreferLocal(deals, remote).filter(
        (d) => !getPendingDeletes().includes(d.id)
      );
      await upsertDealsToRemote(merged);
      await flushPendingDeletes();
      clearPendingSync();
      saveLocalDeals(merged);
      lastLoadMeta = { source: "local-pending-synced", cloudHydrated: true };
      return { wroteToCloud: true, rehydrated: true, deals: merged };
    } catch (err) {
      console.warn("Skipping cloud save — remote still unavailable:", err);
      return { wroteToCloud: false, writeBlocked: true, reason: "not-hydrated" };
    }
  }
  try {
    await upsertDealsToRemote(deals);
    await flushPendingDeletes();
    clearPendingSync();
    return { wroteToCloud: true };
  } catch (err) {
    console.error("Failed to save to Supabase:", err);
    markPendingSync();
    throw err;
  }
}

async function deleteDealAsync(id) {
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
  saveDealsAsync,
  deleteDealAsync,
  subscribeToDealChanges,
};
