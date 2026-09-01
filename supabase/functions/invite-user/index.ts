import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const admin = createClient(supabaseUrl, serviceRoleKey);
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: request.headers.get('Authorization') || '' } }
    });

    const { data: { user: inviter } } = await userClient.auth.getUser();
    if (!inviter) throw new Error('You must be signed in to invite a user.');

    const { data: inviterProfile } = await admin
      .from('users')
      .select('role, group_id')
      .eq('auth_user_id', inviter.id)
      .single();
    if (!inviterProfile || !['super_admin', 'director', 'admin'].includes(inviterProfile.role)) {
      throw new Error('You are not allowed to invite users.');
    }

    const { email, fullName, role, groupId, memberId, redirectTo } = await request.json();
    if (!email || !fullName || !role || !groupId || !memberId) {
      throw new Error('Email, name, role, group, and member ID are required.');
    }
    if (inviterProfile.role === 'admin' && role !== 'member') {
      throw new Error('Administrators can only invite members.');
    }
    if (inviterProfile.role !== 'super_admin' && inviterProfile.group_id !== groupId) {
      throw new Error('You can only invite users to your own group.');
    }

    const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
    if (inviteError) throw new Error(inviteError.message);

    const { error: profileError } = await admin.from('users').insert({
      id: memberId,
      auth_user_id: inviteData.user.id,
      full_name: fullName,
      email,
      role,
      group_id: groupId
    });
    if (profileError) {
      await admin.auth.admin.deleteUser(inviteData.user.id);
      throw new Error(profileError.message);
    }

    return new Response(JSON.stringify({ user: inviteData.user }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ message: error instanceof Error ? error.message : 'Invitation failed.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});