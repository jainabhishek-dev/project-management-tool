import { getSupabaseServerClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { formatCurrency } from '@/lib/utils/budget-calculations';
import { Plus, FolderOpen, DollarSign, TrendingUp } from 'lucide-react';
import Header from '@/components/layout/Header';
import styles from './dashboard.module.css';

export default async function DashboardPage() {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: projects }, { data: budgets }, { data: profile }] = await Promise.all([
    supabase.from('projects').select('id').eq('created_by', user.id),
    supabase.from('budgets').select('total_estimated_budget, created_by, status').eq('created_by', user.id),
    supabase.from('profiles').select('full_name').eq('id', user.id).single(),
  ]);

  const { data: allBudgets } = await supabase
    .from('budgets')
    .select('total_estimated_budget')
    .eq('status', 'approved');

  const myBudgetTotal = (budgets || []).reduce(
    (sum, b) => sum + (parseFloat(b.total_estimated_budget) || 0), 0
  );
  const orgBudgetTotal = (allBudgets || []).reduce(
    (sum, b) => sum + (parseFloat(b.total_estimated_budget) || 0), 0
  );

  const firstName = profile?.full_name?.split(' ')[0] ||
    user?.email?.split('@')[0] || 'there';

  return (
    <div>
      <Header
        title={`Hello, ${firstName} 👋`}
        subtitle="Here's an overview of your project activity."
      />

      <div className="stats-grid">
        <div className="stat-card">
          <p className="stat-label">My Projects</p>
          <p className="stat-value">{projects?.length ?? 0}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">My Budgets</p>
          <p className="stat-value">{budgets?.length ?? 0}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">My Total Budget</p>
          <p className="stat-value" style={{ fontSize: '1.5rem' }}>
            {formatCurrency(myBudgetTotal)}
          </p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Org Approved Budget</p>
          <p className="stat-value" style={{ fontSize: '1.5rem' }}>
            {formatCurrency(orgBudgetTotal)}
          </p>
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
