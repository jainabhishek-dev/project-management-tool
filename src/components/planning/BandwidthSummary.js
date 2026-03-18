'use client';

import { useMemo } from 'react';
import { format, parseISO, differenceInDays } from 'date-fns';
import { Users, AlertCircle, CheckCircle2, TrendingUp } from 'lucide-react';
import styles from './BandwidthSummary.module.css';

export default function BandwidthSummary({ plan, tasks, deliverables }) {
  const analysis = useMemo(() => {
    const roles = {};
    
    // Sum up required effort (man-days) per role
    tasks.forEach(task => {
      const step = plan.steps.find(s => s.id === task.step_id);
      if (!step) return;

      const role = step.role_required;
      if (!roles[role]) roles[role] = { required: 0, count: 0, start: null, end: null };

      // Get norm in mandays for this step/cluster
      const del = deliverables.find(d => d.id === task.deliverable_id);
      if (!del) return;
      
      const normObj = step.norms.find(n => n.cluster_id === del.cluster_id);
      const effort = parseFloat(normObj?.norm_in_mandays) || 0;
      
      roles[role].required += effort;
      roles[role].count += 1;

      // Track the span of time
      const taskStart = parseISO(task.planned_start_date);
      const taskEnd = parseISO(task.planned_end_date);
      if (!roles[role].start || taskStart < roles[role].start) roles[role].start = taskStart;
      if (!roles[role].end || taskEnd > roles[role].end) roles[role].end = taskEnd;
    });

    // For each role, calculate available member-days
    Object.keys(roles).forEach(role => {
      const r = roles[role];
      if (!r.start || !r.end) return;
      
      const totalCalendarDays = differenceInDays(r.end, r.start) + 1;
      // Rough approximation for now: 5/7th of total calendar days are working days
      const workingDays = Math.ceil(totalCalendarDays * (5/7));
      
      // Let's assume we have 3 resources for each role as a default if not defined in team table yet
      const assumedResources = 3; 
      r.availableDays = workingDays * assumedResources;
      r.neededResources = (r.required / workingDays).toFixed(1);
      r.surplus = (assumedResources - r.neededResources).toFixed(1);
    });

    return roles;
  }, [plan, tasks, deliverables]);

  if (!analysis) return null;

  return (
    <div className={styles.container}>
      <div className={styles.grid}>
        {Object.entries(analysis).map(([role, data]) => {
          const isDeficit = parseFloat(data.surplus) < 0;
          return (
            <div key={role} className={styles.card}>
              <div className={styles.header}>
                <div className={styles.roleIcon}><Users size={16} /></div>
                <h3 className={styles.roleName}>{role}</h3>
              </div>
              
              <div className={styles.statRow}>
                <span className={styles.label}>Total Effort</span>
                <span className={styles.value}>{data.required.toFixed(1)} mandays</span>
              </div>
              
              <div className={styles.statRow}>
                <span className={styles.label}>Time Span</span>
                <span className={styles.value}>
                  {format(data.start, 'MMM dd')} - {format(data.end, 'MMM dd')}
                </span>
              </div>

              <div className={styles.divider} />

              <div className={styles.statRow}>
                <span className={styles.label}>Resources Needed</span>
                <span className={styles.value} style={{ color: isDeficit ? 'var(--color-danger)' : 'var(--color-success)' }}>
                  {data.neededResources} members
                </span>
              </div>

              <div className={styles.statusBadge} style={{ background: isDeficit ? 'var(--color-danger-subtle)' : 'var(--color-success-subtle)' }}>
                {isDeficit ? <AlertCircle size={14} /> : <CheckCircle2 size={14} />}
                <span>{isDeficit ? `Deficit: ${Math.abs(data.surplus)}` : `Surplus: ${data.surplus}`}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
