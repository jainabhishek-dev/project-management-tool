import { format, addDays, isWeekend, parseISO } from 'date-fns';

/**
 * Checks if a given date is a non-working day (weekend or in the blocked-dates set).
 *
 * @param {Date} date
 * @param {Set<string>} blockedSet - Set of 'YYYY-MM-DD' strings
 * @returns {boolean}
 */
export const isNonWorkingDay = (date, blockedSet) => {
  if (isWeekend(date)) return true;
  const dateStr = format(date, 'yyyy-MM-dd');
  return blockedSet.has(dateStr);
};

/**
 * Advances a start date by a given number of business days, skipping weekends
 * and any dates in the blocked set.
 *
 * @param {string|Date} startDate
 * @param {number} businessDaysToPlan
 * @param {Set<string>} blockedSet
 * @returns {Date}
 */
export const addBusinessDaysWithHolidays = (startDate, businessDaysToPlan, blockedSet = new Set()) => {
  let date = typeof startDate === 'string' ? parseISO(startDate) : new Date(startDate);
  let remainingDays = businessDaysToPlan;

  // If starting on a non-working day, move forward first
  while (isNonWorkingDay(date, blockedSet)) {
    date = addDays(date, 1);
  }

  // Consume remaining effort
  while (remainingDays > 1) {
    date = addDays(date, 1);
    if (!isNonWorkingDay(date, blockedSet)) {
      remainingDays -= 1;
    }
  }

  // If end date lands on a non-working day, push forward
  while (isNonWorkingDay(date, blockedSet)) {
    date = addDays(date, 1);
  }

  return date;
};

/**
 * The Master Scheduler
 *
 * Generates a full cascading schedule from a plan template, deliverables,
 * availability map, and bandwidth map.
 *
 * availabilityMap shape:
 *   { global: Set<string>, [role]: Set<string> }
 *   - global  : holiday dates blocked for everyone
 *   - [role]  : leave dates specific to team members with that role
 *
 * bandwidthMap shape:
 *   { [role]: number }
 *   - Summed bandwidth for all team members of that role.
 *   - e.g. two Creators at 0.5 each → bandwidthMap['Creator'] = 1.0
 *   - Effective effort in calendar-days = norm_in_mandays / bandwidth
 *
 * @param {Object} planTemplate  - { start_date, steps[] }
 * @param {Array}  deliverables  - planning_deliverables rows
 * @param {Object} availabilityMap
 * @param {Object} bandwidthMap
 * @returns {Array} task objects ready for DB insert (without plan_id or id)
 */
export const forecastExecutionTasks = (
  planTemplate,
  deliverables,
  availabilityMap = {},
  bandwidthMap = {}
) => {
  const tasks = [];

  const steps = [...(planTemplate.steps || [])].sort(
    (a, b) => a.display_order - b.display_order
  );

  const globalHolidays = availabilityMap.global || new Set();

  deliverables.forEach((deliverable) => {
    // Store tasks per step for this deliverable to resolve dependencies
    const deliverableTasks = {};

    steps.forEach((step) => {
      const normObj = (step.norms || []).find(
        (n) => n.cluster_id === deliverable.cluster_id
      );
      const effort = normObj ? parseFloat(normObj.norm_in_mandays) : 0;

      // ── Determine start date ──────────────────────────────────────────
      let startDate;

      if (!step.parallel_dependency_id) {
        // No dependency → starts on plan start date
        startDate = parseISO(planTemplate.start_date);
      } else {
        const predecessorTask = deliverableTasks[step.parallel_dependency_id];
        startDate = addDays(parseISO(predecessorTask.planned_end_date), 1);

        // Add step-level buffer (buffer days skip global holidays only)
        if (step.buffer_days > 0) {
          startDate = addBusinessDaysWithHolidays(
            startDate,
            step.buffer_days,
            globalHolidays
          );
        }
      }

      // ── Build blocked-date set for this step's role ───────────────────
      // Combines plan-level holidays with role-specific member leaves
      const memberLeaves = availabilityMap[step.role_required] || new Set();
      const combinedBlocked = new Set([...globalHolidays, ...memberLeaves]);

      // ── Effective effort (adjusted for bandwidth) ─────────────────────
      // If multiple members share a role, their bandwidths are summed.
      // effectiveDays = mandays_needed / total_bandwidth_for_role
      const roleBandwidth = bandwidthMap[step.role_required] || 1;
      const effectiveDays = effort > 0 ? effort / roleBandwidth : 1;

      // ── Calculate end date ────────────────────────────────────────────
      const endDate = addBusinessDaysWithHolidays(
        startDate,
        effectiveDays,
        combinedBlocked
      );

      const task = {
        deliverable_id: deliverable.id,
        step_id: step.id,
        planned_start_date: format(startDate, 'yyyy-MM-dd'),
        planned_end_date: format(endDate, 'yyyy-MM-dd'),
        status: 'Yet to start',
      };

      deliverableTasks[step.id] = task;
      tasks.push(task);
    });
  });

  return tasks;
};

/**
 * Cascades date changes downstream from a single modified task.
 *
 * Given one task whose planned_end_date has been manually changed,
 * recalculates the start/end dates of all dependent steps for the
 * same deliverable.
 *
 * @param {Array}  allTasksForDeliverable  - All planning_tasks for this deliverable
 * @param {string} changedStepId           - step_id of the task the user edited
 * @param {string} newEndDate              - New planned_end_date ('YYYY-MM-DD')
 * @param {Array}  steps                   - planning_steps[] with norms, sorted
 * @param {string} clusterId               - cluster_id of the deliverable
 * @param {Object} availabilityMap
 * @param {Object} bandwidthMap
 * @returns {Array} Updated task objects (only the ones that changed)
 */
export const cascadeTaskDates = (
  allTasksForDeliverable,
  changedStepId,
  newEndDate,
  steps,
  clusterId,
  availabilityMap = {},
  bandwidthMap = {}
) => {
  const globalHolidays = availabilityMap.global || new Set();

  // Build: stepId → [steps that directly depend on it]
  const dependants = {};
  steps.forEach((step) => {
    if (step.parallel_dependency_id) {
      if (!dependants[step.parallel_dependency_id]) {
        dependants[step.parallel_dependency_id] = [];
      }
      dependants[step.parallel_dependency_id].push(step);
    }
  });

  // Current snapshot of tasks keyed by step_id
  const taskByStep = {};
  allTasksForDeliverable.forEach((t) => {
    taskByStep[t.step_id] = { ...t };
  });

  // Apply the manual change to the anchor task
  taskByStep[changedStepId] = {
    ...taskByStep[changedStepId],
    planned_end_date: newEndDate,
  };

  const updatedTasks = [{ ...taskByStep[changedStepId] }];
  const queue = [changedStepId];

  while (queue.length > 0) {
    const currentStepId = queue.shift();
    const currentTask = taskByStep[currentStepId];
    if (!currentTask) continue;

    const downstream = dependants[currentStepId] || [];

    downstream.forEach((depStep) => {
      let startDate = addDays(parseISO(currentTask.planned_end_date), 1);

      // Apply buffer days (global holidays only)
      if (depStep.buffer_days > 0) {
        startDate = addBusinessDaysWithHolidays(
          startDate,
          depStep.buffer_days,
          globalHolidays
        );
      }

      const memberLeaves = availabilityMap[depStep.role_required] || new Set();
      const combinedBlocked = new Set([...globalHolidays, ...memberLeaves]);

      const normObj = (depStep.norms || []).find((n) => n.cluster_id === clusterId);
      const effort = parseFloat(normObj?.norm_in_mandays) || 0;
      const roleBandwidth = bandwidthMap[depStep.role_required] || 1;
      const effectiveDays = effort > 0 ? effort / roleBandwidth : 1;

      const endDate = addBusinessDaysWithHolidays(startDate, effectiveDays, combinedBlocked);

      const startStr = format(startDate, 'yyyy-MM-dd');
      const endStr = format(endDate, 'yyyy-MM-dd');

      taskByStep[depStep.id] = {
        ...taskByStep[depStep.id],
        planned_start_date: startStr,
        planned_end_date: endStr,
      };

      updatedTasks.push({ ...taskByStep[depStep.id] });
      queue.push(depStep.id);
    });
  }

  return updatedTasks;
};
