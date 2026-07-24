/* MHN Sales — Supabase data layer
 *
 * Safety rules:
 * 1) Cloud WRITE only on GitHub Pages (*.github.io) — not file:// or localhost.
 * 2) Cloud writes upsert only the affected deal row(s); permanent delete removes one id.
 *    Never rewrite the entire deals table from a browser snapshot on routine saves.
 * 3) No cloud writes until this session has successfully loaded from Supabase
 *    (prevents empty/stale localStorage from wiping production).
 * 4) Unsynced local mutations are never silently discarded when cloud returns.
 * 5) Updates use optimistic concurrency (version column). Stale writers get a conflict
 *    instead of silently overwriting a newer remote row.
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
/** When false, fall back to legacy upserts (version column missing in production). */
let versioningEnabled = true;
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

function dealVersion(deal) {
  const n = Number(deal?.version);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function dealToRow(deal, { nextVersion } = {}) {
  const row = {
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
  if (versioningEnabled) {
    row.version = nextVersion != null ? nextVersion : dealVersion(deal) || 1;
  }
  return row;
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
    version: Number.isFinite(Number(row.version)) ? Number(row.version) : 1,
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

function mergeDealsById(baseDeals, replacements) {
  const byId = new Map((baseDeals || []).filter((d) => d?.id).map((d) => [d.id, d]));
  for (const deal of replacements || []) {
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
 * Run an insert/update/upsert, stripping unknown columns if the live schema is behind.
 * @returns {{ data: any, error: any }}
 */
async function withColumnCompat(run) {
  const omit = new Set();
  let lastError = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const result = await run(omit);
    if (!result.error) return result;
    lastError = result.error;
    const msg = result.error.message || "";
    if (/version/i.test(msg) && versioningEnabled) {
      versioningEnabled = false;
      console.warn("deals.version missing — optimistic locking disabled until sync_schema.sql is applied");
      continue;
    }
    if (/board_order/i.test(msg) && !omit.has("board_order")) {
      omit.add("board_order");
      continue;
    }
    if (/tasks/i.test(msg) && !omit.has("tasks")) {
      omit.add("tasks");
      continue;
    }
    return result;
  }
  return { data: null, error: lastError || new Error("Write failed after schema compatibility retries") };
}

function stripOmitted(row, omit) {
  const next = { ...row };
  for (const key of omit) delete next[key];
  if (!versioningEnabled) delete next.version;
  return next;
}

/** Legacy path when version column is unavailable. */
async function legacyUpsertDeal(deal) {
  const { data, error } = await withColumnCompat(async (omit) => {
    const row = stripOmitted(dealToRow(deal), omit);
    return db.from("deals").upsert(row, { onConflict: "id" }).select("*").maybeSingle();
  });
  if (error) throw error;
  return { deal: data ? rowToDeal(data) : { ...deal, version: dealVersion(deal) || 1 }, conflict: false };
}

async function fetchRemoteDealById(id) {
  const { data, error } = await db.from("deals").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? rowToDeal(data) : null;
}

/**
 * Write one deal with optimistic concurrency.
 * @returns {{ deal: object, conflict: boolean }}
 */
async function writeDealToRemote(deal) {
  assertCloudWriteAllowed();
  if (!deal?.id) throw new Error("Deal id required");

  if (!versioningEnabled) {
    return legacyUpsertDeal(deal);
  }

  const expected = dealVersion(deal);

  // Existing row: UPDATE only if version still matches.
  if (expected > 0) {
    const { data, error } = await withColumnCompat(async (omit) => {
      const row = stripOmitted(dealToRow(deal, { nextVersion: expected + 1 }), omit);
      delete row.id;
      return db
        .from("deals")
        .update(row)
        .eq("id", deal.id)
        .eq("version", expected)
        .select("*");
    });

    if (error) {
      if (!versioningEnabled) return legacyUpsertDeal(deal);
      throw error;
    }

    const rows = Array.isArray(data) ? data : data ? [data] : [];
    if (rows.length) {
      return { deal: rowToDeal(rows[0]), conflict: false };
    }

    const remote = await fetchRemoteDealById(deal.id);
    if (remote) {
      return { deal: remote, conflict: true };
    }
    // Remote row gone — fall through to insert.
  }

  // New deal (or resurrected after remote delete): INSERT at version 1.
  const { data, error } = await withColumnCompat(async (omit) => {
    const row = stripOmitted(dealToRow(deal, { nextVersion: 1 }), omit);
    return db.from("deals").insert(row).select("*").maybeSingle();
  });

  if (error) {
    if (!versioningEnabled) return legacyUpsertDeal(deal);
    // Unique violation — someone else created/updated first.
    if (error.code === "23505" || /duplicate/i.test(error.message || "")) {
      const remote = await fetchRemoteDealById(deal.id);
      if (remote) return { deal: remote, conflict: true };
    }
    throw error;
  }

  return { deal: data ? rowToDeal(data) : { ...deal, version: 1 }, conflict: false };
}

/**
 * Write specific deals only. Returns server rows + any version conflicts.
 * @returns {{ written: object[], conflicts: object[] }}
 */
async function writeDealsToRemote(deals) {
  assertCloudWriteAllowed();
  const written = [];
  const conflicts = [];
  for (const deal of deals || []) {
    if (!deal?.id) continue;
    const result = await writeDealToRemote(deal);
    if (result.conflict) conflicts.push(result.deal);
    else written.push(result.deal);
  }
  return { written, conflicts };
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
  const toWrite = (localDeals || []).filter(
    (d) => d?.id && pendingIds.has(d.id) && !deletes.has(d.id)
  );
  let conflicts = [];
  if (toWrite.length) {
    const result = await writeDealsToRemote(toWrite);
    conflicts = result.conflicts;
    // Apply successful + conflict (server) rows back into the working set.
    for (const deal of [...result.written, ...result.conflicts]) {
      const idx = localDeals.findIndex((d) => d.id === deal.id);
      if (idx >= 0) localDeals[idx] = deal;
      else localDeals.push(deal);
    }
  }
  clearPendingUpserts([...pendingIds]);
  return conflicts;
}

/**
 * After a successful remote fetch: either adopt cloud, migrate empty cloud,
 * or preserve/flush pending local mutations so they are never discarded.
 * Pending flush writes only queued deal ids — not the entire table.
 */
async function resolveHydratedDeals(remote) {
  const local = loadLocalDeals();
  ensurePendingUpsertIds(local);

  if (hasPendingSync() || getPendingDeletes().length || getPendingUpserts().length) {
    const deletes = new Set(getPendingDeletes());
    const merged = mergePreferLocal(local, remote).filter((d) => !deletes.has(d.id));
    try {
      const conflicts = await flushPendingUpsertsFromLocal(merged);
      await flushPendingDeletes();
      clearPendingFlagsIfIdle();
      saveLocalDeals(merged);
      lastLoadMeta = {
        source: conflicts.length ? "local-pending-conflict" : "local-pending-synced",
        cloudHydrated: true,
        flushError: false,
      };
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
      const { written } = await writeDealsToRemote(local);
      const seeded = written.length ? mergeDealsById(local, written) : local;
      clearPendingUpserts();
      clearPendingSync();
      saveLocalDeals(seeded);
      lastLoadMeta = { source: "local-migrated", cloudHydrated: true };
      return seeded;
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
 * Persist the full local cache, and write only the affected deal rows to cloud.
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
      const conflicts = await flushPendingUpsertsFromLocal(merged);
      await flushPendingDeletes();
      clearPendingFlagsIfIdle();
      saveLocalDeals(merged);
      lastLoadMeta = {
        source: conflicts.length ? "local-pending-conflict" : "local-pending-synced",
        cloudHydrated: true,
      };
      return {
        wroteToCloud: true,
        rehydrated: true,
        conflict: conflicts.length > 0,
        conflicts,
        deals: merged,
      };
    } catch (err) {
      console.warn("Skipping cloud save — remote still unavailable:", err);
      return { wroteToCloud: false, writeBlocked: true, reason: "not-hydrated" };
    }
  }

  try {
    let next = cache;
    let conflicts = [];
    let wrote = false;
    if (toWrite.length) {
      const result = await writeDealsToRemote(toWrite);
      conflicts = result.conflicts;
      next = mergeDealsById(cache, [...result.written, ...result.conflicts]);
      saveLocalDeals(next);
      clearPendingUpserts(ids);
      wrote = result.written.length > 0;
    }
    await flushPendingDeletes();
    clearPendingFlagsIfIdle();
    return {
      wroteToCloud: wrote || conflicts.length === 0,
      conflict: conflicts.length > 0,
      conflicts,
      deals: next,
    };
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
  get versioningEnabled() {
    return versioningEnabled;
  },
  loadDealsAsync,
  upsertDealsAsync,
  saveDealsAsync,
  deleteDealAsync,
  subscribeToDealChanges,
};
