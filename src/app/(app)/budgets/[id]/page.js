import { getSupabaseServerClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { formatCurrency, formatNumber } from '@/lib/utils/budget-calculations';
import Header from '@/components/layout/Header';
import BudgetStatusManager from '@/components/BudgetStatusManager';
import { isAdmin } from '@/lib/utils/admin';
import DeleteButton from '@/components/ui/DeleteButton';
import styles from './budget-detail.module.css';

export default async function BudgetDetailPage({ params }) {
  const { id } = await params;
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: budget } = await supabase
    .from('budgets')
    .select(`
      *,
      projects ( project_name ),
      profiles:created_by ( full_name, email ),
      budget_roles ( id, name, cost_per_month, display_order ),
      budget_sections (
        id, name, display_order, subtotal,
        budget_line_items (
          id, name, description, unit_of_calculation, number_of_units, line_total, display_order,
          budget_norms ( id, norms_per_unit, total_mandays, total_cost, role_id )
        )
      )
    `)
    .eq('id', id)
    .single();

  if (!budget) notFound();

  const roles = [...(budget.budget_roles || [])].sort((a, b) => a.display_order - b.display_order);
  const sections = [...(budget.budget_sections || [])].sort((a, b) => a.display_order - b.display_order);
  sections.forEach((s) => {
    s.budget_line_items = [...(s.budget_line_items || [])].sort((a, b) => a.display_order - b.display_order);
  });

  const isOwner = budget.created_by === user.id;
  const statusColors = {
    draft: 'badge-draft', submitted: 'badge-submitted',
    approved: 'badge-approved', rejected: 'badge-draft',
  };

  const ownerName = budget.profiles?.full_name || budget.profiles?.email?.split('@')[0] || 'Unknown';
  const createdDate = new Date(budget.created_at).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'long', year: 'numeric',
  });

  const isUserAdmin = isAdmin(user?.email);

  return (
    <div>
      <Header
        title={budget.name}
        subtitle={`${budget.projects?.project_name || ''} · Created by ${ownerName} on ${createdDate}`}
        actions={
          <div style={{ display: 'flex', gap: '8px' }}>
            <DeleteButton type="budget" id={budget.id} isAdmin={isUserAdmin} onSuccessRedirect={`/projects/${budget.project_id}`} />
            {isOwner && (
              <Link href={`/budgets/${id}/edit`} className="btn btn-secondary">
                Edit Budget
              </Link>
            )}
          </div>
        }
      />

      {/* Summary cards */}
      <div className="stats-grid" style={{ marginBottom: 'var(--space-8)' }}>
        <div className="stat-card">
          <p className="stat-label">Total Budget</p>
          <p className="stat-value" style={{ fontSize: '1.5rem' }}>
            {formatCurrency(budget.total_estimated_budget, budget.currency)}
          </p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Status</p>
          <div className="stat-value" style={{ fontSize: '1rem', marginTop: 6, display: 'flex' }}>
            <BudgetStatusManager budgetId={budget.id} initialStatus={budget.status} isOwner={isOwner} />
          </div>
        </div>
        <div className="stat-card">
          <p className="stat-label">Sections</p>
          <p className="stat-value">{sections.length}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Working Days / Month</p>
          <p className="stat-value">{budget.working_days_per_month}</p>
        </div>
      </div>

      {/* Roles table */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Roles & Costs</h2>
        <div className={styles.tableWrapper}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Role</th>
                <th className="number-cell">Monthly Cost</th>
                <th className="number-cell">Daily Rate</th>
              </tr>
            </thead>
            <tbody>
              {roles.map((role) => (
                <tr key={role.id}>
                  <td>{role.name}</td>
                  <td className="number-cell">{formatCurrency(role.cost_per_month, budget.currency)}</td>
                  <td className="number-cell">
                    {formatCurrency(role.cost_per_month / budget.working_days_per_month, budget.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Budget breakdown by section */}
      {sections.map((section) => (
        <div key={section.id} className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>{section.name}</h2>
            <span className={styles.sectionTotal}>
              {formatCurrency(section.subtotal, budget.currency)}
            </span>
          </div>
          <div className={styles.tableWrapper} style={{ marginBottom: '2rem' }}>
            <h3 style={{ fontSize: '1rem', marginBottom: '1rem', color: 'var(--color-text-secondary)' }}>A. Norms (in mandays)</h3>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Step / Task</th>
                  <th>Unit</th>
                  {roles.map((r) => (
                    <th key={r.id} className="number-cell">
                      {r.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {section.budget_line_items.map((li) => {
                  const normsByRole = {};
                  (li.budget_norms || []).forEach((n) => { normsByRole[n.role_id] = n; });
                  return (
                    <tr key={`mandays-${li.id}`}>
                      <td>
                        <span className={styles.lineItemName}>{li.name}</span>
                        {li.description && <p className={styles.lineItemDesc}>{li.description}</p>}
                      </td>
                      <td>{li.unit_of_calculation || '—'}</td>
                      {roles.map((r) => {
                        const norm = normsByRole[r.id];
                        return (
                          <td key={r.id} className="number-cell">
                            {norm ? formatNumber(norm.norms_per_unit) : '—'}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className={styles.tableWrapper}>
            <h3 style={{ fontSize: '1rem', marginBottom: '1rem', color: 'var(--color-text-secondary)' }}>B. Estimated Cost</h3>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Step / Task</th>
                  <th>Unit</th>
                  <th className="number-cell"># Units</th>
                  {roles.map((r) => (
                    <th key={`cost-${r.id}`} className="number-cell">
                      {r.name}
                    </th>
                  ))}
                  <th className="number-cell">Line Total</th>
                </tr>
              </thead>
              <tbody>
                {section.budget_line_items.map((li) => {
                  const normsByRole = {};
                  (li.budget_norms || []).forEach((n) => { normsByRole[n.role_id] = n; });
                  return (
                    <tr key={`cost-${li.id}`}>
                      <td>
                        <span className={styles.lineItemName}>{li.name}</span>
                      </td>
                      <td>{li.unit_of_calculation || '—'}</td>
                      <td className="number-cell">{formatNumber(li.number_of_units)}</td>
                      {roles.map((r) => {
                        const norm = normsByRole[r.id];
                        return (
                          <td key={`cost-${r.id}`} className="number-cell">
                            {norm ? formatCurrency(norm.total_cost, budget.currency) : '—'}
                          </td>
                        );
                      })}
                      <td className="number-cell">
                        <strong>{formatCurrency(li.line_total, budget.currency)}</strong>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className={styles.totalRow}>
                  <td colSpan={3 + roles.length}>Section Total</td>
                  <td className="number-cell">
                    <strong>{formatCurrency(section.subtotal, budget.currency)}</strong>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ))}

      {/* Grand total */}
      <div className={styles.grandTotal}>
        <span>Total Estimated Budget</span>
        <span className={styles.grandTotalAmount}>
          {formatCurrency(budget.total_estimated_budget, budget.currency)}
        </span>
      </div>
    </div>
  );
}
