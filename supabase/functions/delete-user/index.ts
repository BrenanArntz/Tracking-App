import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization) return jsonResponse({ error: 'Authentication is required.' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse({ error: 'Supabase function environment is not configured.' }, 500);
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } }
    });
    const { data: authData, error: authError } = await callerClient.auth.getUser();
    if (authError || !authData.user) return jsonResponse({ error: 'The session is invalid.' }, 401);

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: callerProfile, error: callerProfileError } = await adminClient
      .from('users')
      .select('id, role, group_id')
      .or(`auth_user_id.eq.${authData.user.id},email.eq.${authData.user.email}`)
      .limit(1)
      .maybeSingle();
    if (callerProfileError || !callerProfile) {
      return jsonResponse({ error: 'The current user profile could not be found.' }, 403);
    }

    const requestBody = await request.json();
    const targetUserId = String(requestBody.userId || '');
    if (!targetUserId) return jsonResponse({ error: 'A user ID is required.' }, 400);

    const { data: targetProfile, error: targetProfileError } = await adminClient
      .from('users')
      .select('id, role, group_id, email, auth_user_id')
      .eq('id', targetUserId)
      .maybeSingle();
    if (targetProfileError || !targetProfile) return jsonResponse({ error: 'The target user was not found.' }, 404);

    const canDelete = callerProfile.role === 'super_admin'
      || (callerProfile.group_id === targetProfile.group_id
        && callerProfile.role === 'director'
        && ['member', 'admin'].includes(targetProfile.role))
      || (callerProfile.group_id === targetProfile.group_id
        && callerProfile.role === 'admin'
        && targetProfile.role === 'member');
    if (!canDelete) return jsonResponse({ error: 'You do not have permission to delete this user.' }, 403);

    let authUserId = targetProfile.auth_user_id;
    if (!authUserId && targetProfile.email) {
      const { data: usersPage, error: listError } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (listError) return jsonResponse({ error: listError.message }, 500);
      const matchingUser = usersPage.users.find(user => user.email?.toLowerCase() === targetProfile.email.toLowerCase());
      authUserId = matchingUser?.id || null;
    }

    if (authUserId) {
      const { error: authDeleteError } = await adminClient.auth.admin.deleteUser(authUserId);
      if (authDeleteError) return jsonResponse({ error: authDeleteError.message }, 500);
    }

    const { error: profileDeleteError } = await adminClient
      .from('users')
      .delete()
      .eq('id', targetUserId);
    if (profileDeleteError) return jsonResponse({ error: profileDeleteError.message }, 500);

    return jsonResponse({ ok: true });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unexpected delete failure.' }, 500);
  }
});
