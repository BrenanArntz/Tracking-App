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

async function inviteUser(email, fullName, role, groupId, memberId) {
  const supabase = getSupabaseClient();
  if (!supabase) return { ok: false, message: 'Supabase is not configured.' };

  const { data, error } = await supabase.functions.invoke('invite-user', {
    body: {
      email,
      fullName,
      role,
      groupId,
      memberId,
      redirectTo: window.location.origin + window.location.pathname
    }
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  if (!data || !data.user) {
    return { ok: false, message: data && data.message ? data.message : 'The invitation function did not return a user.' };
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
window.inviteUser = inviteUser;
window.signInUser = signInUser;
window.signOutUser = signOutUser;
window.getCurrentAuthUser = getCurrentAuthUser;
window.updateUserPassword = updateUserPassword;
