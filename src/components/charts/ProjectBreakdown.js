'use client';

import { useState, useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';

export default function ProjectBreakdown({ budgets }) {
  const [drilldownProject, setDrilldownProject] = useState(null);

  const data = useMemo(() => {
    if (drilldownProject) {
      // Show Budget by Section for the selected project
      const sectionTotals = {};
      const projectBudgets = (budgets || []).filter(b => b.projects?.project_name === drilldownProject);
      
      // Use the latest budget for drilldown
      const latestBudget = [...projectBudgets].sort((a, b) => 
        new Date(b.created_at) - new Date(a.created_at)
      )[0];

      if (latestBudget) {
        (latestBudget.budget_sections || []).forEach(section => {
          const val = parseFloat(section.subtotal) || 0;
          if (val > 0) {
            sectionTotals[section.name] = (sectionTotals[section.name] || 0) + val;
          }
        });
      }

      return Object.entries(sectionTotals)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);
    } else {
      // High-level: Budget by Project
      const projectTotals = {};
      (budgets || []).forEach(budget => {
        const projectName = budget.projects?.project_name || 'Unassigned';
        const val = parseFloat(budget.total_estimated_budget) || 0;
        if (val > 0) {
          projectTotals[projectName] = (projectTotals[projectName] || 0) + val;
        }
      });

      return Object.entries(projectTotals)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);
    }
  }, [budgets, drilldownProject]);

  const handleSliceClick = (data) => {
    if (!drilldownProject) {
      setDrilldownProject(data.name);
    }
  };

  if (data.length === 0) {
    return (
      <div className="empty-state" style={{ height: 300 }}>
        <p className="empty-state-text">No data found</p>
        {drilldownProject && (
           <button 
             onClick={() => setDrilldownProject(null)}
             className="btn btn-ghost btn-sm"
             style={{ marginTop: '12px' }}
           >
             ← Back to Projects
           </button>
        )}
      </div>
    );
  }

  // Warm palette for Projects
  const PROJECT_COLORS = [
    '#f43f5e', '#ec4899', '#f97316', '#eab308', 
    '#ef4444', '#d946ef', '#a855f7', '#fbbf24'
  ];

  // Cool palette for Sections
  const SECTION_COLORS = [
    '#3b82f6', '#0ea5e9', '#6366f1', '#8b5cf6', 
    '#10b981', '#14b8a6', '#06b6d4', '#60a5fa'
  ];

  const colorsToUse = drilldownProject ? SECTION_COLORS : PROJECT_COLORS;

  const formatTooltipEntry = (value) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(value);
  };

  return (
    <div style={{ width: '100%', height: 340, position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', margin: 0 }}>
          {drilldownProject ? `Sections in ${drilldownProject}` : 'Click a slice to drill down'}
        </p>
        {drilldownProject && (
          <button 
            onClick={() => setDrilldownProject(null)}
            className="btn btn-ghost btn-sm"
            style={{ padding: '4px 8px', fontSize: '11px' }}
          >
            ← Back to Projects
          </button>
        )}
      </div>

      <div style={{ width: '100%', height: 300 }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={data}
              cx="40%"
              cy="50%"
              innerRadius={60}
              outerRadius={90}
              paddingAngle={2}
              dataKey="value"
              onClick={handleSliceClick}
              style={{ cursor: drilldownProject ? 'default' : 'pointer' }}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={colorsToUse[index % colorsToUse.length]} />
              ))}
            </Pie>
            <Tooltip 
              formatter={formatTooltipEntry}
              contentStyle={{ 
                backgroundColor: 'var(--color-bg-card)', 
                borderColor: 'var(--color-border)',
                borderRadius: 'var(--radius-md)',
              }}
              labelStyle={{ color: 'var(--color-text-primary)' }}
              itemStyle={{ color: '#ffffff' }}
            />
            <Legend 
              verticalAlign="middle" 
              align="right"
              layout="vertical"
              wrapperStyle={{ paddingLeft: '10px', fontSize: '12px', color: 'var(--color-text-secondary)', maxWidth: '40%', overflowY: 'auto' }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
