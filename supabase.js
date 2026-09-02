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
    password
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
    password: generateTemporaryPassword()
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

  const redirectUrl = 'https://brenanarntz.github.io/Tracking-App/';

  try {
    const { data, error } = await supabase.functions.invoke('invite-user', {
      // functions.invoke expects a string body and it's safer to set the header
      body: JSON.stringify({ email, redirectTo: redirectUrl }),
      headers: { 'Content-Type': 'application/json' }
    });

    if (error) {
      return { ok: false, message: error.message || 'Invite email request failed.' };
    }

    // Inspect returned data shape — your function should return JSON like { ok: true }
    return (data && data.ok) ? { ok: true, data } : { ok: false, message: (data && data.message) || 'Invite email request failed.' };
  } catch (err) {
    return { ok: false, message: err.message || 'Invite email request failed.' };
  }
}

async function handleSupabaseAuthRedirect() {
  const supabase = getSupabaseClient();
  if (!supabase) return { ok: false, message: 'Supabase is not configured.' };

  const query = new URLSearchParams(window.location.search || '');
  const hash = new URLSearchParams((window.location.hash || '').replace(/^#/, ''));
  const code = query.get('code') || hash.get('code');
  const tokenHash = query.get('token_hash') || hash.get('token_hash');
  const type = query.get('type') || hash.get('type');

  if (!code && !tokenHash) {
    return { ok: true, changed: false };
  }

  try {
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) throw error;
    }

    if (tokenHash && type) {
      const { error } = await supabase.auth.verifyOtp({
        type: type,
        token: tokenHash
      });
      if (error) throw error;
    }

    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', window.location.pathname);
    }

    return { ok: true, changed: true };
  } catch (error) {
    return { ok: false, message: error.message };
  }
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
window.handleSupabaseAuthRedirect = handleSupabaseAuthRedirect;
window.updateUserPassword = updateUserPassword;
