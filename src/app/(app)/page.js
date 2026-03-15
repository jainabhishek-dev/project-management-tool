import { getSupabaseServerClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { formatCurrency } from '@/lib/utils/budget-calculations';
import { Plus, FolderOpen, DollarSign, TrendingUp, User, Globe } from 'lucide-react';
import Header from '@/components/layout/Header';
import styles from './dashboard.module.css';

export default async function DashboardPage() {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [
    { data: myProjects }, 
    { data: myBudgets }, 
    { data: profile },
    { count: allProjectsCount },
    { data: allBudgetsRaw }
  ] = await Promise.all([
    supabase.from('projects').select('id').eq('created_by', user.id),
    supabase.from('budgets').select('total_estimated_budget').eq('created_by', user.id),
    supabase.from('profiles').select('full_name').eq('id', user.id).single(),
    supabase.from('projects').select('id', { count: 'exact', head: true }),
    supabase.from('budgets').select('total_estimated_budget, status')
  ]);

  // Personal Totals
  const myBudgetTotal = (myBudgets || []).reduce(
    (sum, b) => sum + (parseFloat(b.total_estimated_budget) || 0), 0
  );

  // Org Totals
  const allBudgetsCount = allBudgetsRaw?.length || 0;
  const orgTotalBudget = (allBudgetsRaw || []).reduce(
    (sum, b) => sum + (parseFloat(b.total_estimated_budget) || 0), 0
  );
  const orgApprovedBudget = (allBudgetsRaw || [])
    .filter(b => b.status === 'approved')
    .reduce((sum, b) => sum + (parseFloat(b.total_estimated_budget) || 0), 0);

  const firstName = profile?.full_name?.split(' ')[0] ||
    user?.email?.split('@')[0] || 'there';

  return (
    <div>
      <Header
        title={`Hello, ${firstName} 👋`}
        subtitle="Here's an overview of your project activity."
      />

      {/* Personal Activity Section */}
      <div className={styles.statsSection}>
        <div className={styles.statsHeader}>
          <User size={20} className={styles.statsIcon} />
          <h2 className={styles.sectionTitle} style={{ marginBottom: 0 }}>Personal Activity</h2>
        </div>
        <div className="stats-grid">
          <div className="stat-card">
            <p className="stat-label">My Projects</p>
            <p className="stat-value">{myProjects?.length ?? 0}</p>
          </div>
          <div className="stat-card">
            <p className="stat-label">My Budgets</p>
            <p className="stat-value">{myBudgets?.length ?? 0}</p>
          </div>
          <div className="stat-card">
            <p className="stat-label">My Total Budget</p>
            <p className="stat-value" style={{ fontSize: '1.5rem' }}>
              {formatCurrency(myBudgetTotal)}
            </p>
          </div>
        </div>
      </div>

      {/* Organization Activity Section */}
      <div className={styles.statsSection}>
        <div className={styles.statsHeader}>
          <Globe size={20} className={styles.statsIcon} />
          <h2 className={styles.sectionTitle} style={{ marginBottom: 0 }}>Organization Activity</h2>
        </div>
        <div className="stats-grid">
          <div className="stat-card">
            <p className="stat-label">All Projects</p>
            <p className="stat-value">{allProjectsCount ?? 0}</p>
          </div>
          <div className="stat-card">
            <p className="stat-label">All Budgets</p>
            <p className="stat-value">{allBudgetsCount}</p>
          </div>
          <div className="stat-card" style={{ background: 'var(--color-bg-card-hover)', borderColor: 'var(--color-primary-dim)' }}>
            <p className="stat-label">Overall Total Budget</p>
            <p className="stat-value" style={{ fontSize: '1.5rem', color: 'var(--color-primary)' }}>
              {formatCurrency(orgTotalBudget)}
            </p>
          </div>
          <div className="stat-card">
            <p className="stat-label">Org Approved Budget</p>
            <p className="stat-value" style={{ fontSize: '1.5rem', color: 'var(--color-success)' }}>
              {formatCurrency(orgApprovedBudget)}
            </p>
          </div>
        </div>
      </div>

      <div className={styles.quickActions}>
        <h2 className={styles.sectionTitle}>Quick Actions</h2>
        <div className={styles.actionGrid}>
          <Link href="/projects/new" className={styles.actionCard}>
            <div className={styles.actionIcon} style={{ background: 'rgba(99,102,241,0.15)', color: '#6366f1' }}>
              <FolderOpen size={24} />
            </div>
            <div>
              <h3 className={styles.actionTitle}>New Project</h3>
              <p className={styles.actionDesc}>Create a new project to track work</p>
            </div>
          </Link>
          <Link href="/budgets/new" className={styles.actionCard}>
            <div className={styles.actionIcon} style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>
              <DollarSign size={24} />
            </div>
            <div>
              <h3 className={styles.actionTitle}>New Budget</h3>
              <p className={styles.actionDesc}>Create a budget estimation for a project</p>
            </div>
          </Link>
          <Link href="/analytics" className={styles.actionCard}>
            <div className={styles.actionIcon} style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>
              <TrendingUp size={24} />
            </div>
            <div>
              <h3 className={styles.actionTitle}>Analytics</h3>
              <p className={styles.actionDesc}>View budget breakdowns and trends</p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
