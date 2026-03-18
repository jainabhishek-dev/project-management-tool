'use client';

import { useMemo } from 'react';
import { format, parseISO, differenceInDays } from 'date-fns';
import { Users, AlertCircle, CheckCircle2 } from 'lucide-react';
import styles from './BandwidthSummary.module.css';

export default function BandwidthSummary({ plan, tasks, books, teamMembers }) {
  const stepsById = useMemo(() => {
    const map = {};
    (plan.steps || []).forEach((s) => (map[s.id] = s));
    return map;
  }, [plan.steps]);

  const chaptersById = useMemo(() => {
    const map = {};
    (books || []).forEach((book) =>
      (book.chapters || []).forEach((ch) => (map[ch.id] = ch))
    );
    return map;
  }, [books]);

  const bookChaptersMap = useMemo(() => {
    const map = {}; // bookId → chapters[]
    (books || []).forEach((book) => {
      map[book.id] = book.chapters || [];
    });
    return map;
  }, [books]);

  const memberSummaries = useMemo(() => {
    return (teamMembers || []).map((member) => {
      const memberTasks = tasks.filter(
        (t) => t.plan_team_member_id === member.id
      );

      let totalEffort = 0;
      let earliestStart = null;
      let latestEnd = null;

      memberTasks.forEach((task) => {
        const step = stepsById[task.step_id];
        if (!step) return;

        // Calculate effort for this task
        let effort = 0;
        if (task.deliverable_id) {
          // Chapter-level task
          const chapter = chaptersById[task.deliverable_id];
          if (chapter) {
            const normObj = (step.norms || []).find(
              (n) => n.cluster_id === chapter.cluster_id
            );
            const norm = parseFloat(normObj?.norm_in_mandays) || 0;
            const pagesRatio =
              step.norm_pages > 0
                ? (chapter.pages || 1) / step.norm_pages
                : 1;
            effort = norm * pagesRatio;
          }
        } else if (task.book_id) {
          // Book-level task
          const bookChapters = bookChaptersMap[task.book_id] || [];
          const bookPages = bookChapters.reduce(
            (sum, ch) => sum + (ch.pages || 0),
            0
          );
          const pagesRatio =
            step.norm_pages > 0 ? bookPages / step.norm_pages : 1;
          effort = parseFloat(step.book_norm_in_mandays || 0) * pagesRatio;
        }

        totalEffort += effort;

        // Track time span
        if (task.planned_start_date) {
          const start = parseISO(task.planned_start_date);
          if (!earliestStart || start < earliestStart) earliestStart = start;
        }
        if (task.planned_end_date) {
          const end = parseISO(task.planned_end_date);
          if (!latestEnd || end > latestEnd) latestEnd = end;
        }
      });

      // Capacity calculation
      let workingDays = 0;
      let availableEffort = 0;
      let utilizationPct = 0;

      if (earliestStart && latestEnd) {
        const calendarDays = differenceInDays(latestEnd, earliestStart) + 1;
        workingDays = Math.ceil(calendarDays * (5 / 7));
        availableEffort = workingDays * member.bandwidth;
        utilizationPct =
          availableEffort > 0
            ? +((totalEffort / availableEffort) * 100).toFixed(0)
            : 0;
      }

      return {
        member,
        totalEffort,
        workingDays,
        availableEffort,
        utilizationPct,
        isOverloaded: utilizationPct > 100,
        taskCount: memberTasks.length,
        earliestStart,
        latestEnd,
      };
    });
  }, [tasks, teamMembers, stepsById, chaptersById, bookChaptersMap]);

  if ((teamMembers || []).length === 0) {
    return (
      <div
        className={styles.container}
        style={{ padding: 'var(--space-8)', textAlign: 'center' }}
      >
        <Users
          size={40}
          style={{ color: 'var(--color-text-muted)', marginBottom: 8 }}
        />
        <p style={{ color: 'var(--color-text-muted)' }}>
          No team members defined for this plan.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.grid}>
        {memberSummaries.map(
          ({
            member,
            totalEffort,
            workingDays,
            availableEffort,
            utilizationPct,
            isOverloaded,
            taskCount,
            earliestStart,
            latestEnd,
          }) => (
            <div key={member.id} className={styles.card}>
              <div className={styles.header}>
                <div className={styles.roleIcon}>
                  <Users size={16} />
                </div>
                <div>
                  <h3 className={styles.memberName}>{member.name}</h3>
                  <p className={styles.roleName}>{member.role}</p>
                </div>
              </div>

              <div className={styles.bwRow}>
                <span className={styles.label}>Bandwidth</span>
                <span className={styles.memberBw}>
                  {member.bandwidth * 100}%
                </span>
              </div>

              <div className={styles.divider} />

              <div className={styles.statRow}>
                <span className={styles.label}>Tasks Assigned</span>
                <span className={styles.value}>{taskCount}</span>
              </div>

              <div className={styles.statRow}>
                <span className={styles.label}>Total Effort</span>
                <span className={styles.value}>
                  {totalEffort.toFixed(1)} mandays
                </span>
              </div>

              {earliestStart && latestEnd && (
                <>
                  <div className={styles.statRow}>
                    <span className={styles.label}>Time Span</span>
                    <span className={styles.value}>
                      {format(earliestStart, 'MMM dd')} –{' '}
                      {format(latestEnd, 'MMM dd')}
                    </span>
                  </div>

                  <div className={styles.statRow}>
                    <span className={styles.label}>Working Days</span>
                    <span className={styles.value}>{workingDays}</span>
                  </div>

                  <div className={styles.statRow}>
                    <span className={styles.label}>Available Effort</span>
                    <span className={styles.value}>
                      {availableEffort.toFixed(1)} mandays
                    </span>
                  </div>

                  <div className={styles.divider} />

                  <div className={styles.utilBar}>
                    <div
                      className={styles.utilFill}
                      style={{
                        width: `${Math.min(utilizationPct, 100)}%`,
                        background: isOverloaded
                          ? 'var(--color-danger)'
                          : 'var(--color-success)',
                      }}
                    />
                  </div>

                  <div
                    className={styles.statusBadge}
                    style={{
                      background: isOverloaded
                        ? 'var(--color-danger-subtle)'
                        : 'var(--color-success-subtle)',
                    }}
                  >
                    {isOverloaded ? (
                      <AlertCircle size={14} />
                    ) : (
                      <CheckCircle2 size={14} />
                    )}
                    <span>
                      {utilizationPct}% utilised
                      {isOverloaded ? ' — Overloaded' : ' — OK'}
                    </span>
                  </div>
                </>
              )}
            </div>
          )
        )}
      </div>
    </div>
  );
}
