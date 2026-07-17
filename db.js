/* MHN Sales — Supabase data layer */

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

const db = getSupabaseClient();

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

async function fetchRemoteDeals() {
  const { data, error } = await db.from("deals").select("*").order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []).map(rowToDeal);
}

async function syncDealsToRemote(deals) {
  const rows = deals.map(dealToRow);
  if (rows.length) {
    const { error: upsertError } = await db.from("deals").upsert(rows, { onConflict: "id" });
    if (upsertError) throw upsertError;
  }

  const { data: existing, error: listError } = await db.from("deals").select("id");
  if (listError) throw listError;

  const keep = new Set(deals.map((d) => d.id));
  const toDelete = (existing || []).map((r) => r.id).filter((id) => !keep.has(id));
  if (toDelete.length) {
    const { error: deleteError } = await db.from("deals").delete().in("id", toDelete);
    if (deleteError) throw deleteError;
  }
}

async function migrateLocalToRemoteIfNeeded() {
  const remote = await fetchRemoteDeals();
  if (remote.length) return remote;

  const local = loadLocalDeals();
  if (!local.length) return [];

  await syncDealsToRemote(local);
  return local;
}

/** Load deals from Supabase (or localStorage fallback). */
async function loadDealsAsync() {
  if (!db) {
    console.warn("Supabase not configured — using localStorage only. Fill in config.js.");
    return loadLocalDeals();
  }
  try {
    return await migrateLocalToRemoteIfNeeded();
  } catch (err) {
    console.error("Failed to load from Supabase, falling back to localStorage:", err);
    return loadLocalDeals();
  }
}

/** Persist deals to Supabase and mirror to localStorage. */
async function saveDealsAsync(deals) {
  saveLocalDeals(deals);
  if (!db) return;
  try {
    await syncDealsToRemote(deals);
  } catch (err) {
    console.error("Failed to save to Supabase:", err);
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
  loadDealsAsync,
  saveDealsAsync,
  subscribeToDealChanges,
};
