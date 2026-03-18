import { getSupabaseServerClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { forecastExecutionTasks } from '@/lib/utils/planning-calculations';
import PlanDetailClient from './PlanDetailClient';

export default async function PlanDetailPage({ params }) {
  const { id, planId } = await params;
  const supabase = await getSupabaseServerClient();

  // Fetch all plan data in parallel
  const [
    { data: plan },
    { data: existingTasks },
    { data: teamMembers },
    { data: holidays },
  ] = await Promise.all([
    supabase
      .from('project_plans')
      .select(`
        *,
        project:project_id ( project_name ),
        steps:planning_steps ( *, norms:planning_norms ( * ) ),
        deliverables:planning_deliverables ( * )
      `)
      .eq('id', planId)
      .single(),

    supabase
      .from('planning_tasks')
      .select('*')
      .eq('plan_id', planId),

    supabase
      .from('plan_team_members')
      .select('*, leaves:plan_leaves(*)')
      .eq('plan_id', planId),

    supabase
      .from('plan_holidays')
      .select('*')
      .eq('plan_id', planId)
      .order('holiday_date', { ascending: true }),
  ]);

  if (!plan) notFound();

  // Build availability map (Sets — used only server-side for task generation)
  // global: plan-level holidays (block all roles)
  // [role]: union of leave dates for all members with that role
  const holidaySet = new Set((holidays || []).map((h) => h.holiday_date));
  const availabilityMap = { global: holidaySet };

  // Build bandwidth map: [role] → sum of bandwidths for all members of that role
  const bandwidthMap = {};
  (teamMembers || []).forEach((member) => {
    const role = member.role;
    if (!availabilityMap[role]) availabilityMap[role] = new Set();
    (member.leaves || []).forEach((l) => availabilityMap[role].add(l.leave_date));
    bandwidthMap[role] = (bandwidthMap[role] || 0) + member.bandwidth;
  });

  // Generate tasks on first visit if none exist, then persist them to DB
  let activeTasks = existingTasks || [];

  if (activeTasks.length === 0 && (plan.deliverables || []).length > 0) {
    const generatedTasks = forecastExecutionTasks(
      plan,
      plan.deliverables,
      availabilityMap,
      bandwidthMap
    );

    if (generatedTasks.length > 0) {
      const { error: insertError } = await supabase
        .from('planning_tasks')
        .insert(generatedTasks.map((t) => ({ ...t, plan_id: planId })));

      if (!insertError) {
        // Re-fetch to get DB-generated IDs needed for edits
        const { data: savedTasks } = await supabase
          .from('planning_tasks')
          .select('*')
          .eq('plan_id', planId);
        activeTasks = savedTasks || generatedTasks;
      } else {
        // Fall back to in-memory tasks if insert fails
        activeTasks = generatedTasks;
      }
    }
  }

  return (
    <PlanDetailClient
      plan={plan}
      tasks={activeTasks}
      deliverables={plan.deliverables || []}
      teamMembers={teamMembers || []}
      holidays={holidays || []}
    />
  );
}
