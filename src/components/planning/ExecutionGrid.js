'use client';

import { useState, useMemo, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import { Calendar, BookOpen, AlertCircle } from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { cascadeAfterEdit } from '@/lib/utils/planning-calculations';
import styles from './ExecutionGrid.module.css';

const STATUS_OPTIONS = ['Yet to start', 'In Progress', 'Done', 'Skipped'];

const STATUS_COLORS = {
  Done: 'var(--color-success)',
  'In Progress': 'var(--color-primary)',
  Skipped: 'var(--color-text-muted)',
  'Yet to start': 'var(--color-text-secondary)',
};

export default function ExecutionGrid({
  plan,
  tasks,
  books,
  teamMembers,
  memberLeavesMap,
  holidaySet,
}) {
  const [activeTasks, setActiveTasks] = useState(tasks || []);
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

  // ── Status update ───────────────────────────────────────────────────────
  async function handleStatusChange(taskId, newStatus) {
    setActiveTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t))
    );
    await supabase
      .from('planning_tasks')
      .update({ status: newStatus })
      .eq('id', taskId);
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

    return (
      <td key={task.id || step.id} className={`${styles.stepCell} ${isBookRow ? styles.bookHeaderCell : ''}`}>
        <div
          className={`${styles.taskCard} ${isUnassigned ? styles.taskUnassigned : ''}`}
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
            style={{ color: STATUS_COLORS[task.status] || STATUS_COLORS['Yet to start'] }}
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
              onChange={(e) => handleEndDateChange(task.id, e.target.value)}
            />
          </div>
        </div>
      </td>
    );
  }

  return (
    <div className={styles.container}>
      {/* Timeline bar */}
      <div className={styles.tableHead}>
        <div className={styles.projectInfo}>
          <Calendar size={18} />
          <span>
            Timeline: {format(parseISO(plan.start_date), 'dd MMM yyyy')} onwards
          </span>
        </div>
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

              {/* Dynamic step columns */}
              {steps.map((step) => {
                const isBookStep = step.unit_of_calculation === 'Book';
                return (
                  <th key={step.id} className={styles.stepCol}>
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
                ...book.chapters.map((chapter, chIdx) => {
                  const isLastChapter = chIdx === lastChapterIdx;
                  const rowClass = chIdx % 2 === 0 ? styles.evenRow : styles.oddRow;

                  return (
                    <tr key={chapter.id} className={rowClass}>
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

                      {steps.map((step) => {
                        const isBookStep = step.unit_of_calculation === 'Book';

                        if (isBookStep) {
                          // No task on chapter level for book steps (handled in the Book header row)
                          return (
                            <td key={step.id} className={`${styles.stepCell} ${styles.stepCellDisabled}`}>
                              <span className={styles.noTask}></span>
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
