// Fix: Drop and recreate the handle_new_user trigger with better error handling
// We'll use a simpler approach that avoids the timing issue.
const SUPABASE_URL = 'https://ydwmcthdjvhmiewwnpfo.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlkd21jdGhkanZobWlld3ducGZvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzYyMDM2MiwiZXhwIjoyMDY5MTk2MzYyfQ.CmRE4CItRDUged-TKgkNvyCGW4cP7rKzNjigJYJEYZ4';

// The key: profiles.id references auth.users(id) with ON DELETE CASCADE.
// AFTER INSERT on auth.users means the row IS committed before the trigger runs.
// But the issue might be that the profiles table has a FK that needs the auth.users row.
// Since it's an AFTER trigger, this should work. Let's check if the trigger actually exists.

const headers = {
  'apikey': SERVICE_ROLE_KEY,
  'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
};

// Use the /rest/v1/rpc endpoint to call a function - but we need to check triggers differently
// Let's try inserting a profile with a real UUID to see the exact constraint error
import { randomUUID } from 'crypto';

const testId = randomUUID();
const insertRes = await fetch(
  `${SUPABASE_URL}/rest/v1/profiles`,
  {
    method: 'POST',
    headers: { ...headers, 'Prefer': 'return=representation' },
    body: JSON.stringify({ id: testId, full_name: 'Test User', email: 'test@leadschool.in' }),
  }
);
const insertResult = await insertRes.text();
console.log('Insert test profile status:', insertRes.status);
console.log('Result:', insertResult);

// Check if profiles table column definitions are right
const schemaRes = await fetch(
  `${SUPABASE_URL}/rest/v1/profiles?limit=0`,
  { headers: { ...headers, 'Accept': 'application/openapi+json' } }
);
console.log('\nSchema check status:', schemaRes.status);
