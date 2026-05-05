import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const { email, password } = await request.json();

    if (!email.endsWith('@leadschool.in')) {
      return NextResponse.json({ error: 'Only @leadschool.in emails are allowed for bypass.' }, { status: 400 });
    }

    if (password !== '12345678') {
      return NextResponse.json({ error: 'Invalid bypass password.' }, { status: 400 });
    }

    // Initialize Supabase with SERVICE_ROLE_KEY to perform admin actions
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // 1. Check if user exists using profiles table (more reliable than listUsers)
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('email', email)
      .single();

    if (profileError && profileError.code !== 'PGRST116') { // PGRST116 is "not found"
      throw profileError;
    }

    if (!profile) {
      // 2. Create user if doesn't exist
      const { data: { user: newUser }, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: '12345678',
        email_confirm: true,
        user_metadata: { full_name: email.split('@')[0] }
      });
      if (createError) throw createError;
    } else {
      // 3. Update password just in case it's different
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
        profile.id,
        { password: '12345678', email_confirm: true }
      );
      if (updateError) throw updateError;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Bypass error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
