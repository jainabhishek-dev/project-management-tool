import fs from 'fs';
import path from 'path';

const sourcePath = 'src/app/(app)/budgets/new/page.js';
const targetDir = 'src/app/(app)/budgets/[id]/edit';
const targetPath = path.join(targetDir, 'page.js');

if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

let code = fs.readFileSync(sourcePath, 'utf8');

// 1. imports
code = code.replace(
  "import { useRouter } from 'next/navigation';",
  "import { useRouter, useParams } from 'next/navigation';"
);

// 2. Component Name
code = code.replace('export default function NewBudgetPage() {', 'export default function EditBudgetPage() {');

// 3. Add useParams and initializing state flag
code = code.replace(
  'const supabase = getSupabaseBrowserClient();',
  `const supabase = getSupabaseBrowserClient();
  const params = useParams();
  const editId = params.id;
  const [loadingInitial, setLoadingInitial] = useState(true);`
);

// 4. Update the useEffect to load initial data if edit mode
const fetchLogic = `
  useEffect(() => {
    async function loadData() {
      // Load projects
      const { data: projData } = await supabase.from('projects').select('id, project_name').order('created_at', { ascending: false });
      if (projData) setProjects(projData);

      if (!editId) return;

      // Load budget
      const { data: budget } = await supabase
        .from('budgets')
        .select(\`
          *,
          budget_roles ( * ),
          budget_sections (
            *,
            budget_line_items (
              *,
              budget_norms ( * )
            )
          )
        \`)
        .eq('id', editId)
        .single();

      if (budget) {
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
`;

code = code.replace(
  /useEffect\(\(\) => \{\s*supabase\.from\('projects'\)[\s\S]*?\}, \[supabase\]\);/,
  fetchLogic
);

// 5. Update handleSave to Update instead of Insert, and delete cascades first
const newSaveOpStart = `
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

      // 2. Create roles`;

code = code.replace(
  /\/\/ 1\. Create budget[\s\S]*?\/\/ 2\. Create roles/,
  newSaveOpStart
);

// 6. Fix early return for loading state in JSX
code = code.replace(
  /<Header title="New Budget" subtitle="Build a budget estimation step by step." \/>/,
  `<Header title="Edit Budget" subtitle="Modify your existing budget details." />
  {loadingInitial && <div className="empty-state"><span className="spinner"></span><p>Loading budget...</p></div>}
  {!loadingInitial && (`
);

code = code.replace(
  /<\/div>\s*<\/div>\s*\);\s*\}\s*$/,
  `</div>
    )}
    </div>
  );
}`
);


fs.writeFileSync(targetPath, code);
console.log('Created edit page successfully at', targetPath);
