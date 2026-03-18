'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { Trash2 } from 'lucide-react';

export default function DeleteButton({ type, id, isAdmin, onSuccessRedirect, onSuccessRefresh }) {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    if (!isAdmin) return;

    const firstConfirm = window.confirm(`Are you sure you want to delete this ${type}? This action cannot be undone.`);
    if (!firstConfirm) return;

    if (type === 'project') {
      const secondConfirm = window.confirm('WARNING: Deleting a project will result in deleting ALL budgets and plans mapped to this project. Do you still want to proceed?');
      if (!secondConfirm) return;
    }

    setLoading(true);
    let table = '';
    if (type === 'project') table = 'projects';
    else if (type === 'plan') table = 'project_plans';
    else table = 'budgets';

    const { error } = await supabase.from(table).delete().eq('id', id);

    if (error) {
      alert(`Error deleting ${type}: ${error.message}`);
      setLoading(false);
      return;
    }

    if (onSuccessRedirect) {
      router.push(onSuccessRedirect);
    } else if (onSuccessRefresh) {
      setLoading(false);
      router.refresh();
    } else {
      router.refresh();
    }
  };

  const wrapperProps = !isAdmin 
    ? { title: `Reach out to admins to delete a ${type}`, 'aria-label': `Reach out to admins to delete a ${type}` }
    : {};

  return (
    <div {...wrapperProps} style={{ display: 'inline-block' }}>
      <button 
        onClick={handleDelete}
        disabled={!isAdmin || loading}
        className="btn btn-secondary"
        style={{ 
          opacity: !isAdmin ? 0.5 : 1, 
          cursor: !isAdmin ? 'not-allowed' : 'pointer',
          color: 'var(--color-danger)',
          borderColor: 'var(--color-danger)',
          background: 'transparent',
          padding: '8px 12px'
        }}
      >
        <Trash2 size={16} />
        {loading ? '...' : (type === 'project' ? 'Delete Project' : 'Delete')}
      </button>
    </div>
  );
}
