// --- DEFAULT DEFAULT RESOURCES FOR NEW GROUPS ---
const DEFAULT_RESOURCES = [
  {
    id: 1,
    defaultKey: 'built-in-gospel-guide',
    title: 'Standard Gospel Presentation Guide (Google Docs)',
    url: 'https://docs.google.com/document/u/0/?show_intro=true',
    desc: 'Core outline for local group evangelism training.'
  },
  {
    id: 2,
    defaultKey: 'built-in-follow-up-slides',
    title: 'Follow-up & Discipleship Slides (Google Slides)',
    url: 'https://slides.google.com/u/0/?show_intro=true',
    desc: 'Slide deck for training new members on follow-ups.'
  }
];

// Convert a Date or ISO string to the format a datetime-local input expects
// (YYYY-MM-DDTHH:mm in local time). Avoids the value being cleared by the
// browser when given an ISO string with a timezone suffix.
function toLocalDateTimeInput(value) {
  if (value === null || value === undefined || value === '') return '';

  const stringValue = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(stringValue)) {
    return stringValue;
  }

  const d = new Date(stringValue);
  if (isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// --- STATE MANAGEMENT ---
let currentUser = null;
let activeGroupName = null;
let selectedStatsRange = 'all';

function getStoredArray(key) {
  try {
    const value = localStorage.getItem(key);
    const parsed = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn(`Unable to parse ${key} from localStorage. Resetting to empty array.`);
    return [];
  }
}

async function loadTeamDataFromSupabase() {
  const supabase = window.getSupabaseClient ? window.getSupabaseClient() : null;
  if (!supabase) return getStoredArray('evangelism_team');

  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, full_name, email, role, group_id, groups!group_id(name)');

    if (error || !data) {
      console.warn('Supabase user query failed:', error ? error.message : 'No data returned.');
      return getStoredArray('evangelism_team');
    }

    const mapped = data.map(user => ({
      id: user.id,
      name: user.full_name,
      email: user.email,
      role: user.role,
      groupName: user.groups && user.groups.name ? user.groups.name : 'System'
    }));

    localStorage.setItem('evangelism_team', JSON.stringify(mapped));
    return mapped;
  } catch (error) {
    console.warn('Unable to load team data from Supabase, using localStorage fallback.', error);
    return getStoredArray('evangelism_team');
  }
}

async function loadChatLogsFromSupabase() {
  const supabase = window.getSupabaseClient ? window.getSupabaseClient() : null;
  if (!supabase) return getStoredArray('evangelism_logs');

  try {
    const groupId = await getEffectiveGroupIdAsync();
    const { data, error } = await supabase
      .from('chat_logs')
      .select('*, groups!group_id(name)')
      .eq('group_id', groupId);

    if (error || !data) {
      console.warn('Supabase chat log query failed:', error ? error.message : 'No data returned.');
      return getStoredArray('evangelism_logs');
    }

    const mapped = data.map(log => ({
      id: log.id,
      authorId: log.author_id,
      authorName: log.author_name || '',
      groupName: log.groups && log.groups.name ? log.groups.name : getEffectiveGroupName(),
      name: log.person_name,
      date: log.log_date,
      evangelists: log.evangelists || [],
      progress: log.progress || 0,
      heardGospelCount: log.heard_gospel_count || 0,
      professedCount: log.professed_count || 0,
      notes: log.notes || '',
      photo: log.photo_url || ''
    }));

    localStorage.setItem('evangelism_logs', JSON.stringify(mapped));
    return mapped;
  } catch (error) {
    console.warn('Unable to load chat logs from Supabase, using localStorage fallback.', error);
    return getStoredArray('evangelism_logs');
  }
}

async function loadEventsFromSupabase() {
  const supabase = window.getSupabaseClient ? window.getSupabaseClient() : null;
  if (!supabase) return getStoredArray('evangelism_events');

  try {
    const groupId = await getEffectiveGroupIdAsync();
    const { data: eventsData, error: eventsError } = await supabase
      .from('events')
      .select('*, groups!group_id(name)')
      .eq('group_id', groupId);

    if (eventsError || !eventsData) {
      console.warn('Supabase events query failed:', eventsError ? eventsError.message : 'No data returned.');
      return getStoredArray('evangelism_events');
    }

    const eventIds = eventsData.map(e => String(e.id));
    let rsvpsByEvent = {};

    if (eventIds.length > 0) {
      const { data: rsvpsData, error: rsvpsError } = await supabase
        .from('event_rsvps')
        .select('event_id, user_id, response')
        .in('event_id', eventIds);

      if (!rsvpsError && rsvpsData) {
        rsvpsData.forEach(r => {
          if (!rsvpsByEvent[r.event_id]) {
            rsvpsByEvent[r.event_id] = {};
          }
          rsvpsByEvent[r.event_id][r.user_id] = r.response;
        });
      }
    }

    const mapped = eventsData.map(event => ({
      id: String(event.id),
      groupName: event.groups && event.groups.name ? event.groups.name : getEffectiveGroupName(),
      title: event.title,
      datetime: toLocalDateTimeInput(event.event_datetime),
      status: event.status || 'Confirmed',
      location: event.location,
      description: event.description || '',
      rsvps: rsvpsByEvent[String(event.id)] || {}
    }));

    localStorage.setItem('evangelism_events', JSON.stringify(mapped));
    return mapped;
  } catch (error) {
    console.warn('Unable to load events from Supabase, using localStorage fallback.', error);
    return getStoredArray('evangelism_events');
  }
}

async function loadResourcesFromSupabase() {
  const supabase = window.getSupabaseClient ? window.getSupabaseClient() : null;
  if (!supabase) return getStoredArray('evangelism_resources');

  try {
    const groupId = await getEffectiveGroupIdAsync();
    const { data, error } = await supabase
      .from('resources')
      .select('*, groups!group_id(name)')
      .eq('group_id', groupId);

    if (error || !data) {
      console.warn('Supabase resources query failed:', error ? error.message : 'No data returned.');
      return getStoredArray('evangelism_resources');
    }

    const mapped = data.map(resource => ({
      id: resource.id,
      groupName: resource.groups && resource.groups.name ? resource.groups.name : getEffectiveGroupName(),
      title: resource.title,
      url: resource.url,
      desc: resource.description || '',
      isDefault: resource.is_default === true,
      defaultKey: resource.default_key || ''
    }));

    localStorage.setItem('evangelism_resources', JSON.stringify(mapped));
    return mapped;
  } catch (error) {
    console.warn('Unable to load resources from Supabase, using localStorage fallback.', error);
    return getStoredArray('evangelism_resources');
  }
}

function slugifyGroupName(value) {
  if (!value) return 'metro_ministry';
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'metro_ministry';
}

function getEffectiveGroupId() {
  const targetGroupName = getEffectiveGroupName();
  if (!targetGroupName) return 'metro_ministry';

  const cachedGroupIds = JSON.parse(localStorage.getItem('evangelism_group_ids') || '{}');
  if (cachedGroupIds[targetGroupName]) {
    return cachedGroupIds[targetGroupName];
  }

  const builtInGroupIdMap = {
    'Metro Ministry': 'metro_ministry',
    'System': 'system'
  };

  return builtInGroupIdMap[targetGroupName] || slugifyGroupName(targetGroupName);
}

async function getEffectiveGroupIdAsync() {
  const targetGroupName = getEffectiveGroupName();
  if (!targetGroupName) return 'metro_ministry';

  // Check local cache first
  const cachedGroupIds = JSON.parse(localStorage.getItem('evangelism_group_ids') || '{}');
  if (cachedGroupIds[targetGroupName]) {
    return cachedGroupIds[targetGroupName];
  }

  const builtInGroupIdMap = {
    'Metro Ministry': 'metro_ministry',
    'System': 'system'
  };

  if (builtInGroupIdMap[targetGroupName]) {
    return builtInGroupIdMap[targetGroupName];
  }

  // Look up from Supabase
  const supabase = window.getSupabaseClient ? window.getSupabaseClient() : null;
  if (supabase) {
    try {
      const { data: groupRows } = await supabase
        .from('groups')
        .select('id')
        .eq('name', targetGroupName)
        .limit(1);

      if (groupRows && groupRows.length) {
        const resolvedId = groupRows[0].id;
        cachedGroupIds[targetGroupName] = resolvedId;
        localStorage.setItem('evangelism_group_ids', JSON.stringify(cachedGroupIds));
        return resolvedId;
      }
    } catch (err) {
      console.warn('Could not resolve group ID from Supabase:', err.message);
    }
  }

  return slugifyGroupName(targetGroupName);
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function ensureUserSession() {
  if (!currentUser) {
    dashboardScreen.classList.remove('active');
    authScreen.classList.add('active');
    return false;
  }
  return true;
}

document.getElementById('chat-progress').addEventListener('change', () => syncLogCounters(false));
document.getElementById('edit-chat-progress').addEventListener('change', () => syncLogCounters(true));

function handlePhotoDelete(isEdit = false) {
  const photoInput = document.getElementById(isEdit ? 'edit-chat-photo' : 'chat-photo');
  const clearButton = document.getElementById(isEdit ? 'clear-edit-chat-photo' : 'clear-chat-photo');
  const deleteFlag = document.getElementById(isEdit ? 'edit-chat-photo-delete' : 'chat-photo-delete');
  const previewWrap = document.getElementById('edit-photo-preview-wrap');
  const previewImage = document.getElementById('edit-photo-preview');

  if (!photoInput || !clearButton || !deleteFlag) return;

  photoInput.value = '';
  deleteFlag.value = 'true';
  clearButton.style.display = 'none';

  if (previewWrap && previewImage) {
    previewWrap.style.display = 'none';
    previewImage.src = '';
  }

  if (isEdit) {
    const logId = String(document.getElementById('edit-log-id').value || '');
    if (logId) {
      const logs = getStoredArray('evangelism_logs');
      const index = logs.findIndex(log => String(log.id) === logId);
      if (index !== -1) {
        logs[index].photo = '';
        localStorage.setItem('evangelism_logs', JSON.stringify(logs));
      }
    }
  }
}

function bindPhotoControls() {
  const photoInput = document.getElementById('chat-photo');
  const clearButton = document.getElementById('clear-chat-photo');
  if (photoInput && clearButton) {
    photoInput.addEventListener('change', () => {
      const deleteFlag = document.getElementById('chat-photo-delete');
      if (deleteFlag) deleteFlag.value = 'false';
      clearButton.style.display = photoInput.files && photoInput.files[0] ? 'inline-flex' : 'none';
    });
    clearButton.addEventListener('click', () => handlePhotoDelete(false));
  }

  const editPhotoInput = document.getElementById('edit-chat-photo');
  const editClearButton = document.getElementById('clear-edit-chat-photo');
  if (editPhotoInput && editClearButton) {
    editPhotoInput.addEventListener('change', () => {
      const deleteFlag = document.getElementById('edit-chat-photo-delete');
      if (deleteFlag) deleteFlag.value = 'false';
      editClearButton.style.display = editPhotoInput.files && editPhotoInput.files[0] ? 'inline-flex' : 'none';
    });
    editClearButton.addEventListener('click', () => handlePhotoDelete(true));
  }
}

bindPhotoControls();

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Unable to read file'));
    reader.readAsDataURL(file);
  });
}

function getProgressLabel(level) {
  const labels = {
    0: '0 - No Progress',
    1: '1 - God\'s Existence',
    2: '2 - Law',
    3: '3 - False Ways',
    4: '4 - Gospel',
    5: '5 - Checking Questions',
    6: '6 - Complete (Not Professing)',
    7: '7 - Complete (Not Professing)',
    8: '8 - Already a Believer'
  };

  return labels[String(level)] || '0 - No Progress';
}

function syncLogCounters(isEdit = false) {
  const progressSelect = document.getElementById(isEdit ? 'edit-chat-progress' : 'chat-progress');
  const heardRow = document.getElementById(isEdit ? 'edit-heard-gospel-row' : 'heard-gospel-row');
  const professedRow = document.getElementById(isEdit ? 'edit-professed-row' : 'professed-row');
  const heardInput = document.getElementById(isEdit ? 'edit-heard-gospel-count' : 'heard-gospel-count');
  const professedInput = document.getElementById(isEdit ? 'edit-professed-count' : 'professed-count');

  if (!progressSelect || !heardRow || !professedRow || !heardInput || !professedInput) return;

  const progressValue = Number(progressSelect.value || 0);
  const showHeard = progressValue >= 4 && progressValue <= 7;
  const showProfessed = progressValue === 7;

  heardRow.style.display = showHeard ? 'block' : 'none';
  professedRow.style.display = showProfessed ? 'block' : 'none';

  if (showHeard && Number(heardInput.value || 0) < 1) {
    heardInput.value = 1;
  }

  if (showProfessed && Number(professedInput.value || 0) < 1) {
    professedInput.value = 1;
  }
}

function getEffectiveGroupName() {
  if (!currentUser) return null;

  if (currentUser.role === 'super_admin') {
    return activeGroupName || currentUser.groupName || 'System';
  }

  return currentUser.groupName || '';
}

async function setActiveGroupContext(groupName) {
  if (!groupName || !currentUser || currentUser.role !== 'super_admin') return;
  activeGroupName = groupName;
  localStorage.setItem('evangelism_active_group', groupName);
  groupBadge.textContent = `${groupName} (Admin View)`;
  document.getElementById('rename-team-card').style.display = 'block';
  document.getElementById('team-name').value = groupName;
  switchTab('tab-tracker');
  renderEvangelistCheckboxes();
  await renderLogs();
  await renderCalendar();
  await renderResources();
  await renderTeam();
  renderSuperAdminPanel();
}

// --- DOM ELEMENTS ---
const authScreen = document.getElementById('auth-screen');
const dashboardScreen = document.getElementById('dashboard-screen');
const loginForm = document.getElementById('login-form');
const logoutBtn = document.getElementById('logout-btn');
const staySignedInCheckbox = document.getElementById('stay-signed-in');
const userDisplayName = document.getElementById('user-display-name');
const roleBadge = document.getElementById('role-badge');
const groupBadge = document.getElementById('group-badge');

const navTeamTab = document.getElementById('nav-team-tab');
const navAdminTab = document.getElementById('nav-admin-tab');
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');
const STAY_SIGNED_IN_KEY = 'evangelism_stay_signed_in';

// --- AUTHENTICATION & LOGIN ---
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  const supabase = window.getSupabaseClient ? window.getSupabaseClient() : null;

  // Use Supabase auth with email/password
  if (!email || !password) {
    alert('Please enter your email and password.');
    return;
  }

  if (!supabase) {
    alert('Authentication service is not available. Please try again later.');
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
    let { data: users, error } = await supabase
      .from('users')
      .select('id, full_name, email, role, group_id, groups!group_id(name)')
      .eq('auth_user_id', authUser.id);

    if ((!users || users.length === 0) && authUser.email) {
      const { data: usersByEmail } = await supabase
        .from('users')
        .select('id, full_name, email, role, group_id, groups!group_id(name)')
        .eq('email', authUser.email);

      if (usersByEmail && usersByEmail.length) {
        users = usersByEmail;
        await supabase.from('users').update({ auth_user_id: authUser.id }).eq('id', usersByEmail[0].id);
      }
    }

    if (error || !users || users.length === 0) {
      alert('User profile not found. Please contact an administrator.');
      return;
    }

    if (staySignedInCheckbox.checked) {
      localStorage.setItem(STAY_SIGNED_IN_KEY, 'true');
    } else {
      localStorage.removeItem(STAY_SIGNED_IN_KEY);
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
      const savedGroup = localStorage.getItem('evangelism_active_group');
      activeGroupName = currentUser.groupName || savedGroup || (directorGroups.length ? directorGroups[0] : 'System');
    } else {
      activeGroupName = currentUser.groupName || null;
    }

    showDashboard();
  } catch (err) {
    alert('An error occurred during login: ' + err.message);
  }
});

logoutBtn.addEventListener('click', async () => {
  const supabase = window.getSupabaseClient ? window.getSupabaseClient() : null;
  if (supabase) {
    await window.signOutUser();
  }
  localStorage.removeItem(STAY_SIGNED_IN_KEY);
  currentUser = null;
  dashboardScreen.classList.remove('active');
  authScreen.classList.add('active');
});

async function restoreSavedSession() {
  if (localStorage.getItem(STAY_SIGNED_IN_KEY) !== 'true') return;

  const supabase = window.getSupabaseClient ? window.getSupabaseClient() : null;
  if (!supabase || !window.getCurrentAuthUser) return;

  try {
    const authUser = await window.getCurrentAuthUser();
    if (!authUser) {
      localStorage.removeItem(STAY_SIGNED_IN_KEY);
      return;
    }

    let { data: users, error } = await supabase
      .from('users')
      .select('id, full_name, email, role, group_id, groups!group_id(name)')
      .eq('auth_user_id', authUser.id);

    if ((!users || users.length === 0) && authUser.email) {
      const { data: usersByEmail } = await supabase
        .from('users')
        .select('id, full_name, email, role, group_id, groups!group_id(name)')
        .eq('email', authUser.email);

      if (usersByEmail && usersByEmail.length) {
        users = usersByEmail;
        await supabase.from('users').update({ auth_user_id: authUser.id }).eq('id', usersByEmail[0].id);
      }
    }

    if (error || !users || users.length === 0) {
      localStorage.removeItem(STAY_SIGNED_IN_KEY);
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
      const { data: directorUsers } = await supabase
        .from('users')
        .select('group_id, groups!group_id(name)')
        .eq('role', 'director');
      const directorGroups = (directorUsers || [])
        .map(user => user.groups ? user.groups.name : null)
        .filter(Boolean);
      const savedGroup = localStorage.getItem('evangelism_active_group');
      activeGroupName = currentUser.groupName || savedGroup || (directorGroups.length ? directorGroups[0] : 'System');
    } else {
      activeGroupName = currentUser.groupName || null;
    }

    await showDashboard();
  } catch (error) {
    console.warn('Unable to restore saved session:', error);
  }
}

restoreSavedSession();

async function showDashboard() {
  if (!currentUser) {
    return;
  }

  authScreen.classList.remove('active');
  dashboardScreen.classList.add('active');

  const effectiveGroup = getEffectiveGroupName();

  userDisplayName.textContent = currentUser.name;
  roleBadge.textContent = currentUser.role.replace('_', ' ');
  groupBadge.textContent = currentUser.role === 'super_admin'
    ? `${effectiveGroup || 'System'} (Admin View)`
    : (effectiveGroup || 'Global');

  const isSuper = currentUser.role === 'super_admin';
  const isDirector = currentUser.role === 'director';
  const isAdmin = currentUser.role === 'admin';
  const isLeader = isSuper || isDirector || isAdmin;
  const isDirectorView = isSuper && getStoredArray('evangelism_team').some(member => (
    member.role === 'director' && member.groupName === activeGroupName
  ));
  const canRenameTeam = isDirector || isDirectorView;

  // Nav Visibility
  navTeamTab.style.display = 'inline-block';
  navAdminTab.style.display = isSuper ? 'inline-block' : 'none';

  // Form Visibilities
  document.getElementById('add-event-card').style.display = isLeader ? 'block' : 'none';
  document.getElementById('add-resource-card').style.display = isLeader ? 'block' : 'none';
  document.getElementById('resource-default-row').style.display = isSuper ? 'inline-flex' : 'none';
  document.getElementById('edit-resource-default-row').style.display = isSuper ? 'inline-flex' : 'none';
  document.getElementById('add-member-card').style.display = isLeader ? 'block' : 'none';
  document.getElementById('rename-team-card').style.display = canRenameTeam ? 'block' : 'none';
  if (canRenameTeam) document.getElementById('team-name').value = getEffectiveGroupName() || '';
  const memberRoleSelect = document.getElementById('member-role');
  memberRoleSelect.disabled = isAdmin;
  memberRoleSelect.closest('.form-group').style.display = isAdmin ? 'none' : 'flex';
  if (isAdmin) memberRoleSelect.value = 'member';

  // Default dates
  document.getElementById('chat-date').valueAsDate = new Date();
  document.getElementById('heard-gospel-count').value = 1;
  document.getElementById('professed-count').value = 1;
  syncLogCounters(false);

  switchTab('tab-tracker');
  renderEvangelistCheckboxes();
  await renderLogs();
  await renderCalendar();
  await renderResources();
  await renderTeam();
  if (isSuper) await renderSuperAdminPanel();
}

// --- TAB SWITCHING ---
tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const tabId = btn.getAttribute('data-tab');
    switchTab(tabId);
    if (tabId === 'tab-team' && currentUser) {
      renderTeam();
    }
  });
});

const statsPeriodButton = document.getElementById('stats-period-button');
const statsPeriodMenu = document.getElementById('stats-period-menu');

statsPeriodButton.addEventListener('click', () => {
  const isOpen = !statsPeriodMenu.hidden;
  statsPeriodMenu.hidden = isOpen;
  statsPeriodButton.setAttribute('aria-expanded', String(!isOpen));
});

statsPeriodMenu.addEventListener('click', (event) => {
  const option = event.target.closest('[data-stats-range]');
  if (!option) return;

  selectedStatsRange = option.dataset.statsRange;
  statsPeriodButton.innerHTML = `${escapeHtml(option.textContent.trim())} <span aria-hidden="true">&#x2304;</span>`;
  statsPeriodMenu.hidden = true;
  statsPeriodButton.setAttribute('aria-expanded', 'false');
  if (currentUser) renderTeamStats();
});

document.addEventListener('click', (event) => {
  if (!event.target.closest('.stats-period-picker')) {
    statsPeriodMenu.hidden = true;
    statsPeriodButton.setAttribute('aria-expanded', 'false');
  }
});

function switchTab(tabId) {
  tabBtns.forEach(b => b.classList.remove('active'));
  tabContents.forEach(c => c.classList.remove('active'));

  const activeBtn = document.querySelector(`[data-tab="${tabId}"]`);
  const activeContent = document.getElementById(tabId);

  if (activeBtn) activeBtn.classList.add('active');
  if (activeContent) activeContent.classList.add('active');
}

// --- EVANGELIST CHECKBOXES ---
function renderEvangelistCheckboxes(container = document.getElementById('evangelists-checkbox-group'), selected = []) {
  if (!ensureUserSession()) return;

  const team = getStoredArray('evangelism_team');
  const targetGroup = getEffectiveGroupName();
  const localMembers = team.filter(m => currentUser.role === 'super_admin'
    ? m.groupName === targetGroup
    : m.groupName === currentUser.groupName);

  container.innerHTML = '';
  localMembers.forEach(member => {
    const isCurrentUser = member.id === currentUser.id;
    const isChecked = selected.length > 0 ? selected.includes(member.name) : isCurrentUser;

    const label = document.createElement('label');
    label.className = `checkbox-chip ${isCurrentUser ? 'highlighted' : ''}`;
    label.innerHTML = `
      <input type="checkbox" value="${escapeHtml(member.name)}" ${isChecked ? 'checked' : ''}>
      ${escapeHtml(member.name)} ${isCurrentUser ? '(You)' : ''}
    `;
    container.appendChild(label);
  });
}

// --- LOG CREATION & RENDER ---
document.getElementById('tracker-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const selectedEvangelists = Array.from(
    document.getElementById('evangelists-checkbox-group').querySelectorAll('input[type="checkbox"]:checked')
  ).map(cb => cb.value);

  const photoInput = document.getElementById('chat-photo');
  let photoData = '';

  if (photoInput && photoInput.files && photoInput.files[0]) {
    photoData = await fileToDataUrl(photoInput.files[0]);
  }

  if (document.getElementById('chat-photo-delete').value === 'true') {
    photoData = '';
  }

  const targetGroup = getEffectiveGroupName();
  const heardGospelCount = Number(document.getElementById('heard-gospel-count').value || 1);
  const professedCount = Number(document.getElementById('professed-count').value || 1);
  const progress = Number(document.getElementById('chat-progress').value);

  const newLog = {
    id: String(Date.now()),
    authorId: currentUser.id,
    authorName: currentUser.name,
    groupName: targetGroup,
    name: document.getElementById('person-name').value,
    date: document.getElementById('chat-date').value,
    evangelists: selectedEvangelists,
    progress: progress,
    heardGospelCount: progress >= 4 && progress <= 7 ? heardGospelCount : 0,
    professedCount: progress === 7 ? professedCount : 0,
    photo: photoData,
    notes: document.getElementById('chat-notes').value
  };

  // Try to save to Supabase first
  const supabase = window.getSupabaseClient ? window.getSupabaseClient() : null;
  if (supabase) {
    try {
      const groupId = getEffectiveGroupId();
      const { error: insertError } = await supabase
        .from('chat_logs')
        .insert([{
          id: newLog.id,
          group_id: groupId,
          author_id: newLog.authorId,
          person_name: newLog.name,
          log_date: newLog.date,
          evangelists: newLog.evangelists,
          progress: newLog.progress,
          heard_gospel_count: newLog.heardGospelCount,
          professed_count: newLog.professedCount,
          notes: newLog.notes,
          photo_url: newLog.photo
        }]);

      if (insertError) {
        console.warn('Supabase insert failed:', insertError.message);
      } else {
        console.log('Chat log saved to Supabase:', newLog.id);
      }
    } catch (err) {
      console.warn('Supabase error:', err.message);
    }
  }

  // Always save to localStorage as backup
  const logs = JSON.parse(localStorage.getItem('evangelism_logs') || '[]');
  logs.unshift(newLog);
  localStorage.setItem('evangelism_logs', JSON.stringify(logs));

  document.getElementById('tracker-form').reset();
  document.getElementById('chat-date').valueAsDate = new Date();
  document.getElementById('heard-gospel-count').value = 1;
  document.getElementById('professed-count').value = 1;
  document.getElementById('chat-photo-delete').value = 'false';
  document.getElementById('clear-chat-photo').style.display = 'none';
  syncLogCounters(false);
  renderEvangelistCheckboxes();
  await renderLogs();
});

async function renderLogs() {
  if (!ensureUserSession()) return;

  const logs = await loadChatLogsFromSupabase();
  const logList = document.getElementById('log-list');
  logList.innerHTML = '';

  const targetGroup = getEffectiveGroupName();
  const relevantLogs = logs.filter(l => currentUser.role === 'super_admin'
    ? l.groupName === targetGroup
    : l.groupName === currentUser.groupName);

  if (relevantLogs.length === 0) {
    logList.innerHTML = '<li class="empty-state">No conversations logged yet.</li>';
    return;
  }

  relevantLogs.forEach(log => {
    const isAuthorized = ['super_admin', 'director', 'admin'].includes(currentUser.role) || log.authorId === currentUser.id;

    const li = document.createElement('li');
    li.className = 'log-item';

    const tagsHtml = (log.evangelists || []).map(name => `
      <span class="tag ${name === log.authorName ? 'logged-by' : ''}">${name}</span>
    `).join('');

    const photoHtml = log.photo
      ? `<img src="${log.photo}" alt="Conversation photo" class="log-photo" />`
      : '';

    const heardGospelCount = Number(log.heardGospelCount || 0);
    const professedCount = Number(log.professedCount || 0);
    const counterHtml = (Number(log.progress || 0) >= 4 && Number(log.progress || 0) <= 7)
      ? `<div class="log-counter-row">Heard the Gospel: ${escapeHtml(String(heardGospelCount))}</div>`
      : '';
    const professedHtml = Number(log.progress || 0) === 7
      ? `<div class="log-counter-row">Professed: ${escapeHtml(String(professedCount))}</div>`
      : '';

    const progressHtml = `
      <div class="log-progress">
        <span class="progress-label">Progress:</span>
        <span class="progress-value">${escapeHtml(getProgressLabel(log.progress))}</span>
      </div>
    `;

    li.innerHTML = `
      <div class="log-item-header">
        <span class="log-item-title">${escapeHtml(log.name)}</span>
        <span class="log-item-date">${escapeHtml(log.date)}</span>
      </div>
      <div class="evangelist-tags">${tagsHtml}</div>
      ${progressHtml}
      ${counterHtml}
      ${professedHtml}
      ${photoHtml}
      <p class="log-item-notes">${escapeHtml(log.notes || 'No notes added.')}</p>

      ${isAuthorized ? `
        <div class="log-actions">
          <button class="btn-action edit" onclick="openEditModal('${escapeHtml(String(log.id))}')">Edit</button>
          <button class="btn-action delete" onclick="deleteLog('${escapeHtml(String(log.id))}')">Delete</button>
        </div>
      ` : ''}
    `;
    logList.appendChild(li);
  });
}

// Log Edit/Delete Modals
window.openEditModal = function(logId) {
  const logs = JSON.parse(localStorage.getItem('evangelism_logs') || '[]');
  const log = logs.find(l => String(l.id) === String(logId));
  if (!log) return;

  const previewWrap = document.getElementById('edit-photo-preview-wrap');
  const previewImage = document.getElementById('edit-photo-preview');
  const photoInput = document.getElementById('edit-chat-photo');
  const clearButton = document.getElementById('clear-edit-chat-photo');
  const deleteFlag = document.getElementById('edit-chat-photo-delete');

  document.getElementById('edit-log-id').value = log.id;
  document.getElementById('edit-person-name').value = log.name;
  document.getElementById('edit-chat-date').value = log.date;
  document.getElementById('edit-chat-progress').value = String(log.progress || 0);
  document.getElementById('edit-heard-gospel-count').value = Number(log.heardGospelCount || 1);
  document.getElementById('edit-professed-count').value = Number(log.professedCount || 1);
  document.getElementById('edit-chat-notes').value = log.notes;
  if (photoInput) photoInput.value = '';
  if (deleteFlag) deleteFlag.value = 'false';

  if (previewWrap && previewImage) {
    if (log.photo) {
      previewImage.src = log.photo;
      previewWrap.style.display = 'block';
      if (clearButton) clearButton.style.display = 'inline-flex';
    } else {
      previewImage.src = '';
      previewWrap.style.display = 'none';
      if (clearButton) clearButton.style.display = 'none';
    }
  }

  if (deleteFlag) deleteFlag.value = 'false';

  renderEvangelistCheckboxes(document.getElementById('edit-evangelists-checkbox-group'), log.evangelists || []);
  syncLogCounters(true);
  document.getElementById('edit-modal').classList.add('active');
};

document.getElementById('close-modal-btn').addEventListener('click', () => {
  document.getElementById('edit-modal').classList.remove('active');
});

document.getElementById('edit-tracker-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const logId = String(document.getElementById('edit-log-id').value);
  const logs = JSON.parse(localStorage.getItem('evangelism_logs') || '[]');
  const index = logs.findIndex(l => String(l.id) === logId);

  if (index !== -1) {
    const checkboxes = document.getElementById('edit-evangelists-checkbox-group').querySelectorAll('input[type="checkbox"]:checked');
    const photoInput = document.getElementById('edit-chat-photo');
    const progressValue = Number(document.getElementById('edit-chat-progress').value || 0);

    logs[index].name = document.getElementById('edit-person-name').value;
    logs[index].date = document.getElementById('edit-chat-date').value;
    logs[index].notes = document.getElementById('edit-chat-notes').value;
    logs[index].evangelists = Array.from(checkboxes).map(cb => cb.value);
    logs[index].progress = String(progressValue);
    logs[index].heardGospelCount = progressValue >= 4 && progressValue <= 7 ? Number(document.getElementById('edit-heard-gospel-count').value || 1) : 0;
    logs[index].professedCount = progressValue === 7 ? Number(document.getElementById('edit-professed-count').value || 1) : 0;

    if (document.getElementById('edit-chat-photo-delete').value === 'true') {
      logs[index].photo = '';
    } else if (photoInput && photoInput.files && photoInput.files[0]) {
      logs[index].photo = await fileToDataUrl(photoInput.files[0]);
    }

    const supabase = window.getSupabaseClient ? window.getSupabaseClient() : null;
    if (supabase) {
      try {
        const { error: updateError } = await supabase
          .from('chat_logs')
          .update({
            person_name: logs[index].name,
            log_date: logs[index].date,
            notes: logs[index].notes,
            evangelists: logs[index].evangelists,
            progress: Number(logs[index].progress),
            heard_gospel_count: logs[index].heardGospelCount,
            professed_count: logs[index].professedCount,
            photo_url: logs[index].photo || null,
            updated_at: new Date().toISOString()
          })
          .eq('id', logId);

        if (updateError) {
          console.warn('Supabase update failed:', updateError.message);
        } else {
          console.log('Chat log updated in Supabase:', logId);
        }
      } catch (err) {
        console.warn('Supabase error during update:', err.message);
      }
    }

    localStorage.setItem('evangelism_logs', JSON.stringify(logs));
    document.getElementById('edit-modal').classList.remove('active');
    await renderLogs();
  }
});

window.deleteLog = async function(logId) {
  if (confirm('Delete this chat entry?')) {
    const supabase = window.getSupabaseClient ? window.getSupabaseClient() : null;
    if (supabase) {
      try {
        const { error: deleteError } = await supabase
          .from('chat_logs')
          .delete()
          .eq('id', String(logId));

        if (deleteError) {
          console.warn('Supabase delete failed:', deleteError.message);
        } else {
          console.log('Chat log deleted from Supabase:', logId);
        }
      } catch (err) {
        console.warn('Supabase error during delete:', err.message);
      }
    }

    let logs = JSON.parse(localStorage.getItem('evangelism_logs') || '[]');
    logs = logs.filter(l => String(l.id) !== String(logId));
    localStorage.setItem('evangelism_logs', JSON.stringify(logs));
    await renderLogs();
  }
};

// --- CALENDAR MANAGEMENT ---
document.getElementById('event-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const targetGroup = getEffectiveGroupName();
  const eventId = String(Date.now());
  const rawDatetime = document.getElementById('event-date').value;

  if (!rawDatetime) {
    alert('Please pick a date and time for the event.');
    return;
  }

  const newEvent = {
    id: eventId,
    groupName: targetGroup,
    title: document.getElementById('event-title').value,
    datetime: rawDatetime,
    status: document.getElementById('event-status').value,
    location: document.getElementById('event-location').value,
    description: document.getElementById('event-description').value,
    rsvps: {}
  };

  const supabase = window.getSupabaseClient ? window.getSupabaseClient() : null;
  if (supabase) {
    try {
      const groupId = await getEffectiveGroupIdAsync();

      // Convert datetime-local value (no timezone) to UTC ISO string
      const eventDatetimeUTC = new Date(rawDatetime).toISOString();

      const { error: insertError } = await supabase
        .from('events')
        .insert([{
          id: eventId,
          group_id: groupId,
          title: newEvent.title,
          event_datetime: eventDatetimeUTC,
          status: newEvent.status,
          location: newEvent.location,
          description: newEvent.description
        }]);

      if (insertError) {
        console.warn('Supabase event insert failed:', insertError.message);
        alert('Could not save event: ' + insertError.message);
        return;
      } else {
        console.log('Event saved to Supabase:', eventId);
        // Keep the local datetime string in localStorage so the
        // datetime-local inputs can round-trip correctly.
      }
    } catch (err) {
      console.warn('Supabase error during event insert:', err.message);
      alert('Could not save event: ' + err.message);
      return;
    }
  }

  const events = JSON.parse(localStorage.getItem('evangelism_events') || '[]');
  events.push(newEvent);
  localStorage.setItem('evangelism_events', JSON.stringify(events));

  document.getElementById('event-form').reset();
  await renderCalendar();
});

async function renderCalendar() {
  if (!ensureUserSession()) return;

  const events = await loadEventsFromSupabase();
  const team = getStoredArray('evangelism_team');
  const list = document.getElementById('calendar-event-list');
  list.innerHTML = '';

  const now = new Date();

  const targetGroup = getEffectiveGroupName();

  // Filter by group
  const upcomingEvents = events.filter(evt => {
    return currentUser.role === 'super_admin'
      ? evt.groupName === targetGroup
      : evt.groupName === currentUser.groupName;
  });

  // Sort by date ascending
  upcomingEvents.sort((a, b) => new Date(a.datetime) - new Date(b.datetime));

  if (upcomingEvents.length === 0) {
    list.innerHTML = '<p class="empty-state">No upcoming events scheduled for your group.</p>';
    return;
  }

  const isLeader = ['super_admin', 'director', 'admin'].includes(currentUser.role);

  upcomingEvents.forEach(evt => {
    const formattedDate = new Date(evt.datetime).toLocaleString([], {
      weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    const currentRsvp = (evt.rsvps && evt.rsvps[currentUser.id]) || '';

    // Calculate attendee lists
    const goingNames = [];
    const maybeNames = [];
    const not_goingNames = [];
    if (evt.rsvps) {
      Object.entries(evt.rsvps).forEach(([uId, response]) => {
        const u = team.find(t => t.id === uId);
        if (u) {
          if (response === 'going') goingNames.push(u.name);
          if (response === 'maybe') maybeNames.push(u.name);
          if (response === 'not_going') not_goingNames.push(u.name);
        }
      });
    }

    const card = document.createElement('div');
    card.className = 'event-card';
    card.innerHTML = `
      <div class="event-header">
        <span class="event-title">${escapeHtml(evt.title)}</span>
        <span class="status-badge ${evt.status.toLowerCase()}">${escapeHtml(evt.status)}</span>
      </div>
      <div class="event-meta">
        <span>📅 ${escapeHtml(formattedDate)}</span>
        <span>📍 ${escapeHtml(evt.location)}</span>
      </div>
      <p class="event-desc">${escapeHtml(evt.description || 'No description provided.')}</p>
      
      <!-- RSVP CONTROLS -->
      <div class="rsvp-section">
        <div class="rsvp-title">Your RSVP:</div>
        <div class="rsvp-buttons">
          <button class="rsvp-btn ${currentRsvp === 'going' ? 'active-going' : ''}" onclick="setRSVP('${escapeHtml(String(evt.id))}', 'going')">Going</button>
          <button class="rsvp-btn ${currentRsvp === 'maybe' ? 'active-maybe' : ''}" onclick="setRSVP('${escapeHtml(String(evt.id))}', 'maybe')">Maybe</button>
          <button class="rsvp-btn ${currentRsvp === 'not_going' ? 'active-not_going' : ''}" onclick="setRSVP('${escapeHtml(String(evt.id))}', 'not_going')">Not Going</button>
        </div>
        <div class="rsvp-attendees">
          <strong>Going (${goingNames.length}):</strong> ${goingNames.join(', ') || 'None yet'}<br>
          <strong>Maybe (${maybeNames.length}):</strong> ${maybeNames.join(', ') || 'None yet'}<br>
          <strong>Not Going (${not_goingNames.length}):</strong> ${not_goingNames.join(', ') || 'None yet'}
        </div>
      </div>

      ${isLeader ? `
        <div class="log-actions" style="margin-top:12px;">
          <button class="btn-action edit" onclick="openEditEventModal('${escapeHtml(String(evt.id))}')">Edit Event</button>
          <button class="btn-action delete" onclick="deleteEvent('${escapeHtml(String(evt.id))}')">Delete Event</button>
        </div>
      ` : ''}
    `;
    list.appendChild(card);
  });
}

window.setRSVP = async function(eventId, status) {
  const events = JSON.parse(localStorage.getItem('evangelism_events') || '[]');
  const evt = events.find(e => String(e.id) === String(eventId));
  if (evt) {
    if (!evt.rsvps) evt.rsvps = {};
    evt.rsvps[currentUser.id] = status;
    localStorage.setItem('evangelism_events', JSON.stringify(events));

    const supabase = window.getSupabaseClient ? window.getSupabaseClient() : null;
    if (supabase && currentUser) {
      try {
        const rsvpId = `rsvp_${eventId}_${currentUser.id}`;
        const { error: rsvpError } = await supabase
          .from('event_rsvps')
          .upsert([{
            id: rsvpId,
            event_id: String(eventId),
            user_id: String(currentUser.id),
            response: status
          }], { onConflict: 'event_id,user_id' });

        if (rsvpError) {
          console.warn('Supabase RSVP upsert failed:', rsvpError.message);
        } else {
          console.log('RSVP upserted in Supabase:', rsvpId);
        }
      } catch (err) {
        console.warn('Supabase error during RSVP upsert:', err.message);
      }
    }

    await renderCalendar();
  }
};

window.openEditEventModal = function(eventId) {
  const events = JSON.parse(localStorage.getItem('evangelism_events') || '[]');
  const evt = events.find(e => String(e.id) === String(eventId));
  if (!evt) return;

  document.getElementById('edit-event-id').value = String(evt.id);
  document.getElementById('edit-event-title').value = evt.title;
  document.getElementById('edit-event-date').value = toLocalDateTimeInput(evt.datetime);
  document.getElementById('edit-event-status').value = evt.status;
  document.getElementById('edit-event-location').value = evt.location;
  document.getElementById('edit-event-description').value = evt.description;

  document.getElementById('edit-event-modal').classList.add('active');
};

document.getElementById('close-event-modal-btn').addEventListener('click', () => {
  document.getElementById('edit-event-modal').classList.remove('active');
});

document.getElementById('edit-event-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = String(document.getElementById('edit-event-id').value);
  const events = JSON.parse(localStorage.getItem('evangelism_events') || '[]');
  const index = events.findIndex(e => String(e.id) === id);

  if (index !== -1) {
    events[index].title = document.getElementById('edit-event-title').value;
    events[index].datetime = document.getElementById('edit-event-date').value;
    events[index].status = document.getElementById('edit-event-status').value;
    events[index].location = document.getElementById('edit-event-location').value;
    events[index].description = document.getElementById('edit-event-description').value;

    const supabase = window.getSupabaseClient ? window.getSupabaseClient() : null;
    if (supabase) {
      try {
        const { error: updateError } = await supabase
          .from('events')
          .update({
            title: events[index].title,
            event_datetime: new Date(events[index].datetime).toISOString(),
            status: events[index].status,
            location: events[index].location,
            description: events[index].description,
            updated_at: new Date().toISOString()
          })
          .eq('id', id);

        if (updateError) {
          console.warn('Supabase event update failed:', updateError.message);
        } else {
          console.log('Event updated in Supabase:', id);
        }
      } catch (err) {
        console.warn('Supabase error during event update:', err.message);
      }
    }

    localStorage.setItem('evangelism_events', JSON.stringify(events));
    document.getElementById('edit-event-modal').classList.remove('active');
    await renderCalendar();
  }
});

window.deleteEvent = async function(eventId) {
  if (confirm('Delete this event outing?')) {
    const supabase = window.getSupabaseClient ? window.getSupabaseClient() : null;
    if (supabase) {
      try {
        const { error: deleteError } = await supabase
          .from('events')
          .delete()
          .eq('id', String(eventId));

        if (deleteError) {
          console.warn('Supabase event delete failed:', deleteError.message);
        } else {
          console.log('Event deleted from Supabase:', eventId);
        }
      } catch (err) {
        console.warn('Supabase error during event delete:', err.message);
      }
    }

    let events = JSON.parse(localStorage.getItem('evangelism_events') || '[]');
    events = events.filter(e => String(e.id) !== String(eventId));
    localStorage.setItem('evangelism_events', JSON.stringify(events));
    await renderCalendar();
  }
};

// --- RESOURCES MANAGEMENT ---
document.getElementById('resource-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const targetGroup = getEffectiveGroupName();
  const resourceId = 'res_' + Date.now();

  const newResource = {
    id: resourceId,
    groupName: targetGroup,
    title: document.getElementById('resource-title').value,
    url: document.getElementById('resource-url').value,
    desc: document.getElementById('resource-desc').value,
    isDefault: currentUser.role === 'super_admin' && document.getElementById('resource-is-default').checked,
    defaultKey: resourceId
  };

  const supabase = window.getSupabaseClient ? window.getSupabaseClient() : null;
  if (supabase) {
    try {
      const groupId = getEffectiveGroupId();
      const resourceRows = [{
        id: resourceId,
        group_id: groupId,
        title: newResource.title,
        url: newResource.url,
        description: newResource.desc,
        is_default: newResource.isDefault,
        default_key: newResource.isDefault ? newResource.defaultKey : null
      }];

      if (newResource.isDefault) {
        const { data: groups, error: groupsError } = await supabase
          .from('groups')
          .select('id');
        if (groupsError) throw new Error(groupsError.message);
        groups.forEach(group => {
          if (String(group.id) !== String(groupId)) {
            resourceRows.push({
              ...resourceRows[0],
              id: `${resourceId}_${group.id}`,
              group_id: group.id
            });
          }
        });
      }

      const insertErrors = [];
      for (const resourceRow of resourceRows) {
        const { error: insertError } = await supabase
          .from('resources')
          .insert([resourceRow]);
        if (insertError) {
          insertErrors.push(`${resourceRow.group_id}: ${insertError.message}`);
        }
      }

      if (insertErrors.length) {
        console.warn('Some Supabase resource inserts failed:', insertErrors);
        alert(`The resource could not be added to every group. Run the resource ALTER TABLE statements in supabase-schema.sql and check Supabase row-level security policies. Details: ${insertErrors[0]}`);
        if (insertErrors.some(error => error.startsWith(`${groupId}:`))) return;
      } else {
        console.log('Resource saved to Supabase:', resourceId);
      }
    } catch (err) {
      console.warn('Supabase error during resource insert:', err.message);
    }
  }

  const resources = JSON.parse(localStorage.getItem('evangelism_resources') || '[]');
  resources.push(newResource);
  localStorage.setItem('evangelism_resources', JSON.stringify(resources));

  document.getElementById('resource-form').reset();
  await renderResources();
});

async function renderResources() {
  if (!ensureUserSession()) return;

  const resources = await loadResourcesFromSupabase();
  const list = document.getElementById('resource-list');
  list.innerHTML = '';

  const targetGroup = getEffectiveGroupName();
  const localResources = resources.filter(r => currentUser.role === 'super_admin'
    ? r.groupName === targetGroup
    : r.groupName === currentUser.groupName);

  if (localResources.length === 0) {
    list.innerHTML = '<li class="empty-state">No resources added for this group.</li>';
    return;
  }

  const isLeader = ['super_admin', 'director', 'admin'].includes(currentUser.role);

  localResources.forEach(res => {
    const li = document.createElement('li');
    li.className = 'resource-item';
    li.innerHTML = `
      <div class="resource-info">
        <h4><a href="${escapeHtml(res.url)}" target="_blank" rel="noopener">📄 ${escapeHtml(res.title)}</a></h4>
        <p class="resource-desc">${escapeHtml(res.desc || 'Resource Link')}</p>
      </div>
      ${isLeader ? `
        <div class="log-actions" style="border:none; padding:0; margin:0;">
          <button class="btn-action edit" onclick="openEditResourceModal('${escapeHtml(String(res.id))}')">Edit</button>
          <button class="btn-action delete" onclick="deleteResource('${escapeHtml(String(res.id))}')">Delete</button>
        </div>
      ` : ''}
    `;
    list.appendChild(li);
  });
}

window.openEditResourceModal = function(id) {
  const resources = JSON.parse(localStorage.getItem('evangelism_resources') || '[]');
  const res = resources.find(r => String(r.id) === String(id));
  if (!res) return;

  document.getElementById('edit-resource-id').value = String(res.id);
  document.getElementById('edit-resource-title').value = res.title;
  document.getElementById('edit-resource-url').value = res.url;
  document.getElementById('edit-resource-desc').value = res.desc;
  document.getElementById('edit-resource-is-default').checked = res.isDefault === true;

  document.getElementById('edit-resource-modal').classList.add('active');
};

document.getElementById('close-resource-modal-btn').addEventListener('click', () => {
  document.getElementById('edit-resource-modal').classList.remove('active');
});

document.getElementById('edit-resource-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = String(document.getElementById('edit-resource-id').value);
  const resources = JSON.parse(localStorage.getItem('evangelism_resources') || '[]');
  const index = resources.findIndex(r => String(r.id) === id);

  if (index !== -1) {
    resources[index].title = document.getElementById('edit-resource-title').value;
    resources[index].url = document.getElementById('edit-resource-url').value;
    resources[index].desc = document.getElementById('edit-resource-desc').value;
    const isDefault = currentUser.role === 'super_admin' && document.getElementById('edit-resource-is-default').checked;
    const defaultKey = resources[index].defaultKey || `default-${id}`;
    resources[index].isDefault = isDefault;
    resources[index].defaultKey = isDefault ? defaultKey : '';

    const supabase = window.getSupabaseClient ? window.getSupabaseClient() : null;
    if (supabase) {
      try {
        const updateValues = {
          title: resources[index].title,
          url: resources[index].url,
          description: resources[index].desc,
          is_default: isDefault,
          default_key: isDefault ? defaultKey : null,
          updated_at: new Date().toISOString()
        };
        const { data: existingResource, error: resourceError } = await supabase
          .from('resources')
          .select('group_id, default_key')
          .eq('id', id)
          .single();
        if (resourceError) throw new Error(resourceError.message);

        const { error: updateError } = await supabase
          .from('resources')
          .update(updateValues)
          .eq('id', id);

        if (updateError) {
          throw new Error(updateError.message);
        } else {
          console.log('Resource updated in Supabase:', id);
        }

        if (isDefault) {
          const { error: sharedUpdateError } = await supabase
            .from('resources')
            .update(updateValues)
            .eq('default_key', defaultKey)
            .neq('id', id);
          if (sharedUpdateError) throw new Error(sharedUpdateError.message);

          const { data: groups, error: groupsError } = await supabase
            .from('groups')
            .select('id');
          if (groupsError) throw new Error(groupsError.message);
          const rows = groups
            .filter(group => String(group.id) !== String(existingResource.group_id))
            .map(group => ({
              id: `${defaultKey}_${group.id}`,
              group_id: group.id,
              ...updateValues,
              default_key: defaultKey
            }));
          if (rows.length) {
            const { error: upsertError } = await supabase
              .from('resources')
              .upsert(rows, { onConflict: 'id' });
            if (upsertError) throw new Error(upsertError.message);
          }
        } else if (existingResource.default_key) {
          const { error: removeDefaultError } = await supabase
            .from('resources')
            .update({ is_default: false, default_key: null, updated_at: new Date().toISOString() })
            .eq('default_key', existingResource.default_key)
            .neq('id', id);
          if (removeDefaultError) throw new Error(removeDefaultError.message);
        }
      } catch (err) {
        console.warn('Supabase error during resource update:', err.message);
      }
    }

    localStorage.setItem('evangelism_resources', JSON.stringify(resources));
    document.getElementById('edit-resource-modal').classList.remove('active');
    await renderResources();
  }
});

window.deleteResource = async function(id) {
  if (confirm('Delete this resource?')) {
    const supabase = window.getSupabaseClient ? window.getSupabaseClient() : null;
    if (supabase) {
      try {
        const { error: deleteError } = await supabase
          .from('resources')
          .delete()
          .eq('id', String(id));

        if (deleteError) {
          console.warn('Supabase resource delete failed:', deleteError.message);
        } else {
          console.log('Resource deleted from Supabase:', id);
        }
      } catch (err) {
        console.warn('Supabase error during resource delete:', err.message);
      }
    }

    let resources = JSON.parse(localStorage.getItem('evangelism_resources') || '[]');
    resources = resources.filter(r => String(r.id) !== String(id));
    localStorage.setItem('evangelism_resources', JSON.stringify(resources));
    await renderResources();
  }
};

// --- TEAM MANAGEMENT (DIRECTOR & ADMIN LEVEL) ---
document.getElementById('rename-team-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const isDirectorView = currentUser && currentUser.role === 'super_admin' && getStoredArray('evangelism_team').some(member => (
    member.role === 'director' && member.groupName === activeGroupName
  ));
  if (!currentUser || (currentUser.role !== 'director' && !isDirectorView)) {
    alert('Only the team director can change the team name.');
    return;
  }

  const oldName = getEffectiveGroupName();
  const newName = document.getElementById('team-name').value.trim();
  if (!newName || newName === oldName) return;

  const localTeam = getStoredArray('evangelism_team');
  if (localTeam.some(member => member.groupName === newName)) {
    alert('A team with that name already exists.');
    return;
  }

  const supabase = window.getSupabaseClient ? window.getSupabaseClient() : null;
  if (supabase) {
    const groupId = await getEffectiveGroupIdAsync();
    const { error } = await supabase
      .from('groups')
      .update({ name: newName })
      .eq('id', groupId);

    if (error) {
      console.warn('Team rename failed:', error.message);
      alert('Unable to change the team name. It may already be in use.');
      return;
    }
  }

  ['evangelism_team', 'evangelism_logs', 'evangelism_events', 'evangelism_resources'].forEach(key => {
    const records = getStoredArray(key).map(record => (
      record.groupName === oldName ? { ...record, groupName: newName } : record
    ));
    localStorage.setItem(key, JSON.stringify(records));
  });

  const cachedGroupIds = JSON.parse(localStorage.getItem('evangelism_group_ids') || '{}');
  if (cachedGroupIds[oldName]) {
    cachedGroupIds[newName] = cachedGroupIds[oldName];
    delete cachedGroupIds[oldName];
    localStorage.setItem('evangelism_group_ids', JSON.stringify(cachedGroupIds));
  }

  if (currentUser.role === 'director') currentUser.groupName = newName;
  activeGroupName = newName;
  groupBadge.textContent = currentUser.role === 'super_admin' ? `${newName} (Admin View)` : newName;
  document.getElementById('team-name').value = newName;

  await renderTeam();
  renderEvangelistCheckboxes();
  await renderLogs();
  await renderCalendar();
  await renderResources();
});

document.getElementById('add-member-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!currentUser || !['super_admin', 'director', 'admin'].includes(currentUser.role)) {
    alert('Only team leaders can add members.');
    return;
  }

  const targetGroup = getEffectiveGroupName();
  const newMemberName = document.getElementById('member-name').value;
  const newMemberEmail = document.getElementById('member-email').value;
  const newMemberRole = document.getElementById('member-role').value;

  if (currentUser.role === 'admin' && newMemberRole !== 'member') {
    alert('Administrators can only add basic members.');
    return;
  }

  const newMemberId = 'user_' + Date.now();

  const newMember = {
    id: newMemberId,
    name: newMemberName,
    email: newMemberEmail,
    role: newMemberRole,
    groupName: targetGroup
  };

  // Try to save to Supabase first
  const supabase = window.getSupabaseClient ? window.getSupabaseClient() : null;
  if (supabase) {
    try {
      let { data: groupRows, error: groupLookupError } = await supabase
        .from('groups')
        .select('id')
        .eq('name', targetGroup)
        .limit(1);

      if (groupLookupError) throw new Error(groupLookupError.message);

      let groupId = groupRows && groupRows.length ? groupRows[0].id : null;

      if (!groupId) {
        const { data: insertedGroup, error: insertGroupError } = await supabase
          .from('groups')
          .insert([{ id: String(Date.now()), name: targetGroup }])
          .select('id');

        if (insertGroupError) {
          throw new Error(insertGroupError.message);
        } else if (insertedGroup && insertedGroup[0]) {
          groupId = insertedGroup[0].id;
        }
      }

      if (!groupId) throw new Error('The selected team could not be found.');

      if (!window.createAuthUserForInvite) {
        throw new Error('Authentication setup is not available.');
      }

      const authResult = await window.createAuthUserForInvite(newMemberEmail);
      if (!authResult.ok) {
        throw new Error(`Authentication user could not be created: ${authResult.message}`);
      }

      const authUserId = authResult.data.user.id;

      const { error: insertError } = await supabase
        .from('users')
        .insert([{
          id: newMemberId,
          full_name: newMemberName,
          email: newMemberEmail,
          role: newMemberRole,
          group_id: groupId,
          auth_user_id: authUserId
        }]);

      if (insertError) {
        throw new Error(insertError.message);
      } else {
        console.log('User saved to Supabase:', newMemberId);
        if (window.sendPasswordSetupEmail) {
          const emailResult = await window.sendPasswordSetupEmail(newMemberEmail);
          if (!emailResult.ok) {
            console.warn('Password setup email status:', emailResult.message);
            alert(`Member added, but password setup email could not be sent: ${emailResult.message}`);
          } else {
            alert(`Member added! A password setup email was sent to ${newMemberEmail}.`);
          }
        }
      }
    } catch (err) {
      console.warn('Supabase error:', err.message);
      alert(`Member was not added: ${err.message}`);
      return;
    }
  }

  // Always save to localStorage as backup
  const team = JSON.parse(localStorage.getItem('evangelism_team') || '[]');
  team.push(newMember);
  localStorage.setItem('evangelism_team', JSON.stringify(team));

  document.getElementById('add-member-form').reset();
  await renderTeam();
  renderEvangelistCheckboxes();
});

function canManageUser(targetUser) {
  if (!currentUser || !targetUser) return false;

  if (currentUser.role === 'super_admin') return true;

  const currentGroup = currentUser.groupName || activeGroupName;
  if (!currentGroup) return false;

  if (currentUser.role === 'director') {
    return targetUser.groupName === currentGroup && ['member', 'admin'].includes(targetUser.role);
  }

  if (currentUser.role === 'admin') {
    return targetUser.groupName === currentGroup && targetUser.role === 'member';
  }

  return false;
}

async function renderTeam() {
  if (!ensureUserSession()) return;

  const team = await loadTeamDataFromSupabase();
  await renderTeamStats();
  const teamList = document.getElementById('team-list');
  teamList.innerHTML = '';

  const targetGroup = getEffectiveGroupName();
  const groupMembers = team.filter(m => currentUser.role === 'super_admin'
    ? m.groupName === targetGroup
    : m.groupName === currentUser.groupName);

  groupMembers.forEach(m => {
    const canEdit = canManageUser(m);
    const li = document.createElement('li');
    li.className = 'log-item';
    li.innerHTML = `
      <div class="log-item-header">
        <span class="log-item-title">${escapeHtml(m.name)}</span>
        <span class="badge">${escapeHtml(m.role)}</span>
      </div>
      <p class="log-item-notes">${escapeHtml(m.email)} | Group: ${escapeHtml(m.groupName)}</p>

      ${canEdit ? `
        <div class="log-actions">
          <button class="btn-action edit" onclick="openEditUserModal('${m.id}')">Edit Member</button>
          <button class="btn-action delete" onclick="deleteUser('${m.id}')">Remove Member</button>
        </div>
      ` : ''}
    `;
    teamList.appendChild(li);
  });
}

async function renderTeamStats() {
  const logs = await loadChatLogsFromSupabase();
  const targetGroup = getEffectiveGroupName();
  const groupLogs = logs.filter(log => currentUser.role === 'super_admin'
    ? log.groupName === targetGroup
    : log.groupName === currentUser.groupName);
  const relevantLogs = groupLogs.filter(log => isLogInStatsRange(log.date));

  const totalConversations = relevantLogs.length;
  const heardGospel = relevantLogs.reduce((total, log) => total + Number(log.heardGospelCount || 0), 0);
  const professions = relevantLogs.reduce((total, log) => total + Number(log.professedCount || 0), 0);
  const gospelStageConversations = relevantLogs.filter(log => {
    const progress = Number(log.progress || 0);
    return progress >= 4 && progress <= 7;
  }).length;
  const gospelReachRate = totalConversations
    ? Math.round((gospelStageConversations / totalConversations) * 100)
    : 0;

  document.getElementById('stat-total-conversations').textContent = totalConversations.toLocaleString();
  document.getElementById('stat-heard-gospel').textContent = heardGospel.toLocaleString();
  document.getElementById('stat-professions').textContent = professions.toLocaleString();
  document.getElementById('stat-gospel-reach-rate').textContent = `${gospelReachRate}%`;
  document.getElementById('stat-progress-total').textContent = `${totalConversations.toLocaleString()} conversation${totalConversations === 1 ? '' : 's'}`;

  const progressList = document.getElementById('stats-progress-list');
  const progressLevels = [
    [0, 'No Progress'],
    [1, "God's Existence"],
    [2, 'Law'],
    [3, 'False Ways'],
    [4, 'Gospel'],
    [5, 'Checking Questions'],
    [6, 'Complete (Not Professing)'],
    [7, 'Complete (Professing)'],
    [8, 'Already a Believer']
  ];
  const counts = progressLevels.map(([level]) => relevantLogs.filter(log => Number(log.progress || 0) === level).length);
  const largestCount = Math.max(...counts, 1);

  progressList.innerHTML = progressLevels.map(([level, label], index) => {
    const count = counts[index];
    const width = Math.round((count / largestCount) * 100);
    return `
      <div class="stats-progress-item">
        <div class="stats-progress-label"><span>${escapeHtml(label)}</span><strong>${count}</strong></div>
        <div class="stats-progress-track" aria-hidden="true"><span style="width: ${width}%"></span></div>
      </div>
    `;
  }).join('');
}

function isLogInStatsRange(logDate) {
  if (selectedStatsRange === 'all') return true;
  if (!logDate || !/^\d{4}-\d{2}-\d{2}$/.test(logDate)) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const logDay = new Date(`${logDate}T00:00:00`);
  let startDate = new Date(today);

  if (selectedStatsRange === 'today') {
    return logDay.getTime() === today.getTime();
  }

  if (selectedStatsRange === 'week') startDate.setDate(startDate.getDate() - 6);
  if (selectedStatsRange === 'month') startDate.setMonth(startDate.getMonth() - 1);
  if (selectedStatsRange === 'six-months') startDate.setMonth(startDate.getMonth() - 6);

  return logDay >= startDate && logDay <= today;
}

// --- SUPER ADMIN PANEL (MANAGE DIRECTORS & ALL GROUPS) ---
document.getElementById('appoint-director-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const groupName = document.getElementById('group-name').value.trim();
  const directorName = document.getElementById('director-name').value.trim();
  const directorEmail = document.getElementById('director-email').value.trim();

  if (!groupName || !directorName || !directorEmail) {
    alert('Please complete the group name, director name, and director email.');
    return;
  }

  const supabase = window.getSupabaseClient ? window.getSupabaseClient() : null;
  const groupId = slugifyGroupName(groupName);
  const directorId = 'dir_' + Date.now();
  const newDirector = {
    id: directorId,
    name: directorName,
    email: directorEmail,
    role: 'director',
    groupName: groupName
  };

  try {
    if (supabase) {
      const { data: existingGroup, error: existingGroupError } = await supabase
        .from('groups')
        .select('id')
        .eq('name', groupName)
        .limit(1);

      let resolvedGroupId = groupId;

      if (existingGroupError) {
        console.warn('Group lookup failed:', existingGroupError.message);
      } else if (existingGroup && existingGroup.length) {
        resolvedGroupId = existingGroup[0].id;
      } else {
        const { data: insertedGroup, error: insertGroupError } = await supabase
          .from('groups')
          .upsert([{ id: resolvedGroupId, name: groupName }], { onConflict: 'id' })
          .select('id');

        if (insertGroupError) {
          console.warn('Supabase group insert failed:', insertGroupError.message);
        } else if (insertedGroup && insertedGroup.length) {
          resolvedGroupId = insertedGroup[0].id;
        }
      }

      if (!window.createAuthUserForInvite) {
        throw new Error('Authentication setup is not available.');
      }

      const authResult = await window.createAuthUserForInvite(directorEmail);
      if (!authResult.ok) {
        throw new Error(`Authentication user could not be created: ${authResult.message}`);
      }

      const authUserId = authResult.data.user.id;
      const { error: insertUserError } = await supabase
        .from('users')
        .insert([{
          id: directorId,
          full_name: directorName,
          email: directorEmail,
          role: 'director',
          group_id: resolvedGroupId,
          auth_user_id: authUserId
        }]);

      if (insertUserError) {
        throw new Error(`Director could not be saved: ${insertUserError.message}`);
      }

      const cachedGroupIds = JSON.parse(localStorage.getItem('evangelism_group_ids') || '{}');
      cachedGroupIds[groupName] = resolvedGroupId;
      localStorage.setItem('evangelism_group_ids', JSON.stringify(cachedGroupIds));

      let defaultResources = DEFAULT_RESOURCES;
      const { data: savedDefaults, error: defaultsError } = await supabase
        .from('resources')
        .select('title, url, description, default_key')
        .eq('is_default', true);
      if (!defaultsError && savedDefaults && savedDefaults.length) {
        defaultResources = savedDefaults;
      }

      defaultResources = defaultResources.map((resource, index) => ({
        id: `group_resource_${resolvedGroupId}_${resource.default_key || resource.defaultKey || index}`,
        group_id: resolvedGroupId,
        title: resource.title,
        url: resource.url,
        description: resource.description || resource.desc || '',
        is_default: true,
        default_key: resource.default_key || resource.defaultKey || `built-in-${index}`
      }));

      const { error: resourceInsertError } = await supabase
        .from('resources')
        .upsert(defaultResources, { onConflict: 'id' });

      if (resourceInsertError) {
        console.warn('Supabase default resource insert failed:', resourceInsertError.message);
      }
    }

    const team = getStoredArray('evangelism_team');
    team.push(newDirector);
    localStorage.setItem('evangelism_team', JSON.stringify(team));
    activeGroupName = groupName;

    const resources = getStoredArray('evangelism_resources');
    DEFAULT_RESOURCES.forEach(def => {
      resources.push({
        id: Date.now() + Math.floor(Math.random() * 1000),
        groupName: groupName,
        title: def.title,
        url: def.url,
        desc: def.desc
      });
    });
    localStorage.setItem('evangelism_resources', JSON.stringify(resources));

    document.getElementById('appoint-director-form').reset();

    if (window.sendPasswordSetupEmail && supabase) {
      const emailResult = await window.sendPasswordSetupEmail(directorEmail);
      if (!emailResult.ok) {
        console.warn('Password setup email status:', emailResult.message);
        alert(`Director & group created, but password setup email could not be sent: ${emailResult.message}`);
      } else {
        alert(`Group created & director appointed! A password setup email was sent to ${directorEmail}.`);
      }
    }

    await renderSuperAdminPanel();
    await renderTeam();
    await renderResources();
  } catch (error) {
    console.warn('Director creation failed:', error);
    alert('Unable to save the director and group right now. Please try again.');
  }
});

async function loadAllGroupsFromSupabase() {
  const supabase = window.getSupabaseClient ? window.getSupabaseClient() : null;
  const groupsSet = new Set();

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('groups')
        .select('name');
      if (data && !error) {
        data.forEach(g => { if (g.name) groupsSet.add(g.name); });
      }
    } catch (e) {
      console.warn('Group fetch failed:', e);
    }
  }

  const team = getStoredArray('evangelism_team');
  team.forEach(m => { if (m.groupName && m.groupName !== 'System') groupsSet.add(m.groupName); });

  const cachedGroupIds = JSON.parse(localStorage.getItem('evangelism_group_ids') || '{}');
  Object.keys(cachedGroupIds).forEach(g => { if (g && g !== 'System') groupsSet.add(g); });

  const resources = getStoredArray('evangelism_resources');
  resources.forEach(r => { if (r.groupName && r.groupName !== 'System') groupsSet.add(r.groupName); });

  const logs = getStoredArray('evangelism_logs');
  logs.forEach(l => { if (l.groupName && l.groupName !== 'System') groupsSet.add(l.groupName); });

  const events = getStoredArray('evangelism_events');
  events.forEach(e => { if (e.groupName && e.groupName !== 'System') groupsSet.add(e.groupName); });

  return Array.from(groupsSet).sort();
}

window.prefillAppointDirector = function(groupName) {
  const groupInput = document.getElementById('group-name');
  const nameInput = document.getElementById('director-name');
  if (groupInput) groupInput.value = groupName;
  if (nameInput) nameInput.focus();
};

window.deleteGroupOnly = async function(groupName) {
  if (!confirm(`Delete group "${groupName}" and all associated data?`)) return;

  const supabase = window.getSupabaseClient ? window.getSupabaseClient() : null;

  try {
    if (supabase) {
      const { data: groupRows } = await supabase
        .from('groups')
        .select('id')
        .eq('name', groupName);

      if (groupRows && groupRows.length) {
        for (const g of groupRows) {
          const { error: groupDeleteError } = await supabase
            .from('groups')
            .delete()
            .eq('id', g.id);

          if (groupDeleteError) {
            console.warn('Supabase group delete failed:', groupDeleteError.message);
          }
        }
      }
    }

    let localTeam = getStoredArray('evangelism_team');
    localTeam = localTeam.filter(m => m.groupName !== groupName);
    localStorage.setItem('evangelism_team', JSON.stringify(localTeam));

    let localResources = getStoredArray('evangelism_resources');
    localResources = localResources.filter(r => r.groupName !== groupName);
    localStorage.setItem('evangelism_resources', JSON.stringify(localResources));

    let localLogs = getStoredArray('evangelism_logs');
    localLogs = localLogs.filter(l => l.groupName !== groupName);
    localStorage.setItem('evangelism_logs', JSON.stringify(localLogs));

    let localEvents = getStoredArray('evangelism_events');
    localEvents = localEvents.filter(e => e.groupName !== groupName);
    localStorage.setItem('evangelism_events', JSON.stringify(localEvents));

    const cachedGroupIds = JSON.parse(localStorage.getItem('evangelism_group_ids') || '{}');
    delete cachedGroupIds[groupName];
    localStorage.setItem('evangelism_group_ids', JSON.stringify(cachedGroupIds));

    if (activeGroupName === groupName) {
      activeGroupName = null;
    }

    await renderTeam();
    if (currentUser && currentUser.role === 'super_admin') await renderSuperAdminPanel();
  } catch (error) {
    console.warn('Group deletion failed:', error);
    alert('Unable to delete group right now.');
  }
};

async function renderSuperAdminPanel() {
  if (!ensureUserSession()) return;

  const team = await loadTeamDataFromSupabase();
  const allGroupNames = await loadAllGroupsFromSupabase();
  const directorList = document.getElementById('director-list');
  directorList.innerHTML = '';

  if (allGroupNames.length === 0) {
    directorList.innerHTML = '<li class="empty-state">No groups created yet.</li>';
    return;
  }

  allGroupNames.forEach(groupName => {
    const director = team.find(m => m.groupName === groupName && (m.role === 'director' || m.role === 'super_admin'));
    const membersCount = team.filter(m => m.groupName === groupName).length;

    const li = document.createElement('li');
    li.className = 'log-item';
    li.style.cursor = 'pointer';
    li.title = `Open ${groupName} as director view`;
    const isActive = currentUser.role === 'super_admin' && activeGroupName === groupName;

    const headerDiv = document.createElement('div');
    headerDiv.className = 'log-item-header';

    if (director) {
      const roleLabel = director.role === 'super_admin' ? 'System Admin & Director' : 'Director';
      headerDiv.innerHTML = `
        <span class="log-item-title">${escapeHtml(director.name)} (${roleLabel})</span>
        <span class="badge group-tag">${escapeHtml(groupName)}</span>
      `;
    } else {
      headerDiv.innerHTML = `
        <span class="log-item-title" style="color: var(--text-muted); font-style: italic;">No Director Assigned</span>
        <span class="badge group-tag">${escapeHtml(groupName)}</span>
      `;
    }
    li.appendChild(headerDiv);

    const notesP = document.createElement('p');
    notesP.className = 'log-item-notes';
    notesP.textContent = director ? `${director.email} | ${membersCount} member(s)` : `${membersCount} member(s)`;
    li.appendChild(notesP);

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'log-actions';

    const btnOpen = document.createElement('button');
    btnOpen.className = 'btn-action edit';
    btnOpen.textContent = isActive ? 'Active Group' : 'Open Group';
    btnOpen.onclick = (e) => {
      e.stopPropagation();
      setActiveGroupContext(groupName);
    };
    actionsDiv.appendChild(btnOpen);

    if (director) {
      const btnEdit = document.createElement('button');
      btnEdit.className = 'btn-action edit';
      btnEdit.textContent = 'Edit Director';
      btnEdit.onclick = (e) => {
        e.stopPropagation();
        openEditUserModal(director.id);
      };
      actionsDiv.appendChild(btnEdit);

      const btnDelete = document.createElement('button');
      btnDelete.className = 'btn-action delete';
      btnDelete.textContent = 'Remove Director';
      btnDelete.onclick = (e) => {
        e.stopPropagation();
        deleteUser(director.id);
      };
      actionsDiv.appendChild(btnDelete);
    } else {
      const btnAppoint = document.createElement('button');
      btnAppoint.className = 'btn-action edit';
      btnAppoint.textContent = 'Appoint Director';
      btnAppoint.onclick = (e) => {
        e.stopPropagation();
        prefillAppointDirector(groupName);
      };
      actionsDiv.appendChild(btnAppoint);

      const btnDeleteGrp = document.createElement('button');
      btnDeleteGrp.className = 'btn-action delete';
      btnDeleteGrp.textContent = 'Delete Group';
      btnDeleteGrp.onclick = (e) => {
        e.stopPropagation();
        deleteGroupOnly(groupName);
      };
      actionsDiv.appendChild(btnDeleteGrp);
    }

    li.appendChild(actionsDiv);

    li.addEventListener('click', (event) => {
      if (event.target.closest('button')) return;
      setActiveGroupContext(groupName);
    });

    directorList.appendChild(li);
  });
}

// --- USER EDIT & DELETE MODAL (SUPER ADMIN & DIRECTORS) ---
window.openEditUserModal = async function(userId) {
  const team = await loadTeamDataFromSupabase();
  const u = team.find(m => m.id === userId);
  if (!u) return;

  if (!canManageUser(u)) {
    alert('You do not have permission to edit this account.');
    return;
  }

  document.getElementById('edit-user-id').value = u.id;
  document.getElementById('edit-user-name').value = u.name;
  document.getElementById('edit-user-email').value = u.email;
  document.getElementById('edit-user-role').value = u.role;
  document.getElementById('edit-user-role').disabled = currentUser.role === 'admin';
  document.getElementById('edit-user-group').value = u.groupName || '';
  document.getElementById('edit-user-group').disabled = currentUser.role !== 'super_admin';

  document.getElementById('edit-user-modal').classList.add('active');
};

document.getElementById('close-user-modal-btn').addEventListener('click', () => {
  document.getElementById('edit-user-modal').classList.remove('active');
});

document.getElementById('edit-user-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const uId = document.getElementById('edit-user-id').value;
  const updatedName = document.getElementById('edit-user-name').value.trim();
  const updatedEmail = document.getElementById('edit-user-email').value.trim();
  const updatedRole = document.getElementById('edit-user-role').value;
  const updatedGroupName = document.getElementById('edit-user-group').value.trim();

  if (!uId || !updatedName || !updatedEmail) {
    alert('Please complete the user name and email.');
    return;
  }

  const team = await loadTeamDataFromSupabase();
  const targetUser = team.find(m => m.id === uId);
  if (!targetUser || !canManageUser(targetUser)) {
    alert('You do not have permission to edit this account.');
    return;
  }

  if (currentUser.role === 'director' && !['member', 'admin'].includes(updatedRole)) {
    alert('A director can only manage members and admins in their group.');
    return;
  }

  if (currentUser.role === 'admin' && updatedRole !== targetUser.role) {
    alert('Administrators cannot change a member’s role.');
    return;
  }

  if (currentUser.role !== 'super_admin' && updatedGroupName !== targetUser.groupName) {
    alert('Only the System Admin can move a member to a different team.');
    return;
  }

  const supabase = window.getSupabaseClient ? window.getSupabaseClient() : null;

  try {
    let groupId = null;
    if (supabase && updatedGroupName) {
      let { data: groupRows } = await supabase
        .from('groups')
        .select('id')
        .eq('name', updatedGroupName)
        .limit(1);

      if (!groupRows || !groupRows.length) {
        const { data: insertedGroup, error: insertGroupError } = await supabase
          .from('groups')
          .upsert([{ id: slugifyGroupName(updatedGroupName), name: updatedGroupName }], { onConflict: 'id' })
          .select('id');

        if (insertGroupError) {
          console.warn('Group update failed:', insertGroupError.message);
        } else if (insertedGroup && insertedGroup.length) {
          groupId = insertedGroup[0].id;
        }
      } else {
        groupId = groupRows[0].id;
      }
    }

    const updatedUserPayload = {
      full_name: updatedName,
      email: updatedEmail,
      role: updatedRole,
      group_id: groupId
    };

    if (supabase) {
      const { error: updateError } = await supabase
        .from('users')
        .update(updatedUserPayload)
        .eq('id', uId);

      if (updateError) {
        console.warn('Supabase user update failed:', updateError.message);
      }
    }

    const localTeam = getStoredArray('evangelism_team');
    const index = localTeam.findIndex(m => m.id === uId);
    if (index !== -1) {
      localTeam[index].name = updatedName;
      localTeam[index].email = updatedEmail;
      localTeam[index].role = updatedRole;
      localTeam[index].groupName = updatedGroupName;
      localStorage.setItem('evangelism_team', JSON.stringify(localTeam));
    }

    document.getElementById('edit-user-modal').classList.remove('active');
    await renderTeam();
    if (currentUser && currentUser.role === 'super_admin') await renderSuperAdminPanel();
  } catch (error) {
    console.warn('User edit failed:', error);
    alert('Unable to update this user right now.');
  }
});

window.deleteUser = async function(userId, groupNameToDelete = null) {
  const confirmMsg = groupNameToDelete
    ? `Delete director account and group "${groupNameToDelete}"?`
    : 'Delete this user account?';

  if (!confirm(confirmMsg)) return;

  const team = await loadTeamDataFromSupabase();
  const targetUser = team.find(m => m.id === userId);
  if (!targetUser || !canManageUser(targetUser)) {
    alert('You do not have permission to delete this account.');
    return;
  }

  const supabase = window.getSupabaseClient ? window.getSupabaseClient() : null;

  try {
    if (supabase) {
      const { error: deleteError } = await supabase
        .from('users')
        .delete()
        .eq('id', userId);

      if (deleteError) {
        console.warn('Supabase user delete failed:', deleteError.message);
      }

      if (groupNameToDelete) {
        const { data: groupRows } = await supabase
          .from('groups')
          .select('id')
          .eq('name', groupNameToDelete);

        if (groupRows && groupRows.length) {
          for (const g of groupRows) {
            const { error: groupDeleteError } = await supabase
              .from('groups')
              .delete()
              .eq('id', g.id);

            if (groupDeleteError) {
              console.warn('Supabase group delete failed:', groupDeleteError.message);
            }
          }
        }
      }
    }

    let localTeam = getStoredArray('evangelism_team');
    localTeam = localTeam.filter(m => m.id !== userId);

    if (groupNameToDelete) {
      localTeam = localTeam.filter(m => m.groupName !== groupNameToDelete);

      let localResources = getStoredArray('evangelism_resources');
      localResources = localResources.filter(r => r.groupName !== groupNameToDelete);
      localStorage.setItem('evangelism_resources', JSON.stringify(localResources));

      let localLogs = getStoredArray('evangelism_logs');
      localLogs = localLogs.filter(l => l.groupName !== groupNameToDelete);
      localStorage.setItem('evangelism_logs', JSON.stringify(localLogs));

      let localEvents = getStoredArray('evangelism_events');
      localEvents = localEvents.filter(e => e.groupName !== groupNameToDelete);
      localStorage.setItem('evangelism_events', JSON.stringify(localEvents));

      const cachedGroupIds = JSON.parse(localStorage.getItem('evangelism_group_ids') || '{}');
      delete cachedGroupIds[groupNameToDelete];
      localStorage.setItem('evangelism_group_ids', JSON.stringify(cachedGroupIds));

      if (activeGroupName === groupNameToDelete) {
        activeGroupName = null;
      }
    }

    localStorage.setItem('evangelism_team', JSON.stringify(localTeam));

    await renderTeam();
    if (currentUser && currentUser.role === 'super_admin') await renderSuperAdminPanel();
  } catch (error) {
    console.warn('User deletion failed:', error);
    alert('Unable to delete this user right now.');
  }
};

// --- PASSWORD SETUP MODAL HANDLER (EMAIL LINK REDIRECT) ---
function showPasswordSetupModal() {
  const setModal = document.getElementById('set-password-modal');
  if (setModal) setModal.classList.add('active');
}

function checkPasswordSetupRedirect() {
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  if (hashParams.get('type') === 'recovery') {
    showPasswordSetupModal();
  }
}

checkPasswordSetupRedirect();

const supabaseAuthCheck = window.getSupabaseClient ? window.getSupabaseClient() : null;
if (supabaseAuthCheck) {
  supabaseAuthCheck.auth.onAuthStateChange(async (event, session) => {
    if (event === 'PASSWORD_RECOVERY' && session) showPasswordSetupModal();
  });
}

document.getElementById('set-password-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const newPassword = document.getElementById('new-password').value;
  const confirmPassword = document.getElementById('confirm-new-password').value;

  if (newPassword !== confirmPassword) {
    alert('Passwords do not match. Please check and try again.');
    return;
  }

  if (!window.updateUserPassword) {
    alert('Authentication service is not available.');
    return;
  }

  const result = await window.updateUserPassword(newPassword);
  if (!result.ok) {
    alert('Failed to set password: ' + result.message);
    return;
  }

  const supabase = window.getSupabaseClient ? window.getSupabaseClient() : null;
  if (supabase) {
    try {
      const authUser = await window.getCurrentAuthUser();
      if (authUser && authUser.email) {
        await supabase
          .from('users')
          .update({ auth_user_id: authUser.id })
          .eq('email', authUser.email);
      }
    } catch (err) {
      console.warn('Could not link auth_user_id:', err);
    }
  }

  document.getElementById('set-password-modal').classList.remove('active');
  alert('Your password has been set successfully!');

  if (window.history && window.history.replaceState) {
    window.history.replaceState(null, null, window.location.pathname);
  }

  await restoreSavedSession();
});
