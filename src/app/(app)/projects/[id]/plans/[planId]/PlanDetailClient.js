'use client';

import { useMemo, useState } from 'react';
import Header from '@/components/layout/Header';
import ExecutionGrid from '@/components/planning/ExecutionGrid';
import BandwidthSummary from '@/components/planning/BandwidthSummary';
import { LayoutGrid, Users } from 'lucide-react';

export default function PlanDetailClient({
  plan,
  tasks,
  deliverables,
  teamMembers,
  holidays,
}) {
  const [activeTab, setActiveTab] = useState('grid');

  // Build availability and bandwidth maps client-side from serializable props.
  // These are used by ExecutionGrid for cascade recalculation on date edits.
  const { availabilityMap, bandwidthMap } = useMemo(() => {
    const holidaySet = new Set((holidays || []).map((h) => h.holiday_date));
    const avMap = { global: holidaySet };
    const bwMap = {};

    (teamMembers || []).forEach((member) => {
      const role = member.role;
      if (!avMap[role]) avMap[role] = new Set();
      (member.leaves || []).forEach((l) => avMap[role].add(l.leave_date));
      bwMap[role] = (bwMap[role] || 0) + member.bandwidth;
    });

    return { availabilityMap: avMap, bandwidthMap: bwMap };
  }, [teamMembers, holidays]);

  return (
    <div>
      <Header
        title={plan.name}
        subtitle={`${plan.project?.project_name} · ${plan.type} Workstream`}
        actions={
          <div
            style={{
              display: 'flex',
              gap: '8px',
              background: 'var(--color-bg-tertiary)',
              padding: '4px',
              borderRadius: '8px',
            }}
          >
            <button
              className={`btn ${activeTab === 'grid' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setActiveTab('grid')}
            >
              <LayoutGrid size={16} /> Grid
            </button>
            <button
              className={`btn ${activeTab === 'bandwidth' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setActiveTab('bandwidth')}
            >
              <Users size={16} /> Bandwidth
            </button>
          </div>
        }
      />

      <div className="glass-card animate-fade-in" style={{ padding: 0, overflow: 'hidden' }}>
        {activeTab === 'grid' ? (
          <ExecutionGrid
            plan={plan}
            tasks={tasks}
            deliverables={deliverables}
            teamMembers={teamMembers}
            availabilityMap={availabilityMap}
            bandwidthMap={bandwidthMap}
          />
        ) : (
          <BandwidthSummary
            plan={plan}
            tasks={tasks}
            deliverables={deliverables}
            teamMembers={teamMembers}
          />
        )}
      </div>
    </div>
  );
}
