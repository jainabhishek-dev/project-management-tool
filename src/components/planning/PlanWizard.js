'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { Plus, Minus, Check, ChevronRight, ChevronLeft, LoaderGap, Trash2 } from 'lucide-react';
import styles from './PlanWizard.module.css';

const STEPS_WIZARD = [
  { id: 'info', title: 'Basic Info' },
  { id: 'steps', title: 'Steps & Norms' },
  { id: 'deliverables', title: 'Deliverables' }
];

export default function PlanWizard({ projectId, userId, clusters }) {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // 1. Basic Info State
  const [info, setInfo] = useState({
    name: '',
    type: 'Print',
    start_date: new Date().toISOString().split('T')[0]
  });

  // 2. Steps & Norms State
  const [planSteps, setPlanSteps] = useState([
    { name: 'Step A', role: 'Creator', buffer: 0, norms: clusters.reduce((acc, c) => ({ ...acc, [c.id]: 1 }), {}) },
    { name: 'Step B', role: 'Reviewer 1', buffer: 0, norms: clusters.reduce((acc, c) => ({ ...acc, [c.id]: 0.5 }), {}) }
  ]);

  // 3. Deliverables State
  const [deliverables, setDeliverables] = useState([
    { term: '1', className: 'Nursery', unitNo: '1', unitName: 'Unit name 1', clusterId: clusters[0]?.id || '', pages: 0 }
  ]);

  const handleNext = () => {
    if (currentStepIndex < STEPS_WIZARD.length - 1) {
      setCurrentStepIndex(currentStepIndex + 1);
    } else {
      handleSave();
    }
  };

  const handleBack = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(currentStepIndex - 1);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Create Project Plan
      const { data: plan, error: planError } = await supabase
        .from('project_plans')
        .insert({
          project_id: projectId,
          created_by: userId,
          name: info.name,
          type: info.type,
          start_date: info.start_date
        })
        .select()
        .single();

      if (planError) throw planError;

      // 2. Create Planning Steps & Norms
      for (const stepObj of planSteps) {
        const { data: step, error: stepError } = await supabase
          .from('planning_steps')
          .insert({
            plan_id: plan.id,
            name: stepObj.name,
            role_required: stepObj.role,
            buffer_days: stepObj.buffer,
            display_order: planSteps.indexOf(stepObj)
          })
          .select()
          .single();

        if (stepError) throw stepError;

        // Norms for each cluster
        const normsInsert = Object.entries(stepObj.norms).map(([clusterId, mandays]) => ({
          step_id: step.id,
          cluster_id: clusterId,
          norm_in_mandays: parseFloat(mandays) || 0
        }));

        const { error: normsError } = await supabase
          .from('planning_norms')
          .insert(normsInsert);

        if (normsError) throw normsError;
      }

      // 3. Create Deliverables
      const deliverableInsert = deliverables.map((d, index) => ({
        plan_id: plan.id,
        term: d.term,
        class_name: d.className,
        unit_no: d.unitNo,
        unit_name: d.unitName,
        cluster_id: d.clusterId,
        pages: parseInt(d.pages) || 0
      }));

      const { error: delError } = await supabase
        .from('planning_deliverables')
        .insert(deliverableInsert);

      if (delError) throw delError;

      router.push(`/projects/${projectId}/plans/${plan.id}`);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  const addStep = () => {
    setPlanSteps([...planSteps, { 
      name: '', role: '', buffer: 0, 
      norms: clusters.reduce((acc, c) => ({ ...acc, [c.id]: 0 }), {}) 
    }]);
  };

  const removeStep = (index) => {
    if (planSteps.length > 1) {
      const newSteps = [...planSteps];
      newSteps.splice(index, 1);
      setPlanSteps(newSteps);
    }
  };

  const addDeliverable = () => {
    setDeliverables([...deliverables, { term: '', className: '', unitNo: '', unitName: '', clusterId: clusters[0]?.id || '', pages: 0 }]);
  };

  const removeDeliverable = (index) => {
    if (deliverables.length > 1) {
      const newDels = [...deliverables];
      newDels.splice(index, 1);
      setDeliverables(newDels);
    }
  };

  return (
    <div className={styles.wizard}>
      <div className={styles.stepsNav}>
        {STEPS_WIZARD.map((step, idx) => (
          <div key={idx} className={`${styles.stepIndicator} ${idx === currentStepIndex ? styles.active : ''}`}>
            <span className={styles.stepNum}>{idx + 1}</span>
            <span className={styles.stepTitle}>{step.title}</span>
            {idx < STEPS_WIZARD.length - 1 && <div className={styles.connector} />}
          </div>
        ))}
      </div>

      <div className={styles.content}>
        {currentStepIndex === 0 && (
          <div className="animate-fade-in">
            <div className="form-group">
              <label className="form-label">Plan Name</label>
              <input 
                className="form-input" 
                placeholder="e.g., Print Coursebook FY26 Q1" 
                value={info.name}
                onChange={e => setInfo({ ...info, name: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Work Stream Type</label>
              <select 
                className="form-input" 
                value={info.type}
                onChange={e => setInfo({ ...info, type: e.target.value })}
              >
                <option value="Print">Print</option>
                <option value="Digital">Digital</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Start Date</label>
              <input 
                type="date" 
                className="form-input" 
                value={info.start_date}
                onChange={e => setInfo({ ...info, start_date: e.target.value })}
              />
            </div>
          </div>
        )}

        {currentStepIndex === 1 && (
          <div className="animate-fade-in">
            <div className={styles.tableWrapper}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Step Name</th>
                    <th>Role</th>
                    <th>Buffer (Days)</th>
                    {clusters.map(c => <th key={c.id}>{c.name} Mandays</th>)}
                    <th style={{ width: 40 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {planSteps.map((step, idx) => (
                    <tr key={idx}>
                      <td>
                        <input className="form-input" value={step.name} onChange={e => {
                          const ns = [...planSteps]; ns[idx].name = e.target.value; setPlanSteps(ns);
                        }} />
                      </td>
                      <td>
                        <input className="form-input" value={step.role} onChange={e => {
                          const ns = [...planSteps]; ns[idx].role = e.target.value; setPlanSteps(ns);
                        }} />
                      </td>
                      <td>
                        <input type="number" className="form-input" value={step.buffer} onChange={e => {
                          const ns = [...planSteps]; ns[idx].buffer = e.target.value; setPlanSteps(ns);
                        }} />
                      </td>
                      {clusters.map(c => (
                        <td key={c.id}>
                          <input type="number" step="0.01" className="form-input" value={step.norms[c.id]} onChange={e => {
                            const ns = [...planSteps]; ns[idx].norms[c.id] = e.target.value; setPlanSteps(ns);
                          }} />
                        </td>
                      ))}
                      <td>
                        <button className="btn btn-danger btn-sm" onClick={() => removeStep(idx)}><Trash2 size={14}/></button>
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
                    <tr key={idx}>
                      <td><input className="form-input" value={d.term} onChange={e => { const nd = [...deliverables]; nd[idx].term = e.target.value; setDeliverables(nd); }} /></td>
                      <td><input className="form-input" value={d.className} onChange={e => { const nd = [...deliverables]; nd[idx].className = e.target.value; setDeliverables(nd); }} /></td>
                      <td><input className="form-input" value={d.unitNo} onChange={e => { const nd = [...deliverables]; nd[idx].unitNo = e.target.value; setDeliverables(nd); }} /></td>
                      <td><input className="form-input" value={d.unitName} onChange={e => { const nd = [...deliverables]; nd[idx].unitName = e.target.value; setDeliverables(nd); }} /></td>
                      <td>
                        <select className="form-input" value={d.clusterId} onChange={e => { const nd = [...deliverables]; nd[idx].clusterId = e.target.value; setDeliverables(nd); }}>
                          {clusters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </td>
                      <td><input type="number" className="form-input" value={d.pages} onChange={e => { const nd = [...deliverables]; nd[idx].pages = e.target.value; setDeliverables(nd); }} /></td>
                      <td>
                        <button className="btn btn-danger btn-sm" onClick={() => removeDeliverable(idx)}><Trash2 size={14}/></button>
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
      </div>

      {error && <div className={styles.errorMessage}>{error}</div>}

      <div className={styles.wizardActions}>
        <button className="btn btn-secondary" onClick={handleBack} disabled={currentStepIndex === 0}>
          <ChevronLeft size={16} /> Previous
        </button>
        <button 
          className="btn btn-primary" 
          onClick={handleNext} 
          disabled={loading || !info.name}
        >
          {loading ? 'Saving...' : currentStepIndex === STEPS_WIZARD.length - 1 ? 'Finish & Generate' : 'Next'} 
          {!loading && currentStepIndex < STEPS_WIZARD.length - 1 && <ChevronRight size={16} />}
          {!loading && currentStepIndex === STEPS_WIZARD.length - 1 && <Check size={16} />}
        </button>
      </div>
    </div>
  );
}
