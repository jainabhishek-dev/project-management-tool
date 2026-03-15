'use client';

import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function RoleBreakdown({ budgets }) {
  const data = useMemo(() => {
    const roleTotals = {};

    // Map role_ids to role names for consistent grouping
    const roleNamesMap = {};

    (budgets || []).forEach(budget => {
      // First, catalog the role names for this budget
      (budget.budget_roles || []).forEach(role => {
        roleNamesMap[role.id] = role.name;
      });

      // Then tally the costs from all norms across all line items
      (budget.budget_sections || []).forEach(section => {
        (section.budget_line_items || []).forEach(item => {
          (item.budget_norms || []).forEach(norm => {
            const roleName = roleNamesMap[norm.role_id] || 'Unknown Role';
            const cost = parseFloat(norm.total_cost) || 0;
            
            if (cost > 0) {
              roleTotals[roleName] = (roleTotals[roleName] || 0) + cost;
            }
          });
        });
      });
    });

    return Object.entries(roleTotals)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value); // Sort highest to lowest
  }, [budgets]);

  if (data.length === 0) {
    return (
      <div className="empty-state" style={{ height: 300 }}>
        <p className="empty-state-text">No role data found</p>
      </div>
    );
  }

  const COLORS = [
    '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', 
    '#f97316', '#eab308', '#22c55e', '#0ea5e9',
    '#14b8a6', '#84cc16', '#d946ef', '#3b82f6'
  ];

  const formatTooltipEntry = (value) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(value);
  };

  const formatYAxis = (value) => {
    if (value >= 10000000) return `₹${(value / 10000000).toFixed(1)}Cr`;
    if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
    if (value >= 1000) return `₹${(value / 1000).toFixed(1)}K`;
    return `₹${value}`;
  };

  return (
    <div style={{ width: '100%', height: 300 }}>
      <ResponsiveContainer>
        <BarChart
          data={data}
          margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
          <XAxis 
            dataKey="name" 
            tick={{ fill: 'var(--color-text-secondary)', fontSize: 12 }}
            axisLine={{ stroke: 'var(--color-border)' }}
            tickLine={false}
          />
          <YAxis 
            tickFormatter={formatYAxis}
            tick={{ fill: 'var(--color-text-secondary)', fontSize: 12 }}
            axisLine={{ stroke: 'var(--color-border)' }}
            tickLine={false}
          />
          <Tooltip 
            formatter={formatTooltipEntry}
            cursor={{ fill: 'var(--color-bg-card-hover)' }}
            contentStyle={{ 
              backgroundColor: 'var(--color-bg-card)', 
              borderColor: 'var(--color-border)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--color-text-primary)'
            }}
          />
          <Bar 
            dataKey="value" 
            radius={[4, 4, 0, 0]} 
            name="Total Cost"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
