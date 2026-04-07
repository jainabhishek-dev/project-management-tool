import { format, addDays, isWeekend, parseISO, startOfDay } from 'date-fns';

// ─────────────────────────────────────────────────────────────────────────────
// Core Date & Fractional State Utilities
//
// A "State" is { date: Date, fraction: number } where 0 <= fraction < 1.
// A full working day is 1.0 unit. Tasks consume exact fractions (effort / bandwidth).
// ─────────────────────────────────────────────────────────────────────────────

export const isNonWorkingDay = (date, blockedSet) => {
  if (isWeekend(date)) return true;
  return blockedSet.has(format(date, 'yyyy-MM-dd'));
};

function compareStates(a, b) {
  const diff = a.date.valueOf() - b.date.valueOf();
  if (diff !== 0) return diff;
  return a.fraction - b.fraction;
}

function cloneState(s) {
  return { date: new Date(s.date), fraction: s.fraction };
}

/**
 * Ensures a state sits on a valid working day. If it currently sits on a
 * non-working day, it is advanced to 0.0 of the next available working day.
 */
function normalizeState(state, blockedSet) {
  let { date, fraction } = state;
  let advanced = false;
  while (isNonWorkingDay(date, blockedSet)) {
    date = addDays(date, 1);
    advanced = true;
  }
  if (advanced) fraction = 0;
  return { date, fraction };
}

/**
 * Adds exact fractional working days to a state.
 * Returns the new completion state, AND the exact calendar day work finished on.
 */
function addFractionalBusinessDays(startState, daysToAdd, blockedSet) {
  let { date, fraction } = normalizeState(cloneState(startState), blockedSet);
  let remaining = daysToAdd;
  
  if (remaining <= 0) {
    return { newState: { date, fraction }, lastWorkedDay: new Date(date) };
  }

  let lastWorkedDay = new Date(date);

  while (remaining > 0) {
    lastWorkedDay = new Date(date);
    const availableToday = 1 - fraction;

    // Floating point math safety check
    if (remaining < availableToday - 0.0001) {
      // Fits entirely within today
      fraction += remaining;
      remaining = 0;
    } else if (Math.abs(remaining - availableToday) <= 0.0001) {
      // Finishes exactly at the end of today.
      // Roll over state to 0.0 of the next working day.
      fraction = 0;
      remaining = 0;
      date = addDays(date, 1);
      while (isNonWorkingDay(date, blockedSet)) date = addDays(date, 1);
    } else {
      // Consumes rest of today, spills into future days
      remaining -= availableToday;
      fraction = 0;
      date = addDays(date, 1);
      while (isNonWorkingDay(date, blockedSet)) date = addDays(date, 1);
    }
  }

  return { 
    newState: { date, fraction }, 
    lastWorkedDay 
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Event-Driven Opportunistic Scheduler
//
// 1. Fractional Packing: tasks measuring 0.5 days are packed natively into
//    the same calendar day (concurrency mathematically perfect).
// 2. Zero-Delays: Unassigned tasks report 0 calendar days consumed, passing
//    their state unchanged to successors, eliminating pipeline padding.
// 3. Strict Stickiness: chapterUsedNames O(1) index tracks role locks.
// 4. Progress Guarantee: unassigned fallback prevents infinite loops.
// ─────────────────────────────────────────────────────────────────────────────

function runEventDrivenSchedule(
  plan,
  books,
  teamMembers,
  holidaySet,
  memberLeavesMap,
  manualOverrides = {},
  existingTasksMap = {},
  preservedAssignments = {},
  explicitTaskAssignments = {}
) {
  const globalHolidays  = holidaySet || new Set();
  const sortedSteps     = [...(plan.steps || [])].sort((a, b) => a.display_order - b.display_order);
  const sortedBooks     = [...books].sort((a, b) => a.display_order - b.display_order);
  const planStartDate   = startOfDay(parseISO(plan.start_date));

  // Per-member blocked sets: global holidays + personal leaves
  const memberBlockedSets = {};
  teamMembers.forEach((m) => {
    const blocked = new Set(globalHolidays);
    (memberLeavesMap[m.id] || new Set()).forEach((l) => blocked.add(l));
    memberBlockedSets[m.id] = blocked;
  });

  // Quick lookup
  const memberById = Object.fromEntries(teamMembers.map((m) => [m.id, m]));

  // Track each member's exact fractional availability date
  const memberFreeState = {};
  teamMembers.forEach((m) => {
    memberFreeState[m.id] = normalizeState(
      { date: new Date(planStartDate), fraction: 0 }, 
      memberBlockedSets[m.id]
    );
  });

  // ── Lock Maps ────────────────────────────────────────────────────────────
  // chapterRoleMap[`${chapterId}|${role}`] = memberId
  const chapterRoleMap = { ...preservedAssignments };

  // chapterUsedMemberIds[chapterId] = Set<team_master_id>
  const chapterUsedMemberIds = {};
  Object.entries(preservedAssignments).forEach(([key, mId]) => {
    const chapterId = key.split('|')[0];
    const m = memberById[mId];
    if (!m) return;
    if (!chapterUsedMemberIds[chapterId]) chapterUsedMemberIds[chapterId] = new Set();
    const idToTrack = m.team_master_id || m.name; // Fallback to name for legacy data
    chapterUsedMemberIds[chapterId].add(idToTrack);
  });

  // Output timelines track exact ending Fractional State per task
  const taskEndStates = {}; // taskId → State { date, fraction }

  // ── Build task nodes ─────────────────────────────────────────────────────
  const nodes = [];

  for (let bIdx = 0; bIdx < sortedBooks.length; bIdx++) {
    const book           = sortedBooks[bIdx];
    const sortedChapters = [...(book.chapters || [])].sort(
      (a, b) => a.display_order - b.display_order
    );

    for (let sIdx = 0; sIdx < sortedSteps.length; sIdx++) {
      const step        = sortedSteps[sIdx];
      const isBookStep  = step.unit_of_calculation === 'Book';
      const predStepId  = step.parallel_dependency_id;
      const predStep    = predStepId ? sortedSteps.find((s) => s.id === predStepId) : null;
      const isPredBook  = predStep?.unit_of_calculation === 'Book';

      if (!isBookStep) {
        for (let cIdx = 0; cIdx < sortedChapters.length; cIdx++) {
          const chapter = sortedChapters[cIdx];
          const taskId  = `${chapter.id}-${step.id}`;

          const deps = [];
          if (predStep) {
            deps.push(
              isPredBook ? `${book.id}-${predStep.id}` : `${chapter.id}-${predStep.id}`
            );
          }

          const normObj    = (step.norms || []).find((n) => n.cluster_id === chapter.cluster_id);
          const norm       = parseFloat(normObj?.norm_in_mandays) || 0;
          const pagesRatio = step.norm_pages > 0 ? (chapter.pages || 1) / step.norm_pages : 1;

          const existingTask = existingTasksMap[taskId] || {};
          const isSkipped = existingTask.status === 'Skipped';

          nodes.push({
            id: taskId,
            type: 'chapter',
            chapterId: chapter.id,
            bookId: null,
            stepId: step.id,
            bufferDays: step.buffer_days || 0,
            role_required: step.role_required,
            dependencies: deps,
            effortDays: isSkipped ? 0 : (norm * pagesRatio),
            customPriority:
              typeof chapter.execution_priority === 'number'
                ? chapter.execution_priority
                : Infinity,
            step_idx: sIdx,
            book_idx: bIdx,
            chapter_idx: cIdx,
            isDone: false,
          });
        }
      } else {
        const taskId = `${book.id}-${step.id}`;
        const deps   = [];
        if (predStep) {
          if (isPredBook) {
            deps.push(`${book.id}-${predStep.id}`);
          } else {
            sortedChapters.forEach((ch) => deps.push(`${ch.id}-${predStep.id}`));
          }
        }

        const bookPages  = sortedChapters.reduce((s, ch) => s + (ch.pages || 0), 0);
        const pagesRatio = step.norm_pages > 0 ? bookPages / step.norm_pages : 1;

        const existingTask = existingTasksMap[taskId] || {};
        const isSkipped = existingTask.status === 'Skipped';

        nodes.push({
          id: taskId,
          type: 'book',
          chapterId: null,
          bookId: book.id,
          stepId: step.id,
          bufferDays: step.buffer_days || 0,
          role_required: step.role_required,
          dependencies: deps,
          effortDays: isSkipped ? 0 : (parseFloat(step.book_norm_in_mandays || 0) * pagesRatio),
          customPriority:
            typeof book.execution_priority === 'number' ? book.execution_priority : Infinity,
          step_idx: sIdx,
          book_idx: bIdx,
          chapter_idx: -1,
          isDone: false,
        });
      }
    }
  }

  function lockAssignment(chapterId, role, member) {
    const stickyKey = `${chapterId}|${role}`;
    if (!chapterRoleMap[stickyKey]) {
      chapterRoleMap[stickyKey] = member.id;
      if (!chapterUsedMemberIds[chapterId]) chapterUsedMemberIds[chapterId] = new Set();
      const idToTrack = member.team_master_id || member.name; // Fallback to name for legacy data
      chapterUsedMemberIds[chapterId].add(idToTrack);
    }
  }

  function findEligibleMember(task, earliestDepEndState) {
    if (explicitTaskAssignments[task.id]) {
      const mem = memberById[explicitTaskAssignments[task.id]];
      if (mem) return mem;
    }

    if (task.chapterId) {
      const stickyKey = `${task.chapterId}|${task.role_required}`;
      if (chapterRoleMap[stickyKey]) return memberById[chapterRoleMap[stickyKey]] || null;
    }

    let candidates = teamMembers.filter((m) => {
      if (m.role !== task.role_required) return false;
      
      const restrictions = m.restricted_item_ids || [];
      if (restrictions.length > 0) {
        if (!restrictions.includes(task.chapterId) && !restrictions.includes(task.bookId)) {
          return false; 
        }
      }
      
      return true;
    });

    if (candidates.length === 0) return null;

    if (task.chapterId) {
      const usedMemberIds = chapterUsedMemberIds[task.chapterId];
      if (usedMemberIds && usedMemberIds.size > 0) {
        candidates = candidates.filter((c) => {
          const idToTrack = c.team_master_id || c.name;
          return !usedMemberIds.has(idToTrack);
        });
        if (candidates.length === 0) return null;
      }
    }

    // Pick earliest start. Earliest start is max(member.freeState, task.depEndState).
    return candidates.sort((a, b) => {
      const aFree = memberFreeState[a.id];
      const bFree = memberFreeState[b.id];
      const aNorm = normalizeState(earliestDepEndState, memberBlockedSets[a.id]);
      const bNorm = normalizeState(earliestDepEndState, memberBlockedSets[b.id]);

      const aStart = compareStates(aFree, aNorm) > 0 ? aFree : aNorm;
      const bStart = compareStates(bFree, bNorm) > 0 ? bFree : bNorm;

      const comp = compareStates(aStart, bStart);
      if (comp !== 0) return comp;
      
      // Load Balancing Tie-Breaker: If multiple members are bottlenecked 
      // waiting at the dependency gate simultaneously, pick the one who has 
      // been idle the longest (earliest freeState) to distribute parallel work.
      const idleComp = compareStates(aFree, bFree);
      if (idleComp !== 0) return idleComp;

      return b.bandwidth - a.bandwidth;
    })[0];
  }

  // ── Scheduling loop ───────────────────────────────────────────────────────
  const MAX_LOOPS   = Math.max(nodes.length * 4, 3000);
  const tasksOutput = [];
  let loops = 0;

  while (nodes.some((n) => !n.isDone) && loops < MAX_LOOPS) {
    loops++;

    const readyNodes = nodes.filter((n) => {
      if (n.isDone) return false;
      return n.dependencies.every((depId) => taskEndStates[depId] !== undefined);
    });

    if (readyNodes.length === 0) {
      const stuck = nodes.find((n) => !n.isDone);
      if (stuck) stuck.dependencies = [];
      continue;
    }

    readyNodes.forEach((task) => {
      let earliestDepEndState = normalizeState({ date: new Date(planStartDate), fraction: 0 }, globalHolidays);

      task.dependencies.forEach((depId) => {
        const depState = taskEndStates[depId];
        if (depState) {
          const normalizedDep = normalizeState(depState, globalHolidays);
          if (compareStates(normalizedDep, earliestDepEndState) > 0) {
            earliestDepEndState = normalizedDep;
          }
        }
      });

      if (task.bufferDays > 0) {
        const { newState } = addFractionalBusinessDays(earliestDepEndState, task.bufferDays, globalHolidays);
        earliestDepEndState = newState;
      }
      
      task.earliestDepEndState = earliestDepEndState;

      const eligible = findEligibleMember(task, earliestDepEndState);
      task.eligibleMember = eligible;

      if (eligible) {
        const mFree = memberFreeState[eligible.id];
        const normalizedDep = normalizeState(earliestDepEndState, memberBlockedSets[eligible.id]);
        task.actualStartState = compareStates(mFree, normalizedDep) > 0 ? mFree : normalizedDep;
      } else {
        task.actualStartState = earliestDepEndState;
      }
    });

    // Priority sort maps states to integer weights easily
    readyNodes.sort((a, b) => {
      const aVal = a.actualStartState.date.valueOf() + Math.floor(a.actualStartState.fraction * 24 * 3600 * 1000);
      const bVal = b.actualStartState.date.valueOf() + Math.floor(b.actualStartState.fraction * 24 * 3600 * 1000);
      if (aVal !== bVal) return aVal - bVal;

      const aBook = a.type === 'book' ? 0 : 1;
      const bBook = b.type === 'book' ? 0 : 1;
      if (aBook !== bBook) return aBook - bBook;

      if (a.customPriority !== b.customPriority) return a.customPriority - b.customPriority;
      if (a.step_idx    !== b.step_idx)    return b.step_idx    - a.step_idx;
      if (a.book_idx    !== b.book_idx)    return a.book_idx    - b.book_idx;
      return a.chapter_idx - b.chapter_idx;
    });

    const winner = readyNodes.find((t) => t.eligibleMember) || readyNodes[0];
    const assignedMember = winner.eligibleMember;

    if (!assignedMember) {
      // Unassigned tasks do not queue behind each other (no shared bandwidth bottleneck),
      // but they STILL consume their required effort time on the global calendar.
      const startState = normalizeState(winner.earliestDepEndState, globalHolidays);
      
      const calendarDays = winner.effortDays; // Assume standard 1.0 bandwidth
      const res = addFractionalBusinessDays(startState, calendarDays, globalHolidays);
      const endState = res.newState;
      const lastWorkedDay = res.lastWorkedDay;

      taskEndStates[winner.id] = endState;
      winner.isDone = true;
      const uRec = existingTasksMap[winner.id] || {};
      tasksOutput.push({
        ...uRec,
        deliverable_id: winner.chapterId,
        book_id: winner.bookId,
        step_id: winner.stepId,
        plan_id: plan.id,
        plan_team_member_id: null,
        planned_start_date: format(startState.date, 'yyyy-MM-dd'),
        planned_end_date: format(lastWorkedDay, 'yyyy-MM-dd'),
        status: uRec.status || 'Yet to start',
      });
      continue;
    }

    // Normal path
    const blocked = memberBlockedSets[assignedMember.id];
    let finalStartState, finalEndState, lastWorkedDay;

    const manualOverride = manualOverrides[winner.id];
    if (manualOverride) {
      const overrideDate = startOfDay(parseISO(manualOverride));
      
      finalStartState = cloneState(winner.actualStartState);
      if (finalStartState.date > overrideDate) {
        finalStartState = { date: overrideDate, fraction: 0 };
      }
      lastWorkedDay = overrideDate;
      // Member is free the morning of the day following the override
      let nextDay = addDays(overrideDate, 1);
      while (isNonWorkingDay(nextDay, blocked)) nextDay = addDays(nextDay, 1);
      finalEndState = { date: nextDay, fraction: 0 };
    } else {
      const bandwidth    = assignedMember.bandwidth || 1;
      const calendarDays = winner.effortDays / bandwidth;
      
      finalStartState = cloneState(winner.actualStartState);
      const res = addFractionalBusinessDays(finalStartState, calendarDays, blocked);
      finalEndState = res.newState;
      lastWorkedDay = res.lastWorkedDay;
    }

    if (winner.chapterId) lockAssignment(winner.chapterId, winner.role_required, assignedMember);

    memberFreeState[assignedMember.id] = finalEndState;
    taskEndStates[winner.id] = finalEndState;
    winner.isDone = true;

    const rec = existingTasksMap[winner.id] || {};
    tasksOutput.push({
      ...rec,
      deliverable_id: winner.chapterId,
      book_id: winner.bookId,
      step_id: winner.stepId,
      plan_id: plan.id,
      plan_team_member_id: assignedMember.id,
      planned_start_date: format(finalStartState.date, 'yyyy-MM-dd'),
      planned_end_date: format(lastWorkedDay, 'yyyy-MM-dd'),
      status: rec.status || 'Yet to start',
    });
  }

  return tasksOutput;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export const forecastExecutionTasks = (plan, books, teamMembers, holidaySet) => {
  const memberLeavesMap = {};
  teamMembers.forEach((m) => {
    memberLeavesMap[m.id] = new Set((m.leaves || []).map((l) => l.leave_date));
  });

  return runEventDrivenSchedule(plan, books, teamMembers, holidaySet, memberLeavesMap);
};

export const cascadeAfterEdit = (
  plan, books, existingTasks, teamMembers, holidaySet, overriddenTaskId, newEndDate
) => {
  const memberLeavesMap = {};
  teamMembers.forEach((m) => {
    memberLeavesMap[m.id] = new Set((m.leaves || []).map((l) => l.leave_date));
  });

  const stepsById = Object.fromEntries((plan.steps || []).map((s) => [s.id, s]));

  const preservedAssignments = {};
  const explicitTaskAssignments = {};

  existingTasks.forEach((task) => {
    if (!task.plan_team_member_id) return;
    if (task.id) explicitTaskAssignments[task.id] = task.plan_team_member_id;

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
    manualOverrides, existingTasksMap, preservedAssignments, explicitTaskAssignments
  );
};
