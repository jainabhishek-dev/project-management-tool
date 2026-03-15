'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import Header from '@/components/layout/Header';
import styles from './new-project.module.css';

const STATUS_OPTIONS = ['active', 'on_hold', 'completed', 'cancelled'];

export default function NewProjectPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();

  const [form, setForm] = useState({
    project_name: '',
    description: '',
    status: 'active',
    academic_year: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function handleChange(e) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    if (error) setError('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.project_name.trim()) {
      setError('Project name is required.');
      return;
    }

    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();

    const { data, error: dbError } = await supabase
      .from('projects')
      .insert({
        project_name: form.project_name.trim(),
        description: form.description.trim() || null,
        academic_year: form.academic_year.trim() || null,
        status: form.status,
        created_by: user.id,
      })
      .select('id')
      .single();

    setLoading(false);

    if (dbError) {
      setError(dbError.message);
      return;
    }

    router.push(`/projects/${data.id}`);
  }

  return (
    <div>
      <Header
        title="New Project"
        subtitle="Create a project to group your budgets and track work."
      />
      <div className={styles.formCard}>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="project_name" className="form-label">
              Project Name <span style={{ color: 'var(--color-danger)' }}>*</span>
            </label>
            <input
              id="project_name"
              name="project_name"
              type="text"
              className={`form-input ${error && !form.project_name.trim() ? 'form-input-error' : ''}`}
              placeholder="e.g. KTLO 2.0, LEAD PP 2.0"
              value={form.project_name}
              onChange={handleChange}
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="description" className="form-label">
              Description
            </label>
            <textarea
              id="description"
              name="description"
              className="form-input"
              placeholder="Brief description of the project scope..."
              value={form.description}
              onChange={handleChange}
              rows={3}
            />
          </div>

          <div className="form-group">
            <label htmlFor="academic_year" className="form-label">Academic Year</label>
            <select
              id="academic_year"
              name="academic_year"
              className="form-input"
              value={form.academic_year}
              onChange={handleChange}
            >
              <option value="">Select an Academic Year</option>
              {['AY25-26', 'AY26-27', 'AY27-28'].map(ay => (
                <option key={ay} value={ay}>{ay}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="status" className="form-label">Status</label>
            <select
              id="status"
              name="status"
              className="form-input"
              value={form.status}
              onChange={handleChange}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                </option>
              ))}
            </select>
          </div>

          {error && <p className="form-error">{error}</p>}

          <div className={styles.actions}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => router.back()}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading || !form.project_name.trim()}
            >
              {loading ? (
                <><span className="spinner" style={{ width: 14, height: 14 }} /> Saving...</>
              ) : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
