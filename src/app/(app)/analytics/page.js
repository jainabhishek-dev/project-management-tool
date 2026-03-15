import { getSupabaseServerClient } from '@/lib/supabase/server';
import { formatCurrency } from '@/lib/utils/budget-calculations';
import Header from '@/components/layout/Header';
import ProjectBreakdown from '@/components/charts/ProjectBreakdown';
import RoleBreakdown from '@/components/charts/RoleBreakdown';
import TopCostlyTasks from '@/components/analytics/TopCostlyTasks';
import YearFilter from '@/components/ui/YearFilter';
import styles from './analytics.module.css';

export default async function AnalyticsPage({ searchParams }) {
  const resolvedParams = await Promise.resolve(searchParams);
  const selectedAy = resolvedParams?.ay;
  
  const supabase = await getSupabaseServerClient();

  const { data: budgets, error } = await supabase
    .from('budgets')
    .select(`
      id, name, status, total_estimated_budget, currency, created_at,
      projects ( project_name, academic_year ),
      profiles:created_by ( full_name, email ),
      budget_sections ( 
        subtotal, 
        name,
        budget_line_items (
          name, 
          line_total,
          budget_norms ( role_id, total_cost )
        )
      ),
      budget_roles ( id, name )
    `)
    .order('total_estimated_budget', { ascending: false });

  if (error) {
    console.error('Error fetching analytics budgets:', error);
  }

  const allBudgets = budgets || [];
  const filteredBudgets = selectedAy && selectedAy !== 'All' 
    ? allBudgets.filter(b => b.projects?.academic_year === selectedAy)
    : allBudgets;

  const total = filteredBudgets.reduce(
    (sum, b) => sum + (parseFloat(b.total_estimated_budget) || 0), 0
  );

  const approved = filteredBudgets
    .filter((b) => b.status === 'approved')
    .reduce((sum, b) => sum + (parseFloat(b.total_estimated_budget) || 0), 0);

  const byStatus = filteredBudgets.reduce((acc, b) => {
    acc[b.status] = (acc[b.status] || 0) + 1;
    return acc;
  }, {});

  const statusColors = {
    draft: '#6b6b80', submitted: '#3b82f6',
    approved: '#22c55e', rejected: '#ef4444',
  };

  return (
    <div>
      <Header
        title="Analytics"
        subtitle="Budget overview and breakdowns across the organisation."
        actions={<YearFilter />}
      />

      <div className="stats-grid">
        <div className="stat-card">
          <p className="stat-label">All Budgets</p>
          <p className="stat-value">{filteredBudgets.length}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Total Value</p>
          <p className="stat-value" style={{ fontSize: '1.4rem' }}>
            {formatCurrency(total)}
          </p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Approved Budget</p>
          <p className="stat-value" style={{ fontSize: '1.4rem', color: 'var(--color-success)' }}>
            {formatCurrency(approved)}
          </p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Status Breakdown</p>
          <div className={styles.statusBreakdown}>
            {Object.entries(byStatus).map(([status, count]) => (
              <div key={status} className={styles.statusRow}>
                <span
                  className={styles.statusDot}
                  style={{ background: statusColors[status] || '#6b6b80' }}
                />
                <span className={styles.statusName}>{status}</span>
                <span className={styles.statusCount}>{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Visual Analytics */}
      <div className={styles.chartsContainer}>
        <div className={styles.chartCard}>
          <h3 className={styles.chartTitle}>Budget by Project</h3>
          <ProjectBreakdown budgets={filteredBudgets} />
        </div>
        <div className={styles.chartCard}>
          <h3 className={styles.chartTitle}>Budget by Role</h3>
          <RoleBreakdown budgets={filteredBudgets} />
        </div>
      </div>

      {/* Deep Dive Section */}
      <TopCostlyTasks budgets={filteredBudgets} />

      {/* Budget value table */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Budgets by Value</h2>
        <div className={styles.tableWrapper}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Budget</th>
                <th>Project</th>
                <th>Owner</th>
                <th>Status</th>
                <th className="number-cell">Amount</th>
                <th className="number-cell">% of Total</th>
              </tr>
            </thead>
            <tbody>
              {filteredBudgets.map((b) => {
                const pct = total > 0 ? ((b.total_estimated_budget / total) * 100).toFixed(1) : 0;
                return (
                  <tr key={b.id}>
                    <td>
                      <a href={`/budgets/${b.id}`} className={styles.link}>
                        {b.name}
                      </a>
                    </td>
                    <td>{b.projects?.project_name || '—'}</td>
                    <td>
                      {b.profiles?.full_name || b.profiles?.email?.split('@')[0] || '—'}
                    </td>
                    <td>
                      <span
                        className="badge"
                        style={{
                          background: `${statusColors[b.status]}22`,
                          color: statusColors[b.status] || 'var(--color-text-muted)',
                        }}
                      >
                        {b.status}
                      </span>
                    </td>
                    <td className="number-cell">
                      {formatCurrency(b.total_estimated_budget, b.currency)}
                    </td>
                    <td className="number-cell">
                      <div className={styles.pctCell}>
                        <div
                          className={styles.pctBar}
                          style={{ width: `${pct}%` }}
                        />
                        <span>{pct}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
