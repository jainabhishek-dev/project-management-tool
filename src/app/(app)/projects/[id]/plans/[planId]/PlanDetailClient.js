'use client';

import { useMemo, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/layout/Header';
import ExecutionGrid from '@/components/planning/ExecutionGrid';
import BandwidthSummary from '@/components/planning/BandwidthSummary';
import { LayoutGrid, Users, Settings } from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

export default function PlanDetailClient({
  plan,
  tasks,
  books,
  teamMembers,
  holidays,
}) {
  const [activeTab, setActiveTab] = useState('grid');
  const [currentUserId, setCurrentUserId] = useState(null);
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();

  // Fetch current user id on mount
  useEffect(() => {
    async function getUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setCurrentUserId(user.id);
    }
    getUser();
  }, [supabase]);

  // Check if current user owns the plan
  const isOwner = currentUserId === plan.created_by;

  // Build per-member leave sets and holiday set client-side.
  // These are passed to ExecutionGrid so the cascade algorithm can use them.
  const { memberLeavesMap, holidaySet } = useMemo(() => {
    const holSet = new Set((holidays || []).map((h) => h.holiday_date));
    const leavesMap = {};
    (teamMembers || []).forEach((m) => {
      leavesMap[m.id] = new Set((m.leaves || []).map((l) => l.leave_date));
    });
    return { memberLeavesMap: leavesMap, holidaySet: holSet };
  }, [teamMembers, holidays]);

  return (
    <div>
      <Header
        title={plan.name}
        subtitle={`${plan.project?.project_name} · ${plan.type} Workstream`}
        actions={
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
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
            
            {/* Edit Configuration feature is approved conceptually, but UI will arrive when full wizard is built */}
          </div>
        }
      />

      <div
        className="glass-card animate-fade-in"
        style={{ padding: 0, overflow: 'hidden' }}
      >
        {activeTab === 'grid' ? (
          <ExecutionGrid
            plan={plan}
            tasks={tasks}
            books={books}
            teamMembers={teamMembers}
            memberLeavesMap={memberLeavesMap}
            holidaySet={holidaySet}
          />
        ) : (
          <BandwidthSummary
            plan={plan}
            tasks={tasks}
            books={books}
            teamMembers={teamMembers}
          />
        )}
      </div>
    </div>
  );
}
