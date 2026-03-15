'use client';

import { useState, useMemo } from 'react';
import { formatCurrency } from '@/lib/utils/budget-calculations';

export default function TopCostlyTasks({ budgets }) {
  // Get unique projects from the budgets list
  const projects = useMemo(() => {
    const projMap = {};
    (budgets || []).forEach(b => {
      if (b.projects?.project_name) {
        projMap[b.projects.project_name] = b.projects.project_name;
      }
    });
    return Object.values(projMap).sort();
  }, [budgets]);

  const [selectedProject, setSelectedProject] = useState(projects[0] || '');

  // Calculate top 5 tasks for the selected project
  const topTasks = useMemo(() => {
    if (!selectedProject) return [];

    // Filter budgets for this project
    const projectBudgets = budgets.filter(b => b.projects?.project_name === selectedProject);
    
    // Flatten all line items across all sections of those budgets
    // Note: If there are multiple budgets for the same project (e.g. versions), 
    // we take the latest one based on created_at for this analysis.
    const latestBudget = [...projectBudgets].sort((a, b) => 
      new Date(b.created_at) - new Date(a.created_at)
    )[0];

    if (!latestBudget) return [];

    const allItems = [];
    (latestBudget.budget_sections || []).forEach(section => {
      (section.budget_line_items || []).forEach(item => {
        allItems.push({
          name: item.name,
          cost: parseFloat(item.line_total) || 0
        });
      });
    });

    // Sort by cost desc and take top 5
    return allItems
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 5);
  }, [budgets, selectedProject]);

  return (
    <div className="analytics-card" style={{ marginTop: 'var(--space-8)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-6)', flexWrap: 'wrap', gap: '16px' }}>
        <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: '600', margin: 0 }}>Top 5 Costliest Tasks</h2>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <label htmlFor="project-select" style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>Select Project:</label>
          <select 
            id="project-select"
            className="form-input"
            style={{ width: 'auto', minWidth: '200px', padding: '8px 12px' }}
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
          >
            {projects.length === 0 && <option value="">No projects available</option>}
            {projects.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: '70%' }}>Task/Step Description</th>
              <th className="number-cell" style={{ width: '30%' }}>Cost (Estimated)</th>
            </tr>
          </thead>
          <tbody>
            {topTasks.length === 0 ? (
              <tr>
                <td colSpan="2" style={{ textAlign: 'center', padding: 'var(--space-10)', color: 'var(--color-text-muted)' }}>
                  {selectedProject ? 'No line items found for this project.' : 'Please select a project to view details.'}
                </td>
              </tr>
            ) : (
              topTasks.map((task, i) => (
                <tr key={`${task.name}-${i}`}>
                  <td style={{ fontWeight: '500' }}>{task.name}</td>
                  <td className="number-cell" style={{ fontWeight: '600', color: 'var(--color-accent)' }}>
                    {formatCurrency(task.cost)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
