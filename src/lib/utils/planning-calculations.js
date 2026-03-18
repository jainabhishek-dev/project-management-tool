import { format, addDays, isWeekend, parseISO, differenceInDays } from 'date-fns';

/**
 * Checks if a given date is a non-working day (weekend, global holiday, or team member leave).
 * 
 * @param {Date} date The date to check.
 * @param {Set<string>} holidaySet Set of holiday/leave dates in 'YYYY-MM-DD' format.
 * @returns {boolean}
 */
export const isNonWorkingDay = (date, holidaySet) => {
  if (isWeekend(date)) return true;
  const dateStr = format(date, 'yyyy-MM-dd');
  return holidaySet.has(dateStr);
};

/**
 * Adds a specific number of business days to a start date, accounting for holidays and weekends.
 * 
 * @param {string|Date} startDate The starting date.
 * @param {number} businessDaysToPlan The effort in mandays (e.g., 2.5).
 * @param {Set<string>} holidaySet Set of holiday/leave dates in 'YYYY-MM-DD' format.
 * @returns {Date} The calculated end date.
 */
export const addBusinessDaysWithHolidays = (startDate, businessDaysToPlan, holidaySet = new Set()) => {
  let date = typeof startDate === 'string' ? parseISO(startDate) : new Date(startDate);
  let remainingDays = businessDaysToPlan;

  // If we start on a non-working day, move to the next working day first
  while (isNonWorkingDay(date, holidaySet)) {
    date = addDays(date, 1);
  }

  // We keep adding days until the effort is exhausted
  while (remainingDays > 1) {
    date = addDays(date, 1);
    if (!isNonWorkingDay(date, holidaySet)) {
      remainingDays -= 1;
    }
  }

  // Final check: if the calculated end date lands on a non-working day, 
  // push it forward to the next working day.
  while (isNonWorkingDay(date, holidaySet)) {
    date = addDays(date, 1);
  }

  return date;
};

/**
 * Calculates the total number of business days between two dates.
 * 
 * @param {Date} start 
 * @param {Date} end 
 * @param {Set<string>} holidaySet 
 * @returns {number}
 */
export const calculateBusinessDaysBetween = (start, end, holidaySet = new Set()) => {
  let count = 0;
  let current = new Date(start);
  const target = new Date(end);

  while (current <= target) {
    if (!isNonWorkingDay(current, holidaySet)) {
      count++;
    }
    current = addDays(current, 1);
  }
  return count;
};

/**
 * The Master Scheduler Logic
 * 
 * This generates the full cascading schedule based on dependencies and norms.
 */
export const forecastExecutionTasks = (planTemplate, deliverables, availabilityMap = {}) => {
  const tasks = [];
  
  // 1. Group steps by their parallel dependencies
  const steps = planTemplate.steps.sort((a, b) => a.display_order - b.display_order);

  deliverables.forEach(deliverable => {
    const deliverableTasks = {}; // Store tasks for this unit by stepId to resolve dependencies

    steps.forEach(step => {
      // Find norm for this step and deliverable's cluster
      const normObj = planTemplate.norms.find(n => n.step_id === step.id && n.cluster_id === deliverable.cluster_id);
      const effort = normObj ? parseFloat(normObj.norm_in_mandays) : 0;
      
      // Determine Start Date
      let startDate;
      if (!step.parallel_dependency_id) {
        // First step starts on project start date
        startDate = parseISO(planTemplate.start_date);
      } else {
        // Dependent step starts based on predecessor's end date + buffer
        const predecessorTask = deliverableTasks[step.parallel_dependency_id];
        startDate = addDays(parseISO(predecessorTask.planned_end_date), 1);
        
        // Add step-specific buffer
        if (step.buffer_days > 0) {
          startDate = addBusinessDaysWithHolidays(startDate, step.buffer_days, availabilityMap.global || new Set());
        }
      }

      // Calculate End Date
      // Note: We use the assigned member's specific holiday set if provided
      const memberHolidays = availabilityMap[step.role_required] || availabilityMap.global || new Set();
      const endDate = addBusinessDaysWithHolidays(startDate, effort > 0 ? effort : 1, memberHolidays);

      const task = {
        deliverable_id: deliverable.id,
        step_id: step.id,
        planned_start_date: format(startDate, 'yyyy-MM-dd'),
        planned_end_date: format(endDate, 'yyyy-MM-dd'),
        status: 'Yet to start'
      };

      deliverableTasks[step.id] = task;
      tasks.push(task);
    });
  });

  return tasks;
};
