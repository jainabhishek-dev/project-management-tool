'use client';

import { useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';

export default function SectionBreakdown({ budgets }) {
  const data = useMemo(() => {
    const sectionTotals = {};

    (budgets || []).forEach(budget => {
      (budget.budget_sections || []).forEach(section => {
        const val = parseFloat(section.subtotal) || 0;
        if (val > 0) {
          sectionTotals[section.name] = (sectionTotals[section.name] || 0) + val;
        }
      });
    });

    return Object.entries(sectionTotals)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [budgets]);

  if (data.length === 0) {
    return (
      <div className="empty-state" style={{ height: 300 }}>
        <p className="empty-state-text">No section data found</p>
      </div>
    );
  }

  // Generate distinct colors based on index
  // Cool palette for Sections
  const COLORS = [
    '#3b82f6', '#0ea5e9', '#6366f1', '#8b5cf6', 
    '#10b981', '#14b8a6', '#06b6d4', '#60a5fa'
  ];

  const formatTooltipEntry = (value) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(value);
  };

  return (
    <div style={{ width: '100%', height: 300 }}>
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={90}
            paddingAngle={2}
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip 
            formatter={formatTooltipEntry}
            contentStyle={{ 
              backgroundColor: 'var(--color-bg-card)', 
              borderColor: 'var(--color-border)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--color-text-primary)'
            }}
            itemStyle={{ color: 'var(--color-text-primary)' }}
          />
          <Legend 
            verticalAlign="middle" 
            align="right"
            layout="vertical"
            wrapperStyle={{ paddingLeft: '20px', fontSize: '14px', color: 'var(--color-text-secondary)' }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
