import { getSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Lists all projects in the database.
 */
export async function list_all_projects() {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from('projects')
    .select('id, project_name, academic_year')
    .order('created_at', { ascending: false });
    
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Gets detailed info for a specific project.
 */
export async function get_project_details(projectName) {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from('projects')
    .select(`
      *,
      profiles:created_by ( full_name, email )
    `)
    .ilike('project_name', projectName)
    .single();

  if (error) return { error: `Project "${projectName}" not found.` };
  return data;
}

/**
 * Gets all budgets associated with a project.
 */
export async function get_budgets_for_project(projectName) {
  const supabase = await getSupabaseServerClient();
  
  // First find the project ID
  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .ilike('project_name', projectName)
    .single();
    
  if (!project) return { error: `Project "${projectName}" not found.` };

  const { data: budgets, error } = await supabase
    .from('budgets')
    .select(`
      id, name, status, total_estimated_budget, currency, created_at,
      profiles:created_by ( full_name, email )
    `)
    .eq('project_id', project.id)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return budgets;
}

/**
 * Gets the financial breakdown by role for a specific budget.
 */
export async function get_budget_breakdown_by_role(budgetId) {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from('budgets')
    .select(`
      total_estimated_budget,
      budget_roles ( id, name ),
      budget_sections (
        budget_line_items (
          budget_norms ( role_id, total_cost )
        )
      )
    `)
    .eq('id', budgetId)
    .single();

  if (error) throw new Error(error.message);

  const roleTotals = {};
  const roleNames = {};
  data.budget_roles.forEach(r => roleNames[r.id] = r.name);

  data.budget_sections.forEach(s => {
    s.budget_line_items.forEach(li => {
      li.budget_norms.forEach(n => {
        const name = roleNames[n.role_id] || 'Unknown';
        roleTotals[name] = (roleTotals[name] || 0) + (parseFloat(n.total_cost) || 0);
      });
    });
  });

  return {
    total: data.total_estimated_budget,
    roles: Object.entries(roleTotals).map(([name, value]) => ({ name, value }))
  };
}

/**
 * Gets the financial breakdown by section for a specific budget.
 */
export async function get_budget_breakdown_by_section(budgetId) {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from('budget_sections')
    .select('name, subtotal')
    .eq('budget_id', budgetId);

  if (error) throw new Error(error.message);
  return data;
}

/**
 * Finds the costliest tasks across all sections for a specific budget.
 */
export async function find_costliest_line_items(budgetId, limit = 5) {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from('budget_sections')
    .select(`
      budget_line_items ( name, line_total )
    `)
    .eq('budget_id', budgetId);

  if (error) throw new Error(error.message);

  const allItems = [];
  data.forEach(s => {
    s.budget_line_items.forEach(li => {
      allItems.push({ name: li.name, cost: parseFloat(li.line_total) || 0 });
    });
  });

  return allItems
    .sort((a, b) => b.cost - a.cost)
    .slice(0, limit);
}

/**
 * Gets organization-wide high-level statistics.
 */
export async function get_org_summary_stats() {
  const supabase = await getSupabaseServerClient();
  const { data: budgets, error } = await supabase
    .from('budgets')
    .select('total_estimated_budget, status');

  if (error) throw new Error(error.message);

  const stats = {
    total_value: 0,
    approved_value: 0,
    counts: { draft: 0, submitted: 0, approved: 0, rejected: 0 }
  };

  budgets.forEach(b => {
    const val = parseFloat(b.total_estimated_budget) || 0;
    stats.total_value += val;
    if (b.status === 'approved') stats.approved_value += val;
    stats.counts[b.status] = (stats.counts[b.status] || 0) + 1;
  });

  return stats;
}

/**
 * Searches for budgets by their current status.
 */
export async function search_budgets_by_status(status) {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from('budgets')
    .select(`
      id, name, total_estimated_budget,
      projects ( project_name )
    `)
    .eq('status', status.toLowerCase());

  if (error) throw new Error(error.message);
  return data;
}
