'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { Plus, Trash2, Check, ChevronRight, ChevronLeft } from 'lucide-react';
import styles from './PlanWizard.module.css';

const STEPS_WIZARD = [
  { id: 'info',         title: 'Basic Info' },
  { id: 'steps',        title: 'Steps & Norms' },
  { id: 'deliverables', title: 'Deliverables' },
  { id: 'team',         title: 'Team Members' },
  { id: 'holidays',     title: 'Holidays' },
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

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

export default function PlanWizard({ projectId, userId, clusters }) {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();

  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // ── Step 1: Basic Info ───────────────────────────────────────────────────
  const [info, setInfo] = useState({
    name: '',
    type: 'Print',
    start_date: new Date().toISOString().split('T')[0],
  });

  // ── Step 2: Cluster Labels ────────────────────────────────────────────────
  // Pre-populated from cluster names; user can rename them per-plan.
  const [clusterLabels, setClusterLabels] = useState(
    clusters.reduce((acc, c) => ({ ...acc, [c.id]: c.name }), {})
  );

  // ── Step 2: Steps & Norms ────────────────────────────────────────────────
  // dependsOnIndex: null (starts from plan start_date) or index of another step
  const [planSteps, setPlanSteps] = useState([
    {
      _id: generateId(),
      name: 'Step A',
      role: 'Creator',
      buffer: 0,
      dependsOnIndex: null,
      norms: clusters.reduce((acc, c) => ({ ...acc, [c.id]: 1 }), {}),
    },
    {
      _id: generateId(),
      name: 'Step B',
      role: 'Reviewer 1',
      buffer: 0,
      dependsOnIndex: 0,
      norms: clusters.reduce((acc, c) => ({ ...acc, [c.id]: 0.5 }), {}),
    },
  ]);

  // ── Step 3: Deliverables ─────────────────────────────────────────────────
  const [deliverables, setDeliverables] = useState([
    {
      _id: generateId(),
      term: '1',
      className: 'Nursery',
      unitNo: '1',
      unitName: 'Unit name 1',
      clusterId: clusters[0]?.id || '',
      pages: 0,
    },
  ]);

  // ── Step 4: Team Members ─────────────────────────────────────────────────
  const [teamMembers, setTeamMembers] = useState([
    { _id: generateId(), name: '', role: 'Creator', bandwidth: 1, leaves: [] },
  ]);

  // ── Step 5: Holidays ─────────────────────────────────────────────────────
  const [holidays, setHolidays] = useState([
    { _id: generateId(), date: '', description: '' },
  ]);

  // ── Navigation ───────────────────────────────────────────────────────────
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

  // ── Validation ───────────────────────────────────────────────────────────
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
      if (deliverables.length === 0) return 'Add at least one deliverable.';
      for (const d of deliverables) {
        if (!d.unitName.trim()) return 'All deliverables must have a unit name.';
        if (!d.clusterId) return 'All deliverables must have a cluster selected.';
      }
    }
    // Team Members and Holidays are optional — no required fields
    return null;
  }

  // ── Step 2: Steps helpers ─────────────────────────────────────────────────
  const addStep = () => {
    setPlanSteps([
      ...planSteps,
      {
        _id: generateId(),
        name: '',
        role: ROLE_OPTIONS[0],
        buffer: 0,
        dependsOnIndex: planSteps.length > 0 ? planSteps.length - 1 : null,
        norms: clusters.reduce((acc, c) => ({ ...acc, [c.id]: 0 }), {}),
      },
    ]);
  };

  const removeStep = (index) => {
    if (planSteps.length <= 1) return;
    const newSteps = planSteps.filter((_, i) => i !== index);
    // Fix dependsOnIndex references: if a step depended on the removed step,
    // reset it; if it depended on a later index, shift it down.
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

  // Paste handler for Steps table (enables Excel paste)
  const handlePastePlanSteps = (e, rowIndex, field) => {
    if (!e.clipboardData) return;
    const pasteData = e.clipboardData.getData('text/plain');
    if (!pasteData) return;
    const pastedRows = pasteData
      .split(/\r?\n/)
      .filter((r) => r.length > 0)
      .map((r) => r.split('\t'));
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
          _id: generateId(),
          name: '',
          role: ROLE_OPTIONS[0],
          buffer: 0,
          dependsOnIndex: null,
          norms: clusters.reduce((acc, c) => ({ ...acc, [c.id]: 0 }), {}),
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

  // ── Step 3: Deliverables helpers ──────────────────────────────────────────
  const addDeliverable = () => {
    setDeliverables([
      ...deliverables,
      {
        _id: generateId(),
        term: '',
        className: '',
        unitNo: '',
        unitName: '',
        clusterId: clusters[0]?.id || '',
        pages: 0,
      },
    ]);
  };

  const removeDeliverable = (id) => {
    if (deliverables.length <= 1) return;
    setDeliverables(deliverables.filter((d) => d._id !== id));
  };

  const updateDeliverable = (id, field, value) => {
    setDeliverables(
      deliverables.map((d) => (d._id === id ? { ...d, [field]: value } : d))
    );
  };

  // Paste handler for Deliverables table
  const handlePasteDeliverables = (e, index, field) => {
    if (!e.clipboardData) return;
    const pasteData = e.clipboardData.getData('text/plain');
    if (!pasteData) return;
    const pastedRows = pasteData
      .split(/\r?\n/)
      .filter((r) => r.length > 0)
      .map((r) => r.split('\t'));
    if (pastedRows.length <= 1 && pastedRows[0].length <= 1) return;
    e.preventDefault();

    const allCols = ['term', 'className', 'unitNo', 'unitName', 'clusterId', 'pages'];
    const startColIndex = allCols.indexOf(field);
    if (startColIndex === -1) return;

    const newDeliverables = [...deliverables];
    for (let r = 0; r < pastedRows.length; r++) {
      const targetIndex = index + r;
      if (targetIndex >= newDeliverables.length) {
        newDeliverables.push({
          _id: generateId(),
          term: '',
          className: '',
          unitNo: '',
          unitName: '',
          clusterId: clusters[0]?.id || '',
          pages: 0,
        });
      }
      const rowData = pastedRows[r];
      const del = { ...newDeliverables[targetIndex] };
      for (let c = 0; c < rowData.length; c++) {
        const colIdx = startColIndex + c;
        if (colIdx < allCols.length) {
          const col = allCols[colIdx];
          const val = rowData[c].trim();
          if (col === 'pages') del.pages = parseInt(val) || 0;
          else if (col === 'clusterId') {
            const match = clusters.find(
              (cl) => cl.name.toLowerCase() === val.toLowerCase() || cl.id === val
            );
            del.clusterId = match ? match.id : val;
          } else {
            del[col] = val;
          }
        }
      }
      newDeliverables[targetIndex] = del;
    }
    setDeliverables(newDeliverables);
  };

  // ── Step 4: Team Members helpers ──────────────────────────────────────────
  const addTeamMember = () => {
    setTeamMembers([
      ...teamMembers,
      { _id: generateId(), name: '', role: ROLE_OPTIONS[0], bandwidth: 1, leaves: [] },
    ]);
  };

  const removeTeamMember = (id) => {
    if (teamMembers.length <= 1) return;
    setTeamMembers(teamMembers.filter((m) => m._id !== id));
  };

  const updateTeamMember = (id, field, value) => {
    setTeamMembers(
      teamMembers.map((m) => (m._id === id ? { ...m, [field]: value } : m))
    );
  };

  const addLeave = (memberId, date) => {
    setTeamMembers(
      teamMembers.map((m) => {
        if (m._id !== memberId) return m;
        if (m.leaves.includes(date)) return m; // no duplicates
        return { ...m, leaves: [...m.leaves, date].sort() };
      })
    );
  };

  const removeLeave = (memberId, date) => {
    setTeamMembers(
      teamMembers.map((m) =>
        m._id === memberId ? { ...m, leaves: m.leaves.filter((d) => d !== date) } : m
      )
    );
  };

  // ── Step 5: Holidays helpers ──────────────────────────────────────────────
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

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    setLoading(true);
    setError(null);

    try {
      // Prepare cluster_labels payload
      const clusterLabelsPayload = {};
      clusters.forEach((c) => {
        clusterLabelsPayload[c.id] = clusterLabels[c.id] || c.name;
      });

      // 1. Create Project Plan
      const { data: plan, error: planError } = await supabase
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

      // 2. Insert all steps first (parallel_dependency_id = null for now)
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
          })
          .select()
          .single();

        if (stepError) throw stepError;
        savedStepIds.push(step.id);
      }

      // 3. Now update parallel_dependency_id using saved IDs
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

      // 4. Insert norms for each step
      for (let i = 0; i < planSteps.length; i++) {
        const normsInsert = Object.entries(planSteps[i].norms).map(
          ([clusterId, mandays]) => ({
            step_id: savedStepIds[i],
            cluster_id: clusterId,
            norm_in_mandays: parseFloat(mandays) || 0,
          })
        );
        if (normsInsert.length > 0) {
          const { error: normsError } = await supabase
            .from('planning_norms')
            .insert(normsInsert);
          if (normsError) throw normsError;
        }
      }

      // 5. Insert deliverables
      const deliverableInsert = deliverables.map((d) => ({
        plan_id: plan.id,
        term: d.term.trim(),
        class_name: d.className.trim(),
        unit_no: d.unitNo.trim(),
        unit_name: d.unitName.trim(),
        cluster_id: d.clusterId,
        pages: parseInt(d.pages) || 0,
      }));

      const { error: delError } = await supabase
        .from('planning_deliverables')
        .insert(deliverableInsert);
      if (delError) throw delError;

      // 6. Insert team members and their leaves
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
          const leavesInsert = member.leaves.map((date) => ({
            plan_id: plan.id,
            team_member_id: savedMember.id,
            leave_date: date,
          }));
          const { error: leavesError } = await supabase
            .from('plan_leaves')
            .insert(leavesInsert);
          if (leavesError) throw leavesError;
        }
      }

      // 7. Insert holidays (skip rows with empty dates)
      const validHolidays = holidays.filter((h) => h.date.trim());
      if (validHolidays.length > 0) {
        const holidaysInsert = validHolidays.map((h) => ({
          plan_id: plan.id,
          holiday_date: h.date.trim(),
          description: h.description.trim() || null,
        }));
        const { error: holError } = await supabase
          .from('plan_holidays')
          .insert(holidaysInsert);
        if (holError) throw holError;
      }

      // Navigate to plan detail — tasks will be generated on first visit
      router.push(`/projects/${projectId}/plans/${plan.id}`);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
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
        {/* ── STEP 1: Basic Info ───────────────────────────────────────── */}
        {currentStepIndex === 0 && (
          <div className="animate-fade-in">
            <div className="form-group">
              <label className="form-label">Plan Name <span style={{ color: 'var(--color-danger)' }}>*</span></label>
              <input
                className="form-input"
                placeholder="e.g., Print Coursebook FY26 Q1"
                value={info.name}
                onChange={(e) => setInfo({ ...info, name: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Work Stream Type</label>
              <select
                className="form-input"
                value={info.type}
                onChange={(e) => setInfo({ ...info, type: e.target.value })}
              >
                <option value="Print">Print</option>
                <option value="Digital">Digital</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Start Date <span style={{ color: 'var(--color-danger)' }}>*</span></label>
              <input
                type="date"
                className="form-input"
                value={info.start_date}
                onChange={(e) => setInfo({ ...info, start_date: e.target.value })}
              />
            </div>
          </div>
        )}

        {/* ── STEP 2: Steps & Norms ────────────────────────────────────── */}
        {currentStepIndex === 1 && (
          <div className="animate-fade-in">
            <p className={styles.stepDesc}>
              Enter norms in <strong>mandays per unit</strong>. Edit the cluster column headers to label them (e.g. Minor Modification, Fresh Creation).
              Set <strong>Depends On</strong> to chain steps — parallel steps share the same predecessor.
            </p>
            <div className={styles.tableWrapper}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ minWidth: 160 }}>Step Name</th>
                    <th style={{ minWidth: 140 }}>Role</th>
                    <th style={{ minWidth: 90 }}>Buffer (Days)</th>
                    <th style={{ minWidth: 160 }}>Depends On</th>
                    {clusters.map((c) => (
                      <th key={c.id} style={{ minWidth: 140 }}>
                        {/* Editable cluster label */}
                        <input
                          className={styles.clusterHeaderInput}
                          value={clusterLabels[c.id] || c.name}
                          onChange={(e) =>
                            setClusterLabels((prev) => ({ ...prev, [c.id]: e.target.value }))
                          }
                          placeholder={c.name}
                          title="Rename this cluster column for this plan"
                        />
                        <span className={styles.clusterHeaderSub}>mandays</span>
                      </th>
                    ))}
                    <th style={{ width: 40 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {planSteps.map((step, idx) => (
                    <tr key={step._id}>
                      <td>
                        <input
                          className="form-input"
                          value={step.name}
                          placeholder={`Step ${idx + 1}`}
                          onChange={(e) => updateStep(idx, 'name', e.target.value)}
                          onPaste={(e) => handlePastePlanSteps(e, idx, 'name')}
                        />
                      </td>
                      <td>
                        <select
                          className="form-input"
                          value={step.role}
                          onChange={(e) => updateStep(idx, 'role', e.target.value)}
                        >
                          {ROLE_OPTIONS.map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          type="number"
                          className="form-input"
                          min={0}
                          value={step.buffer}
                          onChange={(e) => updateStep(idx, 'buffer', e.target.value)}
                          onPaste={(e) => handlePastePlanSteps(e, idx, 'buffer')}
                        />
                      </td>
                      <td>
                        <select
                          className="form-input"
                          value={step.dependsOnIndex ?? ''}
                          onChange={(e) =>
                            updateStep(
                              idx,
                              'dependsOnIndex',
                              e.target.value === '' ? null : parseInt(e.target.value)
                            )
                          }
                        >
                          <option value="">— Plan Start Date</option>
                          {planSteps.map((s, i) => {
                            if (i === idx) return null;
                            return (
                              <option key={i} value={i}>
                                Step {i + 1}: {s.name || '(unnamed)'}
                              </option>
                            );
                          })}
                        </select>
                      </td>
                      {clusters.map((c) => (
                        <td key={c.id}>
                          <input
                            type="number"
                            step="0.01"
                            min={0}
                            className="form-input"
                            value={step.norms[c.id] ?? ''}
                            onChange={(e) => updateNorm(idx, c.id, e.target.value)}
                            onPaste={(e) => handlePastePlanSteps(e, idx, c.id)}
                            title={`${clusterLabels[c.id] || c.name} — mandays`}
                          />
                        </td>
                      ))}
                      <td>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => removeStep(idx)}
                          disabled={planSteps.length <= 1}
                          title="Remove step"
                        >
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

        {/* ── STEP 3: Deliverables ─────────────────────────────────────── */}
        {currentStepIndex === 2 && (
          <div className="animate-fade-in">
            <div className={styles.tableWrapper}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Term</th>
                    <th>Class</th>
                    <th>Unit No</th>
                    <th>Unit Name</th>
                    <th>Cluster</th>
                    <th>Pages</th>
                    <th style={{ width: 40 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {deliverables.map((d, idx) => (
                    <tr key={d._id}>
                      <td>
                        <input className="form-input" value={d.term}
                          onChange={(e) => updateDeliverable(d._id, 'term', e.target.value)}
                          onPaste={(e) => handlePasteDeliverables(e, idx, 'term')} />
                      </td>
                      <td>
                        <input className="form-input" value={d.className}
                          onChange={(e) => updateDeliverable(d._id, 'className', e.target.value)}
                          onPaste={(e) => handlePasteDeliverables(e, idx, 'className')} />
                      </td>
                      <td>
                        <input className="form-input" value={d.unitNo}
                          onChange={(e) => updateDeliverable(d._id, 'unitNo', e.target.value)}
                          onPaste={(e) => handlePasteDeliverables(e, idx, 'unitNo')} />
                      </td>
                      <td>
                        <input className="form-input" value={d.unitName}
                          onChange={(e) => updateDeliverable(d._id, 'unitName', e.target.value)}
                          onPaste={(e) => handlePasteDeliverables(e, idx, 'unitName')} />
                      </td>
                      <td>
                        <select className="form-input" value={d.clusterId}
                          onChange={(e) => updateDeliverable(d._id, 'clusterId', e.target.value)}>
                          {clusters.map((c) => (
                            <option key={c.id} value={c.id}>
                              {clusterLabels[c.id] || c.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input type="number" min={0} className="form-input" value={d.pages}
                          onChange={(e) => updateDeliverable(d._id, 'pages', e.target.value)}
                          onPaste={(e) => handlePasteDeliverables(e, idx, 'pages')} />
                      </td>
                      <td>
                        <button className="btn btn-ghost btn-sm"
                          onClick={() => removeDeliverable(d._id)}
                          disabled={deliverables.length <= 1}>
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="btn btn-secondary btn-sm" style={{ marginTop: 16 }} onClick={addDeliverable}>
              <Plus size={14} /> Add Deliverable
            </button>
          </div>
        )}

        {/* ── STEP 4: Team Members ──────────────────────────────────────── */}
        {currentStepIndex === 3 && (
          <div className="animate-fade-in">
            <p className={styles.stepDesc}>
              Add team members working on this plan. Bandwidth indicates their availability per working day
              (1 = fully available, 0.5 = half-day, etc.). Add individual leave dates per member.
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
                        <input
                          className="form-input"
                          value={member.name}
                          placeholder="e.g. Rahul Sharma"
                          onChange={(e) => updateTeamMember(member._id, 'name', e.target.value)}
                        />
                      </td>
                      <td>
                        <select
                          className="form-input"
                          value={member.role}
                          onChange={(e) => updateTeamMember(member._id, 'role', e.target.value)}
                        >
                          {ROLE_OPTIONS.map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select
                          className="form-input"
                          value={member.bandwidth}
                          onChange={(e) =>
                            updateTeamMember(member._id, 'bandwidth', parseFloat(e.target.value))
                          }
                        >
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
                              <button
                                className={styles.leaveRemove}
                                onClick={() => removeLeave(member._id, date)}
                                title="Remove leave"
                              >
                                ×
                              </button>
                            </span>
                          ))}
                          <input
                            type="date"
                            className={styles.leaveInput}
                            title="Add a leave date"
                            onChange={(e) => {
                              if (e.target.value) {
                                addLeave(member._id, e.target.value);
                                e.target.value = '';
                              }
                            }}
                          />
                        </div>
                      </td>
                      <td>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => removeTeamMember(member._id)}
                          disabled={teamMembers.length <= 1}
                          title="Remove member"
                        >
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

        {/* ── STEP 5: Holidays ─────────────────────────────────────────── */}
        {currentStepIndex === 4 && (
          <div className="animate-fade-in">
            <p className={styles.stepDesc}>
              Add public holidays for this plan window. These dates will be skipped for
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
                        <input
                          type="date"
                          className="form-input"
                          value={h.date}
                          onChange={(e) => updateHoliday(h._id, 'date', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          className="form-input"
                          value={h.description}
                          placeholder="e.g. Diwali, Republic Day"
                          onChange={(e) => updateHoliday(h._id, 'description', e.target.value)}
                        />
                      </td>
                      <td>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => removeHoliday(h._id)}
                          disabled={holidays.length <= 1}
                          title="Remove holiday"
                        >
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

      {/* Navigation buttons */}
      <div className={styles.wizardActions}>
        <button
          className="btn btn-secondary"
          onClick={handleBack}
          disabled={currentStepIndex === 0}
        >
          <ChevronLeft size={16} /> Previous
        </button>
        <button
          className="btn btn-primary"
          onClick={handleNext}
          disabled={loading || !info.name.trim()}
        >
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
