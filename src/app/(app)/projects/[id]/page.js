import { getSupabaseServerClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import Header from '@/components/layout/Header';
import { formatCurrency } from '@/lib/utils/budget-calculations';
import { isAdmin } from '@/lib/utils/admin';
import DeleteButton from '@/components/ui/DeleteButton';
import styles from './project-detail.module.css';

export default async function ProjectDetailPage({ params }) {
  const { id } = await params;
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: project } = await supabase
    .from('projects')
    .select(`
      *,
      profiles:created_by ( full_name, email ),
      budgets (
        id, name, status, total_estimated_budget, currency, created_at,
        profiles:created_by ( full_name, email )
      ),
      project_plans (
        id, name, type, start_date, target_end_date, created_at
      )
    `)
    .eq('id', id)
    .single();

  if (!project) notFound();

  const isOwner = project.created_by === user.id;
  const budgets = [...(project.budgets || [])].sort(
    (a, b) => new Date(b.created_at) - new Date(a.created_at)
  );
  const plans = [...(project.project_plans || [])].sort(
    (a, b) => new Date(b.created_at) - new Date(a.created_at)
  );

  const totalBudget = budgets.reduce(
    (sum, b) => sum + (parseFloat(b.total_estimated_budget) || 0), 0
  );

  const statusColors = {
    draft: 'badge-draft', submitted: 'badge-submitted',
    approved: 'badge-approved', rejected: 'badge-draft',
  };

  const ownerName = project.profiles?.full_name ||
    project.profiles?.email?.split('@')[0] || 'Unknown';

  const isUserAdmin = isAdmin(user?.email);

  return (
    <div>
      <Header
        title={project.project_name}
        subtitle={`${project.academic_year ? project.academic_year + ' · ' : ''}${project.status.replace('_', ' ')} · Owned by ${ownerName}`}
        actions={
          <div style={{ display: 'flex', gap: '8px' }}>
            <DeleteButton type="project" id={project.id} isAdmin={isUserAdmin} onSuccessRedirect="/projects" />
            <Link href={`/projects/${id}/plans/new`} className="btn btn-info">
              <Plus size={16} /> New Plan
            </Link>
            <Link href={`/budgets/new?project_id=${project.id}`} className="btn btn-primary">
              <Plus size={16} /> New Budget
            </Link>
          </div>
        }
      />

      <div className="stats-grid">
        <div className="stat-card">
          <p className="stat-label">Total Budgets</p>
          <p className="stat-value">{budgets.length}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Project Plans</p>
          <p className="stat-value">{plans.length}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Combined Budget</p>
          <p className="stat-value" style={{ fontSize: '1.4rem' }}>
            {formatCurrency(totalBudget)}
          </p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Approved Budgets</p>
          <p className="stat-value">
            {budgets.filter((b) => b.status === 'approved').length}
          </p>
        </div>
      </div>

      {project.description && (
        <div className={styles.descCard}>
          <p>{project.description}</p>
        </div>
      )}

      {/* PROJECT PLANS SECTION */}
      <h2 className={styles.sectionTitle}>Project Plans</h2>
      {plans.length === 0 ? (
        <div className="empty-state" style={{ padding: '48px 0', marginBottom: '32px' }}>
          <p className="empty-state-title">No plans yet</p>
          <p className="empty-state-text">Create a project plan for Print or Digital streams.</p>
          <Link href={`/projects/${id}/plans/new`} className="btn btn-primary">
            <Plus size={16} /> Create Plan
          </Link>
        </div>
      ) : (
        <div className={styles.tableWrapper} style={{ marginBottom: '32px' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Plan Name</th>
                <th>Type</th>
                <th>Start Date</th>
                <th>Target End Date</th>
                <th>Created</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link href={`/projects/${id}/plans/${p.id}`} className={styles.budgetLink}>
                      {p.name}
                    </Link>
                  </td>
                  <td>
                    <span className="badge badge-submitted">{p.type}</span>
                  </td>
                  <td>
                    {format(parseISO(p.start_date), 'dd MMM yyyy')}
                  </td>
                  <td>
                    {p.target_end_date ? format(parseISO(p.target_end_date), 'dd MMM yyyy') : '—'}
                  </td>
                  <td>
                    {format(new Date(p.created_at), 'dd MMM yyyy')}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <DeleteButton type="plan" id={p.id} isAdmin={isUserAdmin} onSuccessRefresh />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className={styles.sectionTitle}>Budgets</h2>

      {budgets.length === 0 ? (
        <div className="empty-state" style={{ padding: '48px 0' }}>
          <p className="empty-state-title">No budgets yet</p>
          <p className="empty-state-text">Create a budget estimation for this project.</p>
          <Link href={`/budgets/new?project_id=${project.id}`} className="btn btn-primary">
            <Plus size={16} /> Create Budget
          </Link>
        </div>
      ) : (
        <div className={styles.tableWrapper}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Budget Name</th>
                <th>Status</th>
                <th>Owner</th>
                <th className="number-cell">Total</th>
                <th>Created</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {budgets.map((b) => (
                <tr key={b.id}>
                  <td>
                    <Link href={`/budgets/${b.id}`} className={styles.budgetLink}>
                      {b.name}
                    </Link>
                  </td>
                  <td>
                    <span className={`badge ${statusColors[b.status] || 'badge-draft'}`}>
                      {b.status}
                    </span>
                  </td>
                  <td>
                    {b.profiles?.full_name || b.profiles?.email?.split('@')[0] || '—'}
                    {b.created_by === user.id && (
                      <span style={{ color: 'var(--color-accent)', marginLeft: 4 }}>(you)</span>
                    )}
                  </td>
                  <td className="number-cell">
                    {formatCurrency(b.total_estimated_budget, b.currency)}
                  </td>
                  <td>
                    {new Date(b.created_at).toLocaleDateString('en-IN', {
                      day: '2-digit', month: 'short', year: 'numeric',
                    })}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <DeleteButton type="budget" id={b.id} isAdmin={isUserAdmin} onSuccessRefresh />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
