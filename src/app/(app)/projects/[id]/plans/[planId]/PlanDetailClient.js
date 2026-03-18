'use client';

import { useState } from 'react';
import Header from '@/components/layout/Header';
import ExecutionGrid from '@/components/planning/ExecutionGrid';
import BandwidthSummary from '@/components/planning/BandwidthSummary';
import { LayoutGrid, Users } from 'lucide-react';

export default function PlanDetailClient({ plan, tasks, deliverables }) {
  const [activeTab, setActiveTab] = useState('grid');
  const [activeTasks] = useState(tasks);

  return (
    <div>
      <Header
        title={plan.name}
        subtitle={`${plan.project?.project_name} · ${plan.type} Workstream`}
        actions={
          <div className="tabs-container" style={{ display: 'flex', gap: '8px', background: 'var(--color-bg-tertiary)', padding: '4px', borderRadius: '8px' }}>
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
            tasks={activeTasks} 
            deliverables={deliverables}
          />
        ) : (
          <BandwidthSummary 
            plan={plan} 
            tasks={activeTasks} 
            deliverables={deliverables}
          />
        )}
      </div>
    </div>
  );
}
