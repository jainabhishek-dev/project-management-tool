import { getSupabaseServerClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { forecastExecutionTasks } from '@/lib/utils/planning-calculations';
import PlanDetailClient from './PlanDetailClient';

export default async function PlanDetailPage({ params }) {
  const { id, planId } = await params;
  const supabase = await getSupabaseServerClient();

  // 1. Fetch Plan details with steps and deliverables
  const { data: plan } = await supabase
    .from('project_plans')
    .select(`
      *,
      project:project_id ( project_name ),
      steps:planning_steps ( *, norms:planning_norms ( * ) ),
      deliverables:planning_deliverables ( * )
    `)
    .eq('id', planId)
    .single();

  if (!plan) notFound();

  // 2. Fetch existing execution tasks
  const { data: existingTasks } = await supabase
    .from('planning_tasks')
    .select('*')
    .eq('plan_id', planId);

  // 3. Fetch availability overrides
  const { data: overrides } = await supabase
    .from('availability_overrides')
    .select('*');

  // Prepare availability map for the engine
  const availabilityMap = {
    global: new Set((overrides || []).filter(o => !o.profile_id).map(o => o.date))
  };

  // 4. If no tasks exist, run the forecast engine
  let activeTasks = existingTasks || [];
  if (activeTasks.length === 0 && plan.deliverables.length > 0) {
    activeTasks = forecastExecutionTasks(plan, plan.deliverables, availabilityMap);
  }

  return (
    <PlanDetailClient 
      plan={plan} 
      tasks={activeTasks} 
      deliverables={plan.deliverables} 
    />
  );
}
