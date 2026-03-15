'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import styles from './login.module.css';

const ALLOWED_DOMAIN = 'leadschool.in';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const router = useRouter();
  const supabase = getSupabaseBrowserClient();

  // If a magic link redirects here and establishes a session in the browser,
  // or if the user is already logged in, instantly redirect them to the dashboard.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        router.push('/');
        router.refresh();
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase, router]);

  function validateEmail(email) {
    if (!email || !email.includes('@')) return 'Please enter a valid email address.';
    const domain = email.split('@')[1];
    if (domain !== ALLOWED_DOMAIN) return `Only @${ALLOWED_DOMAIN} emails are allowed.`;
    return '';
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    const validationError = validateEmail(email.trim());
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    const { error: authError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        shouldCreateUser: true,
      },
    });

    setLoading(false);

    if (authError) {
      setError(authError.message);
    } else {
      setSent(true);
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.background}>
        <div className={styles.orb1} />
        <div className={styles.orb2} />
        <div className={styles.orb3} />
      </div>

      <div className={styles.card}>
        <div className={styles.logo}>
          <span className={styles.logoIcon}>📊</span>
        </div>
        <h1 className={styles.title}>LeadSchool PM</h1>
        <p className={styles.subtitle}>Project Management Tool</p>

        {sent ? (
          <div className={styles.sentState}>
            <span className={styles.sentIcon}>✉️</span>
            <h2 className={styles.sentTitle}>Check your email</h2>
            <p className={styles.sentText}>
              We sent a magic link to <strong>{email}</strong>. Click it to sign in.
            </p>
            <button
              className={`btn btn-ghost ${styles.resendBtn}`}
              onClick={() => setSent(false)}
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className={styles.form}>
            <div className="form-group">
              <label htmlFor="email" className="form-label">
                Work Email
              </label>
              <input
                id="email"
                type="email"
                className={`form-input ${error ? 'form-input-error' : ''}`}
                placeholder="you@leadschool.in"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) setError('');
                }}
                disabled={loading}
                autoComplete="email"
                autoFocus
              />
              {error && <p className="form-error">{error}</p>}
              <p className="form-hint">Only @leadschool.in email addresses are allowed.</p>
            </div>

            <button
              type="submit"
              className={`btn btn-primary btn-lg ${styles.submitBtn}`}
              disabled={loading || !email}
            >
              {loading ? (
                <>
                  <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                  Sending...
                </>
              ) : (
                'Send Magic Link'
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
