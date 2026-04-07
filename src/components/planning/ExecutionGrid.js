'use client';

import { useState, useMemo, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import { Calendar, BookOpen, AlertCircle, Maximize2, Minimize2 } from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { cascadeAfterEdit } from '@/lib/utils/planning-calculations';
import styles from './ExecutionGrid.module.css';

const STATUS_OPTIONS = ['Yet to start', 'In Progress', 'Done', 'Skipped'];

export default function ExecutionGrid({
  plan,
  tasks,
  books,
  teamMembers,
  memberLeavesMap,
  holidaySet,
}) {
  const [activeTasks, setActiveTasks] = useState(tasks || []);
  const [isCompact, setIsCompact] = useState(true); // Default to compact view
  const supabase = getSupabaseBrowserClient();

  // Issue 1 Fix: Fetch tasks immediately if initial server load returned [] but tasks exist in DB
  useEffect(() => {
    async function fetchTasks() {
      if ((tasks || []).length === 0) {
        const { data } = await supabase
          .from('planning_tasks')
          .select('*')
          .eq('plan_id', plan.id);
        if (data && data.length > 0) setActiveTasks(data);
      }
    }
    fetchTasks();
  }, [tasks, plan.id, supabase]);

  const isPrint = plan.type !== 'Digital';
  const steps = useMemo(
    () =>
      [...(plan.steps || [])].sort((a, b) => a.display_order - b.display_order),
    [plan.steps]
  );

  const uniqueRoles = useMemo(() => {
    return [...new Set(steps.map(s => s.role_required))].filter(role => 
      teamMembers.some(m => m.role === role)
    );
  }, [steps, teamMembers]);

  // Sort books by display_order; chapters within each book by display_order
  const sortedBooks = useMemo(
    () =>
      [...(books || [])].sort((a, b) => a.display_order - b.display_order).map(
        (book) => ({
          ...book,
          chapters: [...(book.chapters || [])].sort(
            (a, b) => a.display_order - b.display_order
          ),
        })
      ),
    [books]
  );

  // Build quick-lookup maps
  const memberById = useMemo(() => {
    const map = {};
    (teamMembers || []).forEach((m) => (map[m.id] = m));
    return map;
  }, [teamMembers]);

  // Task lookup: chapter tasks by `${deliverable_id}-${step_id}`,
  //             book tasks   by `${book_id}-${step_id}`
  const taskMap = useMemo(() => {
    const map = {};
    activeTasks.forEach((t) => {
      const key = t.deliverable_id
        ? `${t.deliverable_id}-${t.step_id}`
        : `${t.book_id}-${t.step_id}`;
      map[key] = t;
    });
    return map;
  }, [activeTasks]);

  // ── Predictive Analytics (Manpower Deficit Algorithm) ───────────────────
  const deficitAnalysis = useMemo(() => {
     if (!plan.target_end_date || activeTasks.length === 0 || !teamMembers) return null;
     
     const targetDate = new Date(plan.target_end_date);
     const planStartDate = new Date(plan.start_date);

     let globalMaxEnd = planStartDate;
     const roleStats = {};

     // 1. Collect absolute Start and End dates for every role
     activeTasks.forEach(t => {
         if (!t.planned_start_date || !t.planned_end_date) return;
         
         const assignedMember = memberById[t.plan_team_member_id];
         if (!assignedMember) return;
         
         const role = assignedMember.role;
         if (!roleStats[role]) {
            roleStats[role] = {
               minStart: new Date(t.planned_start_date),
               maxEnd: new Date(t.planned_end_date),
               currentBandwidth: 0
            };
         }
         
         const tStart = new Date(t.planned_start_date);
         const tEnd = new Date(t.planned_end_date);
         
         if (tStart < roleStats[role].minStart) roleStats[role].minStart = tStart;
         if (tEnd > roleStats[role].maxEnd) roleStats[role].maxEnd = tEnd;
         if (tEnd > globalMaxEnd) globalMaxEnd = tEnd;
     });

     if (globalMaxEnd <= targetDate) return { onTrack: true, deficits: [] };

     // 2. Aggregate current bandwidth allocations per role
     teamMembers.forEach(m => {
         if (roleStats[m.role]) {
            roleStats[m.role].currentBandwidth += parseFloat(m.bandwidth) || 1;
         }
     });

     // 3. Compute Deficit via Velocity Scalar (Total Days Taken / Allowed Days)
     const deficits = [];
     Object.keys(roleStats).forEach(role => {
         const stats = roleStats[role];
         if (stats.maxEnd > targetDate) {
             const daysTaken = (stats.maxEnd - stats.minStart) / (1000 * 60 * 60 * 24);
             const daysAllowed = (targetDate - stats.minStart) / (1000 * 60 * 60 * 24);
             
             if (daysAllowed > 0 && daysTaken > daysAllowed) {
                 const requiredBandwidth = stats.currentBandwidth * (daysTaken / daysAllowed);
                 const deficit = requiredBandwidth - stats.currentBandwidth;
                 if (deficit > 0.05) { // Threshold to prevent noise
                    deficits.push({ role, additionalHeadcount: deficit });
                 }
             }
         }
     });

     return {
        onTrack: false,
        maxProjected: globalMaxEnd,
        deficits: deficits.sort((a,b) => b.additionalHeadcount - a.additionalHeadcount)
     };

  }, [activeTasks, plan.target_end_date, plan.start_date, memberById, teamMembers]);

  // ── Status update ───────────────────────────────────────────────────────
  async function handleStatusChange(taskId, newStatus) {
    let tasksToUpdate = [taskId];

    if (newStatus === 'Done') {
        // --- Recursive "Done" Cascade (Backward Topological Traversal) ---
        // User marked a task as Done. Trace backwards mapping all predecessors up the chain if they are not already Done!
        const initialTask = activeTasks.find(t => t.id === taskId);
        if (initialTask) {
            let currentStepId = initialTask.step_id;
            while (currentStepId) {
                const currentStepDef = steps.find(s => s.id === currentStepId);
                if (!currentStepDef || !currentStepDef.parallel_dependency_id) break;
                
                const predStepId = currentStepDef.parallel_dependency_id;
                const predStepDef = steps.find(s => s.id === predStepId);
                if (!predStepDef) break;
                
                let predTask = null;
                if (predStepDef.unit_of_calculation === 'Book') {
                   predTask = activeTasks.find(t => t.step_id === predStepId && t.book_id === initialTask.book_id && !t.deliverable_id);
                } else {
                   predTask = activeTasks.find(t => t.step_id === predStepId && t.deliverable_id === initialTask.deliverable_id);
                }
                
                if (predTask) {
                   if (predTask.status !== 'Done') {
                       tasksToUpdate.push(predTask.id);
                       currentStepId = predStepId; 
                   } else {
                       break; // Predecessor already done, stop recursing!
                   }
                } else {
                   break; 
                }
            }
        }
    }

    // 1. Calculate the new local task array with updated statuses
    const newActiveTasks = activeTasks.map((t) =>
      tasksToUpdate.includes(t.id) ? { ...t, status: newStatus } : t
    );

    // 2. Pass this array to cascadeAfterEdit so the engine honors 'Skipped' -> 0 days
    const reprojectedTasks = cascadeAfterEdit(
      plan,
      books,
      newActiveTasks, // Has the new statuses
      teamMembers,
      holidaySet,
      null, // No single manual end-date override
      null
    );

    // 3. Update React State
    setActiveTasks(reprojectedTasks);

    // 4. Save to DB
    for (const t of reprojectedTasks) {
       await supabase.from('planning_tasks').update({ 
           status: t.status,
           planned_start_date: t.planned_start_date,
           planned_end_date: t.planned_end_date,
           plan_team_member_id: t.plan_team_member_id
       }).eq('id', t.id);
    }
  }

  // ── End-date change — full re-schedule cascade ──────────────────────────
  async function handleEndDateChange(taskId, newEndDate) {
    if (!newEndDate) return;

    const updatedTasks = cascadeAfterEdit(
      plan,
      sortedBooks,
      activeTasks,
      teamMembers || [],
      holidaySet,
      taskId,
      newEndDate
    );

    setActiveTasks(updatedTasks);

    // Persist all tasks with changed dates
    for (const t of updatedTasks) {
      if (!t.id) continue;
      await supabase
        .from('planning_tasks')
        .update({
          planned_start_date: t.planned_start_date,
          planned_end_date: t.planned_end_date,
          plan_team_member_id: t.plan_team_member_id,
        })
        .eq('id', t.id);
    }
  }

  // ── Role Allocation Overrides — full re-schedule cascade ───────────────────
  async function handleRoleReassignment(chapterId, role, newMemberIdStr) {
    const newMemberId = newMemberIdStr === "" ? null : newMemberIdStr;
    const stepIdsForRole = steps.filter(s => s.role_required === role).map(s => s.id);
    const taskIdsToUpdate = activeTasks.filter(t => t.deliverable_id === chapterId && stepIdsForRole.includes(t.step_id)).map(t => t.id);
    
    if (taskIdsToUpdate.length === 0) return;

    // 1. Update activeTasks state directly with new asignee
    const newActiveTasks = activeTasks.map(t => taskIdsToUpdate.includes(t.id) ? { ...t, plan_team_member_id: newMemberId } : t);
    
    // 2. Reproject the entire grid prioritizing these frozen overrides
    const reprojectedTasks = cascadeAfterEdit(
      plan,
      books,
      newActiveTasks,
      teamMembers,
      holidaySet,
      null, 
      null
    );

    setActiveTasks(reprojectedTasks);

    // 3. Save to database
    for (const t of reprojectedTasks) {
       await supabase.from('planning_tasks').update({ 
           status: t.status,
           planned_start_date: t.planned_start_date,
           planned_end_date: t.planned_end_date,
           plan_team_member_id: t.plan_team_member_id
       }).eq('id', t.id);
    }
  }

  // ── Inline Click-to-Edit Date Component ─────────────────────────────────
  function ClickToEditDate({ value, onChange, disabled, compact }) {
    const [isEditing, setIsEditing] = useState(false);

    if (disabled) {
      return (
        <span className={compact ? styles.dateValue : styles.dateValue}>
          {value ? format(parseISO(value), 'dd MMM yyyy') : '—'}
        </span>
      );
    }

    if (!isEditing) {
      return (
        <div
          className={compact ? styles.compactDateDisplay : styles.dateValue}
          onClick={() => setIsEditing(true)}
          style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}
          title="Click to edit date"
        >
          {value ? format(parseISO(value), 'dd MMM yyyy') : '—'}
        </div>
      );
    }

    return (
      <input
        type="date"
        className={compact ? styles.compactDateInput : styles.dateInput}
        value={value || ''}
        autoFocus
        onBlur={() => setIsEditing(false)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === 'Escape') setIsEditing(false);
        }}
        onChange={(e) => {
          onChange(e.target.value);
          setIsEditing(false);
        }}
      />
    );
  }

  const getStatusClass = (status) => {
    switch (status) {
      case 'Yet to start':
        return styles.statusYetToStart;
      case 'In Progress':
        return styles.statusInProgress;
      case 'Done':
        return styles.statusDone;
      case 'Skipped':
        return styles.statusSkipped;
      default:
        return styles.statusYetToStart;
    }
  };

  // ── Render a single task cell ───────────────────────────────────────────
  function renderTaskCell(task, step, isBookRow = false) {
    if (!task) {
      return (
        <td key={step.id} className={`${styles.stepCell} ${isBookRow ? styles.bookHeaderCell : ''}`}>
          <span className={styles.noTask}>—</span>
        </td>
      );
    }

    const assignedMember = task.plan_team_member_id
      ? memberById[task.plan_team_member_id]
      : null;
    const isUnassigned = !assignedMember;
    const statusClass = getStatusClass(task.status);

    if (isCompact) {
      return (
        <td key={task.id || step.id} className={`${styles.stepCell} ${isBookRow ? styles.bookHeaderCell : ''}`}>
          <div className={`${styles.taskCardCompact} ${statusClass}`}>
            <ClickToEditDate
              value={task.planned_end_date}
              disabled={!task.id}
              onChange={(value) => handleEndDateChange(task.id, value)}
              compact={true}
            />
          </div>
        </td>
      );
    }

    return (
      <td key={task.id || step.id} className={`${styles.stepCell} ${isBookRow ? styles.bookHeaderCell : ''}`}>
        <div
          className={`${styles.taskCard} ${statusClass} ${isUnassigned ? styles.taskUnassigned : ''}`}
        >
          {/* Member name */}
          {assignedMember ? (
            <span className={styles.taskMember}>
              {assignedMember.name.split(' ')[0]}
            </span>
          ) : (
            <span className={styles.taskMemberWarn}>
              <AlertCircle size={10} /> Unassigned
            </span>
          )}

          {/* Editable status */}
          <select
            className={styles.statusSelect}
            value={task.status || 'Yet to start'}
            onChange={(e) => handleStatusChange(task.id, e.target.value)}
            disabled={!task.id}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          {/* Start date (read-only) */}
          <div className={styles.taskDates}>
            <span className={styles.dateLabel}>Start:</span>
            <span className={styles.dateValue}>
              {task.planned_start_date
                ? format(parseISO(task.planned_start_date), 'dd MMM yyyy')
                : '—'}
            </span>
          </div>

          {/* Editable end date */}
          <div className={styles.taskDates}>
            <span className={styles.dateLabel}>End:</span>
            <ClickToEditDate
              value={task.planned_end_date}
              disabled={!task.id}
              onChange={(value) => handleEndDateChange(task.id, value)}
              compact={false}
            />
          </div>
        </div>
      </td>
    );
  }

  return (
    <div className={styles.container}>
      {/* ── Predictive Analytics Banner ── */}
      {deficitAnalysis && !deficitAnalysis.onTrack && deficitAnalysis.deficits && deficitAnalysis.deficits.length > 0 && (
         <div style={{ background: 'rgba(255, 60, 60, 0.1)', border: '1px solid var(--color-danger)', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px' }}>
             <h4 style={{ margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-danger)', fontSize: '14px' }}>
                <AlertCircle size={16} /> Projected Timeline Exceeds Target Completion Date
             </h4>
             <p style={{ margin: 0, fontSize: '13px', color: 'var(--color-text)' }}>
                Target: <strong>{format(parseISO(plan.target_end_date), 'dd MMM yyyy')}</strong> vs Projected: <strong>{format(deficitAnalysis.maxProjected, 'dd MMM yyyy')}</strong>
             </p>
             <div style={{ marginTop: '12px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                 {deficitAnalysis.deficits.map(def => (
                     <span key={def.role} style={{ background: 'var(--color-danger)', color: '#fff', fontSize: '12px', padding: '4px 8px', borderRadius: '4px', fontWeight: 500 }}>
                        Missing ~{def.additionalHeadcount.toFixed(1)}x {def.role}
                     </span>
                 ))}
             </div>
         </div>
      )}

      {/* Timeline bar & Controls */}
      <div className={styles.tableHead}>
        <div className={styles.projectInfo}>
          <Calendar size={18} />
          <span>
            Timeline: {format(parseISO(plan.start_date), 'dd MMM yyyy')} {plan.target_end_date && (<>→ <b>Target:</b> {format(parseISO(plan.target_end_date), 'dd MMM yyyy')}</>)}
          </span>
        </div>
        <button
          className={styles.toggleBtn}
          onClick={() => setIsCompact(!isCompact)}
          title={isCompact ? "Show Full Details" : "Compact Grid"}
        >
          {isCompact ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
          {isCompact ? 'Expand' : 'Contract'}
        </button>
      </div>

      <div className={styles.tableWrapper}>
        <table className={styles.executionTable}>
          <thead>
            <tr className={styles.headerRow}>
              {/* Fixed chapter columns */}
              <th className={styles.stickyUnit}>Unit No</th>
              <th className={styles.stickyName}>Unit Name</th>
              <th className={styles.stickySmall}>Cluster</th>
              {isPrint && <th className={styles.stickySmall}>Pages</th>}

              {/* Role Assignment Dropdown Columns */}
              {uniqueRoles.map((role) => (
                <th key={`role-header-${role}`} className={styles.stickyRole}>
                  <div className={styles.stepHeader}>
                    <p className={styles.stepRole}>Assign</p>
                    <p className={styles.stepName}>{role}</p>
                  </div>
                </th>
              ))}

              {/* Dynamic step columns */}
              {steps.map((step) => {
                const isBookStep = step.unit_of_calculation === 'Book';
                return (
                  <th key={step.id} className={`${styles.stepCol} ${isCompact ? styles.stepColCompact : ''}`}>
                    <div className={styles.stepHeader}>
                      {isBookStep && (
                        <span className={styles.bookStepBadge}>
                          <BookOpen size={9} /> Book
                        </span>
                      )}
                      <p className={styles.stepRole}>{step.role_required}</p>
                      <p className={styles.stepName}>{step.name}</p>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {sortedBooks.map((book) => {
              const lastChapterIdx = book.chapters.length - 1;
              return [
                /* Book header row */
                <tr key={`book-header-${book.id}`} className={styles.bookHeaderRow}>
                  {/* Issue 2 Fix: Individual Sticky Columns for Header Row */}
                  <td className={`${styles.stickyUnit} ${styles.bookHeaderCell}`} style={{ borderRight: 'none' }}></td>
                  <td className={`${styles.stickyName} ${styles.bookHeaderCell}`} style={{ borderRight: 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <BookOpen size={14} />
                      <span>{book.name}</span>
                    </div>
                  </td>
                  <td className={`${styles.stickySmall} ${styles.bookHeaderCell}`} style={{ borderRight: 'none' }}></td>
                  {isPrint && <td className={`${styles.stickySmall} ${styles.bookHeaderCell}`} style={{ borderRight: 'none' }}></td>}

                  {/* Empty cells for Role columns on Book row */}
                  {uniqueRoles.map(role => (
                    <td key={`book-role-${book.id}-${role}`} className={`${styles.stickyRole} ${styles.bookHeaderCell}`} style={{ borderRight: 'none' }}></td>
                  ))}
                  
                  {/* Empty book spacer for dynamic span */}
                  <td
                    colSpan={steps.length}
                    className={styles.bookHeaderCell}
                    style={{ borderRight: 'none', display: 'none' }}
                  >
                  </td>

                  {/* Render Book steps here, empty cells for chapters */}
                  {steps.map((step) => {
                    const isBookStep = step.unit_of_calculation === 'Book';
                    if (isBookStep) {
                      const bookTask = taskMap[`${book.id}-${step.id}`];
                      return renderTaskCell(bookTask, step, true);
                    }
                    return (
                      <td key={`empty-bd-${step.id}`} className={styles.bookHeaderCell}></td>
                    );
                  })}
                </tr>,

                /* Chapter rows */
                ...book.chapters.map((chapter) => {
                  return (
                    <tr key={chapter.id} className={styles.chapterRow}>
                      <td className={styles.stickyUnit}>{chapter.unit_no}</td>
                      <td className={styles.stickyName}>{chapter.unit_name}</td>
                      <td className={styles.stickySmall}>
                        <span className={styles.clusterLabel}>
                          {plan.cluster_labels?.[chapter.cluster_id] ||
                            chapter.cluster_id}
                        </span>
                      </td>
                      {isPrint && (
                        <td className={styles.stickySmall}>{chapter.pages}</td>
                      )}

                      {/* Render Manual Assigment Dropdowns */}
                      {uniqueRoles.map(role => {
                         const roleStepsIds = steps.filter(s => s.role_required === role).map(s => s.id);
                         if (roleStepsIds.length === 0) return <td key={`null-${role}`} className={styles.stickyRole}></td>;
                         
                         // Get tasks for this chapter that use this role
                         const chapterTasksResult = activeTasks.filter(t => t.deliverable_id === chapter.id && roleStepsIds.includes(t.step_id));
                         const currentAssigned = chapterTasksResult.length > 0 ? chapterTasksResult[0].plan_team_member_id : '';

                         const candidates = teamMembers.filter(m => m.role === role);
                         const eligibleCandidates = candidates.filter(m => !m.allowed_books || m.allowed_books.length === 0 || m.allowed_books.includes(book.id));

                         return (
                           <td key={`role-select-${chapter.id}-${role}`} className={styles.stickyRole}>
                             <select 
                                className="form-input" 
                                style={{ minWidth: '100px', padding: '2px 4px', fontSize: '11px', height: '24px' }}
                                value={currentAssigned || ''}
                                onChange={(e) => handleRoleReassignment(chapter.id, role, e.target.value)}
                             >
                                <option value="">— Auto —</option>
                                {eligibleCandidates.map(c => (
                                   <option key={c.id} value={c._id || c.id}>{c.name}</option>
                                ))}
                             </select>
                           </td>
                         );
                      })}

                      {steps.map((step) => {
                        const isBookStep = step.unit_of_calculation === 'Book';

                        if (isBookStep) {
                          // No task on chapter level for book steps (handled in the Book header row)
                          return (
                            <td key={step.id} className={`${styles.stepCell} ${styles.stepCellDisabled}`}>
                              <span className={styles.noTask}>—</span>
                            </td>
                          );
                        }

                        // Chapter-level task
                        const task = taskMap[`${chapter.id}-${step.id}`] || null;
                        return renderTaskCell(task, step);
                      })}
                    </tr>
                  );
                }),
              ];
            })}
          </tbody>
        </table>

        {sortedBooks.length === 0 && (
          <div
            style={{
              textAlign: 'center',
              padding: 'var(--space-12)',
              color: 'var(--color-text-muted)',
            }}
          >
            No books or chapters found for this plan.
          </div>
        )}
      </div>
    </div>
  );
}
