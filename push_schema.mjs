import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = 'https://ydwmcthdjvhmiewwnpfo.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlkd21jdGhkanZobWlld3ducGZvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzYyMDM2MiwiZXhwIjoyMDY5MTk2MzYyfQ.CmRE4CItRDUged-TKgkNvyCGW4cP7rKzNjigJYJEYZ4';

const sqlFile = path.join(__dirname, 'supabase_schema.sql');
const fullSQL = fs.readFileSync(sqlFile, 'utf-8');

// Split into individual statements and execute them one by one via REST
// using the pg REST endpoint with service role
const statements = fullSQL
  .split(';')
  .map(s => s.trim())
  .filter(s => s.length > 0 && !s.startsWith('--'));

console.log(`Found ${statements.length} SQL statements to run`);

let successCount = 0;
let errorCount = 0;

for (let i = 0; i < statements.length; i++) {
  const stmt = statements[i] + ';';
  // Skip comments-only statements
  if (stmt.replace(/--[^\n]*/g, '').trim() === ';') continue;

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ query: stmt }),
    });

    if (res.ok) {
      successCount++;
    } else {
      const text = await res.text();
      console.error(`Statement ${i + 1} failed (${res.status}): ${text.slice(0, 200)}`);
      errorCount++;
    }
  } catch(e) {
    console.error(`Statement ${i + 1} threw: ${e.message}`);
    errorCount++;
  }
}

console.log(`Done. ${successCount} succeeded, ${errorCount} failed.`);
