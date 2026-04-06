import { format, addDays, isWeekend, parseISO } from 'date-fns';

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
 * The startDate itself counts as Day 1 (if it is a working day).
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
// Advance a date to the next working day (same day if already working).
// Uses the member-specific blocked set (holidays + personal leaves).
// ─────────────────────────────────────────────────────────────────────────────

function nextWorkingDay(date, blockedSet) {
  let d = new Date(date);
  while (isNonWorkingDay(d, blockedSet)) d = addDays(d, 1);
  return d;
}

// ─────────────────────────────────────────────────────────────────────────────
// Event-Driven Opportunistic Scheduler
//
// Design principles:
//  1. No phase-1 pre-assignment. All chapter assignments are made dynamically
//     the moment a task becomes "ready" (all dependencies done).
//  2. Strict stickiness: once a person is assigned to (chapter, role), they
//     handle ALL future steps with that role on that chapter. Other people's
//     assignment to that chapter must be a different person (conflict rule).
//  3. Book-closure priority: when a book's chapter steps are all done and its
//     book-level step is ready, that task is scheduled before any new chapter task.
//  4. No sub-day fractional packing. Tasks occupy whole working days.
//     Duration = ceil(effortDays / bandwidth), minimum 1 working day.
//     After a task ends, the person's next slot starts the following working day.
// ─────────────────────────────────────────────────────────────────────────────

function runEventDrivenSchedule(
  plan,
  books,
  teamMembers,
  holidaySet,
  memberLeavesMap,
  manualOverrides = {},
  existingTasksMap = {},
  preservedAssignments = {}   // `${chapterId}|${role}` or `${bookId}|book|${stepId}` → memberId
) {
  const globalHolidays = holidaySet || new Set();
  const sortedSteps = [...(plan.steps || [])].sort((a, b) => a.display_order - b.display_order);
  const sortedBooks = [...books].sort((a, b) => a.display_order - b.display_order);
  const planStartDate = parseISO(plan.start_date);

  // ── Per-member blocked sets (global holidays + personal leaves) ──────────
  const memberBlockedSets = {};
  teamMembers.forEach((m) => {
    const blocked = new Set(globalHolidays);
    const leaves = memberLeavesMap[m.id] || new Set();
    leaves.forEach((l) => blocked.add(l));
    memberBlockedSets[m.id] = blocked;
  });

  // ── Member availability tracking ─────────────────────────────────────────
  // memberFreeDate[id] = the first working day the member is available.
  const memberFreeDate = {};
  teamMembers.forEach((m) => {
    memberFreeDate[m.id] = nextWorkingDay(planStartDate, memberBlockedSets[m.id]);
  });

  // ── Sticky assignment map ────────────────────────────────────────────────
  // chapterRoleMap[`${chapterId}|${role}`] = memberId
  // Seeded from preserved assignments (used by cascadeAfterEdit).
  const chapterRoleMap = { ...preservedAssignments };

  // ── Dependency resolution ────────────────────────────────────────────────
  const taskEndDates = {}; // taskId → Date

  // ── Build task nodes ─────────────────────────────────────────────────────
  const nodes = [];

  for (let bIdx = 0; bIdx < sortedBooks.length; bIdx++) {
    const book = sortedBooks[bIdx];
    const sortedChapters = [...(book.chapters || [])].sort(
      (a, b) => a.display_order - b.display_order
    );

    for (let sIdx = 0; sIdx < sortedSteps.length; sIdx++) {
      const step = sortedSteps[sIdx];
      const isBookStep = step.unit_of_calculation === 'Book';
      const predStepId = step.parallel_dependency_id;
      const predStep = predStepId ? sortedSteps.find((s) => s.id === predStepId) : null;
      const isPredBookStep = predStep?.unit_of_calculation === 'Book';

      if (!isBookStep) {
        // Chapter-level tasks
        for (let cIdx = 0; cIdx < sortedChapters.length; cIdx++) {
          const chapter = sortedChapters[cIdx];
          const taskId = `${chapter.id}-${step.id}`;

          let dependencies = [];
          if (predStep) {
            if (isPredBookStep) dependencies.push(`${book.id}-${predStep.id}`);
            else dependencies.push(`${chapter.id}-${predStep.id}`);
          }

          const normObj = (step.norms || []).find((n) => n.cluster_id === chapter.cluster_id);
          const norm = parseFloat(normObj?.norm_in_mandays) || 0;
          const pagesRatio = step.norm_pages > 0 ? (chapter.pages || 1) / step.norm_pages : 1;
          const effortDays = norm * pagesRatio;

          nodes.push({
            id: taskId,
            type: 'chapter',
            chapterId: chapter.id,
            bookId: null,
            stepId: step.id,
            bufferDays: step.buffer_days || 0,
            role_required: step.role_required,
            dependencies,
            effortDays,
            customPriority: typeof chapter.execution_priority === 'number'
              ? chapter.execution_priority
              : Infinity,
            step_idx: sIdx,
            book_idx: bIdx,
            chapter_idx: cIdx,
            isDone: false,
          });
        }
      } else {
        // Book-level task
        const taskId = `${book.id}-${step.id}`;
        let dependencies = [];
        if (predStep) {
          if (isPredBookStep) {
            dependencies.push(`${book.id}-${predStep.id}`);
          } else {
            // Waits for ALL chapters of this book for the predecessor step
            sortedChapters.forEach((ch) => dependencies.push(`${ch.id}-${predStep.id}`));
          }
        }

        const bookPages = sortedChapters.reduce((sum, ch) => sum + (ch.pages || 0), 0);
        const pagesRatio = step.norm_pages > 0 ? bookPages / step.norm_pages : 1;
        const effortDays = parseFloat(step.book_norm_in_mandays || 0) * pagesRatio;

        nodes.push({
          id: taskId,
          type: 'book',
          chapterId: null,
          bookId: book.id,
          stepId: step.id,
          bufferDays: step.buffer_days || 0,
          role_required: step.role_required,
          dependencies,
          effortDays,
          customPriority: typeof book.execution_priority === 'number'
            ? book.execution_priority
            : Infinity,
          step_idx: sIdx,
          book_idx: bIdx,
          chapter_idx: -1,
          isDone: false,
        });
      }
    }
  }

  // ── Helper: find eligible member for a task ───────────────────────────────
  //
  // Rules applied in order:
  //  1. Stickiness: if this chapter+role is already locked to a person, use them.
  //  2. Conflict: exclude anyone already assigned to this chapter in any OTHER role.
  //  3. Among eligible candidates, pick the one who will be free earliest
  //     (using the task's earliestDepEnd as a lower bound on start time).
  //
  function findEligibleMember(task, earliestDepEnd) {
    // ── Stickiness check ──────────────────────────────────────────────────
    if (task.chapterId) {
      const stickyKey = `${task.chapterId}|${task.role_required}`;
      if (chapterRoleMap[stickyKey]) {
        const locked = teamMembers.find((m) => m.id === chapterRoleMap[stickyKey]);
        return locked || null;
      }
    }

    // ── Build candidate pool ──────────────────────────────────────────────
    let candidates = teamMembers.filter((m) => m.role === task.role_required);
    if (candidates.length === 0) return null;

    // ── Conflict rule for chapter tasks ───────────────────────────────────
    // Exclude anyone whose name is already assigned to this chapter in any role.
    if (task.chapterId) {
      const usedNames = new Set();
      Object.entries(chapterRoleMap).forEach(([key, memberId]) => {
        if (key.startsWith(`${task.chapterId}|`)) {
          const m = teamMembers.find((tm) => tm.id === memberId);
          if (m) usedNames.add(m.name);
        }
      });
      candidates = candidates.filter((c) => !usedNames.has(c.name));
      if (candidates.length === 0) return null;
    }

    // ── Pick earliest-available candidate ─────────────────────────────────
    // "effective start" = max(when the person is free, earliestDepEnd)
    // Prefer the person who can start earliest; break ties by higher bandwidth.
    return candidates.sort((a, b) => {
      const aFree = nextWorkingDay(memberFreeDate[a.id], memberBlockedSets[a.id]);
      const bFree = nextWorkingDay(memberFreeDate[b.id], memberBlockedSets[b.id]);
      const aStart = aFree > earliestDepEnd ? aFree : earliestDepEnd;
      const bStart = bFree > earliestDepEnd ? bFree : earliestDepEnd;
      if (aStart.valueOf() !== bStart.valueOf()) return aStart.valueOf() - bStart.valueOf();
      return b.bandwidth - a.bandwidth;
    })[0];
  }

  // ── Scheduling loop ───────────────────────────────────────────────────────
  const tasksOutput = [];
  const MAX_LOOPS = 500000;
  let loops = 0;

  while (nodes.some((n) => !n.isDone) && loops < MAX_LOOPS) {
    loops++;

    // Find all tasks whose dependencies are fully resolved
    const readyNodes = nodes.filter((n) => {
      if (n.isDone) return false;
      return n.dependencies.every((depId) => taskEndDates[depId] !== undefined);
    });

    if (readyNodes.length === 0) {
      // Guard against dependency cycles / missing deps
      const remaining = nodes.filter((n) => !n.isDone);
      if (remaining.length > 0) remaining[0].dependencies = [];
      continue;
    }

    // Compute earliest dep-resolved start for each ready task
    readyNodes.forEach((task) => {
      let earliestDepEnd = new Date(planStartDate);
      task.dependencies.forEach((depId) => {
        const depEnd = taskEndDates[depId];
        if (depEnd) {
          // The next working day after the dependency ends (global holidays only;
          // member-specific leaves are factored in via memberFreeDate).
          let candidate = addDays(depEnd, 1);
          while (isNonWorkingDay(candidate, globalHolidays)) candidate = addDays(candidate, 1);
          if (candidate > earliestDepEnd) earliestDepEnd = candidate;
        }
      });

      if (task.bufferDays > 0) {
        earliestDepEnd = addBusinessDaysWithHolidays(earliestDepEnd, task.bufferDays, globalHolidays);
      }
      task.earliestDepEnd = earliestDepEnd;

      // Find the eligible member now (needed for actualStart computation below)
      const eligible = findEligibleMember(task, earliestDepEnd);
      task.eligibleMember = eligible;

      if (eligible) {
        const mFree = nextWorkingDay(memberFreeDate[eligible.id], memberBlockedSets[eligible.id]);
        task.actualStart = mFree > earliestDepEnd ? mFree : nextWorkingDay(earliestDepEnd, memberBlockedSets[eligible.id]);
      } else {
        task.actualStart = earliestDepEnd;
      }
    });

    // ── Priority sort ─────────────────────────────────────────────────────
    // Rule 0: Book tasks (all chapter deps done → book closure) beat chapter tasks
    //         AT THE SAME actual start time. This prevents a free person from
    //         picking up a new chapter when they could close an already-ready book.
    // Rule 1: Earliest actual start
    // Rule 2: Explicit custom priority
    // Rule 3: Left-to-right (higher step index = closer to project completion)
    // Rule 4: Top-to-bottom (lower book/chapter index)
    readyNodes.sort((a, b) => {
      const aStart = a.actualStart.valueOf();
      const bStart = b.actualStart.valueOf();
      if (aStart !== bStart) return aStart - bStart;                         // Rule 1

      const aIsBook = a.type === 'book' ? 0 : 1;
      const bIsBook = b.type === 'book' ? 0 : 1;
      if (aIsBook !== bIsBook) return aIsBook - bIsBook;                     // Rule 0

      if (a.customPriority !== b.customPriority)
        return a.customPriority - b.customPriority;                          // Rule 2
      if (a.step_idx !== b.step_idx) return b.step_idx - a.step_idx;        // Rule 3
      if (a.book_idx !== b.book_idx) return a.book_idx - b.book_idx;        // Rule 4
      return a.chapter_idx - b.chapter_idx;
    });

    // Pick the highest-priority task that has an eligible member right now
    const winner = readyNodes.find((t) => t.eligibleMember);
    if (!winner) {
      // All ready tasks are blocked (strict stickiness awaiting a locked person).
      // Unblock one to prevent an infinite loop.
      const remaining = nodes.filter((n) => !n.isDone);
      if (remaining.length > 0) remaining[0].dependencies = [];
      continue;
    }

    // ── Compute exact dates ───────────────────────────────────────────────
    let finalStart, finalEnd;
    const member = winner.eligibleMember;
    const blocked = memberBlockedSets[member.id];

    const manualOverride = manualOverrides[winner.id];
    if (manualOverride) {
      // User manually set an end date — respect it; start = earliest possible.
      finalStart = nextWorkingDay(winner.earliestDepEnd, blocked);
      const mFree = nextWorkingDay(memberFreeDate[member.id], blocked);
      if (mFree > finalStart) finalStart = mFree;
      finalEnd = parseISO(manualOverride);
    } else {
      // Normal computation — no sub-day packing.
      // Duration = ceil(effort / bandwidth), minimum 1 working day.
      const bandwidth = member.bandwidth || 1;
      const calendarDays = Math.max(1, Math.ceil(winner.effortDays / bandwidth));

      finalStart = winner.actualStart;
      finalEnd = addBusinessDaysWithHolidays(finalStart, calendarDays, blocked);
    }

    // ── Lock sticky assignment for chapter tasks ──────────────────────────
    if (winner.chapterId) {
      const stickyKey = `${winner.chapterId}|${winner.role_required}`;
      if (!chapterRoleMap[stickyKey]) {
        chapterRoleMap[stickyKey] = member.id;
      }
    }

    // ── Update member's next free date ────────────────────────────────────
    // Next slot = the working day immediately after finalEnd.
    let nextFree = addDays(finalEnd, 1);
    while (isNonWorkingDay(nextFree, blocked)) nextFree = addDays(nextFree, 1);
    memberFreeDate[member.id] = nextFree;

    // ── Record ────────────────────────────────────────────────────────────
    taskEndDates[winner.id] = finalEnd;
    winner.isDone = true;

    const existing = existingTasksMap[winner.id] || {};
    tasksOutput.push({
      ...existing,
      deliverable_id: winner.chapterId,
      book_id: winner.bookId,
      step_id: winner.stepId,
      plan_id: plan.id,
      plan_team_member_id: member.id,
      planned_start_date: format(finalStart, 'yyyy-MM-dd'),
      planned_end_date: format(finalEnd, 'yyyy-MM-dd'),
      status: existing.status || 'Yet to start',
    });
  }

  return tasksOutput;
}


// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a full fresh schedule for a plan.
 * Assignments are made opportunistically — no pre-assignment phase.
 */
export const forecastExecutionTasks = (plan, books, teamMembers, holidaySet) => {
  const memberLeavesMap = {};
  teamMembers.forEach((m) => {
    memberLeavesMap[m.id] = new Set((m.leaves || []).map((l) => l.leave_date));
  });

  return runEventDrivenSchedule(
    plan, books, teamMembers, holidaySet, memberLeavesMap
  );
};

/**
 * Re-schedule downstream tasks after a user manually edits one end date.
 * Existing assignments are preserved (seeded as preservedAssignments) so
 * stickiness is maintained across the cascade.
 */
export const cascadeAfterEdit = (
  plan, books, existingTasks, teamMembers, holidaySet, overriddenTaskId, newEndDate
) => {
  const memberLeavesMap = {};
  teamMembers.forEach((m) => {
    memberLeavesMap[m.id] = new Set((m.leaves || []).map((l) => l.leave_date));
  });

  const stepsById = Object.fromEntries((plan.steps || []).map((s) => [s.id, s]));

  // Rebuild the sticky assignment map from existing task records
  // so the cascade respects who already did what.
  const preservedAssignments = {};
  existingTasks.forEach((task) => {
    if (!task.plan_team_member_id) return;
    const step = stepsById[task.step_id];
    if (!step) return;
    if (task.deliverable_id && (!step.unit_of_calculation || step.unit_of_calculation === 'Chapter / Unit')) {
      preservedAssignments[`${task.deliverable_id}|${step.role_required}`] = task.plan_team_member_id;
    }
    // Book-level steps don't need sticky assignment (only one task per book per step)
  });

  const existingTasksMap = {};
  existingTasks.forEach((task) => {
    const key = task.deliverable_id
      ? `${task.deliverable_id}-${task.step_id}`
      : `${task.book_id}-${task.step_id}`;
    existingTasksMap[key] = task;
  });

  const overriddenTask = existingTasks.find((t) => t.id === overriddenTaskId);
  const manualOverrides = {};
  if (overriddenTask) {
    const key = overriddenTask.deliverable_id
      ? `${overriddenTask.deliverable_id}-${overriddenTask.step_id}`
      : `${overriddenTask.book_id}-${overriddenTask.step_id}`;
    manualOverrides[key] = newEndDate;
  }

  return runEventDrivenSchedule(
    plan, books, teamMembers, holidaySet, memberLeavesMap,
    manualOverrides, existingTasksMap, preservedAssignments
  );
};
