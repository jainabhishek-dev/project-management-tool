export const dynamic = 'force-dynamic'; // always fetch fresh — no stale cache on first visit

import { getSupabaseServerClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { forecastExecutionTasks } from '@/lib/utils/planning-calculations';
import PlanDetailClient from './PlanDetailClient';

export default async function PlanDetailPage({ params }) {
  const { id, planId } = await params;
  const supabase = await getSupabaseServerClient();

  // 1. Fetch Core Plan
  const { data: plan } = await supabase
    .from('project_plans')
    .select(`
      *,
      project:project_id ( project_name ),
      steps:planning_steps ( *, norms:planning_norms ( * ) )
    `)
    .eq('id', planId)
    .single();

  if (!plan) notFound();

  // 2. Fetch dependencies
  const [
    { data: teamMembers },
    { data: holidays },
    { data: booksRaw },
    { data: deliverables },
  ] = await Promise.all([
    supabase
      .from('plan_team_members')
      .select('*, leaves:plan_leaves(*)')
      .eq('plan_id', planId),

    supabase
      .from('plan_holidays')
      .select('*')
      .eq('plan_id', planId)
      .order('holiday_date', { ascending: true }),

    supabase
      .from('plan_books')
      .select('*')
      .eq('plan_id', planId)
      .order('display_order', { ascending: true }),

    supabase
      .from('planning_deliverables')
      .select('*')
      .eq('plan_id', planId)
      .order('display_order', { ascending: true }),
  ]);

  // 3. Iterative Fetch for Tasks (Bypass 1,000 row hard-limit for large plans)
  let existingTasks = [];
  let page = 0;
  const pageSize = 1000;
  let hasMoreTasks = true;

  while (hasMoreTasks) {
    const { data: pageTasks, error: taskErr } = await supabase
      .from('planning_tasks')
      .select('*')
      .eq('plan_id', planId)
      .order('id', { ascending: true })
      .range(page * pageSize, (page + 1) * pageSize - 1);
      
    if (taskErr || !pageTasks || pageTasks.length === 0) {
      hasMoreTasks = false;
    } else {
      existingTasks.push(...pageTasks);
      if (pageTasks.length < pageSize) hasMoreTasks = false;
      else page++;
    }
  }

  // 4. Validate or Create Tasks
  if (!plan) notFound();

  // Group chapters under their books
  const books = (booksRaw || []).map((book) => ({
    ...book,
    chapters: (deliverables || []).filter((d) => d.book_id === book.id),
  }));

  // Build per-plan holiday set (user-defined, no global table used)
  const holidaySet = new Set((holidays || []).map((h) => h.holiday_date));

  // Generate tasks on first visit and persist them to DB
  let activeTasks = existingTasks || [];

  if (activeTasks.length === 0 && books.some((b) => b.chapters.length > 0)) {
    try {
      const generatedTasks = forecastExecutionTasks(
        plan,
        books,
        teamMembers || [],
        holidaySet
      );

      if (generatedTasks.length > 0) {
        const { error: insertError } = await supabase
          .from('planning_tasks')
          .insert(generatedTasks.map((t) => ({ ...t, plan_id: planId })));

        if (!insertError) {
          // Re-fetch to get DB-generated IDs (needed for edits)
          const { data: savedTasks } = await supabase
            .from('planning_tasks')
            .select('*')
            .eq('plan_id', planId);

          activeTasks = savedTasks || generatedTasks;
        } else {
          console.error('[planId/page] Task insert failed:', insertError.message);
          activeTasks = generatedTasks; // fall back to in-memory
        }
      }
    } catch (err) {
      console.error('[planId/page] forecastExecutionTasks failed:', err.message);
      // activeTasks stays [] — grid will show empty with a clear indication
    }
  }

  return (
    <PlanDetailClient
      plan={plan}
      tasks={activeTasks}
      books={books}
      teamMembers={teamMembers || []}
      holidays={holidays || []}
    />
  );
}
