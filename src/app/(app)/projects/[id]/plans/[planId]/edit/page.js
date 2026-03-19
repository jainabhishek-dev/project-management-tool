import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import PlanWizard from '@/components/planning/PlanWizard';
import { notFound, redirect } from 'next/navigation';

export default async function EditPlanPage({ params }) {
  const { id: projectId, planId } = params;
  const supabase = createServerComponentClient({ cookies });
  
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect('/login');
  
  // 1. Fetch Core Plan
  const { data: plan, error: planError } = await supabase
    .from('project_plans')
    .select('*')
    .eq('id', planId)
    .single();
    
  if (planError || !plan) notFound();
  
  // 2. Authorization Verification (Owner only for configuration edit)
  if (plan.created_by !== session.user.id) {
    // Basic redirect barrier if a non-owner tries to manually hit the /edit URL
    redirect(`/projects/${projectId}/plans/${planId}`);
  }

  // 3. Fetch Clusters
  const { data: clusters } = await supabase
    .from('planning_clusters')
    .select('*')
    .order('name');
    
  // 4. Fetch Execution Arrays for Hydration
  const { data: steps } = await supabase
    .from('planning_steps')
    .select('*, planning_norms(*)')
    .eq('plan_id', planId)
    .order('display_order');
    
  const { data: books } = await supabase
    .from('plan_books')
    .select('*, planning_deliverables(*)')
    .eq('plan_id', planId)
    .order('display_order');
    
  const { data: team } = await supabase
    .from('plan_team_members')
    .select('*, plan_leaves(*)')
    .eq('plan_id', planId)
    .order('created_at');
    
  const { data: holidays } = await supabase
    .from('plan_holidays')
    .select('*')
    .eq('plan_id', planId)
    .order('holiday_date');
    
  // 5. Package for generic deserialization in the UI Component
  const initialData = {
    plan,
    steps: steps || [],
    books: books || [],
    team: team || [],
    holidays: holidays || []
  };

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px' }}>
      <h1 className="text-2xl font-bold mb-4" style={{ color: 'var(--color-text-primary)' }}>Edit Plan Configuration</h1>
      <p style={{ color: 'var(--color-danger)', marginBottom: '24px', fontWeight: 600 }}>
        Warning: Saving changes here will recalculate the entire topological grid. Any manually adjusted progress or custom dates on the grid will be reset.
      </p>
      <PlanWizard 
        projectId={projectId} 
        userId={session.user.id} 
        clusters={clusters || []} 
        initialPlanData={initialData}
      />
    </div>
  );
}
