import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return response({ ok: false, message: 'Method not allowed.' }, 405);
  }

  const authorization = request.headers.get('Authorization');
  if (!authorization) {
    return response({ ok: false, message: 'Authentication is required.' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return response({ ok: false, message: 'Server authentication configuration is incomplete.' }, 500);
  }

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } }
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: authData, error: authError } = await callerClient.auth.getUser();
  if (authError || !authData.user) {
    return response({ ok: false, message: 'The current session is not valid.' }, 401);
  }

  const { userId } = await request.json();
  if (!userId || typeof userId !== 'string') {
    return response({ ok: false, message: 'A user ID is required.' }, 400);
  }

  const { data: caller, error: callerError } = await adminClient
    .from('users')
    .select('id, role, group_id')
    .eq('auth_user_id', authData.user.id)
    .maybeSingle();
  const { data: target, error: targetError } = await adminClient
    .from('users')
    .select('id, auth_user_id, role, group_id')
    .eq('id', userId)
    .maybeSingle();

  if (callerError || targetError || !caller || !target) {
    return response({ ok: false, message: 'The user account could not be found.' }, 404);
  }

  const sameGroup = caller.group_id && caller.group_id === target.group_id;
  const canDelete = caller.role === 'super_admin'
    || (caller.role === 'director' && sameGroup && ['member', 'admin'].includes(target.role))
    || (caller.role === 'admin' && sameGroup && target.role === 'member');

  if (!canDelete) {
    return response({ ok: false, message: 'You do not have permission to delete this account.' }, 403);
  }

  if (target.auth_user_id) {
    const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(target.auth_user_id);
    if (deleteAuthError) {
      return response({ ok: false, message: `Authentication account could not be deleted: ${deleteAuthError.message}` }, 502);
    }
  }

  const { error: deleteProfileError } = await adminClient
    .from('users')
    .delete()
    .eq('id', userId);
  if (deleteProfileError) {
    return response({ ok: false, message: `User profile could not be deleted: ${deleteProfileError.message}` }, 500);
  }

  return response({ ok: true });
});