'use client';

import { useMemo } from 'react';
import { format, parseISO, differenceInDays } from 'date-fns';
import { Users, AlertCircle, CheckCircle2 } from 'lucide-react';
import styles from './BandwidthSummary.module.css';

export default function BandwidthSummary({ plan, tasks, deliverables, teamMembers }) {
  const analysis = useMemo(() => {
    const roleData = {};

    // Initialise role entries from actual team members
    (teamMembers || []).forEach((member) => {
      const role = member.role;
      if (!roleData[role]) {
        roleData[role] = {
          members: [],
          totalBandwidth: 0,
          required: 0,
          start: null,
          end: null,
        };
      }
      roleData[role].members.push(member);
      roleData[role].totalBandwidth += member.bandwidth;
    });

    // Accumulate required effort from tasks
    tasks.forEach((task) => {
      const step = (plan.steps || []).find((s) => s.id === task.step_id);
      if (!step) return;

      const role = step.role_required;
      if (!roleData[role]) {
        // Role exists in plan but no team member assigned yet
        roleData[role] = {
          members: [],
          totalBandwidth: 0,
          required: 0,
          start: null,
          end: null,
        };
      }

      const del = deliverables.find((d) => d.id === task.deliverable_id);
      if (!del) return;

      const normObj = (step.norms || []).find((n) => n.cluster_id === del.cluster_id);
      const effort = parseFloat(normObj?.norm_in_mandays) || 0;
      roleData[role].required += effort;

      if (task.planned_start_date && task.planned_end_date) {
        const taskStart = parseISO(task.planned_start_date);
        const taskEnd = parseISO(task.planned_end_date);
        if (!roleData[role].start || taskStart < roleData[role].start) {
          roleData[role].start = taskStart;
        }
        if (!roleData[role].end || taskEnd > roleData[role].end) {
          roleData[role].end = taskEnd;
        }
      }
    });

    // Calculate capacity vs demand for each role
    Object.keys(roleData).forEach((role) => {
      const r = roleData[role];
      if (!r.start || !r.end) {
        r.workingDays = 0;
        r.availableEffort = 0;
        r.utilizationPct = 0;
        r.isOverloaded = false;
        return;
      }

      const totalCalendarDays = differenceInDays(r.end, r.start) + 1;
      // Approximate: 5 working days per 7 calendar days
      r.workingDays = Math.ceil(totalCalendarDays * (5 / 7));

      // Available effort = working days × summed bandwidth for this role
      r.availableEffort = r.workingDays * r.totalBandwidth;
      r.utilizationPct =
        r.availableEffort > 0
          ? ((r.required / r.availableEffort) * 100).toFixed(0)
          : 0;
      r.isOverloaded = parseFloat(r.utilizationPct) > 100;
    });

    return roleData;
  }, [plan, tasks, deliverables, teamMembers]);

  const roles = Object.keys(analysis);

  if (roles.length === 0) {
    return (
      <div className={styles.container} style={{ padding: 'var(--space-8)', textAlign: 'center' }}>
        <Users size={40} style={{ color: 'var(--color-text-muted)', marginBottom: 8 }} />
        <p style={{ color: 'var(--color-text-muted)' }}>
          No team members defined for this plan yet.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.grid}>
        {roles.map((role) => {
          const data = analysis[role];
          const hasData = data.start && data.end;
          return (
            <div key={role} className={styles.card}>
              <div className={styles.header}>
                <div className={styles.roleIcon}>
                  <Users size={16} />
                </div>
                <h3 className={styles.roleName}>{role}</h3>
              </div>

              {/* Team members assigned */}
              {data.members.length > 0 && (
                <div className={styles.membersList}>
                  {data.members.map((m) => (
                    <div key={m.id} className={styles.memberRow}>
                      <span className={styles.memberName}>{m.name}</span>
                      <span className={styles.memberBw}>{m.bandwidth * 100}% BW</span>
                    </div>
                  ))}
                </div>
              )}

              {data.members.length === 0 && (
                <p className={styles.noMember}>No member assigned</p>
              )}

              <div className={styles.divider} />

              <div className={styles.statRow}>
                <span className={styles.label}>Total Effort</span>
                <span className={styles.value}>{data.required.toFixed(1)} mandays</span>
              </div>

              {hasData && (
                <>
                  <div className={styles.statRow}>
                    <span className={styles.label}>Time Span</span>
                    <span className={styles.value}>
                      {format(data.start, 'MMM dd')} – {format(data.end, 'MMM dd')}
                    </span>
                  </div>

                  <div className={styles.statRow}>
                    <span className={styles.label}>Working Days</span>
                    <span className={styles.value}>{data.workingDays} days</span>
                  </div>

                  <div className={styles.statRow}>
                    <span className={styles.label}>Available Effort</span>
                    <span className={styles.value}>
                      {data.availableEffort.toFixed(1)} mandays
                      {data.totalBandwidth < 1 && (
                        <span style={{ color: 'var(--color-text-muted)', fontSize: '0.6rem', marginLeft: 4 }}>
                          ({(data.totalBandwidth * 100).toFixed(0)}% BW)
                        </span>
                      )}
                    </span>
                  </div>

                  <div className={styles.divider} />

                  {/* Utilisation bar */}
                  <div className={styles.utilBar}>
                    <div
                      className={styles.utilFill}
                      style={{
                        width: `${Math.min(parseFloat(data.utilizationPct), 100)}%`,
                        background: data.isOverloaded
                          ? 'var(--color-danger)'
                          : 'var(--color-success)',
                      }}
                    />
                  </div>

                  <div
                    className={styles.statusBadge}
                    style={{
                      background: data.isOverloaded
                        ? 'var(--color-danger-subtle)'
                        : 'var(--color-success-subtle)',
                    }}
                  >
                    {data.isOverloaded ? (
                      <AlertCircle size={14} />
                    ) : (
                      <CheckCircle2 size={14} />
                    )}
                    <span>
                      {data.utilizationPct}% utilised
                      {data.isOverloaded ? ' — Overloaded' : ' — OK'}
                    </span>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
