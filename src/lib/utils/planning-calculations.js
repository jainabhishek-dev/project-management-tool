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
 * The startDate itself counts as Day 1 (must already be a working day).
 */
export const addBusinessDaysWithHolidays = (
  startDate,
  businessDaysToPlan,
  blockedSet = new Set()
) => {
  let date =
    typeof startDate === 'string' ? parseISO(startDate) : new Date(startDate);
  let remaining = businessDaysToPlan;

  while (isNonWorkingDay(date, blockedSet)) date = addDays(date, 1);

  while (remaining > 1) {
    date = addDays(date, 1);
    if (!isNonWorkingDay(date, blockedSet)) remaining -= 1;
  }

  while (isNonWorkingDay(date, blockedSet)) date = addDays(date, 1);

  return date;
};

/** Advance date to the next working day (no-op if already a working day). */
function nextWorkingDay(date, blockedSet) {
  let d = new Date(date);
  while (isNonWorkingDay(d, blockedSet)) d = addDays(d, 1);
  return d;
}

// ─────────────────────────────────────────────────────────────────────────────
// Event-Driven Opportunistic Scheduler
//
// Design:
//  1. No static pre-assignment. Every chapter-role assignment is made the
//     moment the task becomes ready (all dependencies done), choosing the
//     earliest-free eligible person at that instant.
//  2. Strict stickiness (Option A): once Person A does the "Creator" step of
//     Chapter X, all future "Creator" steps on that chapter go to Person A,
//     even if that means waiting for them to become free.
//  3. Conflict rule: the same person cannot hold two different roles on the
//     same chapter (enforced by name comparison).
//  4. Book-closure priority: a book task whose chapter dependencies are all
//     satisfied beats any chapter task at equal actualStart time.
//  5. No sub-day fractional packing. Duration = ceil(effort / bandwidth)
//     working days, minimum 1. After a task ends, member's next slot begins
//     the following working day.
//  6. Progress guarantee: if every ready task has no eligible member (e.g.
//     the locked person is still busy), the top-priority task is scheduled
//     as "Unassigned" so taskEndDates always gets an entry and the loop
//     can never spin indefinitely.
// ─────────────────────────────────────────────────────────────────────────────

function runEventDrivenSchedule(
  plan,
  books,
  teamMembers,
  holidaySet,
  memberLeavesMap,
  manualOverrides = {},
  existingTasksMap = {},
  preservedAssignments = {}
) {
  const globalHolidays = holidaySet || new Set();
  const sortedSteps = [...(plan.steps || [])].sort((a, b) => a.display_order - b.display_order);
  const sortedBooks  = [...books].sort((a, b) => a.display_order - b.display_order);
  const planStartDate = parseISO(plan.start_date);

  // Per-member blocked sets: global holidays + personal leaves
  const memberBlockedSets = {};
  teamMembers.forEach((m) => {
    const blocked = new Set(globalHolidays);
    (memberLeavesMap[m.id] || new Set()).forEach((l) => blocked.add(l));
    memberBlockedSets[m.id] = blocked;
  });

  // When each member is next free (first available working day)
  const memberFreeDate = {};
  teamMembers.forEach((m) => {
    memberFreeDate[m.id] = nextWorkingDay(planStartDate, memberBlockedSets[m.id]);
  });

  // Sticky assignment map: `${chapterId}|${role}` → memberId
  const chapterRoleMap = { ...preservedAssignments };

  // Task end dates for dependency resolution
  const taskEndDates = {};

  // ── Build task nodes ─────────────────────────────────────────────────────
  const nodes = [];

  for (let bIdx = 0; bIdx < sortedBooks.length; bIdx++) {
    const book = sortedBooks[bIdx];
    const sortedChapters = [...(book.chapters || [])].sort(
      (a, b) => a.display_order - b.display_order
    );

    for (let sIdx = 0; sIdx < sortedSteps.length; sIdx++) {
      const step = sortedSteps[sIdx];
      const isBookStep   = step.unit_of_calculation === 'Book';
      const predStepId   = step.parallel_dependency_id;
      const predStep     = predStepId ? sortedSteps.find((s) => s.id === predStepId) : null;
      const isPredBook   = predStep?.unit_of_calculation === 'Book';

      if (!isBookStep) {
        for (let cIdx = 0; cIdx < sortedChapters.length; cIdx++) {
          const chapter = sortedChapters[cIdx];
          const taskId  = `${chapter.id}-${step.id}`;

          const deps = [];
          if (predStep) {
            deps.push(isPredBook ? `${book.id}-${predStep.id}` : `${chapter.id}-${predStep.id}`);
          }

          const normObj    = (step.norms || []).find((n) => n.cluster_id === chapter.cluster_id);
          const norm       = parseFloat(normObj?.norm_in_mandays) || 0;
          const pagesRatio = step.norm_pages > 0 ? (chapter.pages || 1) / step.norm_pages : 1;

          nodes.push({
            id: taskId,
            type: 'chapter',
            chapterId: chapter.id,
            bookId: null,
            stepId: step.id,
            bufferDays: step.buffer_days || 0,
            role_required: step.role_required,
            dependencies: deps,
            effortDays: norm * pagesRatio,
            customPriority: typeof chapter.execution_priority === 'number'
              ? chapter.execution_priority : Infinity,
            step_idx: sIdx,
            book_idx: bIdx,
            chapter_idx: cIdx,
            isDone: false,
          });
        }
      } else {
        const taskId   = `${book.id}-${step.id}`;
        const deps     = [];
        if (predStep) {
          if (isPredBook) {
            deps.push(`${book.id}-${predStep.id}`);
          } else {
            sortedChapters.forEach((ch) => deps.push(`${ch.id}-${predStep.id}`));
          }
        }

        const bookPages  = sortedChapters.reduce((s, ch) => s + (ch.pages || 0), 0);
        const pagesRatio = step.norm_pages > 0 ? bookPages / step.norm_pages : 1;

        nodes.push({
          id: taskId,
          type: 'book',
          chapterId: null,
          bookId: book.id,
          stepId: step.id,
          bufferDays: step.buffer_days || 0,
          role_required: step.role_required,
          dependencies: deps,
          effortDays: parseFloat(step.book_norm_in_mandays || 0) * pagesRatio,
          customPriority: typeof book.execution_priority === 'number'
            ? book.execution_priority : Infinity,
          step_idx: sIdx,
          book_idx: bIdx,
          chapter_idx: -1,
          isDone: false,
        });
      }
    }
  }

  // ── Helper: find eligible member for a task ───────────────────────────────
  function findEligibleMember(task, earliestDepEnd) {
    // Stickiness check (strict Option A)
    if (task.chapterId) {
      const stickyKey = `${task.chapterId}|${task.role_required}`;
      if (chapterRoleMap[stickyKey]) {
        return teamMembers.find((m) => m.id === chapterRoleMap[stickyKey]) || null;
      }
    }

    // Candidate pool for this role
    let candidates = teamMembers.filter((m) => m.role === task.role_required);
    if (candidates.length === 0) return null;

    // Conflict rule: exclude anyone already on this chapter in a different role
    if (task.chapterId) {
      const usedNames = new Set();
      Object.entries(chapterRoleMap).forEach(([key, mId]) => {
        if (key.startsWith(`${task.chapterId}|`)) {
          const m = teamMembers.find((tm) => tm.id === mId);
          if (m) usedNames.add(m.name);
        }
      });
      candidates = candidates.filter((c) => !usedNames.has(c.name));
      if (candidates.length === 0) return null;
    }

    // Pick earliest-available; break ties via bandwidth (higher = faster)
    return candidates.sort((a, b) => {
      const aFree   = nextWorkingDay(memberFreeDate[a.id], memberBlockedSets[a.id]);
      const bFree   = nextWorkingDay(memberFreeDate[b.id], memberBlockedSets[b.id]);
      const aStart  = aFree > earliestDepEnd ? aFree : earliestDepEnd;
      const bStart  = bFree > earliestDepEnd ? bFree : earliestDepEnd;
      if (aStart.valueOf() !== bStart.valueOf()) return aStart.valueOf() - bStart.valueOf();
      return b.bandwidth - a.bandwidth;
    })[0];
  }

  // ── Scheduling loop ───────────────────────────────────────────────────────
  // MAX_LOOPS is proportional to node count — each node should be scheduled
  // in at most a handful of iterations.
  const MAX_LOOPS = Math.max(nodes.length * 4, 2000);
  const tasksOutput = [];
  let loops = 0;

  while (nodes.some((n) => !n.isDone) && loops < MAX_LOOPS) {
    loops++;

    // Collect tasks whose dependencies are all resolved
    const readyNodes = nodes.filter((n) => {
      if (n.isDone) return false;
      return n.dependencies.every((depId) => taskEndDates[depId] !== undefined);
    });

    if (readyNodes.length === 0) {
      // Dependency cycle or missing dep — unblock the first stuck node
      const stuck = nodes.find((n) => !n.isDone);
      if (stuck) stuck.dependencies = [];
      continue;
    }

    // Compute earliest dep-resolved start and eligible member for each ready task
    readyNodes.forEach((task) => {
      let earliestDepEnd = new Date(planStartDate);
      task.dependencies.forEach((depId) => {
        const depEnd = taskEndDates[depId];
        if (depEnd) {
          let candidate = addDays(depEnd, 1);
          while (isNonWorkingDay(candidate, globalHolidays)) candidate = addDays(candidate, 1);
          if (candidate > earliestDepEnd) earliestDepEnd = candidate;
        }
      });

      if (task.bufferDays > 0) {
        earliestDepEnd = addBusinessDaysWithHolidays(
          earliestDepEnd, task.bufferDays, globalHolidays
        );
      }
      task.earliestDepEnd = earliestDepEnd;

      const eligible = findEligibleMember(task, earliestDepEnd);
      task.eligibleMember = eligible;

      if (eligible) {
        const mFree = nextWorkingDay(memberFreeDate[eligible.id], memberBlockedSets[eligible.id]);
        task.actualStart = mFree > earliestDepEnd
          ? mFree
          : nextWorkingDay(earliestDepEnd, memberBlockedSets[eligible.id]);
      } else {
        task.actualStart = earliestDepEnd;
      }
    });

    // Priority sort
    // Rule 0: Book tasks beat chapter tasks at the same actualStart (book closure)
    // Rule 1: Earliest actualStart
    // Rule 2: User-defined custom priority
    // Rule 3: Left-to-right (higher step index = closer to project end)
    // Rule 4: Top-to-bottom book/chapter order
    readyNodes.sort((a, b) => {
      const aVal = a.actualStart.valueOf();
      const bVal = b.actualStart.valueOf();
      if (aVal !== bVal) return aVal - bVal;

      const aIsBook = a.type === 'book' ? 0 : 1;
      const bIsBook = b.type === 'book' ? 0 : 1;
      if (aIsBook !== bIsBook) return aIsBook - bIsBook;

      if (a.customPriority !== b.customPriority) return a.customPriority - b.customPriority;
      if (a.step_idx    !== b.step_idx)    return b.step_idx    - a.step_idx;
      if (a.book_idx    !== b.book_idx)    return a.book_idx    - b.book_idx;
      return a.chapter_idx - b.chapter_idx;
    });

    // Pick the best task that has an eligible member.
    // If none do (strict stickiness holding), force-schedule the top-priority
    // task as Unassigned so the loop always advances by at least one task.
    const winner          = readyNodes.find((t) => t.eligibleMember) || readyNodes[0];
    const assignedMember  = winner.eligibleMember; // null → unassigned

    if (!assignedMember) {
      // Schedule as unassigned at the earliest dep end
      const uStart = nextWorkingDay(winner.earliestDepEnd, globalHolidays);
      taskEndDates[winner.id] = uStart;
      winner.isDone = true;
      const uRec = existingTasksMap[winner.id] || {};
      tasksOutput.push({
        ...uRec,
        deliverable_id: winner.chapterId,
        book_id: winner.bookId,
        step_id: winner.stepId,
        plan_id: plan.id,
        plan_team_member_id: null,
        planned_start_date: format(uStart, 'yyyy-MM-dd'),
        planned_end_date: format(uStart, 'yyyy-MM-dd'),
        status: uRec.status || 'Yet to start',
      });
      continue;
    }

    // Normal scheduling path
    const blocked = memberBlockedSets[assignedMember.id];
    let finalStart;
    let finalEnd;

    const manualOverride = manualOverrides[winner.id];
    if (manualOverride) {
      finalStart = nextWorkingDay(winner.earliestDepEnd, blocked);
      const mFree = nextWorkingDay(memberFreeDate[assignedMember.id], blocked);
      if (mFree > finalStart) finalStart = mFree;
      finalEnd = parseISO(manualOverride);
    } else {
      const bandwidth    = assignedMember.bandwidth || 1;
      const calendarDays = Math.max(1, Math.ceil(winner.effortDays / bandwidth));
      finalStart = winner.actualStart;
      finalEnd   = addBusinessDaysWithHolidays(finalStart, calendarDays, blocked);
    }

    // Lock sticky assignment for chapter tasks
    if (winner.chapterId) {
      const stickyKey = `${winner.chapterId}|${winner.role_required}`;
      if (!chapterRoleMap[stickyKey]) chapterRoleMap[stickyKey] = assignedMember.id;
    }

    // Advance member's free date to the working day after finalEnd
    let nextFree = addDays(finalEnd, 1);
    while (isNonWorkingDay(nextFree, blocked)) nextFree = addDays(nextFree, 1);
    memberFreeDate[assignedMember.id] = nextFree;

    taskEndDates[winner.id] = finalEnd;
    winner.isDone = true;

    const rec = existingTasksMap[winner.id] || {};
    tasksOutput.push({
      ...rec,
      deliverable_id: winner.chapterId,
      book_id: winner.bookId,
      step_id: winner.stepId,
      plan_id: plan.id,
      plan_team_member_id: assignedMember.id,
      planned_start_date: format(finalStart, 'yyyy-MM-dd'),
      planned_end_date: format(finalEnd, 'yyyy-MM-dd'),
      status: rec.status || 'Yet to start',
    });
  }

  return tasksOutput;
}


// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a full fresh schedule for a plan.
 * All assignments are made opportunistically — no pre-assignment phase.
 */
export const forecastExecutionTasks = (plan, books, teamMembers, holidaySet) => {
  const memberLeavesMap = {};
  teamMembers.forEach((m) => {
    memberLeavesMap[m.id] = new Set((m.leaves || []).map((l) => l.leave_date));
  });

  return runEventDrivenSchedule(plan, books, teamMembers, holidaySet, memberLeavesMap);
};

/**
 * Re-schedule downstream tasks after a user manually edits one end date.
 * Existing assignments are seeded as preservedAssignments so stickiness is
 * maintained across the cascade.
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
  const preservedAssignments = {};
  existingTasks.forEach((task) => {
    if (!task.plan_team_member_id) return;
    const step = stepsById[task.step_id];
    if (!step) return;
    if (
      task.deliverable_id &&
      (!step.unit_of_calculation || step.unit_of_calculation === 'Chapter / Unit')
    ) {
      preservedAssignments[`${task.deliverable_id}|${step.role_required}`] =
        task.plan_team_member_id;
    }
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
