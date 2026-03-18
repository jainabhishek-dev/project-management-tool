import { getSupabaseServerClient } from '@/lib/supabase/server';
import Header from '@/components/layout/Header';
import { FolderOpen, TrendingUp, AlertTriangle, CheckCircle2 } from 'lucide-react';
import styles from './portfolio.module.css';
import Link from 'next/link';
import { formatCurrency } from '@/lib/utils/budget-calculations';

export default async function PortfolioViewPage() {
  const supabase = await getSupabaseServerClient();
  
  const { data: projects } = await supabase
    .from('projects')
    .select(`
      *,
      budgets ( total_estimated_budget, status ),
      project_plans ( id, type )
    `)
    .order('created_at', { ascending: false });

  // Calculate aggregated stats
  const totalProjects = projects?.length || 0;
  const totalApprovedBudget = projects?.reduce((sum, p) => {
    const approved = (p.budgets || [])
      .filter(b => b.status === 'approved')
      .reduce((s, b) => s + parseFloat(b.total_estimated_budget || 0), 0);
    return sum + approved;
  }, 0);

  const totalPlans = projects?.reduce((sum, p) => sum + (p.project_plans?.length || 0), 0);

  return (
    <div>
      <Header
        title="Portfolio Overview"
        subtitle="All projects and workstreams in a single view."
      />

      <div className="stats-grid">
        <div className="stat-card">
          <p className="stat-label">Total Portfolio</p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <p className="stat-value">{totalProjects}</p>
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Projects</span>
          </div>
        </div>
        <div className="stat-card">
          <p className="stat-label">Approved Budget</p>
          <p className="stat-value" style={{ color: 'var(--color-success)' }}>
            {formatCurrency(totalApprovedBudget)}
          </p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Active Workstreams</p>
          <p className="stat-value">{totalPlans}</p>
        </div>
      </div>

      <div className="glass-card">
        <table className="data-table">
          <thead>
            <tr>
              <th>Project Name</th>
              <th>Academic Year</th>
              <th>Status</th>
              <th>Budgets</th>
              <th>Plans</th>
              <th className="number-cell">Approved Budget</th>
            </tr>
          </thead>
          <tbody>
            {(projects || []).map(p => {
              const approved = (p.budgets || [])
                .filter(b => b.status === 'approved')
                .reduce((s, b) => s + parseFloat(b.total_estimated_budget || 0), 0);
              
              return (
                <tr key={p.id}>
                  <td>
                    <Link href={`/projects/${p.id}`} style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
                      {p.project_name}
                    </Link>
                  </td>
                  <td>{p.academic_year || '—'}</td>
                  <td>
                    <span className={`badge ${p.status === 'active' ? 'badge-submitted' : 'badge-draft'}`}>
                      {p.status}
                    </span>
                  </td>
                  <td>{p.budgets?.length || 0}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {(p.project_plans || []).map(plan => (
                        <span key={plan.id} className={styles.planBadge} title={plan.type}>
                          {plan.type[0]}
                        </span>
                      ))}
                      {(!p.project_plans || p.project_plans.length === 0) && '—'}
                    </div>
                  </td>
                  <td className="number-cell" style={{ fontWeight: 600 }}>
                    {formatCurrency(approved)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
