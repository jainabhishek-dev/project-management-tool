'use client';

import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Calendar } from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { cascadeTaskDates } from '@/lib/utils/planning-calculations';
import styles from './ExecutionGrid.module.css';

const STATUS_OPTIONS = ['Yet to start', 'In Progress', 'Done', 'Skipped'];

const STATUS_COLORS = {
  'Done': 'var(--color-success)',
  'In Progress': 'var(--color-primary)',
  'Skipped': 'var(--color-text-muted)',
  'Yet to start': 'var(--color-text-secondary)',
};

export default function ExecutionGrid({
  plan,
  tasks,
  deliverables,
  teamMembers,
  availabilityMap,
  bandwidthMap,
}) {
  const [activeTasks, setActiveTasks] = useState(tasks);
  const supabase = getSupabaseBrowserClient();

  const steps = [...(plan.steps || [])].sort((a, b) => a.display_order - b.display_order);

  // Group tasks by deliverable for easy lookup
  const groupedTasks = deliverables.map((del) => {
    const delTasks = activeTasks.filter((t) => t.deliverable_id === del.id);
    return {
      ...del,
      stepsTasks: steps.reduce((acc, step) => {
        acc[step.id] = delTasks.find((t) => t.step_id === step.id) || null;
        return acc;
      }, {}),
    };
  });

  // ── Status update ─────────────────────────────────────────────────────────
  async function handleStatusChange(taskId, newStatus) {
    setActiveTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t))
    );
    await supabase.from('planning_tasks').update({ status: newStatus }).eq('id', taskId);
  }

  // ── End-date change with cascade ─────────────────────────────────────────
  async function handleEndDateChange(taskId, newEndDate, deliverableId, stepId) {
    const deliverable = deliverables.find((d) => d.id === deliverableId);
    if (!deliverable) return;

    const tasksForDeliverable = activeTasks.filter(
      (t) => t.deliverable_id === deliverableId
    );

    // Compute cascade using the shared utility
    const updatedTasksForDel = cascadeTaskDates(
      tasksForDeliverable,
      stepId,
      newEndDate,
      steps,
      deliverable.cluster_id,
      availabilityMap,
      bandwidthMap
    );

    // Merge cascade results back into full task list
    const updatedMap = {};
    updatedTasksForDel.forEach((t) => {
      updatedMap[t.step_id] = t;
    });

    setActiveTasks((prev) =>
      prev.map((t) => {
        if (t.deliverable_id !== deliverableId) return t;
        return updatedMap[t.step_id] ? { ...t, ...updatedMap[t.step_id] } : t;
      })
    );

    // Persist all changed tasks to DB
    for (const t of updatedTasksForDel) {
      if (!t.id) continue; // skip if no DB id (shouldn't happen after first load)
      const { planned_start_date, planned_end_date } = t;
      // Only include end_date for the anchor task (user-changed), start+end for cascade
      await supabase
        .from('planning_tasks')
        .update({ planned_start_date, planned_end_date })
        .eq('id', t.id);
    }
  }

  return (
    <div className={styles.container}>
      {/* Timeline info bar */}
      <div className={styles.tableHead}>
        <div className={styles.projectInfo}>
          <Calendar size={18} />
          <span>Timeline: {format(parseISO(plan.start_date), 'dd MMM yyyy')} onwards</span>
        </div>
      </div>

      <div className={styles.tableWrapper}>
        <table className={styles.executionTable}>
          <thead>
            <tr className={styles.headerRow}>
              {/* Deliverable info columns */}
              <th className={styles.stickyCol}>Term</th>
              <th className={styles.stickyCol}>Class</th>
              <th className={styles.stickyCol}>Unit No</th>
              <th className={styles.stickyCol} style={{ minWidth: 200 }}>Unit Name</th>
              <th className={styles.stickyCol}>Cluster</th>
              <th className={styles.stickyCol}>Pages</th>

              {/* Dynamic step columns */}
              {steps.map((step) => {
                // Show assigned team members for this step's role
                const assigned = (teamMembers || []).filter(
                  (m) => m.role === step.role_required
                );
                return (
                  <th key={step.id} className={styles.stepCol}>
                    <div className={styles.stepHeader}>
                      <p className={styles.stepRole}>{step.role_required}</p>
                      <p className={styles.stepName}>{step.name}</p>
                      {assigned.length > 0 && (
                        <div className={styles.stepMembers}>
                          {assigned.map((m) => (
                            <span
                              key={m.id}
                              className={styles.memberBadge}
                              title={`${m.name} — ${m.bandwidth * 100}% bandwidth`}
                            >
                              {m.name.split(' ')[0]} ({m.bandwidth}x)
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {groupedTasks.map((del, idx) => (
              <tr key={del.id} className={idx % 2 === 0 ? styles.evenRow : styles.oddRow}>
                <td className={styles.stickyCol}>{del.term}</td>
                <td className={styles.stickyCol}>{del.class_name}</td>
                <td className={styles.stickyCol}>{del.unit_no}</td>
                <td className={styles.stickyCol}>{del.unit_name}</td>
                <td className={styles.stickyCol}>
                  {/* Show human-readable cluster label from plan.cluster_labels */}
                  <span className={styles.clusterLabel}>
                    {plan.cluster_labels?.[del.cluster_id] || del.cluster_id}
                  </span>
                </td>
                <td className={styles.stickyCol}>{del.pages}</td>

                {/* Task cells per step */}
                {steps.map((step) => {
                  const task = del.stepsTasks[step.id];

                  if (!task) {
                    return (
                      <td key={step.id} className={styles.stepCell}>
                        <span className={styles.noTask}>—</span>
                      </td>
                    );
                  }

                  return (
                    <td key={step.id} className={styles.stepCell}>
                      <div className={styles.taskCard}>
                        {/* Editable status */}
                        <select
                          className={styles.statusSelect}
                          value={task.status || 'Yet to start'}
                          style={{ color: STATUS_COLORS[task.status] || STATUS_COLORS['Yet to start'] }}
                          onChange={(e) => handleStatusChange(task.id, e.target.value)}
                          disabled={!task.id}
                        >
                          {STATUS_OPTIONS.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>

                        {/* Start date (read-only — determined by cascade) */}
                        <div className={styles.taskDates}>
                          <span className={styles.dateLabel}>Start:</span>
                          <span className={styles.dateValue}>
                            {task.planned_start_date
                              ? format(parseISO(task.planned_start_date), 'dd MMM')
                              : '—'}
                          </span>
                        </div>

                        {/* Editable end date */}
                        <div className={styles.taskDates}>
                          <span className={styles.dateLabel}>End:</span>
                          <input
                            type="date"
                            className={styles.dateInput}
                            value={task.planned_end_date || ''}
                            disabled={!task.id}
                            onChange={(e) =>
                              handleEndDateChange(task.id, e.target.value, del.id, step.id)
                            }
                          />
                        </div>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
