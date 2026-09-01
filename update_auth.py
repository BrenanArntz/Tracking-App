#!/usr/bin/env python3

with open('app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the login handler - find the old one and replace with new
old_login = """loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const selectedUserId = document.getElementById('test-role').value;

  let team = getStoredArray('evangelism_team');
  const supabase = window.getSupabaseClient ? window.getSupabaseClient() : null;

  if (supabase) {
    team = await loadTeamDataFromSupabase();
  }

  currentUser = team.find(u => u.id === selectedUserId) || null;

  if (!currentUser) {
    alert('Selected user was not found. Please try again.');
    return;
  }

  if (currentUser.role === 'super_admin') {
    const directorGroups = team.filter(u => u.role === 'director' && u.groupName).map(u => u.groupName);
    activeGroupName = directorGroups[0] || currentUser.groupName || 'System';
  } else {
    activeGroupName = currentUser.groupName || null;
  }

  showDashboard();
});"""

new_login = """loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const testRoleSelect = document.getElementById('test-role').value;

  const supabase = window.getSupabaseClient ? window.getSupabaseClient() : null;

  // If test mode is being used (test-role has a value), use that instead
  if (testRoleSelect) {
    let team = getStoredArray('evangelism_team');
    if (supabase) {
      team = await loadTeamDataFromSupabase();
    }

    currentUser = team.find(u => u.id === testRoleSelect) || null;

    if (!currentUser) {
      alert('Selected user was not found. Please try again.');
      return;
    }

    if (currentUser.role === 'super_admin') {
      const directorGroups = team.filter(u => u.role === 'director' && u.groupName).map(u => u.groupName);
      activeGroupName = directorGroups[0] || currentUser.groupName || 'System';
    } else {
      activeGroupName = currentUser.groupName || null;
    }

    showDashboard();
    return;
  }

  // Use Supabase auth with email/password
  if (!email || !password) {
    alert('Please enter your email and password.');
    return;
  }

  if (!supabase) {
    alert('Authentication service is not available. Please use test mode.');
    return;
  }

  try {
    // Sign in with Supabase Auth
    const authResult = await window.signInUser(email, password);
    if (!authResult.ok) {
      alert('Login failed: ' + authResult.message);
      return;
    }

    const authUser = authResult.data.user;

    // Look up the user in the users table
    const { data: users, error } = await supabase
      .from('users')
      .select('id, full_name, email, role, group_id, groups!group_id(name)')
      .eq('auth_user_id', authUser.id);

    if (error || !users || users.length === 0) {
      alert('User profile not found. Please contact an administrator.');
      return;
    }

    const userRecord = users[0];
    currentUser = {
      id: userRecord.id,
      name: userRecord.full_name,
      email: userRecord.email,
      role: userRecord.role,
      groupName: userRecord.groups ? userRecord.groups.name : null
    };

    if (currentUser.role === 'super_admin') {
      // Load all director groups for super admin
      const { data: directorUsers } = await supabase
        .from('users')
        .select('group_id, groups!group_id(name)')
        .eq('role', 'director');

      const directorGroups = directorUsers
        .map(u => u.groups ? u.groups.name : null)
        .filter(Boolean);
      activeGroupName = directorGroups[0] || currentUser.groupName || 'System';
    } else {
      activeGroupName = currentUser.groupName || null;
    }

    showDashboard();
  } catch (err) {
    alert('An error occurred during login: ' + err.message);
  }
});"""

content = content.replace(old_login, new_login)

# Also update the logout handler
old_logout = """logoutBtn.addEventListener('click', () => {
  currentUser = null;
  dashboardScreen.classList.remove('active');
  authScreen.classList.add('active');
});"""

new_logout = """logoutBtn.addEventListener('click', async () => {
  const supabase = window.getSupabaseClient ? window.getSupabaseClient() : null;
  if (supabase) {
    await window.signOutUser();
  }
  currentUser = null;
  dashboardScreen.classList.remove('active');
  authScreen.classList.add('active');
});"""

content = content.replace(old_logout, new_logout)

with open('app.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("✓ Updated login handler")
print("✓ Updated logout handler")
