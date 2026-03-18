'use client';

import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Calendar, User, CheckCircle2, Circle, Clock, Info } from 'lucide-react';
import styles from './ExecutionGrid.module.css';

export default function ExecutionGrid({ plan, tasks, deliverables }) {
  const [activeTasks, setActiveTasks] = useState(tasks);
  const steps = [...(plan.steps || [])].sort((a, b) => a.display_order - b.display_order);

  // Group tasks by deliverable
  const groupedTasks = deliverables.map(del => {
    const delTasks = activeTasks.filter(t => t.deliverable_id === del.id);
    return {
      ...del,
      stepsTasks: steps.reduce((acc, step) => {
        acc[step.id] = delTasks.find(t => t.step_id === step.id) || {};
        return acc;
      }, {})
    };
  });

  const getStatusIcon = (status) => {
    switch (status) {
      case 'Done': return <CheckCircle2 size={14} className={styles.iconDone} />;
      case 'In Progress': return <Clock size={14} className={styles.iconProgress} />;
      case 'Blocked': return <Info size={14} className={styles.iconBlocked} />;
      default: return <Circle size={14} className={styles.iconOpen} />;
    }
  };

  return (
    <div className={styles.container}>
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
              <th className={styles.stickyCol}>Term</th>
              <th className={styles.stickyCol}>Class</th>
              <th className={styles.stickyCol}>Unit No</th>
              <th className={styles.stickyCol} style={{ minWidth: 200 }}>Unit Name</th>
              <th className={styles.stickyCol}>Cluster</th>
              <th className={styles.stickyCol}>Pages</th>
              
              {/* Dynamic Step Columns */}
              {steps.map(step => (
                <th key={step.id} className={styles.stepCol}>
                  <div className={styles.stepHeader}>
                    <p className={styles.stepRole}>{step.role_required}</p>
                    <p className={styles.stepName}>{step.name}</p>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groupedTasks.map((del, idx) => (
              <tr key={del.id} className={idx % 2 === 0 ? styles.evenRow : styles.oddRow}>
                <td className={styles.stickyCol}>{del.term}</td>
                <td className={styles.stickyCol}>{del.class_name}</td>
                <td className={styles.stickyCol}>{del.unit_no}</td>
                <td className={styles.stickyCol}>{del.unit_name}</td>
                <td className={styles.stickyCol}><span className={styles.clusterId}>{del.cluster_id}</span></td>
                <td className={styles.stickyCol}>{del.pages}</td>

                {/* Step Cells */}
                {steps.map(step => {
                  const task = del.stepsTasks[step.id];
                  return (
                    <td key={step.id} className={styles.stepCell}>
                      <div className={styles.taskCard}>
                        <div className={styles.taskStatus}>
                          {getStatusIcon(task.status)}
                          <span>{task.status || '—'}</span>
                        </div>
                        <div className={styles.taskDates}>
                          <span className={styles.dateLabel}>Start:</span>
                          <span className={styles.dateValue}>{task.planned_start_date ? format(parseISO(task.planned_start_date), 'dd/MM') : '—'}</span>
                        </div>
                        <div className={styles.taskDates}>
                          <span className={styles.dateLabel}>End:</span>
                          <span className={styles.dateValue}>{task.planned_end_date ? format(parseISO(task.planned_end_date), 'dd/MM') : '—'}</span>
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
