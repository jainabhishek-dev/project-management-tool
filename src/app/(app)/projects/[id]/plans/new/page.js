import { getSupabaseServerClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Header from '@/components/layout/Header';
import PlanWizard from '@/components/planning/PlanWizard';

export default async function NewPlanPage({ params }) {
  const { id } = await params;
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('id', id)
    .single();

  if (!project) notFound();

  // Fetch Clusters for the dropdowns
  const { data: clusters } = await supabase
    .from('planning_clusters')
    .select('*')
    .order('name', { ascending: true });

  return (
    <div>
      <Header
        title="Create Project Plan"
        subtitle={`Planning for ${project.project_name}`}
      />
      
      <div className="glass-card animate-fade-in">
        <PlanWizard 
          projectId={id} 
          userId={user.id} 
          clusters={clusters || []} 
        />
      </div>
    </div>
  );
}
