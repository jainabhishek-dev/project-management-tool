'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Plus, Trash2, ChevronRight, ChevronLeft } from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { calculateNorm, calculateLineTotal, formatCurrency } from '@/lib/utils/budget-calculations';
import { isAdmin } from '@/lib/utils/admin';
import Header from '@/components/layout/Header';
import styles from '../../new/new-budget.module.css';

const STEPS = ['Project & Info', 'Roles & Costs', 'Sections & Line Items', 'Review & Save'];
const ROLE_OPTIONS = ['Creator', 'Reviewer 1', 'Reviewer 2', 'Design', 'DTP', 'Edit', 'QA', 'PM', 'Author', 'FL - Creator', 'FL - Reviewer 1', 'FL - Reviewer 2', 'FL - Design', 'FL - DTP', 'FL - Edit', 'FL - QA', 'FL - PM', 'Intern'];
const UNIT_OPTIONS = ['Unit', 'Chapter', 'Book', 'AVC', 'CTRB', 'EPUB', 'CRL'];

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

export default function EditBudgetPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const params = useParams();
  const editId = params.id;
  const [loadingInitial, setLoadingInitial] = useState(true);

  const [step, setStep] = useState(0);
  const [projects, setProjects] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Step 1: basic info
  const [info, setInfo] = useState({
    project_id: '',
    name: '',
    description: '',
    working_days_per_month: 20,
    currency: 'INR',
  });

  // Step 2: roles
  const [roles, setRoles] = useState([
    { _id: generateId(), name: 'Creator', cost_per_month: '', display_order: 0 },
    { _id: generateId(), name: 'Reviewer 1', cost_per_month: '', display_order: 1 },
    { _id: generateId(), name: 'DTP', cost_per_month: '', display_order: 2 },
  ]);

  // Step 3: sections with line items and norms
  const [sections, setSections] = useState([
    {
      _id: generateId(),
      name: 'Section 1',
      display_order: 0,
      lineItems: [
        {
          _id: generateId(),
          name: '',
          unit_of_calculation: 'Unit',
          number_of_units: '',
          display_order: 0,
          norms: {},
        },
      ],
    },
  ]);

  
  useEffect(() => {
    async function loadData() {
      // Load projects
      const { data: projData } = await supabase.from('projects').select('id, project_name').order('created_at', { ascending: false });
      if (projData) setProjects(projData);

      if (!editId) return;

      // Load budget
      const { data: budget } = await supabase
        .from('budgets')
        .select(`
          *,
          budget_roles ( * ),
          budget_sections (
            *,
            budget_line_items (
              *,
              budget_norms ( * )
            )
          )
        `)
        .eq('id', editId)
        .single();

      if (budget) {
        const { data: { user } } = await supabase.auth.getUser();
        const isUserAdmin = isAdmin(user?.email);
        const isOwner = budget.created_by === user?.id;

        const canEdit = 
          (isOwner && budget.status === 'draft') || 
          (isUserAdmin && (budget.status === 'draft' || budget.status === 'submitted'));

        if (!canEdit) {
          router.push(`/budgets/${editId}`);
          return;
        }

        setInfo({
          project_id: budget.project_id || '',
          name: budget.name || '',
          description: budget.description || '',
          working_days_per_month: budget.working_days_per_month || 20,
          currency: budget.currency || 'INR',
        });

        if (budget.budget_roles?.length > 0) {
          const sortedRoles = [...budget.budget_roles].sort((a,b)=>a.display_order-b.display_order);
          setRoles(sortedRoles.map(r => ({ ...r, _id: String(r.id) })));
          
          if (budget.budget_sections?.length > 0) {
            const sortedSections = [...budget.budget_sections].sort((a,b)=>a.display_order-b.display_order);
            const formattedSections = sortedSections.map(s => {
              const sortedItems = [...(s.budget_line_items||[])].sort((a,b)=>a.display_order-b.display_order);
              return {
                _id: String(s.id),
                name: s.name,
                display_order: s.display_order,
                lineItems: sortedItems.map(li => {
                  const normsObj = {};
                  (li.budget_norms||[]).forEach(n => {
                    normsObj[n.role_id] = n.norms_per_unit;
                  });
                  return {
                    _id: String(li.id),
                    name: li.name,
                    unit_of_calculation: li.unit_of_calculation,
                    number_of_units: li.number_of_units,
                    display_order: li.display_order,
                    norms: normsObj
                  };
                })
              };
            });
            setSections(formattedSections);
          }
        }
      }
      setLoadingInitial(false);
    }
    loadData();
  }, [supabase, editId]);


  // ────────── Step 1 helpers ──────────
  function handleInfoChange(e) {
    setInfo((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  // ────────── Step 2 helpers ──────────
  function addRole() {
    setRoles((prev) => [
      ...prev,
      { _id: generateId(), name: '', cost_per_month: '', display_order: prev.length },
    ]);
  }

  function updateRole(id, field, value) {
    setRoles((prev) =>
      prev.map((r) => (r._id === id ? { ...r, [field]: value } : r))
    );
  }

  function removeRole(id) {
    setRoles((prev) => prev.filter((r) => r._id !== id));
  }

  // ────────── Step 3 helpers ──────────
  function addSection() {
    setSections((prev) => [
      ...prev,
      {
        _id: generateId(),
        name: `Section ${prev.length + 1}`,
        display_order: prev.length,
        lineItems: [{
          _id: generateId(), name: '', unit_of_calculation: 'Unit',
          number_of_units: '', display_order: 0, norms: {},
        }],
      },
    ]);
  }

  function updateSection(sectionId, field, value) {
    setSections((prev) =>
      prev.map((s) => (s._id === sectionId ? { ...s, [field]: value } : s))
    );
  }

  function removeSection(sectionId) {
    setSections((prev) => prev.filter((s) => s._id !== sectionId));
  }

  function addLineItem(sectionId) {
    setSections((prev) =>
      prev.map((s) =>
        s._id === sectionId
          ? {
              ...s,
              lineItems: [
                ...s.lineItems,
                {
                  _id: generateId(), name: '', unit_of_calculation: 'Unit',
                  number_of_units: '', display_order: s.lineItems.length, norms: {},
                },
              ],
            }
          : s
      )
    );
  }

  function updateLineItem(sectionId, lineId, field, value) {
    setSections((prev) =>
      prev.map((s) =>
        s._id === sectionId
          ? {
              ...s,
              lineItems: s.lineItems.map((li) =>
                li._id === lineId ? { ...li, [field]: value } : li
              ),
            }
          : s
      )
    );
  }

  function removeLineItem(sectionId, lineId) {
    setSections((prev) =>
      prev.map((s) =>
        s._id === sectionId
          ? { ...s, lineItems: s.lineItems.filter((li) => li._id !== lineId) }
          : s
      )
    );
  }

  function updateNorm(sectionId, lineId, roleId, value) {
    setSections((prev) =>
      prev.map((s) =>
        s._id === sectionId
          ? {
              ...s,
              lineItems: s.lineItems.map((li) =>
                li._id === lineId
                  ? { ...li, norms: { ...li.norms, [roleId]: value } }
                  : li
              ),
            }
          : s
      )
    );
  }

  function handlePaste(e, sectionId, lineIndex, fieldOrRoleId) {
    if (!e.clipboardData) return;
    const pasteData = e.clipboardData.getData('text/plain');
    if (!pasteData) return;
    
    // Split into rows and columns
    const pastedRows = pasteData.split(/\r?\n/).filter((r) => r.length > 0).map((r) => r.split('\t'));
    if (pastedRows.length <= 1 && pastedRows[0].length <= 1) return; // let default paste handle single cell

    e.preventDefault();

    setSections((prev) => prev.map((section) => {
      if (section._id !== sectionId) return section;

      const newItems = [...section.lineItems];
      const allCols = ['name', 'unit_of_calculation', 'number_of_units', ...roles.map((r) => r._id)];
      const startColIndex = allCols.indexOf(fieldOrRoleId);
      
      if (startColIndex === -1) return section;

      for (let r = 0; r < pastedRows.length; r++) {
        const targetLineIndex = lineIndex + r;
        
        // Auto-add new line items if we run out of rows
        if (targetLineIndex >= newItems.length) {
          newItems.push({
            _id: generateId(), name: '', unit_of_calculation: 'Unit',
            number_of_units: '', display_order: newItems.length, norms: {},
          });
        }
        
        const rowData = pastedRows[r];
        const lineItem = { ...newItems[targetLineIndex], norms: { ...newItems[targetLineIndex].norms } };
        
        for (let c = 0; c < rowData.length; c++) {
          const targetColIndex = startColIndex + c;
          if (targetColIndex < allCols.length) {
            const colName = allCols[targetColIndex];
            const val = rowData[c].trim();
            if (['name', 'unit_of_calculation', 'number_of_units'].includes(colName)) {
              lineItem[colName] = val;
            } else {
              if (val !== '') {
                 lineItem.norms[colName] = val;
              }
            }
          }
        }
        newItems[targetLineIndex] = lineItem;
      }
      return { ...section, lineItems: newItems };
    }));
  }

  // ────────── Calculation helpers ──────────
  function getLineCost(lineItem) {
    const units = parseFloat(lineItem.number_of_units) || 0;
    const wdpm = parseFloat(info.working_days_per_month) || 20;
    let total = 0;
    for (const role of roles) {
      const normsVal = parseFloat(lineItem.norms[role._id]) || 0;
      const cost = parseFloat(role.cost_per_month) || 0;
      const { totalCost } = calculateNorm(normsVal, units, cost, wdpm);
      total += totalCost;
    }
    return total;
  }

  function getSectionTotal(section) {
    return section.lineItems.reduce((sum, li) => sum + getLineCost(li), 0);
  }

  function getGrandTotal() {
    return sections.reduce((sum, s) => sum + getSectionTotal(s), 0);
  }

  // ────────── Validation ──────────
  function validateStep() {
    if (step === 0) {
      if (!info.project_id) return 'Please select a project.';
      if (!info.name.trim()) return 'Budget name is required.';
      if (!info.working_days_per_month || Number(info.working_days_per_month) < 1) return 'Working days must be at least 1.';
    }
    if (step === 1) {
      if (roles.length === 0) return 'Add at least one role.';
      for (const r of roles) {
        if (!r.name.trim()) return 'All roles must have a name.';
        if (r.cost_per_month === '' || Number(r.cost_per_month) < 0) return 'All roles must have a valid cost per month.';
      }
    }
    if (step === 2) {
      if (sections.length === 0) return 'Add at least one section.';
      for (const s of sections) {
        if (!s.name.trim()) return 'All sections must have a name.';
        if (s.lineItems.length === 0) return `Section "${s.name}" must have at least one line item.`;
        for (const li of s.lineItems) {
          if (!li.name.trim()) return 'All line items must have a name.';
        }
      }
    }
    return '';
  }

  function handleNext() {
    const err = validateStep();
    if (err) { setError(err); return; }
    setError('');
    setStep((s) => s + 1);
  }

  function handleBack() {
    setError('');
    setStep((s) => s - 1);
  }

  // ────────── Save ──────────
  async function handleSave() {
    const err = validateStep();
    if (err) { setError(err); return; }
    setSaving(true);
    setError('');

    const { data: { user } } = await supabase.auth.getUser();
    const wdpm = parseFloat(info.working_days_per_month) || 20;

    try {
      
      // 1. Update budget instead of insert
      const { data: budget, error: budgetErr } = await supabase
        .from('budgets')
        .update({
          project_id: info.project_id,
          name: info.name.trim(),
          description: info.description.trim() || null,
          currency: info.currency,
          working_days_per_month: wdpm,
          total_estimated_budget: getGrandTotal(),
        })
        .eq('id', editId)
        .select('id')
        .single();
      if (budgetErr) throw budgetErr;

      // DELETE existing relationships so we can safely re-insert
      await supabase.from('budget_roles').delete().eq('budget_id', editId);
      await supabase.from('budget_sections').delete().eq('budget_id', editId);

      // 2. Create roles
      const { data: savedRoles, error: rolesErr } = await supabase
        .from('budget_roles')
        .insert(
          roles.map((r, i) => ({
            budget_id: budget.id,
            name: r.name.trim(),
            cost_per_month: parseFloat(r.cost_per_month) || 0,
            display_order: i,
          }))
        )
        .select('id, name');
      if (rolesErr) throw rolesErr;

      // Map _id → saved role id by position
      const roleIdMap = {};
      roles.forEach((r, i) => { roleIdMap[r._id] = savedRoles[i].id; });

      // 3. Create sections + line items + norms
      for (let si = 0; si < sections.length; si++) {
        const section = sections[si];
        const { data: savedSection, error: secErr } = await supabase
          .from('budget_sections')
          .insert({
            budget_id: budget.id,
            name: section.name.trim(),
            display_order: si,
            subtotal: getSectionTotal(section),
          })
          .select('id')
          .single();
        if (secErr) throw secErr;

        for (let li_i = 0; li_i < section.lineItems.length; li_i++) {
          const li = section.lineItems[li_i];
          const lineTotal = getLineCost(li);
          const units = parseFloat(li.number_of_units) || 0;

          const { data: savedLi, error: liErr } = await supabase
            .from('budget_line_items')
            .insert({
              section_id: savedSection.id,
              name: li.name.trim(),
              description: null,
              unit_of_calculation: li.unit_of_calculation.trim() || null,
              number_of_units: units,
              line_total: lineTotal,
              display_order: li_i,
            })
            .select('id')
            .single();
          if (liErr) throw liErr;

          // norms rows
          const normInserts = [];
          for (const role of roles) {
            const normsVal = parseFloat(li.norms[role._id]) || 0;
            const cost = parseFloat(role.cost_per_month) || 0;
            const { totalMandays, totalCost } = calculateNorm(normsVal, units, cost, wdpm);
            normInserts.push({
              line_item_id: savedLi.id,
              role_id: roleIdMap[role._id],
              norms_per_unit: normsVal,
              total_mandays: totalMandays,
              total_cost: totalCost,
            });
          }
          if (normInserts.length > 0) {
            const { error: normErr } = await supabase.from('budget_norms').insert(normInserts);
            if (normErr) throw normErr;
          }
        }
      }

      router.push(`/budgets/${budget.id}`);
    } catch (e) {
      setError(e.message || 'Something went wrong. Please try again.');
      setSaving(false);
    }
  }

  // ────────── Render ──────────
  return (
    <div>
      <Header title="Edit Budget" subtitle="Modify your existing budget details." />
      {loadingInitial && <div className="empty-state"><span className="spinner" style={{width:24, height:24, marginBottom: 16}}></span><p>Loading budget...</p></div>}
      {!loadingInitial && (
        <>

      {/* Progress indicator */}
      <div className={styles.progressBar}>
        {STEPS.map((label, i) => (
          <div key={label} className={`${styles.progressStep} ${i <= step ? styles.progressStepActive : ''}`}>
            <div className={styles.progressDot}>{i < step ? '✓' : i + 1}</div>
            <span className={styles.progressLabel}>{label}</span>
            {i < STEPS.length - 1 && <div className={styles.progressLine} />}
          </div>
        ))}
      </div>

      <div className={styles.formCard}>
        {/* ── STEP 0: Project & Info ── */}
        {step === 0 && (
          <div className={styles.stepContent}>
            <h2 className={styles.stepTitle}>Project & Budget Info</h2>
            <div className="form-group">
              <label className="form-label">Project <span style={{color:'var(--color-danger)'}}>*</span></label>
              <select
                className={`form-input ${!info.project_id && error ? 'form-input-error' : ''}`}
                name="project_id"
                value={info.project_id}
                onChange={handleInfoChange}
              >
                <option value="">Select a project...</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.project_name}</option>
                ))}
              </select>
              <p className="form-hint">
                Don't see your project?{' '}
                <a href="/projects/new" target="_blank" rel="noreferrer">Create one first</a>
              </p>
            </div>
            <div className="form-group">
              <label className="form-label">Budget Name <span style={{color:'var(--color-danger)'}}>*</span></label>
              <input
                type="text" name="name" className="form-input"
                placeholder="e.g. KTLO 2.0 Budget v1, LEAD PP Scope Stage"
                value={info.name} onChange={handleInfoChange}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Description</label>
              <textarea
                name="description" className="form-input" rows={3}
                placeholder="Brief scope and purpose of this budget..."
                value={info.description} onChange={handleInfoChange}
              />
            </div>
            <div className={styles.twoCol}>
              <div className="form-group">
                <label className="form-label">Working Days / Month</label>
                <input
                  type="number" name="working_days_per_month" className="form-input"
                  min={1} max={31} value={info.working_days_per_month} onChange={handleInfoChange}
                />
                <p className="form-hint">Used to calculate daily rate from monthly cost.</p>
              </div>
              <div className="form-group">
                <label className="form-label">Currency</label>
                <select name="currency" className="form-input" value={info.currency} onChange={handleInfoChange}>
                  <option value="INR">INR (₹)</option>
                  <option value="USD">USD ($)</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 1: Roles ── */}
        {step === 1 && (
          <div className={styles.stepContent}>
            <h2 className={styles.stepTitle}>Define Roles & Monthly Costs</h2>
            <p className={styles.stepDesc}>
              Add all roles involved in this project. You can use your own names and costs.
            </p>
            <div className={styles.rolesGrid}>
              <div className={styles.rolesHeader}>
                <span>Role Name</span>
                <span>Monthly Cost (₹)</span>
                <span></span>
              </div>
              {roles.map((role) => (
                <div key={role._id} className={styles.roleRow}>
                  <select
                    className="form-input"
                    value={role.name}
                    onChange={(e) => updateRole(role._id, 'name', e.target.value)}
                  >
                    <option value="">Select a Role...</option>
                    {ROLE_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                  <input
                    type="number" className="form-input" min={0}
                    placeholder="e.g. 70000"
                    value={role.cost_per_month}
                    onChange={(e) => updateRole(role._id, 'cost_per_month', e.target.value)}
                  />
                  <button
                    type="button" className="btn btn-ghost btn-sm"
                    onClick={() => removeRole(role._id)}
                    disabled={roles.length <= 1}
                    title="Remove role"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={addRole}>
              <Plus size={14} /> Add Role
            </button>
          </div>
        )}

        {/* ── STEP 2: Sections & Line Items ── */}
        {step === 2 && (
          <div className={styles.stepContent}>
            <h2 className={styles.stepTitle}>Sections & Line Items</h2>
            <p className={styles.stepDesc}>
              Enter norms in <strong>mandays per unit</strong>. Cost is auto-calculated.
            </p>
            {sections.map((section, si) => (
              <div key={section._id} className={styles.sectionBlock}>
                <div className={styles.sectionHeader}>
                  <input
                    type="text" className={`form-input ${styles.sectionName}`}
                    placeholder="Section name (e.g. Print, Digital, A. Student Reader)"
                    value={section.name}
                    onChange={(e) => updateSection(section._id, 'name', e.target.value)}
                  />
                  <button
                    type="button" className="btn btn-ghost btn-sm"
                    onClick={() => removeSection(section._id)}
                    disabled={sections.length <= 1}
                    title="Remove section"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                {/* Line items table */}
                <div className={styles.lineItemsTable}>
                  <div className={styles.lineItemsHeader}>
                    <span className={styles.colStep}>Step / Task Name</span>
                    <span className={styles.colUnit}>Unit</span>
                    <span className={styles.colCount}># Units</span>
                    {roles.map((r) => (
                      <span key={r._id} className={styles.colRole} title={`Norms for ${r.name}`}>
                        {r.name}
                      </span>
                    ))}
                    <span className={styles.colTotal}>Line Total</span>
                    <span />
                  </div>
                  {section.lineItems.map((li, liIndex) => (
                    <div key={li._id} className={styles.lineItemRow}>
                      <input
                        type="text" className={`form-input ${styles.colStep}`}
                        placeholder="e.g. Chapter level changes for Cluster 1"
                        value={li.name}
                        onChange={(e) => updateLineItem(section._id, li._id, 'name', e.target.value)}
                        onPaste={(e) => handlePaste(e, section._id, liIndex, 'name')}
                      />
                      <select
                        className={`form-input ${styles.colUnit}`}
                        value={li.unit_of_calculation}
                        onChange={(e) => updateLineItem(section._id, li._id, 'unit_of_calculation', e.target.value)}
                      >
                        {UNIT_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                      <input
                        type="number" className={`form-input ${styles.colCount}`} min={0}
                        placeholder="0"
                        value={li.number_of_units}
                        onChange={(e) => updateLineItem(section._id, li._id, 'number_of_units', e.target.value)}
                        onPaste={(e) => handlePaste(e, section._id, liIndex, 'number_of_units')}
                      />
                      {roles.map((r) => (
                        <input
                          key={r._id}
                          type="number" className={`form-input ${styles.colRole}`}
                          placeholder="0"
                          min={0} step={0.001}
                          value={li.norms[r._id] ?? ''}
                          onChange={(e) => updateNorm(section._id, li._id, r._id, e.target.value)}
                          onPaste={(e) => handlePaste(e, section._id, liIndex, r._id)}
                          title={`${r.name} norms per unit (mandays)`}
                        />
                      ))}
                      <span className={`${styles.colTotal} ${styles.lineTotal}`}>
                        {formatCurrency(getLineCost(li), info.currency)}
                      </span>
                      <button
                        type="button" className="btn btn-ghost btn-sm"
                        onClick={() => removeLineItem(section._id, li._id)}
                        disabled={section.lineItems.length <= 1}
                        title="Remove line item"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>

                <div className={styles.sectionFooter}>
                  <button
                    type="button" className="btn btn-ghost btn-sm"
                    onClick={() => addLineItem(section._id)}
                  >
                    <Plus size={13} /> Add Line Item
                  </button>
                  <span className={styles.sectionTotal}>
                    Section Total: <strong>{formatCurrency(getSectionTotal(section), info.currency)}</strong>
                  </span>
                </div>
              </div>
            ))}

            <button type="button" className="btn btn-secondary btn-sm" onClick={addSection}>
              <Plus size={14} /> Add Section
            </button>
          </div>
        )}

        {/* ── STEP 3: Review ── */}
        {step === 3 && (
          <div className={styles.stepContent}>
            <h2 className={styles.stepTitle}>Review & Save</h2>
            <div className={styles.reviewGrid}>
              <div className={styles.reviewItem}>
                <span className={styles.reviewLabel}>Project</span>
                <span>{projects.find((p) => p.id === info.project_id)?.project_name}</span>
              </div>
              <div className={styles.reviewItem}>
                <span className={styles.reviewLabel}>Budget Name</span>
                <span>{info.name}</span>
              </div>
              <div className={styles.reviewItem}>
                <span className={styles.reviewLabel}>Working Days/Month</span>
                <span>{info.working_days_per_month}</span>
              </div>
              <div className={styles.reviewItem}>
                <span className={styles.reviewLabel}>Roles</span>
                <span>{roles.map((r) => r.name).join(', ')}</span>
              </div>
              <div className={styles.reviewItem}>
                <span className={styles.reviewLabel}>Sections</span>
                <span>{sections.length} ({sections.reduce((s, sec) => s + sec.lineItems.length, 0)} line items)</span>
              </div>
            </div>

            <div className={styles.grandTotalBox}>
              <span className={styles.grandTotalLabel}>Total Estimated Budget</span>
              <span className={styles.grandTotalValue}>{formatCurrency(getGrandTotal(), info.currency)}</span>
            </div>

            {sections.map((section) => (
              <div key={section._id} className={styles.reviewSection}>
                <div className={styles.reviewSectionHeader}>
                  <span>{section.name}</span>
                  <span>{formatCurrency(getSectionTotal(section), info.currency)}</span>
                </div>
                {section.lineItems.map((li) => (
                  <div key={li._id} className={styles.reviewLineItem}>
                    <span>{li.name || '(unnamed)'}</span>
                    <span>{formatCurrency(getLineCost(li), info.currency)}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {error && <p className="form-error" style={{ margin: '12px 0' }}>{error}</p>}

        {/* Nav buttons */}
        <div className={styles.navButtons}>
          {step > 0 && (
            <button type="button" className="btn btn-secondary" onClick={handleBack} disabled={saving}>
              <ChevronLeft size={16} /> Back
            </button>
          )}
          <div style={{ flex: 1 }} />
          {step < STEPS.length - 1 ? (
            <button type="button" className="btn btn-primary" onClick={handleNext}>
              Next <ChevronRight size={16} />
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? (
                <><span className="spinner" style={{ width: 14, height: 14 }} /> Saving...</>
              ) : 'Save Budget'}
            </button>
          )}
        </div>
      </div>
      </>
    )}
    </div>
  );
}