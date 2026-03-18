import { format, addDays, isWeekend, parseISO, isBefore, isEqual } from 'date-fns';

// ─────────────────────────────────────────────────────────────────────────────
// Core date utilities
// ─────────────────────────────────────────────────────────────────────────────

export const isNonWorkingDay = (date, blockedSet) => {
  if (isWeekend(date)) return true;
  return blockedSet.has(format(date, 'yyyy-MM-dd'));
};

/**
 * Starting from startDate, advance by businessDaysToPlan working days,
 * skipping weekends and any dates in blockedSet.
 */
export const addBusinessDaysWithHolidays = (
  startDate,
  businessDaysToPlan,
  blockedSet = new Set()
) => {
  let date =
    typeof startDate === 'string' ? parseISO(startDate) : new Date(startDate);
  let remaining = businessDaysToPlan;

  // Ensure we start on a working day
  while (isNonWorkingDay(date, blockedSet)) {
    date = addDays(date, 1);
  }

  while (remaining > 1) {
    date = addDays(date, 1);
    if (!isNonWorkingDay(date, blockedSet)) remaining -= 1;
  }

  // Land on a working day
  while (isNonWorkingDay(date, blockedSet)) {
    date = addDays(date, 1);
  }

  return date;
};

// ─────────────────────────────────────────────────────────────────────────────
// Topological sort of steps (Kahn's algorithm)
// Handles arbitrary dependency chains via parallel_dependency_id.
// ─────────────────────────────────────────────────────────────────────────────

function topoSortSteps(steps) {
  const adj = {};       // stepId → [steps that depend on it]
  const inDegree = {};  // stepId → number of unresolved predecessors

  steps.forEach((s) => {
    adj[s.id] = [];
    inDegree[s.id] = 0;
  });

  steps.forEach((s) => {
    if (s.parallel_dependency_id && inDegree[s.id] !== undefined) {
      adj[s.parallel_dependency_id] = adj[s.parallel_dependency_id] || [];
      adj[s.parallel_dependency_id].push(s);
      inDegree[s.id] += 1;
    }
  });

  const queue = steps.filter((s) => inDegree[s.id] === 0);
  const sorted = [];

  while (queue.length > 0) {
    const step = queue.shift();
    sorted.push(step);
    (adj[step.id] || []).forEach((dep) => {
      inDegree[dep.id] -= 1;
      if (inDegree[dep.id] === 0) queue.push(dep);
    });
  }

  // If sorted.length < steps.length there's a cycle — return best effort
  if (sorted.length < steps.length) {
    const missing = steps.filter((s) => !sorted.find((ss) => ss.id === s.id));
    sorted.push(...missing);
  }

  return sorted;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase-1: Assign one team member per (chapter × role) for chapter-level steps.
//
// Priority order: books by display_order, then chapters within each book
//   by display_order.
// Tie-breaking: highest bandwidth first; equal bandwidth → member free earliest.
//
// Returns chapterRoleAssignment map:
//   `${chapter.id}-${role}` → teamMember object
// ─────────────────────────────────────────────────────────────────────────────

function assignChapterRoles(books, steps, teamMembers) {
  const chapterRoleAssignment = {};

  // Count rough effort days per member to track assignment order load
  const memberEstLoad = {}; // memberId → estimated cumulative days
  teamMembers.forEach((m) => {
    memberEstLoad[m.id] = 0;
  });

  const chapterLevelSteps = steps.filter(
    (s) => !s.unit_of_calculation || s.unit_of_calculation === 'Chapter / Unit'
  );
  const rolesNeeded = [...new Set(chapterLevelSteps.map((s) => s.role_required))];

  const sortedBooks = [...books].sort((a, b) => a.display_order - b.display_order);

  for (const book of sortedBooks) {
    const sortedChapters = [...(book.chapters || [])].sort(
      (a, b) => a.display_order - b.display_order
    );

    for (const chapter of sortedChapters) {
      for (const role of rolesNeeded) {
        const candidates = teamMembers.filter((m) => m.role === role);
        if (candidates.length === 0) continue;

        // Sort: highest BW first, then lowest estimated load (free earliest)
        const winner = [...candidates].sort((a, b) => {
          if (b.bandwidth !== a.bandwidth) return b.bandwidth - a.bandwidth;
          return memberEstLoad[a.id] - memberEstLoad[b.id];
        })[0];

        chapterRoleAssignment[`${chapter.id}-${role}`] = winner;

        // Rough effort estimate for load tracking
        const chapterEffort = chapterLevelSteps
          .filter((s) => s.role_required === role)
          .reduce((sum, step) => {
            const normObj = (step.norms || []).find(
              (n) => n.cluster_id === chapter.cluster_id
            );
            const norm = parseFloat(normObj?.norm_in_mandays) || 0;
            const pagesRatio =
              step.norm_pages > 0 ? (chapter.pages || 1) / step.norm_pages : 1;
            return sum + norm * pagesRatio;
          }, 0);

        memberEstLoad[winner.id] += chapterEffort / winner.bandwidth;
      }
    }
  }

  return chapterRoleAssignment;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase-2: Run the full schedule.
//
// chapterRoleAssignment: from Phase-1  (`${chapterId}-${role}` → member)
// preservedBookAssignments: from existing DB tasks (`${bookId}-${stepId}` → member)
//   — used on cascade to keep the same people for book tasks
// manualOverrides: `${chapterId}-${stepId}` or `${bookId}-${stepId}` → endDateStr
//   — forces a specific end date (user edit); start is still computed normally
// existingTasksMap: `${chapterId}-${stepId}` or `${bookId}-${stepId}` → existing task
//   — used to preserve DB id, status, comments on cascade
// ─────────────────────────────────────────────────────────────────────────────

function runSchedule(
  plan,
  books,
  teamMembers,
  holidaySet,
  memberLeavesMap,
  chapterRoleAssignment,
  preservedBookAssignments = {},
  manualOverrides = {},
  existingTasksMap = {}
) {
  const globalHolidays = holidaySet || new Set();
  const sortedSteps = topoSortSteps(plan.steps || []);
  const stepsById = Object.fromEntries((plan.steps || []).map((s) => [s.id, s]));

  // member → earliest available date (starts from plan start)
  const memberFreeFrom = {};
  teamMembers.forEach((m) => {
    memberFreeFrom[m.id] = parseISO(plan.start_date);
  });

  const taskMap = {}; // `${chapterId}-${stepId}` or `${bookId}-${stepId}` → task
  const tasks = [];

  const sortedBooks = [...books].sort((a, b) => a.display_order - b.display_order);

  for (const step of sortedSteps) {
    const predStep = step.parallel_dependency_id
      ? stepsById[step.parallel_dependency_id]
      : null;

    const isChapterStep =
      !step.unit_of_calculation ||
      step.unit_of_calculation === 'Chapter / Unit';

    // ── Chapter / Unit level ────────────────────────────────────────────────
    if (isChapterStep) {
      for (const book of sortedBooks) {
        const sortedChapters = [...(book.chapters || [])].sort(
          (a, b) => a.display_order - b.display_order
        );

        for (const chapter of sortedChapters) {
          const taskKey = `${chapter.id}-${step.id}`;
          const member = chapterRoleAssignment[`${chapter.id}-${step.role_required}`];

          // Determine earliest start from predecessor
          let earliestStart = parseISO(plan.start_date);

          if (predStep) {
            const isPredChapter =
              !predStep.unit_of_calculation ||
              predStep.unit_of_calculation === 'Chapter / Unit';

            if (isPredChapter) {
              const predTask = taskMap[`${chapter.id}-${predStep.id}`];
              if (predTask) {
                earliestStart = addDays(parseISO(predTask.planned_end_date), 1);
              }
            } else {
              // Predecessor is a Book step
              const predTask = taskMap[`${book.id}-${predStep.id}`];
              if (predTask) {
                earliestStart = addDays(parseISO(predTask.planned_end_date), 1);
              }
            }

            if (step.buffer_days > 0) {
              earliestStart = addBusinessDaysWithHolidays(
                earliestStart,
                step.buffer_days,
                globalHolidays
              );
            }
          }

          if (!member) {
            // No team member for this role — create unassigned warning task
            const existing = existingTasksMap[taskKey] || {};
            const task = {
              ...existing,
              deliverable_id: chapter.id,
              book_id: null,
              step_id: step.id,
              plan_id: plan.id,
              plan_team_member_id: null,
              planned_start_date: format(earliestStart, 'yyyy-MM-dd'),
              planned_end_date: format(earliestStart, 'yyyy-MM-dd'),
              status: existing.status || 'Yet to start',
            };
            taskMap[taskKey] = task;
            tasks.push(task);
            continue;
          }

          const memberLeaves = memberLeavesMap[member.id] || new Set();
          const blocked = new Set([...globalHolidays, ...memberLeaves]);

          // Actual start = max(earliestStart, member's current free-from)
          let actualStart =
            isBefore(memberFreeFrom[member.id], earliestStart) ||
            isEqual(memberFreeFrom[member.id], earliestStart)
              ? earliestStart
              : memberFreeFrom[member.id];

          // Advance past non-working days
          while (isNonWorkingDay(actualStart, blocked)) {
            actualStart = addDays(actualStart, 1);
          }

          let endDate;
          if (manualOverrides[taskKey]) {
            endDate = parseISO(manualOverrides[taskKey]);
          } else {
            const normObj = (step.norms || []).find(
              (n) => n.cluster_id === chapter.cluster_id
            );
            const norm = parseFloat(normObj?.norm_in_mandays) || 0;
            const pagesRatio =
              step.norm_pages > 0 ? (chapter.pages || 1) / step.norm_pages : 1;
            const effort = norm * pagesRatio;
            const effectiveDays = effort > 0 ? effort / member.bandwidth : 1;
            endDate = addBusinessDaysWithHolidays(actualStart, effectiveDays, blocked);
          }

          memberFreeFrom[member.id] = addDays(endDate, 1);

          const existing = existingTasksMap[taskKey] || {};
          const task = {
            ...existing,
            deliverable_id: chapter.id,
            book_id: null,
            step_id: step.id,
            plan_id: plan.id,
            plan_team_member_id: member.id,
            planned_start_date: format(actualStart, 'yyyy-MM-dd'),
            planned_end_date: format(endDate, 'yyyy-MM-dd'),
            status: existing.status || 'Yet to start',
          };

          taskMap[taskKey] = task;
          tasks.push(task);
        }
      }
    }

    // ── Book level ──────────────────────────────────────────────────────────
    if (step.unit_of_calculation === 'Book') {
      for (const book of sortedBooks) {
        const taskKey = `${book.id}-${step.id}`;

        // Use preserved assignment or pick the member free earliest (highest BW on tie)
        let member = preservedBookAssignments[taskKey]
          ? teamMembers.find((m) => m.id === preservedBookAssignments[taskKey])
          : null;

        if (!member) {
          const candidates = teamMembers.filter(
            (m) => m.role === step.role_required
          );
          if (candidates.length > 0) {
            member = [...candidates].sort((a, b) => {
              const aFree = memberFreeFrom[a.id];
              const bFree = memberFreeFrom[b.id];
              if (!isEqual(aFree, bFree))
                return isBefore(aFree, bFree) ? -1 : 1;
              return b.bandwidth - a.bandwidth;
            })[0];
          }
        }

        // Earliest start from predecessor
        let earliestStart = parseISO(plan.start_date);

        if (predStep) {
          const isPredChapter =
            !predStep.unit_of_calculation ||
            predStep.unit_of_calculation === 'Chapter / Unit';

          if (isPredChapter) {
            // Wait for ALL chapters in this book to finish the predecessor step
            const sortedChapters = [...(book.chapters || [])].sort(
              (a, b) => a.display_order - b.display_order
            );
            let maxEnd = parseISO(plan.start_date);
            for (const ch of sortedChapters) {
              const predTask = taskMap[`${ch.id}-${predStep.id}`];
              if (predTask) {
                const predEnd = parseISO(predTask.planned_end_date);
                if (!isBefore(predEnd, maxEnd)) maxEnd = predEnd;
              }
            }
            earliestStart = addDays(maxEnd, 1);
          } else {
            const predTask = taskMap[`${book.id}-${predStep.id}`];
            if (predTask) {
              earliestStart = addDays(parseISO(predTask.planned_end_date), 1);
            }
          }

          if (step.buffer_days > 0) {
            earliestStart = addBusinessDaysWithHolidays(
              earliestStart,
              step.buffer_days,
              globalHolidays
            );
          }
        }

        if (!member) {
          // No member — create unassigned warning task
          const existing = existingTasksMap[taskKey] || {};
          const task = {
            ...existing,
            deliverable_id: null,
            book_id: book.id,
            step_id: step.id,
            plan_id: plan.id,
            plan_team_member_id: null,
            planned_start_date: format(earliestStart, 'yyyy-MM-dd'),
            planned_end_date: format(earliestStart, 'yyyy-MM-dd'),
            status: existing.status || 'Yet to start',
          };
          taskMap[taskKey] = task;
          tasks.push(task);
          continue;
        }

        const memberLeaves = memberLeavesMap[member.id] || new Set();
        const blocked = new Set([...globalHolidays, ...memberLeaves]);

        let actualStart =
          isBefore(memberFreeFrom[member.id], earliestStart) ||
          isEqual(memberFreeFrom[member.id], earliestStart)
            ? earliestStart
            : memberFreeFrom[member.id];

        while (isNonWorkingDay(actualStart, blocked)) {
          actualStart = addDays(actualStart, 1);
        }

        let endDate;
        if (manualOverrides[taskKey]) {
          endDate = parseISO(manualOverrides[taskKey]);
        } else {
          const bookPages = (book.chapters || []).reduce(
            (sum, ch) => sum + (ch.pages || 0),
            0
          );
          const pagesRatio =
            step.norm_pages > 0 ? bookPages / step.norm_pages : 1;
          const effort = parseFloat(step.book_norm_in_mandays || 0) * pagesRatio;
          const effectiveDays = effort > 0 ? effort / member.bandwidth : 1;
          endDate = addBusinessDaysWithHolidays(actualStart, effectiveDays, blocked);
        }

        memberFreeFrom[member.id] = addDays(endDate, 1);

        const existing = existingTasksMap[taskKey] || {};
        const task = {
          ...existing,
          deliverable_id: null,
          book_id: book.id,
          step_id: step.id,
          plan_id: plan.id,
          plan_team_member_id: member.id,
          planned_start_date: format(actualStart, 'yyyy-MM-dd'),
          planned_end_date: format(endDate, 'yyyy-MM-dd'),
          status: existing.status || 'Yet to start',
        };

        taskMap[taskKey] = task;
        tasks.push(task);
      }
    }
  }

  return tasks;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a full schedule for a new plan.
 *
 * @param {Object} plan          - { id, start_date, steps: planning_steps[] with norms[] }
 * @param {Array}  books         - plan_books[] each with chapters: planning_deliverables[]
 * @param {Array}  teamMembers   - plan_team_members[] with leaves: plan_leaves[] on each
 * @param {Set}    holidaySet    - Set of 'YYYY-MM-DD' holiday date strings
 * @returns {Array}              - planning_tasks[] ready for DB insert
 */
export const forecastExecutionTasks = (plan, books, teamMembers, holidaySet) => {
  // Build per-member leave sets
  const memberLeavesMap = {};
  teamMembers.forEach((m) => {
    memberLeavesMap[m.id] = new Set((m.leaves || []).map((l) => l.leave_date));
  });

  const chapterRoleAssignment = assignChapterRoles(
    books,
    plan.steps || [],
    teamMembers
  );

  return runSchedule(
    plan,
    books,
    teamMembers,
    holidaySet,
    memberLeavesMap,
    chapterRoleAssignment
  );
};

/**
 * Re-run the full schedule after a manual end-date override (Option B cascade).
 * Preserves existing member assignments and DB task IDs/statuses.
 *
 * @param {Object} plan             - plan with steps and norms
 * @param {Array}  books            - books with chapters
 * @param {Array}  existingTasks    - current planning_tasks from DB/state (must have .id)
 * @param {Array}  teamMembers      - plan_team_members with leaves
 * @param {Set}    holidaySet
 * @param {string} overriddenTaskId - DB id of the task the user manually edited
 * @param {string} newEndDate       - 'YYYY-MM-DD'
 * @returns {Array}                 - all tasks with updated dates, preserving ids/statuses
 */
export const cascadeAfterEdit = (
  plan,
  books,
  existingTasks,
  teamMembers,
  holidaySet,
  overriddenTaskId,
  newEndDate
) => {
  const memberLeavesMap = {};
  teamMembers.forEach((m) => {
    memberLeavesMap[m.id] = new Set((m.leaves || []).map((l) => l.leave_date));
  });

  // Extract chapter-role assignments from existing tasks (preserve Phase-1 decisions)
  const stepsById = Object.fromEntries(
    (plan.steps || []).map((s) => [s.id, s])
  );

  const chapterRoleAssignment = {};
  const preservedBookAssignments = {};

  existingTasks.forEach((task) => {
    if (!task.plan_team_member_id) return;
    const step = stepsById[task.step_id];
    if (!step) return;

    if (
      task.deliverable_id &&
      (!step.unit_of_calculation || step.unit_of_calculation === 'Chapter / Unit')
    ) {
      chapterRoleAssignment[`${task.deliverable_id}-${step.role_required}`] =
        teamMembers.find((m) => m.id === task.plan_team_member_id);
    } else if (task.book_id && step.unit_of_calculation === 'Book') {
      // Store memberId (resolve to object in runSchedule)
      preservedBookAssignments[`${task.book_id}-${step.id}`] =
        task.plan_team_member_id;
    }
  });

  // Build existing task lookup map (for preserving id, status, comments)
  const existingTasksMap = {};
  existingTasks.forEach((task) => {
    const key = task.deliverable_id
      ? `${task.deliverable_id}-${task.step_id}`
      : `${task.book_id}-${task.step_id}`;
    existingTasksMap[key] = task;
  });

  // Find the overridden task and build manualOverrides
  const overriddenTask = existingTasks.find((t) => t.id === overriddenTaskId);
  const manualOverrides = {};
  if (overriddenTask) {
    const key = overriddenTask.deliverable_id
      ? `${overriddenTask.deliverable_id}-${overriddenTask.step_id}`
      : `${overriddenTask.book_id}-${overriddenTask.step_id}`;
    manualOverrides[key] = newEndDate;
  }

  return runSchedule(
    plan,
    books,
    teamMembers,
    holidaySet,
    memberLeavesMap,
    chapterRoleAssignment,
    preservedBookAssignments,
    manualOverrides,
    existingTasksMap
  );
};
