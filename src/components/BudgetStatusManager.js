'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

const STATUS_OPTIONS = ['draft', 'submitted', 'approved', 'rejected'];
const STATUS_COLORS = {
  draft: 'badge-draft', 
  submitted: 'badge-submitted',
  approved: 'badge-approved', 
  rejected: 'badge-draft',
};

export default function BudgetStatusManager({ budgetId, initialStatus, isOwner }) {
  const [status, setStatus] = useState(initialStatus);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();

  if (!isOwner) {
    return <span className={`badge ${STATUS_COLORS[initialStatus] || 'badge-draft'}`}>{initialStatus}</span>;
  }

  async function handleChange(e) {
    const newStatus = e.target.value;
    setStatus(newStatus);
    setLoading(true);

    const { error } = await supabase
      .from('budgets')
      .update({ status: newStatus })
      .eq('id', budgetId);

    setLoading(false);
    if (!error) {
      router.refresh(); 
    } else {
      alert('Error updating status: ' + error.message);
      setStatus(initialStatus);
    }
  }

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
      <select 
        value={status} 
        onChange={handleChange} 
        disabled={loading}
        className={`badge ${STATUS_COLORS[status] || 'badge-draft'}`}
        style={{ border: 'none', cursor: 'pointer', appearance: 'auto', paddingRight: '20px' }}
      >
        {STATUS_OPTIONS.map(opt => (
          <option key={opt} value={opt}>{opt.charAt(0).toUpperCase() + opt.slice(1)}</option>
        ))}
      </select>
      {loading && <span className="spinner" style={{width: 12, height: 12}}></span>}
    </div>
  );
}
