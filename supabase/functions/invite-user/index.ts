import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
