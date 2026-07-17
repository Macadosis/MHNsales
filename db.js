/* MHN Sales — Supabase data layer
 *
 * Safety rules:
 * 1) Cloud WRITE only on GitHub Pages (*.github.io) — not file:// or localhost.
 * 2) Never "replace all rows" / mass-delete orphans from a local snapshot.
 *    Saves upsert deals; permanent delete removes one id only.
 * 3) No cloud writes until this session has successfully loaded from Supabase
 *    (prevents empty/stale localStorage from wiping production).
 */

const LOCAL_STORAGE_KEY = "mhn-sales-deals";

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
    committed_at: msToIso(deal.committedAt),
    dismissed_at: msToIso(deal.dismissedAt),
    created_at: msToIso(deal.createdAt) || new Date().toISOString(),
    updated_at: new Date().toISOString(),
    notes: Array.isArray(deal.notes) ? deal.notes : [],
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
    committedAt: isoToMs(row.committed_at) ?? undefined,
    dismissedAt: isoToMs(row.dismissed_at) ?? undefined,
    createdAt: isoToMs(row.created_at) || Date.now(),
    notes: Array.isArray(row.notes) ? row.notes : [],
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

/** Upsert deals only — never deletes other cloud rows. */
async function upsertDealsToRemote(deals) {
  assertCloudWriteAllowed();
  if (!deals.length) return;
  const rows = deals.map(dealToRow);
  const { error } = await db.from("deals").upsert(rows, { onConflict: "id" });
  if (error) throw error;
}

async function deleteDealFromRemote(id) {
  assertCloudWriteAllowed();
  if (!id) return;
  const { error } = await db.from("deals").delete().eq("id", id);
  if (error) throw error;
}

/**
 * First-time seed only: if cloud is empty and we're on Pages, upload local cache.
 * Does not delete anything.
 */
async function migrateLocalToRemoteIfNeeded() {
  const remote = await fetchRemoteDeals();
  if (remote.length) return remote;

  if (!cloudWriteAllowedByOrigin) return remote;

  const local = loadLocalDeals();
  if (!local.length) return [];

  // Hydrated (empty remote is a valid load). Safe to seed without orphan deletes.
  await upsertDealsToRemote(local);
  return local;
}

async function loadDealsAsync() {
  if (!db) {
    console.warn("Supabase not configured — using localStorage only. Fill in config.js.");
    cloudHydrated = false;
    return loadLocalDeals();
  }
  try {
    if (cloudWriteAllowedByOrigin) {
      const deals = await migrateLocalToRemoteIfNeeded();
      // Refresh local cache from cloud so Pages doesn't keep a stale snapshot
      saveLocalDeals(deals);
      return deals;
    }
    const remote = await fetchRemoteDeals();
    return remote;
  } catch (err) {
    console.error("Failed to load from Supabase, falling back to localStorage:", err);
    cloudHydrated = false; // refuse cloud writes this session
    return loadLocalDeals();
  }
}

/**
 * Persist deals.
 * - Always mirrors to localStorage (per-origin).
 * - On Pages: upserts to Supabase only after a successful remote load.
 * - Never mass-deletes cloud rows.
 */
async function saveDealsAsync(deals) {
  saveLocalDeals(deals);
  if (!db) return { wroteToCloud: false };
  if (!cloudWriteAllowedByOrigin) {
    return { wroteToCloud: false, writeBlocked: true };
  }
  if (!cloudHydrated) {
    console.warn("Skipping cloud save — remote data not hydrated yet");
    return { wroteToCloud: false, writeBlocked: true, reason: "not-hydrated" };
  }
  try {
    await upsertDealsToRemote(deals);
    return { wroteToCloud: true };
  } catch (err) {
    console.error("Failed to save to Supabase:", err);
    throw err;
  }
}

async function deleteDealAsync(id) {
  if (!db) return { wroteToCloud: false };
  if (!cloudWriteAllowedByOrigin || !cloudHydrated) {
    return { wroteToCloud: false, writeBlocked: true };
  }
  try {
    await deleteDealFromRemote(id);
    return { wroteToCloud: true };
  } catch (err) {
    console.error("Failed to delete deal from Supabase:", err);
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
  isRemote: Boolean(db),
  get cloudWriteEnabled() {
    return cloudWriteAllowedByOrigin && cloudHydrated;
  },
  get cloudWriteAllowedByOrigin() {
    return cloudWriteAllowedByOrigin;
  },
  loadDealsAsync,
  saveDealsAsync,
  deleteDealAsync,
  subscribeToDealChanges,
};
