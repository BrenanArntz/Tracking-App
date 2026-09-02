import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

<<<<<<< HEAD
Deno.serve(async (req) => {
  try {
    const { email, redirectTo } = await req.json();

    if (!email || !email.includes('@')) {
      return new Response(JSON.stringify({ ok: false, message: 'Valid email is required.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return new Response(JSON.stringify({ ok: false, message: 'Missing Supabase service credentials.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    });

    const targetUrl = redirectTo || 'https://brenanarntz.github.io/Tracking-App/';

    const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
      redirectTo: targetUrl,
      data: {
        invited: true
      }
    });

    if (error) {
      return new Response(JSON.stringify({ ok: false, message: error.message }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ ok: true, data }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, message: error.message || 'Unexpected server error.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});
=======
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
>>>>>>> parent of 2a0e549 (authentification)
