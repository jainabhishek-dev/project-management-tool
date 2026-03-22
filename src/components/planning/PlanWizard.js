'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { Plus, Trash2, Check, ChevronRight, ChevronLeft, BookOpen, GripVertical } from 'lucide-react';
import styles from './PlanWizard.module.css';

const STEPS_WIZARD = [
  { id: 'info',    title: 'Basic Info' },
  { id: 'steps',   title: 'Steps & Norms' },
  { id: 'books',   title: 'Books & Chapters' },
  { id: 'priority', title: 'Execution Priority' },
  { id: 'team',    title: 'Team Members' },
  { id: 'holidays', title: 'Holidays' },
];

const ROLE_OPTIONS = [
  'Creator', 'Reviewer 1', 'Reviewer 2', 'Design', 'DTP', 'Edit',
  'QA', 'PM', 'Author', 'FL - Creator', 'FL - Reviewer 1', 'FL - Reviewer 2',
  'FL - Design', 'FL - DTP', 'FL - Edit', 'FL - QA', 'FL - PM', 'Intern',
];

const BANDWIDTH_OPTIONS = [
  { value: 0.25, label: '0.25 (25%)' },
  { value: 0.5,  label: '0.5 (50%)' },
  { value: 0.75, label: '0.75 (75%)' },
  { value: 1,    label: '1 (100%)' },
];

const UNIT_OPTIONS = ['Chapter / Unit', 'Book'];

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

export default function PlanWizard({ projectId, userId, clusters, initialPlanData }) {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();

  const isEditMode = !!initialPlanData;

  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // ── Drag & Drop States ──
  const [draggedStepIdx, setDraggedStepIdx] = useState(null);
  const [dragOverStepIdx, setDragOverStepIdx] = useState(null);

  // ── Step 1: Basic Info ────────────────────────────────────────────────
  const [info, setInfo] = useState(() => {
    if (isEditMode) {
      return {
        name: initialPlanData.plan.name || '',
        type: initialPlanData.plan.type || 'Print',
        start_date: initialPlanData.plan.start_date || new Date().toISOString().split('T')[0],
      };
    }
    return { name: '', type: 'Print', start_date: new Date().toISOString().split('T')[0] };
  });

  const isPrint = info.type !== 'Digital';

  // ── Step 2: Cluster Labels ────────────────────────────────────────────
  const [clusterLabels, setClusterLabels] = useState(() => {
    if (isEditMode && initialPlanData.plan.cluster_labels) {
      return initialPlanData.plan.cluster_labels;
    }
    return clusters.reduce((acc, c) => ({ ...acc, [c.id]: c.name }), {});
  });

  // ── Step 2: Steps & Norms ─────────────────────────────────────────────
  const [planSteps, setPlanSteps] = useState(() => {
    if (isEditMode && initialPlanData.steps.length > 0) {
      // Create a map to resolve dependsOnIndex from the original step IDs
      const idToIndexMap = {};
      const sortedSteps = [...initialPlanData.steps].sort((a, b) => a.display_order - b.display_order);
      sortedSteps.forEach((s, idx) => { idToIndexMap[s.id] = idx; });

      return sortedSteps.map((s) => {
        // Flatten norms array into { [clusterId]: value } map
        const normsMap = {};
        if (s.planning_norms) {
          s.planning_norms.forEach(n => { normsMap[n.cluster_id] = n.norm_in_mandays; });
        }
        
        return {
          _id: s.id, // we reuse the real DB UUID as the react key
          name: s.name,
          role: s.role_required,
          buffer: s.buffer_days,
          dependsOnIndex: s.parallel_dependency_id ? idToIndexMap[s.parallel_dependency_id] : null,
          unitOfCalc: s.unit_of_calculation || 'Chapter / Unit',
          normPages: s.norm_pages || 0,
          bookNorm: s.book_norm_in_mandays || 0,
          norms: normsMap,
        };
      });
    }

    return [
      {
        _id: generateId(),
        name: 'Step A',
        role: 'Creator',
        buffer: 0,
        dependsOnIndex: null,
        unitOfCalc: 'Chapter / Unit',
        normPages: 0,
        bookNorm: 0,
        norms: clusters.reduce((acc, c) => ({ ...acc, [c.id]: 1 }), {}),
      },
      {
        _id: generateId(),
        name: 'Step B',
        role: 'Reviewer 1',
        buffer: 0,
        dependsOnIndex: 0,
        unitOfCalc: 'Chapter / Unit',
        normPages: 0,
        bookNorm: 0,
        norms: clusters.reduce((acc, c) => ({ ...acc, [c.id]: 0.5 }), {}),
      },
    ];
  });

  // ── Drag & Drop Handlers ──
  const handleDragStartSteps = (e, index) => {
    setDraggedStepIdx(index);
    e.dataTransfer.setData('text/plain', index.toString());
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOverSteps = (e, index) => {
    e.preventDefault();
    if (dragOverStepIdx !== index) setDragOverStepIdx(index);
  };

  const handleDropSteps = (e, targetIdx) => {
    e.preventDefault();
    if (draggedStepIdx === null || draggedStepIdx === targetIdx) {
      setDraggedStepIdx(null);
      setDragOverStepIdx(null);
      return;
    }

    setPlanSteps((prev) => {
      const newSteps = [...prev];
      const draggedItem = newSteps[draggedStepIdx];

      newSteps.splice(draggedStepIdx, 1);
      newSteps.splice(targetIdx, 0, draggedItem);

      // Map old index to new index to fix parallel dependencies
      const newIndexMap = {};
      for (let i = 0; i < prev.length; i++) {
        const newPos = newSteps.indexOf(prev[i]);
        if (newPos !== -1) newIndexMap[i] = newPos;
      }

      return newSteps.map((s) => {
        if (s.dependsOnIndex !== null && s.dependsOnIndex !== undefined) {
          return { ...s, dependsOnIndex: newIndexMap[s.dependsOnIndex] };
        }
        return s;
      });
    });

    setDraggedStepIdx(null);
    setDragOverStepIdx(null);
  };

  const handleDragEndSteps = () => {
    setDraggedStepIdx(null);
    setDragOverStepIdx(null);
  };

  // ── Step 3: Books & Chapters ──────────────────────────────────────────
  const [books, setBooks] = useState(() => {
    if (isEditMode && initialPlanData.books.length > 0) {
      return initialPlanData.books.map(b => ({
        _id: b.id,
        name: b.name,
        priority: b.execution_priority || null,
        chapters: (b.planning_deliverables || []).sort((x, y) => x.display_order - y.display_order).map(ch => ({
          _id: ch.id,
          unitNo: ch.unit_no || '',
          unitName: ch.unit_name || '',
          clusterId: ch.cluster_id || '',
          pages: ch.pages || 0,
          priority: ch.execution_priority || null,
        })),
      }));
    }
    return [
      {
        _id: generateId(),
        name: '',
        priority: null,
        chapters: [
          {
            _id: generateId(),
            unitNo: '1',
            unitName: '',
            clusterId: clusters[0]?.id || '',
            pages: 0,
            priority: null,
          },
        ],
      },
    ];
  });

  // Flat structured chapters sorted intrinsically by currently stored priority OR naturally by fallback flow
  const orderedChapters = [].concat(...books.map(b => 
    b.chapters.map(ch => ({ ...ch, bookId: b._id, bookName: b.name }))
  )).sort((a, b) => (a.priority || Infinity) - (b.priority || Infinity));

  const [draggedPrioIdx, setDraggedPrioIdx] = useState(null);
  const [dragOverPrioIdx, setDragOverPrioIdx] = useState(null);

  const handleDragStartPrio = (e, index) => {
    setDraggedPrioIdx(index);
    e.dataTransfer.setData('text/plain', index.toString());
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOverPrio = (e, index) => {
    e.preventDefault();
    if (dragOverPrioIdx !== index) setDragOverPrioIdx(index);
  };

  const handleDropPrio = (e, targetIdx) => {
    e.preventDefault();
    if (draggedPrioIdx === null || draggedPrioIdx === targetIdx) {
      setDraggedPrioIdx(null);
      setDragOverPrioIdx(null);
      return;
    }

    const flat = [...orderedChapters];
    const draggedItem = flat[draggedPrioIdx];
    flat.splice(draggedPrioIdx, 1);
    flat.splice(targetIdx, 0, draggedItem);

    // Apply strict priority 1 through N exactly
    const updatedBooks = [...books];
    flat.forEach((flatCh, sortedIndex) => {
      const bookObj = updatedBooks.find(b => b._id === flatCh.bookId);
      if (bookObj) {
        const chapterRef = bookObj.chapters.find(c => c._id === flatCh._id);
        if (chapterRef) chapterRef.priority = sortedIndex + 1;
      }
    });

    setBooks(updatedBooks);
    setDraggedPrioIdx(null);
    setDragOverPrioIdx(null);
  };

  const handleDragEndPrio = () => {
    setDraggedPrioIdx(null);
    setDragOverPrioIdx(null);
  };

  // ── Step 5: Team Members ──────────────────────────────────────────────
  const [teamMembers, setTeamMembers] = useState(() => {
    if (isEditMode && initialPlanData.team.length > 0) {
      return initialPlanData.team.map(m => ({
        _id: m.id,
        name: m.name,
        role: m.role,
        bandwidth: m.bandwidth || 1,
        leaves: (m.plan_leaves || []).map(l => l.leave_date),
      }));
    }
    return [
      { _id: generateId(), name: '', role: 'Creator', bandwidth: 1, leaves: [] },
    ];
  });

  // ── Step 5: Holidays ──────────────────────────────────────────────────
  const [holidays, setHolidays] = useState(() => {
    if (isEditMode && initialPlanData.holidays.length > 0) {
      return initialPlanData.holidays.map(h => ({
        _id: h.id,
        date: h.holiday_date,
        description: h.description || '',
      }));
    }
    return [
      { _id: generateId(), date: '', description: '' },
    ];
  });

  // ── Navigation ────────────────────────────────────────────────────────
  const handleNext = () => {
    const err = validateCurrentStep();
    if (err) { setError(err); return; }
    setError(null);
    if (currentStepIndex < STEPS_WIZARD.length - 1) {
      setCurrentStepIndex(currentStepIndex + 1);
    } else {
      handleSave();
    }
  };

  const handleBack = () => {
    setError(null);
    if (currentStepIndex > 0) setCurrentStepIndex(currentStepIndex - 1);
  };

  // ── Validation ────────────────────────────────────────────────────────
  function validateCurrentStep() {
    if (currentStepIndex === 0) {
      if (!info.name.trim()) return 'Plan name is required.';
      if (!info.start_date) return 'Start date is required.';
    }
    if (currentStepIndex === 1) {
      if (planSteps.length === 0) return 'Add at least one step.';
      for (const s of planSteps) {
        if (!s.name.trim()) return 'All steps must have a name.';
        if (!s.role) return 'All steps must have a role assigned.';
      }
    }
    if (currentStepIndex === 2) {
      if (books.length === 0) return 'Add at least one book.';
      for (const book of books) {
        if (!book.name.trim()) return 'Each book must have a name.';
        if (book.chapters.length === 0)
          return `Book "${book.name || '…'}" must have at least one chapter.`;
        for (const ch of book.chapters) {
          if (!ch.unitName.trim()) return 'All chapters must have a unit name.';
          if (!ch.clusterId) return 'All chapters must have a cluster selected.';
        }
      }
    }
    return null;
  }

  // ── Step 2 helpers ────────────────────────────────────────────────────
  const addStep = () => {
    setPlanSteps([
      ...planSteps,
      {
        _id: generateId(),
        name: '',
        role: ROLE_OPTIONS[0],
        buffer: 0,
        dependsOnIndex: planSteps.length > 0 ? planSteps.length - 1 : null,
        unitOfCalc: 'Chapter / Unit',
        normPages: 0,
        bookNorm: 0,
        norms: clusters.reduce((acc, c) => ({ ...acc, [c.id]: 0 }), {}),
      },
    ]);
  };

  const removeStep = (index) => {
    if (planSteps.length <= 1) return;
    const newSteps = planSteps.filter((_, i) => i !== index);
    const fixed = newSteps.map((s) => {
      if (s.dependsOnIndex === null) return s;
      if (s.dependsOnIndex === index) return { ...s, dependsOnIndex: null };
      if (s.dependsOnIndex > index) return { ...s, dependsOnIndex: s.dependsOnIndex - 1 };
      return s;
    });
    setPlanSteps(fixed);
  };

  const updateStep = (index, field, value) => {
    setPlanSteps(planSteps.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  };

  const updateNorm = (stepIndex, clusterId, value) => {
    setPlanSteps(
      planSteps.map((s, i) =>
        i === stepIndex ? { ...s, norms: { ...s.norms, [clusterId]: value } } : s
      )
    );
  };

  const handlePastePlanSteps = (e, rowIndex, field) => {
    if (!e.clipboardData) return;
    const pasteData = e.clipboardData.getData('text/plain');
    if (!pasteData) return;
    const pastedRows = pasteData.split(/\r?\n/).filter((r) => r.length > 0).map((r) => r.split('\t'));
    if (pastedRows.length <= 1 && pastedRows[0].length <= 1) return;
    e.preventDefault();

    const clusterIds = clusters.map((c) => c.id);
    const allCols = ['name', 'role', 'buffer', ...clusterIds];
    const startColIndex = allCols.indexOf(field);
    if (startColIndex === -1) return;

    const newSteps = [...planSteps];
    for (let r = 0; r < pastedRows.length; r++) {
      const targetIndex = rowIndex + r;
      if (targetIndex >= newSteps.length) {
        newSteps.push({
          _id: generateId(), name: '', role: ROLE_OPTIONS[0], buffer: 0,
          dependsOnIndex: null, unitOfCalc: 'Chapter / Unit', normPages: 0,
          bookNorm: 0, norms: clusters.reduce((acc, c) => ({ ...acc, [c.id]: 0 }), {}),
        });
      }
      const rowData = pastedRows[r];
      const step = { ...newSteps[targetIndex], norms: { ...newSteps[targetIndex].norms } };
      for (let c = 0; c < rowData.length; c++) {
        const colIdx = startColIndex + c;
        if (colIdx < allCols.length) {
          const col = allCols[colIdx];
          const val = rowData[c].trim();
          if (col === 'name' || col === 'role') step[col] = val;
          else if (col === 'buffer') step.buffer = parseFloat(val) || 0;
          else if (val !== '') step.norms[col] = parseFloat(val) || 0;
        }
      }
      newSteps[targetIndex] = step;
    }
    setPlanSteps(newSteps);
  };

  // ── Step 3 helpers — Books ────────────────────────────────────────────
  const addBook = () => {
    setBooks([
      ...books,
      {
        _id: generateId(),
        name: '',
        chapters: [
          { _id: generateId(), unitNo: '1', unitName: '', clusterId: clusters[0]?.id || '', pages: 0 },
        ],
      },
    ]);
  };

  const removeBook = (bookId) => {
    if (books.length <= 1) return;
    setBooks(books.filter((b) => b._id !== bookId));
  };

  const updateBook = (bookId, value) => {
    setBooks(books.map((b) => (b._id === bookId ? { ...b, name: value } : b)));
  };

  // ── Step 3 helpers — Chapters ─────────────────────────────────────────
  const addChapter = (bookId) => {
    setBooks(
      books.map((b) =>
        b._id !== bookId
          ? b
          : {
              ...b,
              chapters: [
                ...b.chapters,
                { _id: generateId(), unitNo: '', unitName: '', clusterId: clusters[0]?.id || '', pages: 0 },
              ],
            }
      )
    );
  };

  const removeChapter = (bookId, chapterId) => {
    setBooks(
      books.map((b) => {
        if (b._id !== bookId) return b;
        if (b.chapters.length <= 1) return b;
        return { ...b, chapters: b.chapters.filter((ch) => ch._id !== chapterId) };
      })
    );
  };

  const updateChapter = (bookId, chapterId, field, value) => {
    setBooks(
      books.map((b) =>
        b._id !== bookId
          ? b
          : {
              ...b,
              chapters: b.chapters.map((ch) =>
                ch._id !== chapterId ? ch : { ...ch, [field]: value }
              ),
            }
      )
    );
  };

  const handlePasteChapters = (e, bookId, chapterIndex, field) => {
    if (!e.clipboardData) return;
    const pasteData = e.clipboardData.getData('text/plain');
    if (!pasteData) return;
    const pastedRows = pasteData.split(/\r?\n/).filter((r) => r.length > 0).map((r) => r.split('\t'));
    if (pastedRows.length <= 1 && pastedRows[0].length <= 1) return;
    e.preventDefault();

    const allCols = isPrint
      ? ['unitNo', 'unitName', 'clusterId', 'pages']
      : ['unitNo', 'unitName', 'clusterId'];
    const startColIndex = allCols.indexOf(field);
    if (startColIndex === -1) return;

    setBooks(
      books.map((b) => {
        if (b._id !== bookId) return b;
        const newChapters = [...b.chapters];
        for (let r = 0; r < pastedRows.length; r++) {
          const targetIndex = chapterIndex + r;
          if (targetIndex >= newChapters.length) {
            newChapters.push({ _id: generateId(), unitNo: '', unitName: '', clusterId: clusters[0]?.id || '', pages: 0 });
          }
          const rowData = pastedRows[r];
          const ch = { ...newChapters[targetIndex] };
          for (let c = 0; c < rowData.length; c++) {
            const colIdx = startColIndex + c;
            if (colIdx < allCols.length) {
              const col = allCols[colIdx];
              const val = rowData[c].trim();
              if (col === 'pages') ch.pages = parseInt(val) || 0;
              else if (col === 'clusterId') {
                const match = clusters.find((cl) => cl.name.toLowerCase() === val.toLowerCase() || cl.id === val);
                ch.clusterId = match ? match.id : val;
              } else ch[col] = val;
            }
          }
          newChapters[targetIndex] = ch;
        }
        return { ...b, chapters: newChapters };
      })
    );
  };

  // ── Step 4 helpers — Team Members ─────────────────────────────────────
  const addTeamMember = () => {
    setTeamMembers([...teamMembers, { _id: generateId(), name: '', role: ROLE_OPTIONS[0], bandwidth: 1, leaves: [] }]);
  };

  const removeTeamMember = (id) => {
    if (teamMembers.length <= 1) return;
    setTeamMembers(teamMembers.filter((m) => m._id !== id));
  };

  const updateTeamMember = (id, field, value) => {
    setTeamMembers(teamMembers.map((m) => (m._id === id ? { ...m, [field]: value } : m)));
  };

  const addLeave = (memberId, date) => {
    setTeamMembers(
      teamMembers.map((m) =>
        m._id !== memberId || m.leaves.includes(date)
          ? m
          : { ...m, leaves: [...m.leaves, date].sort() }
      )
    );
  };

  const removeLeave = (memberId, date) => {
    setTeamMembers(
      teamMembers.map((m) =>
        m._id === memberId ? { ...m, leaves: m.leaves.filter((d) => d !== date) } : m
      )
    );
  };

  // ── Step 5 helpers — Holidays ─────────────────────────────────────────
  const addHoliday = () => {
    setHolidays([...holidays, { _id: generateId(), date: '', description: '' }]);
  };

  const removeHoliday = (id) => {
    if (holidays.length <= 1) return;
    setHolidays(holidays.filter((h) => h._id !== id));
  };

  const updateHoliday = (id, field, value) => {
    setHolidays(holidays.map((h) => (h._id === id ? { ...h, [field]: value } : h)));
  };

  // ── Save ──────────────────────────────────────────────────────────────
  const handleSave = async () => {
    setLoading(true);
    setError(null);

    try {
      // Cluster labels payload
      const clusterLabelsPayload = {};
      clusters.forEach((c) => {
        clusterLabelsPayload[c.id] = clusterLabels[c.id] || c.name;
      });

      // 1. Create or Update project plan
      let plan;

      if (isEditMode) {
        const { data: updatedPlan, error: planError } = await supabase
          .from('project_plans')
          .update({
            name: info.name.trim(),
            type: info.type,
            start_date: info.start_date,
            cluster_labels: clusterLabelsPayload,
          })
          .eq('id', initialPlanData.plan.id)
          .select()
          .single();

        if (planError) throw planError;
        plan = updatedPlan;

        // WIPE existing child structures to allow complete clean generation
        // Due to strictly enforced Foreign Key ON DELETE CASCADE rules in Supabase mappings,
        // deleting these high-level structures perfectly obliterates all planning tasks securely.
        await supabase.from('plan_books').delete().eq('plan_id', plan.id);
        await supabase.from('planning_steps').delete().eq('plan_id', plan.id);
        await supabase.from('plan_team_members').delete().eq('plan_id', plan.id);
        await supabase.from('plan_holidays').delete().eq('plan_id', plan.id);

      } else {
        const { data: newPlan, error: planError } = await supabase
          .from('project_plans')
          .insert({
            project_id: projectId,
            created_by: userId,
            name: info.name.trim(),
            type: info.type,
            start_date: info.start_date,
            cluster_labels: clusterLabelsPayload,
          })
          .select()
          .single();

        if (planError) throw planError;
        plan = newPlan;
      }

      // 2. Insert steps (without dependencies first)
      const savedStepIds = [];
      for (const stepObj of planSteps) {
        const { data: step, error: stepError } = await supabase
          .from('planning_steps')
          .insert({
            plan_id: plan.id,
            name: stepObj.name.trim(),
            role_required: stepObj.role,
            buffer_days: parseFloat(stepObj.buffer) || 0,
            display_order: planSteps.indexOf(stepObj),
            parallel_dependency_id: null,
            unit_of_calculation: stepObj.unitOfCalc,
            norm_pages: parseInt(isPrint ? stepObj.normPages : 0) || 0,
            book_norm_in_mandays:
              stepObj.unitOfCalc === 'Book'
                ? parseFloat(stepObj.bookNorm) || 0
                : 0,
          })
          .select()
          .single();

        if (stepError) throw stepError;
        savedStepIds.push(step.id);
      }

      // 3. Update parallel_dependency_id using saved IDs
      for (let i = 0; i < planSteps.length; i++) {
        const dep = planSteps[i].dependsOnIndex;
        if (dep !== null && dep !== undefined && dep >= 0 && dep < savedStepIds.length) {
          const { error: depError } = await supabase
            .from('planning_steps')
            .update({ parallel_dependency_id: savedStepIds[dep] })
            .eq('id', savedStepIds[i]);
          if (depError) throw depError;
        }
      }

      // 4. Insert norms — only for Chapter/Unit steps (Book steps use book_norm_in_mandays)
      for (let i = 0; i < planSteps.length; i++) {
        const stepObj = planSteps[i];
        if (stepObj.unitOfCalc !== 'Chapter / Unit') continue;

        const normsInsert = Object.entries(stepObj.norms).map(([clusterId, mandays]) => ({
          step_id: savedStepIds[i],
          cluster_id: clusterId,
          norm_in_mandays: parseFloat(mandays) || 0,
        }));

        if (normsInsert.length > 0) {
          const { error: normsError } = await supabase
            .from('planning_norms')
            .insert(normsInsert);
          if (normsError) throw normsError;
        }
      }

      // 5. Insert books and their chapters
      for (let bIdx = 0; bIdx < books.length; bIdx++) {
        const book = books[bIdx];

        const { data: savedBook, error: bookError } = await supabase
          .from('plan_books')
          .insert({
            plan_id: plan.id,
            name: book.name.trim(),
            display_order: bIdx,
            execution_priority: book.priority || null,
          })
          .select()
          .single();

        if (bookError) throw bookError;

        const chaptersInsert = book.chapters.map((ch, chIdx) => ({
          plan_id: plan.id,
          book_id: savedBook.id,
          unit_no: ch.unitNo.trim(),
          unit_name: ch.unitName.trim(),
          cluster_id: ch.clusterId,
          pages: isPrint ? parseInt(ch.pages) || 0 : 0,
          display_order: chIdx,
          execution_priority: ch.priority || null,
        }));

        if (chaptersInsert.length > 0) {
          const { error: chapError } = await supabase
            .from('planning_deliverables')
            .insert(chaptersInsert);
          if (chapError) throw chapError;
        }
      }

      // 6. Insert team members with their leaves
      const validMembers = teamMembers.filter((m) => m.name.trim());
      for (const member of validMembers) {
        const { data: savedMember, error: memberError } = await supabase
          .from('plan_team_members')
          .insert({
            plan_id: plan.id,
            name: member.name.trim(),
            role: member.role,
            bandwidth: member.bandwidth,
          })
          .select()
          .single();

        if (memberError) throw memberError;

        if (member.leaves.length > 0) {
          const { error: leavesError } = await supabase
            .from('plan_leaves')
            .insert(
              member.leaves.map((date) => ({
                plan_id: plan.id,
                team_member_id: savedMember.id,
                leave_date: date,
              }))
            );
          if (leavesError) throw leavesError;
        }
      }

      // 7. Insert holidays
      const validHolidays = holidays.filter((h) => h.date.trim());
      if (validHolidays.length > 0) {
        const { error: holError } = await supabase
          .from('plan_holidays')
          .insert(
            validHolidays.map((h) => ({
              plan_id: plan.id,
              holiday_date: h.date.trim(),
              description: h.description.trim() || null,
            }))
          );
        if (holError) throw holError;
      }

      // Navigate to plan detail — tasks generated on first visit
      router.push(`/projects/${projectId}/plans/${plan.id}`);
    } catch (err) {
      console.error('[PlanWizard] Save error:', err);
      setError(err.message || 'An unexpected error occurred. Please try again.');
      setLoading(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className={styles.wizard}>
      {/* Step indicator */}
      <div className={styles.stepsNav}>
        {STEPS_WIZARD.map((step, idx) => (
          <div
            key={idx}
            className={`${styles.stepIndicator} ${idx === currentStepIndex ? styles.active : ''} ${idx < currentStepIndex ? styles.done : ''}`}
          >
            <span className={styles.stepNum}>
              {idx < currentStepIndex ? <Check size={12} /> : idx + 1}
            </span>
            <span className={styles.stepTitle}>{step.title}</span>
            {idx < STEPS_WIZARD.length - 1 && <div className={styles.connector} />}
          </div>
        ))}
      </div>

      <div className={styles.content}>

        {/* ── STEP 1: Basic Info ─────────────────────────────────────────── */}
        {currentStepIndex === 0 && (
          <div className="animate-fade-in">
            <div className="form-group">
              <label className="form-label">Plan Name <span style={{ color: 'var(--color-danger)' }}>*</span></label>
              <input className="form-input" value={info.name}
                placeholder="e.g. Print Coursebook FY26 Q1"
                onChange={(e) => setInfo({ ...info, name: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Work Stream Type</label>
              <select className="form-input" value={info.type}
                onChange={(e) => setInfo({ ...info, type: e.target.value })}>
                <option value="Print">Print</option>
                <option value="Digital">Digital</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Start Date <span style={{ color: 'var(--color-danger)' }}>*</span></label>
              <input type="date" className="form-input" value={info.start_date}
                onChange={(e) => setInfo({ ...info, start_date: e.target.value })} />
            </div>
          </div>
        )}

        {/* ── STEP 2: Steps & Norms ──────────────────────────────────────── */}
        {currentStepIndex === 1 && (
          <div className="animate-fade-in">
            <p className={styles.stepDesc}>
              Enter norms in <strong>mandays per unit</strong>. Rename cluster headers for this plan.
              Set <strong>Depends On</strong> for step chaining.
              For <strong>Book</strong>-level steps, enter a single mandays value (applies once per book).
              {isPrint && ' Set Ref. Pages to scale effort by page count.'}
            </p>
            <div className={styles.tableWrapper}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ minWidth: 150 }}>Step Name</th>
                    <th style={{ minWidth: 140 }}>Role</th>
                    <th style={{ minWidth: 80 }}>Buffer (d)</th>
                    <th style={{ minWidth: 150 }}>Depends On</th>
                    <th style={{ minWidth: 120 }}>Unit</th>
                    {isPrint && <th style={{ minWidth: 90 }}>Ref. Pages</th>}
                    {clusters.map((c) => (
                      <th key={c.id} style={{ minWidth: 140 }}>
                        <input
                          className={styles.clusterHeaderInput}
                          value={clusterLabels[c.id] || c.name}
                          onChange={(e) =>
                            setClusterLabels((prev) => ({ ...prev, [c.id]: e.target.value }))
                          }
                          placeholder={c.name}
                          title="Rename this cluster label for this plan"
                        />
                        <span className={styles.clusterHeaderSub}>mandays</span>
                      </th>
                    ))}
                    <th style={{ width: 40 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {planSteps.map((step, idx) => (
                    <tr
                      key={step._id}
                      draggable
                      onDragStart={(e) => handleDragStartSteps(e, idx)}
                      onDragOver={(e) => handleDragOverSteps(e, idx)}
                      onDrop={(e) => handleDropSteps(e, idx)}
                      onDragEnd={handleDragEndSteps}
                      style={{
                        borderTop: dragOverStepIdx === idx && draggedStepIdx !== idx ? '2px solid var(--color-primary)' : 'none',
                      }}
                    >
                      <td style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ cursor: 'grab', paddingRight: '4px' }}>
                          <GripVertical size={16} color="var(--color-text-muted)" />
                        </div>
                        <input className="form-input" value={step.name}
                          placeholder={`Step ${idx + 1}`}
                          onChange={(e) => updateStep(idx, 'name', e.target.value)}
                          onPaste={(e) => handlePastePlanSteps(e, idx, 'name')} />
                      </td>
                      <td>
                        <select className="form-input" value={step.role}
                          onChange={(e) => updateStep(idx, 'role', e.target.value)}>
                          {ROLE_OPTIONS.map((opt) => <option key={opt}>{opt}</option>)}
                        </select>
                      </td>
                      <td>
                        <input type="number" className="form-input" min={0} value={step.buffer}
                          onChange={(e) => updateStep(idx, 'buffer', e.target.value)}
                          onPaste={(e) => handlePastePlanSteps(e, idx, 'buffer')} />
                      </td>
                      <td>
                        <select className="form-input"
                          value={step.dependsOnIndex ?? ''}
                          onChange={(e) =>
                            updateStep(idx, 'dependsOnIndex', e.target.value === '' ? null : parseInt(e.target.value))
                          }>
                          <option value="">— Plan Start Date</option>
                          {planSteps.map((s, i) => i === idx ? null : (
                            <option key={i} value={i}>Step {i + 1}: {s.name || '(unnamed)'}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select className="form-input" value={step.unitOfCalc}
                          onChange={(e) => updateStep(idx, 'unitOfCalc', e.target.value)}>
                          {UNIT_OPTIONS.map((opt) => <option key={opt}>{opt}</option>)}
                        </select>
                      </td>
                      {isPrint && (
                        <td>
                          <input type="number" className="form-input" min={0}
                            value={step.normPages}
                            placeholder="0 = no scale"
                            onChange={(e) => updateStep(idx, 'normPages', e.target.value)}
                            title="Reference page count for scaling. 0 = no page scaling." />
                        </td>
                      )}
                      {/* Norm inputs — per cluster for Chapter/Unit, single for Book */}
                      {step.unitOfCalc === 'Chapter / Unit'
                        ? clusters.map((c) => (
                            <td key={c.id}>
                              <input type="number" step="0.01" min={0} className="form-input"
                                value={step.norms[c.id] ?? ''}
                                onChange={(e) => updateNorm(idx, c.id, e.target.value)}
                                onPaste={(e) => handlePastePlanSteps(e, idx, c.id)}
                                title={`${clusterLabels[c.id] || c.name} — mandays per chapter`} />
                            </td>
                          ))
                        : (
                          <td colSpan={clusters.length} style={{ padding: '4px 8px' }}>
                            <input type="number" step="0.01" min={0} className="form-input"
                              value={step.bookNorm}
                              placeholder="Mandays per book"
                              onChange={(e) => updateStep(idx, 'bookNorm', e.target.value)}
                              title="Total mandays for this step per book (not per chapter)" />
                          </td>
                        )}
                      <td>
                        <button className="btn btn-ghost btn-sm"
                          onClick={() => removeStep(idx)}
                          disabled={planSteps.length <= 1} title="Remove step">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="btn btn-secondary btn-sm" style={{ marginTop: 16 }} onClick={addStep}>
              <Plus size={14} /> Add Step
            </button>
          </div>
        )}

        {/* ── STEP 3: Books & Chapters ───────────────────────────────────── */}
        {currentStepIndex === 2 && (
          <div className="animate-fade-in">
            <p className={styles.stepDesc}>
              Define your books and add chapters (units) within each book.
              Books appear as grouped sections in the final plan grid.
              {isPrint && ' Enter page count per chapter for effort scaling.'}
            </p>

            {books.map((book, bIdx) => (
              <div key={book._id} className={styles.bookBlock}>
                {/* Book name */}
                <div className={styles.bookHeader}>
                  <BookOpen size={16} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
                  <input
                    className={`form-input ${styles.bookNameInput}`}
                    value={book.name}
                    placeholder={`Book ${bIdx + 1} name (e.g. Nursery Full Year)`}
                    onChange={(e) => updateBook(book._id, e.target.value)}
                  />
                  <button className="btn btn-ghost btn-sm"
                    onClick={() => removeBook(book._id)}
                    disabled={books.length <= 1} title="Remove book">
                    <Trash2 size={14} />
                  </button>
                </div>

                {/* Chapters table */}
                <div className={styles.tableWrapper}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th style={{ minWidth: 80 }}>Unit No</th>
                        <th style={{ minWidth: 200 }}>Unit Name</th>
                        <th style={{ minWidth: 160 }}>Cluster</th>
                        {isPrint && <th style={{ minWidth: 80 }}>Pages</th>}
                        <th style={{ width: 40 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {book.chapters.map((ch, chIdx) => (
                        <tr key={ch._id}>
                          <td>
                            <input className="form-input" value={ch.unitNo}
                              onChange={(e) => updateChapter(book._id, ch._id, 'unitNo', e.target.value)}
                              onPaste={(e) => handlePasteChapters(e, book._id, chIdx, 'unitNo')} />
                          </td>
                          <td>
                            <input className="form-input" value={ch.unitName}
                              placeholder="e.g. Seeds & Plants"
                              onChange={(e) => updateChapter(book._id, ch._id, 'unitName', e.target.value)}
                              onPaste={(e) => handlePasteChapters(e, book._id, chIdx, 'unitName')} />
                          </td>
                          <td>
                            <select className="form-input" value={ch.clusterId}
                              onChange={(e) => updateChapter(book._id, ch._id, 'clusterId', e.target.value)}>
                              {clusters.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {clusterLabels[c.id] || c.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          {isPrint && (
                            <td>
                              <input type="number" min={0} className="form-input" value={ch.pages}
                                onChange={(e) => updateChapter(book._id, ch._id, 'pages', e.target.value)}
                                onPaste={(e) => handlePasteChapters(e, book._id, chIdx, 'pages')} />
                            </td>
                          )}
                          <td>
                            <button className="btn btn-ghost btn-sm"
                              onClick={() => removeChapter(book._id, ch._id)}
                              disabled={book.chapters.length <= 1} title="Remove chapter">
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <button className="btn btn-ghost btn-sm" style={{ marginTop: 8, marginLeft: 8 }}
                  onClick={() => addChapter(book._id)}>
                  <Plus size={13} /> Add Chapter
                </button>
              </div>
            ))}

            <button className="btn btn-secondary btn-sm" style={{ marginTop: 16 }} onClick={addBook}>
              <Plus size={14} /> Add Book
            </button>
          </div>
        )}

        {/* ── STEP 4: Execution Priority ───────────────────────────────────────── */}
        {currentStepIndex === 3 && (
          <div className="animate-fade-in">
            <p className={styles.stepDesc}>
              Drag and drop chapters to force their chronological execution priority.
              Items at the top of the list will steal scheduling bandwidth natively to execute first!
            </p>
            <div className={styles.tableWrapper}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: 100 }}>Priority (P)</th>
                    <th style={{ minWidth: 200 }}>Book Name</th>
                    <th style={{ minWidth: 200 }}>Unit No. & Name</th>
                  </tr>
                </thead>
                <tbody>
                  {orderedChapters.map((ch, idx) => (
                    <tr
                      key={ch._id}
                      draggable
                      onDragStart={(e) => handleDragStartPrio(e, idx)}
                      onDragOver={(e) => handleDragOverPrio(e, idx)}
                      onDrop={(e) => handleDropPrio(e, idx)}
                      onDragEnd={handleDragEndPrio}
                      style={{
                        borderTop: dragOverPrioIdx === idx && draggedPrioIdx !== idx ? '2px solid var(--color-primary)' : 'none',
                      }}
                    >
                      <td style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ cursor: 'grab', paddingRight: '4px' }}>
                          <GripVertical size={16} color="var(--color-text-muted)" />
                        </div>
                        <span style={{ fontWeight: 600, color: 'var(--color-text)' }}>{idx + 1}</span>
                      </td>
                      <td style={{ color: 'var(--color-text-muted)' }}>{ch.bookName}</td>
                      <td style={{ fontWeight: 500 }}>
                         {ch.unitNo ? `${ch.unitNo} - ` : ''}{ch.unitName}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── STEP 5: Team Members ───────────────────────────────────────── */}
        {currentStepIndex === 4 && (
          <div className="animate-fade-in">
            <p className={styles.stepDesc}>
              Add team members for this plan. Bandwidth is their daily availability
              (1 = full day, 0.5 = half day). Add individual leave dates per member.
            </p>
            <div className={styles.tableWrapper}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ minWidth: 160 }}>Name</th>
                    <th style={{ minWidth: 160 }}>Role</th>
                    <th style={{ minWidth: 130 }}>Bandwidth</th>
                    <th style={{ minWidth: 260 }}>Leaves</th>
                    <th style={{ width: 40 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {teamMembers.map((member) => (
                    <tr key={member._id}>
                      <td>
                        <input className="form-input" value={member.name}
                          placeholder="e.g. Rahul Sharma"
                          onChange={(e) => updateTeamMember(member._id, 'name', e.target.value)} />
                      </td>
                      <td>
                        <select className="form-input" value={member.role}
                          onChange={(e) => updateTeamMember(member._id, 'role', e.target.value)}>
                          {ROLE_OPTIONS.map((opt) => <option key={opt}>{opt}</option>)}
                        </select>
                      </td>
                      <td>
                        <select className="form-input" value={member.bandwidth}
                          onChange={(e) => updateTeamMember(member._id, 'bandwidth', parseFloat(e.target.value))}>
                          {BANDWIDTH_OPTIONS.map((b) => (
                            <option key={b.value} value={b.value}>{b.label}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <div className={styles.leavesCell}>
                          {member.leaves.map((date) => (
                            <span key={date} className={styles.leaveTag}>
                              {date}
                              <button className={styles.leaveRemove}
                                onClick={() => removeLeave(member._id, date)}>×</button>
                            </span>
                          ))}
                          <input type="date" className={styles.leaveInput}
                            title="Add a leave date"
                            onChange={(e) => {
                              if (e.target.value) { addLeave(member._id, e.target.value); e.target.value = ''; }
                            }} />
                        </div>
                      </td>
                      <td>
                        <button className="btn btn-ghost btn-sm"
                          onClick={() => removeTeamMember(member._id)}
                          disabled={teamMembers.length <= 1} title="Remove member">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="btn btn-secondary btn-sm" style={{ marginTop: 16 }} onClick={addTeamMember}>
              <Plus size={14} /> Add Member
            </button>
          </div>
        )}

        {/* ── STEP 6: Holidays ──────────────────────────────────────────── */}
        {currentStepIndex === 5 && (
          <div className="animate-fade-in">
            <p className={styles.stepDesc}>
              Add public holidays for this plan window. These dates are blocked for
              <strong> all team members</strong> when calculating the schedule.
            </p>
            <div className={styles.tableWrapper}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ minWidth: 180 }}>Date</th>
                    <th>Description (optional)</th>
                    <th style={{ width: 40 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {holidays.map((h) => (
                    <tr key={h._id}>
                      <td>
                        <input type="date" className="form-input" value={h.date}
                          onChange={(e) => updateHoliday(h._id, 'date', e.target.value)} />
                      </td>
                      <td>
                        <input className="form-input" value={h.description}
                          placeholder="e.g. Diwali, Republic Day"
                          onChange={(e) => updateHoliday(h._id, 'description', e.target.value)} />
                      </td>
                      <td>
                        <button className="btn btn-ghost btn-sm"
                          onClick={() => removeHoliday(h._id)}
                          disabled={holidays.length <= 1} title="Remove holiday">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="btn btn-secondary btn-sm" style={{ marginTop: 16 }} onClick={addHoliday}>
              <Plus size={14} /> Add Holiday
            </button>
          </div>
        )}
      </div>

      {error && <div className={styles.errorMessage}>{error}</div>}

      <div className={styles.wizardActions}>
        <button className="btn btn-secondary" onClick={handleBack} disabled={currentStepIndex === 0}>
          <ChevronLeft size={16} /> Previous
        </button>
        <button className="btn btn-primary" onClick={handleNext}
          disabled={loading || !info.name.trim()}>
          {loading
            ? 'Saving...'
            : currentStepIndex === STEPS_WIZARD.length - 1
            ? 'Finish & Generate'
            : 'Next'}
          {!loading && currentStepIndex < STEPS_WIZARD.length - 1 && <ChevronRight size={16} />}
          {!loading && currentStepIndex === STEPS_WIZARD.length - 1 && <Check size={16} />}
        </button>
      </div>
    </div>
  );
}
