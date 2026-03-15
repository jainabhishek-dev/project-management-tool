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
