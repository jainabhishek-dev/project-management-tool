import { format, addDays, isWeekend, parseISO, isBefore, isEqual, isValid } from 'date-fns';

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
// Phase-1: Assign one team member per (chapter × role) for chapter-level steps.
// ─────────────────────────────────────────────────────────────────────────────

function assignChapterRoles(books, steps, teamMembers) {
  const chapterRoleAssignment = {};
  const memberEstLoad = {};
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

        const winner = [...candidates].sort((a, b) => {
          return memberEstLoad[a.id] - memberEstLoad[b.id];
        })[0];

        chapterRoleAssignment[`${chapter.id}-${role}`] = winner;

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
// Phase-2: Event-Driven Simulation (Option B: Left-to-Right Priority)
// ─────────────────────────────────────────────────────────────────────────────

function runEventDrivenSchedule(
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
  const sortedSteps = [...(plan.steps || [])].sort((a, b) => a.display_order - b.display_order);
  const sortedBooks = [...books].sort((a, b) => a.display_order - b.display_order);
  
  const planStartDate = parseISO(plan.start_date);
  
  // Track sub-day fractional availability
  const memberFreeDate = {};
  const memberCapacityLeft = {};
  teamMembers.forEach((m) => {
    memberFreeDate[m.id] = new Date(planStartDate);
    memberCapacityLeft[m.id] = 1.0;
  });

  // Track task ends to resolve dependencies
  const taskEndDates = {}; // taskId → Date

  // 1. Generate all task nodes
  const nodes = [];

  for (let bIdx = 0; bIdx < sortedBooks.length; bIdx++) {
    const book = sortedBooks[bIdx];
    const sortedChapters = [...(book.chapters || [])].sort((a, b) => a.display_order - b.display_order);

    for (let sIdx = 0; sIdx < sortedSteps.length; sIdx++) {
      const step = sortedSteps[sIdx];
      const isBookStep = step.unit_of_calculation === 'Book';
      
      const predStepId = step.parallel_dependency_id;
      const predStep = predStepId ? sortedSteps.find(s => s.id === predStepId) : null;
      const isPredBookStep = predStep?.unit_of_calculation === 'Book';

      if (!isBookStep) {
        // Chapter tasks
        for (let cIdx = 0; cIdx < sortedChapters.length; cIdx++) {
          const chapter = sortedChapters[cIdx];
          const taskId = `${chapter.id}-${step.id}`;
          
          let dependencies = [];
          if (predStep) {
            if (isPredBookStep) dependencies.push(`${book.id}-${predStep.id}`);
            else dependencies.push(`${chapter.id}-${predStep.id}`);
          }

          const member = chapterRoleAssignment[`${chapter.id}-${step.role_required}`];
          
          // Pages ratio prep
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
            assignedMember: member,
            role_required: step.role_required,
            dependencies,
            effortDays,
            step_idx: sIdx,       // Higher is better priority (closer to done)
            book_idx: bIdx,       // Lower is better priority (first book)
            chapter_idx: cIdx,    // Lower is better priority (first chapter)
            isDone: false,
            taskRecord: null,
          });
        }
      } else {
        // Book tasks
        const taskId = `${book.id}-${step.id}`;
        let dependencies = [];
        if (predStep) {
          if (isPredBookStep) {
            dependencies.push(`${book.id}-${predStep.id}`);
          } else {
            // Book step waits for ALL chapters of predecessor
            sortedChapters.forEach(ch => dependencies.push(`${ch.id}-${predStep.id}`));
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
          assignedMember: null, // Resolved right when it starts
          role_required: step.role_required,
          dependencies,
          effortDays,
          step_idx: sIdx,
          book_idx: bIdx,
          chapter_idx: -1,
          isDone: false,
          taskRecord: null,
        });
      }
    }
  }

  // 2. Event loop until all nodes are processed
  const tasksOutput = [];
  const MAX_LOOPS = 500000;
  let loops = 0;

  while (nodes.some(n => !n.isDone) && loops < MAX_LOOPS) {
    loops++;

    // Find all "Ready" tasks (all dependencies are Done/scheduled)
    const readyTasks = nodes.filter(n => {
      if (n.isDone) return false;
      return n.dependencies.every(depId => taskEndDates[depId] !== undefined);
    });

    if (readyTasks.length === 0) {
      // Missing dependencies or cycle. Unblock remaining randomly to prevent infinite loop
      const remaining = nodes.filter(n => !n.isDone);
      if (remaining.length > 0) remaining[0].dependencies = [];
      continue;
    }

    // Evaluate Earliest Possible Start for all Ready tasks based on Predecessors ONLY
    readyTasks.forEach(task => {
      let earliestStart = new Date(planStartDate);
      task.dependencies.forEach(depId => {
        const depEnd = taskEndDates[depId];
        const candidateStart = addDays(depEnd, 1);
        if (candidateStart > earliestStart) earliestStart = candidateStart;
      });

      if (task.bufferDays > 0) {
        earliestStart = addBusinessDaysWithHolidays(earliestStart, task.bufferDays, globalHolidays);
      }
      task.earliestTheoreticalStart = earliestStart;

      // Assign dynamic member for Book tasks now based on who avoids delays
      if (task.type === 'book' && !task.assignedMember) {
        let bestMember = null;
        if (preservedBookAssignments[task.id]) {
           bestMember = teamMembers.find(m => m.id === preservedBookAssignments[task.id]);
        }
        
        if (!bestMember) {
           const candidates = teamMembers.filter(m => m.role === task.role_required);
           if (candidates.length > 0) {
              bestMember = candidates.sort((a, b) => {
                 const mFreeDate = new Date(memberFreeDate[a.id]);
                 const nFreeDate = new Date(memberFreeDate[b.id]);
                 const aStart = Math.max(earliestStart.valueOf(), mFreeDate.valueOf());
                 const bStart = Math.max(earliestStart.valueOf(), nFreeDate.valueOf());
                 if (aStart !== bStart) return aStart - bStart;
                 return b.bandwidth - a.bandwidth; // Highest bandwidth wins tie
              })[0];
           }
        }
        task.assignedMember = bestMember || { id: null, bandwidth: 1, _missing: true }; // Dummy for unassigned
      }

      // Calculate actual start including member's free timeline
      if (task.assignedMember && !task.assignedMember._missing) {
         const mFreeDate = memberFreeDate[task.assignedMember.id];
         task.actualStart = task.earliestTheoreticalStart > mFreeDate ? task.earliestTheoreticalStart : mFreeDate;
      } else {
         task.actualStart = task.earliestTheoreticalStart; // Unassigned falls back to earliest
      }
    });

    // Pick the BEST ready task to schedule next
    // Rule 1: Starts earliest in real time (simulating chronological timeline)
    // Rule 2: Left-to-Right Priority (Higher step index => closer to completion wins)
    // Rule 3: Top-to-Bottom Priority (Lower book/chapter index wins)

    readyTasks.sort((a, b) => {
       const startA = a.actualStart.valueOf();
       const startB = b.actualStart.valueOf();
       if (startA !== startB) return startA - startB; // Rule 1

       if (a.step_idx !== b.step_idx) return b.step_idx - a.step_idx; // Rule 2
       if (a.book_idx !== b.book_idx) return a.book_idx - b.book_idx; // Rule 3
       return a.chapter_idx - b.chapter_idx;                          // Rule 3
    });

    const winner = readyTasks[0];

    // Compute Exact Dates
    let finalStart;
    let finalEnd;

    const blocked = new Set(globalHolidays);
    if (winner.assignedMember && !winner.assignedMember._missing) {
       const mLeaves = memberLeavesMap[winner.assignedMember.id] || new Set();
       mLeaves.forEach(l => blocked.add(l));
    }

    const manualOverride = manualOverrides[winner.id];
    let finalEndStr;

    if (manualOverride) {
      finalEnd = parseISO(manualOverride);
      finalEndStr = manualOverride;
      finalStart = winner.actualStart; 
      
      // Update member tracking conceptually
      if (winner.assignedMember && !winner.assignedMember._missing) {
         memberFreeDate[winner.assignedMember.id] = finalEnd;
         memberCapacityLeft[winner.assignedMember.id] = 0.0; 
      }
    } else {
      const bandwidth = winner.assignedMember ? winner.assignedMember.bandwidth : 1;
      const effectiveDays = winner.effortDays > 0 ? winner.effortDays / (bandwidth || 1) : 1;

      if (!winner.assignedMember || winner.assignedMember._missing) {
        finalStart = winner.earliestTheoreticalStart;
        while (isNonWorkingDay(finalStart, blocked)) finalStart = addDays(finalStart, 1);
        finalEnd = addBusinessDaysWithHolidays(finalStart, Math.max(1, effectiveDays), blocked);
      } else {
        const mId = winner.assignedMember.id;
        let mFree = new Date(memberFreeDate[mId]);
        let mCap = memberCapacityLeft[mId];

        const earliestStr = format(winner.earliestTheoreticalStart, 'yyyy-MM-dd');
        while (format(mFree, 'yyyy-MM-dd') < earliestStr || isNonWorkingDay(mFree, blocked)) {
          mFree = addDays(mFree, 1);
          mCap = 1.0; 
        }

        finalStart = new Date(mFree);

        if (effectiveDays <= mCap) {
          mCap -= effectiveDays;
          finalEnd = new Date(mFree);
        } else {
          let overflow = effectiveDays - mCap;
          
          do {
             mFree = addDays(mFree, 1);
             while (isNonWorkingDay(mFree, blocked)) mFree = addDays(mFree, 1);
          } while (false); 

          while (overflow >= 1.0) {
             mFree = addDays(mFree, 1);
             while (isNonWorkingDay(mFree, blocked)) mFree = addDays(mFree, 1);
             overflow -= 1.0;
          }
          
          mCap = 1.0 - overflow;
          if (mCap >= 1.0) mCap = 0; // if overflow was practically 0
          
          finalEnd = new Date(mFree);
        }

        memberFreeDate[mId] = new Date(mFree);
        memberCapacityLeft[mId] = mCap;
      }
      finalEndStr = format(finalEnd, 'yyyy-MM-dd');
    }

    // Bookkeeping
    taskEndDates[winner.id] = finalEnd;
    winner.isDone = true;

    // Build the DB Task Object
    const existing = existingTasksMap[winner.id] || {};
    winner.taskRecord = {
       ...existing,
       deliverable_id: winner.chapterId,
       book_id: winner.bookId,
       step_id: winner.stepId,
       plan_id: plan.id,
       plan_team_member_id: winner.assignedMember && !winner.assignedMember._missing ? winner.assignedMember.id : null,
       planned_start_date: format(finalStart, 'yyyy-MM-dd'),
       planned_end_date: finalEndStr,
       status: existing.status || 'Yet to start'
    };
    tasksOutput.push(winner.taskRecord);
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

  const chapterRoleAssignment = assignChapterRoles(books, plan.steps || [], teamMembers);

  return runEventDrivenSchedule(
    plan, books, teamMembers, holidaySet, memberLeavesMap, chapterRoleAssignment
  );
};

export const cascadeAfterEdit = (
  plan, books, existingTasks, teamMembers, holidaySet, overriddenTaskId, newEndDate
) => {
  const memberLeavesMap = {};
  teamMembers.forEach((m) => {
    memberLeavesMap[m.id] = new Set((m.leaves || []).map((l) => l.leave_date));
  });

  const stepsById = Object.fromEntries((plan.steps || []).map((s) => [s.id, s]));
  const chapterRoleAssignment = {};
  const preservedBookAssignments = {};

  existingTasks.forEach((task) => {
    if (!task.plan_team_member_id) return;
    const step = stepsById[task.step_id];
    if (!step) return;

    if (task.deliverable_id && (!step.unit_of_calculation || step.unit_of_calculation === 'Chapter / Unit')) {
      chapterRoleAssignment[`${task.deliverable_id}-${step.role_required}`] =
        teamMembers.find((m) => m.id === task.plan_team_member_id);
    } else if (task.book_id && step.unit_of_calculation === 'Book') {
      preservedBookAssignments[`${task.book_id}-${step.id}`] = task.plan_team_member_id;
    }
  });

  const existingTasksMap = {};
  existingTasks.forEach((task) => {
    const key = task.deliverable_id ? `${task.deliverable_id}-${task.step_id}` : `${task.book_id}-${task.step_id}`;
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
    plan, books, teamMembers, holidaySet, memberLeavesMap, chapterRoleAssignment,
    preservedBookAssignments, manualOverrides, existingTasksMap
  );
};
