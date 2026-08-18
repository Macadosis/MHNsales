/* MHN Sales — Supabase email/password authentication */

function getAuthClient() {
  return window.MHN_DB?.client || null;
}

function profileNameFromMeta(user) {
  const meta = user?.user_metadata || {};
  const fromMeta =
    meta.full_name ||
    meta.name ||
    meta.display_name ||
    "";
  return typeof fromMeta === "string" ? fromMeta.trim() : "";
}

function hasProfileName(user) {
  return Boolean(profileNameFromMeta(user));
}

function displayNameFromUser(user) {
  if (!user) return "";
  const named = profileNameFromMeta(user);
  if (named) return named;
  const email = user.email || "";
  const local = email.split("@")[0] || "";
  return local.trim();
}

function sessionToUser(session) {
  return authUserToAppUser(session?.user);
}

function authUserToAppUser(authUser) {
  if (!authUser) return null;
  return {
    id: authUser.id,
    email: authUser.email || "",
    name: displayNameFromUser(authUser),
    needsName: !hasProfileName(authUser),
  };
}

function friendlyAuthError(error) {
  const message = (error?.message || "").toLowerCase();
  if (!message) return "Something went wrong. Please try again.";
  if (message.includes("invalid login credentials")) {
    return "Incorrect email or password.";
  }
  if (message.includes("user already registered")) {
    return "An account with this email already exists. Log in instead.";
  }
  if (message.includes("password should be at least")) {
    return "Password must be at least 6 characters.";
  }
  if (message.includes("unable to validate email")) {
    return "Please enter a valid email address.";
  }
  if (message.includes("email rate limit") || message.includes("over_email_send_rate_limit")) {
    return "Too many attempts. Please wait a moment and try again.";
  }
  if (message.includes("email not confirmed")) {
    return "Please confirm your email before logging in. Check your inbox.";
  }
  return error.message || "Something went wrong. Please try again.";
}

async function getSession() {
  const client = getAuthClient();
  if (!client) return null;
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  return data.session || null;
}

async function getCurrentAuthUser() {
  const session = await getSession();
  return sessionToUser(session);
}

async function signUp() {
  return {
    ok: false,
    error: "Accounts are created by an administrator. Self-signup is disabled.",
  };
}

async function signIn({ email, password }) {
  const client = getAuthClient();
  if (!client) {
    return { ok: false, error: "Supabase is not configured. Add credentials in config.js." };
  }

  const trimmedEmail = String(email || "").trim().toLowerCase();
  if (!trimmedEmail) return { ok: false, error: "Please enter your email." };
  if (!password) return { ok: false, error: "Please enter your password." };

  const { data, error } = await client.auth.signInWithPassword({
    email: trimmedEmail,
    password,
  });

  if (error) return { ok: false, error: friendlyAuthError(error) };

  return {
    ok: true,
    session: data.session,
    user: sessionToUser(data.session),
  };
}

async function updateProfileName(name) {
  const client = getAuthClient();
  if (!client) {
    return { ok: false, error: "Supabase is not configured. Add credentials in config.js." };
  }

  const trimmed = String(name || "").trim();
  if (!trimmed) return { ok: false, error: "Please enter your name." };
  if (trimmed.length > 80) return { ok: false, error: "Name is too long." };

  const { data, error } = await client.auth.updateUser({
    data: {
      full_name: trimmed,
      name: trimmed,
      display_name: trimmed,
    },
  });

  if (error) return { ok: false, error: friendlyAuthError(error) };

  const { data: fresh, error: freshError } = await client.auth.getUser();
  if (freshError) {
    return { ok: true, user: authUserToAppUser(data.user) };
  }

  return {
    ok: true,
    user: authUserToAppUser(fresh.user) || authUserToAppUser(data.user),
  };
}

async function signOut() {
  const client = getAuthClient();
  if (!client) return { ok: true };
  const { error } = await client.auth.signOut();
  if (error) return { ok: false, error: friendlyAuthError(error) };
  return { ok: true };
}

function onAuthStateChange(callback) {
  const client = getAuthClient();
  if (!client) return () => {};
  const { data } = client.auth.onAuthStateChange((_event, session) => {
    callback(sessionToUser(session), session);
  });
  return () => {
    data?.subscription?.unsubscribe?.();
  };
}

window.MHN_AUTH = {
  isConfigured: () => Boolean(getAuthClient()),
  getSession,
  getCurrentAuthUser,
  displayNameFromUser,
  updateProfileName,
  signUp,
  signIn,
  signOut,
  onAuthStateChange,
};
