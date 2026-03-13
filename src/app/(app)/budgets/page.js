import { getSupabaseServerClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { Plus, DollarSign } from 'lucide-react';
import Header from '@/components/layout/Header';
import { formatCurrency } from '@/lib/utils/budget-calculations';
import styles from './budgets.module.css';

export default async function BudgetsPage() {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: budgets } = await supabase
    .from('budgets')
    .select(`
      id,
      name,
      description,
      status,
      total_estimated_budget,
      currency,
      created_at,
      created_by,
      profiles:created_by ( full_name, email ),
      projects ( project_name )
    `)
    .order('created_at', { ascending: false });

  const statusColors = {
    draft:     { cls: 'badge-draft',      label: 'Draft' },
    submitted: { cls: 'badge-submitted',  label: 'Submitted' },
    approved:  { cls: 'badge-approved',   label: 'Approved' },
    rejected:  { cls: 'badge-draft',      label: 'Rejected' },
  };

  return (
    <div>
      <Header
        title="Budgets"
        subtitle="All budget estimations across all projects."
        actions={
          <Link href="/budgets/new" className="btn btn-primary">
            <Plus size={16} />
            New Budget
          </Link>
        }
      />

      {!budgets || budgets.length === 0 ? (
        <div className="empty-state">
          <DollarSign size={48} className="empty-state-icon" />
          <h3 className="empty-state-title">No budgets yet</h3>
          <p className="empty-state-text">
            Create your first budget to start estimating project costs.
          </p>
          <Link href="/budgets/new" className="btn btn-primary">
            <Plus size={16} /> Create Budget
          </Link>
        </div>
      ) : (
        <div className={styles.tableWrapper}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Budget Name</th>
                <th>Project</th>
                <th>Owner</th>
                <th>Status</th>
                <th className="number-cell">Total Budget</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {budgets.map((budget) => {
                const st = statusColors[budget.status] || statusColors.draft;
                const isOwner = budget.created_by === user.id;
                const createdDate = new Date(budget.created_at).toLocaleDateString('en-IN', {
                  day: '2-digit', month: 'short', year: 'numeric',
                });
                return (
                  <tr key={budget.id}>
                    <td>
                      <Link href={`/budgets/${budget.id}`} className={styles.budgetLink}>
                        {budget.name}
                      </Link>
                      {budget.description && (
                        <p className={styles.budgetDesc}>{budget.description}</p>
                      )}
                    </td>
                    <td>{budget.projects?.project_name ?? '—'}</td>
                    <td>
                      {budget.profiles?.full_name || budget.profiles?.email?.split('@')[0] || '—'}
                      {isOwner && <span className={styles.youTag}> (you)</span>}
                    </td>
                    <td>
                      <span className={`badge ${st.cls}`}>{st.label}</span>
                    </td>
                    <td className="number-cell">
                      {formatCurrency(budget.total_estimated_budget, budget.currency)}
                    </td>
                    <td>{createdDate}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
