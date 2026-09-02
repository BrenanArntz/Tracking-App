// Supabase setup for the evangelism tracker.
// Replace the placeholder values below with your real Supabase project URL and anon key.
// You can also move this into a real environment config later if you prefer.

const SUPABASE_CONFIG = {
  url: 'https://toexpyjgwlmmehjpapoj.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRvZXhweWpnd2xtbWVoanBhcG9qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgwNTA0NjIsImV4cCI6MjEwMzYyNjQ2Mn0.z3vaFvzIXp2Wwv4tpu_0QYJjsAN3Jtt_RB_IZ7aL_K8'
};

let supabaseClient = null;

function getSupabaseClient() {
  if (!window.supabase) {
    console.warn('Supabase JS SDK not loaded yet. Include the CDN script or install the package before use.');
    return null;
  }

  if (!SUPABASE_CONFIG.url || !SUPABASE_CONFIG.anonKey || SUPABASE_CONFIG.url.includes('YOUR_PROJECT_ID') || SUPABASE_CONFIG.anonKey.includes('YOUR_')) {
    console.warn('Supabase client is not configured yet. Add your project URL and anon key.');
    return null;
  }

  if (!supabaseClient) {
    supabaseClient = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
  }

  return supabaseClient;
}

function getAuthRedirectUrl() {
  return new URL(window.location.pathname, window.location.origin).toString();
}

async function testSupabaseConnection() {
  const supabase = getSupabaseClient();
  if (!supabase) return { ok: false, message: 'Supabase is not configured.' };

  const { data, error } = await supabase.from('users').select('id').limit(1);

  if (error) {
    return { ok: false, message: error.message };
  }

  return { ok: true, message: 'Supabase connected.', data };
}

async function signUpUser(email, password) {
  const supabase = getSupabaseClient();
  if (!supabase) return { ok: false, message: 'Supabase is not configured.' };

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: getAuthRedirectUrl()
    }
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  return { ok: true, data };
}

function generateTemporaryPassword() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return `Evangelism-${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')}`;
}

async function createAuthUserForInvite(email) {
  const supabase = getSupabaseClient();
  if (!supabase) return { ok: false, message: 'Supabase is not configured.' };

  const { data: sessionData } = await supabase.auth.getSession();
  const currentSession = sessionData.session;
  const { data, error } = await supabase.auth.signUp({
    email,
    password: generateTemporaryPassword(),
    options: {
      emailRedirectTo: getAuthRedirectUrl()
    }
  });

  if (currentSession && data.session && data.session.user.id !== currentSession.user.id) {
    await supabase.auth.setSession(currentSession);
  }

  if (error) {
    return { ok: false, message: error.message };
  }

  if (!data.user) {
    return { ok: false, message: 'Supabase did not return the new authentication user.' };
  }

  return { ok: true, data };
}

async function signInUser(email, password) {
  const supabase = getSupabaseClient();
  if (!supabase) return { ok: false, message: 'Supabase is not configured.' };

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  return { ok: true, data };
}

async function signOutUser() {
  const supabase = getSupabaseClient();
  if (!supabase) return { ok: false, message: 'Supabase is not configured.' };

  const { error } = await supabase.auth.signOut();

  if (error) {
    return { ok: false, message: error.message };
  }

  return { ok: true };
}

async function getCurrentAuthUser() {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

async function sendPasswordSetupEmail(email) {
  const supabase = getSupabaseClient();
  if (!supabase) return { ok: false, message: 'Supabase is not configured.' };

  const redirectUrl = window.location.origin + window.location.pathname;

  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: redirectUrl
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  return { ok: true, data };
}

async function updateUserPassword(newPassword) {
  const supabase = getSupabaseClient();
  if (!supabase) return { ok: false, message: 'Supabase is not configured.' };

  const { data, error } = await supabase.auth.updateUser({
    password: newPassword
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  return { ok: true, data };
}

window.getSupabaseClient = getSupabaseClient;
window.testSupabaseConnection = testSupabaseConnection;
window.signUpUser = signUpUser;
window.createAuthUserForInvite = createAuthUserForInvite;
window.signInUser = signInUser;
window.signOutUser = signOutUser;
window.getCurrentAuthUser = getCurrentAuthUser;
window.sendPasswordSetupEmail = sendPasswordSetupEmail;
window.updateUserPassword = updateUserPassword;
