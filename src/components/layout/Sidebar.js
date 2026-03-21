'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  FolderOpen,
  DollarSign,
  BarChart3,
  AlertTriangle,
  Sparkles,
  LogOut,
} from 'lucide-react';
import styles from './Sidebar.module.css';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/portfolio', label: 'All Projects View', icon: LayoutDashboard },
  { href: '/projects', label: 'Projects', icon: FolderOpen },
  { href: '/budgets', label: 'Budgets', icon: DollarSign },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/chat', label: 'AI Planner', icon: Sparkles },
  { href: '/risks', label: 'Risk Management', icon: AlertTriangle, comingSoon: true },
];

export default function Sidebar({ user }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  const initials = user?.user_metadata?.full_name
    ? user.user_metadata.full_name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : (user?.email?.[0] ?? 'U').toUpperCase();

  return (
    <aside className={styles.sidebar}>
      <div className={styles.logo}>
        <span className={styles.logoIcon}>📊</span>
        <span className={styles.logoText}>LeadSchool PM</span>
      </div>

      <nav className={styles.nav}>
        {NAV_ITEMS.map(({ href, label, icon: Icon, comingSoon }) => {
          const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={comingSoon ? '#' : href}
              className={`${styles.navItem} ${isActive ? styles.navItemActive : ''} ${comingSoon ? styles.navItemDisabled : ''}`}
            >
              <Icon size={18} />
              <span>{label}</span>
              {comingSoon && <span className={styles.comingSoonBadge}>Soon</span>}
            </Link>
          );
        })}
      </nav>

      <div className={styles.footer}>
        <div className={styles.userInfo}>
          <div className={styles.avatar}>{initials}</div>
          <div className={styles.userDetails}>
            <span className={styles.userName}>
              {user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User'}
            </span>
            <span className={styles.userEmail}>{user?.email}</span>
          </div>
        </div>
        <button onClick={handleSignOut} className={styles.signOutBtn} title="Sign out">
          <LogOut size={16} />
        </button>
      </div>
    </aside>
  );
}
