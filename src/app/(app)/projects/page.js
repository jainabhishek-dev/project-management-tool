import { getSupabaseServerClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { Plus, FolderOpen } from 'lucide-react';
import Header from '@/components/layout/Header';
import styles from './projects.module.css';

export default async function ProjectsPage() {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: projects } = await supabase
    .from('projects')
    .select(`
      id,
      project_name,
      description,
      academic_year,
      status,
      created_at,
      created_by,
      profiles:created_by ( full_name, email ),
      budgets ( id, total_estimated_budget, status )
    `)
    .order('created_at', { ascending: false });

  const statusColors = {
    active: 'badge-submitted',
    completed: 'badge-approved',
    on_hold: 'badge-draft',
    cancelled: 'badge-draft',
  };

  return (
    <div>
      <Header
        title="Projects"
        subtitle="All projects across your organisation."
        actions={
          <Link href="/projects/new" className="btn btn-primary">
            <Plus size={16} />
            New Project
          </Link>
        }
      />

      {!projects || projects.length === 0 ? (
        <div className="empty-state">
          <FolderOpen size={48} className="empty-state-icon" />
          <h3 className="empty-state-title">No projects yet</h3>
          <p className="empty-state-text">
            Create your first project to start tracking budgets and timelines.
          </p>
          <Link href="/projects/new" className="btn btn-primary">
            <Plus size={16} /> Create Project
          </Link>
        </div>
      ) : (
        <div className={styles.projectsGrid}>
          {projects.map((project) => {
            const totalBudget = (project.budgets || []).reduce(
              (sum, b) => sum + (parseFloat(b.total_estimated_budget) || 0), 0
            );
            const isOwner = project.created_by === user.id;

            return (
              <Link key={project.id} href={`/projects/${project.id}`} className={styles.projectCard}>
                <div className={styles.cardTop}>
                  <div className={styles.cardIcon}>
                    <FolderOpen size={20} />
                  </div>
                  <span className={`badge ${statusColors[project.status] || 'badge-draft'}`}>
                    {project.status.replace('_', ' ')}
                  </span>
                </div>
                <h3 className={styles.projectName}>{project.project_name}</h3>
                {project.description && (
                  <p className={styles.projectDesc}>{project.description}</p>
                )}
                <div className={styles.projectMeta}>
                  {project.academic_year && (
                    <>
                      <span className={styles.metaItem}>{project.academic_year}</span>
                      <span className={styles.metaDot}>·</span>
                    </>
                  )}
                  <span className={styles.metaItem}>
                    {project.budgets?.length ?? 0} budget{project.budgets?.length !== 1 ? 's' : ''}
                  </span>
                  <span className={styles.metaDot}>·</span>
                  <span className={styles.metaItem}>
                    {project.profiles?.full_name || project.profiles?.email?.split('@')[0] || 'Unknown'}
                    {isOwner && <span className={styles.ownerTag}> (you)</span>}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
