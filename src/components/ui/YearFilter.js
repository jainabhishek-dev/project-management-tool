'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';

export default function YearFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  
  const currentAY = searchParams.get('ay') || 'All';
  
  const options = ['All', 'AY25-26', 'AY26-27', 'AY27-28'];

  const handleChange = (e) => {
    const newAy = e.target.value;
    const params = new URLSearchParams(searchParams.toString());
    
    if (newAy === 'All') {
      params.delete('ay');
    } else {
      params.set('ay', newAy);
    }
    
    router.push(pathname + '?' + params.toString());
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <label htmlFor="ay-select" style={{ fontSize: '14px', color: 'var(--color-text-secondary)' }}>
        Academic Year:
      </label>
      <select 
        id="ay-select"
        value={currentAY} 
        onChange={handleChange}
        className="form-input"
        style={{ padding: '6px 12px', minWidth: '120px', cursor: 'pointer' }}
      >
        {options.map(opt => (
          <option key={opt} value={opt}>{opt === 'All' ? 'All Years' : opt}</option>
        ))}
      </select>
    </div>
  );
}
