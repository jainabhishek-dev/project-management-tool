'use client';

import { useRef } from 'react';
import * as XLSX from 'xlsx';
import { Upload, Download } from 'lucide-react';

export default function UnifiedBulkUpload({ 
  onUploadSteps,
  onUploadBooks,
  onUploadPriority,
  onUploadTeam,
  onUploadHolidays,
  stepHeaders,
  bookHeaders,
  priorityHeaders,
  teamHeaders,
  holidayHeaders
}) {
  const fileInputRef = useRef(null);

  const handleDownloadTemplate = () => {
    const wb = XLSX.utils.book_new();

    // Generate Example Row Data
    const stepExample = [...stepHeaders].fill('');
    // Fill known columns
    stepExample[stepHeaders.indexOf('Step Name')] = 'Drafting';
    stepExample[stepHeaders.indexOf('Role')] = 'Creator';
    stepExample[stepHeaders.indexOf('Buffer Days')] = '2';
    stepExample[stepHeaders.indexOf('Depends On (Step Name)')] = '';
    stepExample[stepHeaders.indexOf('Unit')] = 'Chapter / Unit';
    if (stepHeaders.indexOf('Ref Pages (Optional)') !== -1) stepExample[stepHeaders.indexOf('Ref Pages (Optional)')] = '20';
    // Assume cluster 1 is 6th/7th depending on optional
    const firstClusterIndex = stepHeaders.indexOf('Ref Pages (Optional)') !== -1 ? 6 : 5;
    if (stepHeaders.length > firstClusterIndex) stepExample[firstClusterIndex] = '5'; // 5 mandays

    const bookExample = [...bookHeaders].fill('');
    bookExample[bookHeaders.indexOf('Book Name')] = 'Book 1';
    bookExample[bookHeaders.indexOf('Unit No')] = '1';
    bookExample[bookHeaders.indexOf('Unit Name')] = 'Algebra basics';
    bookExample[bookHeaders.indexOf('Chapter Cluster')] = stepHeaders[firstClusterIndex] || 'Cluster 1';
    if (bookHeaders.indexOf('External Pages (Optional)') !== -1) bookExample[bookHeaders.indexOf('External Pages (Optional)')] = '10';

    const priorityExample = [...priorityHeaders].fill('');
    priorityExample[0] = 'Book 1';
    priorityExample[1] = 'Algebra basics';
    priorityExample[2] = '1';

    const teamExample = [...teamHeaders].fill('');
    teamExample[0] = 'John Doe';
    teamExample[1] = 'Creator';
    teamExample[2] = '1';
    teamExample[3] = '2026-03-25, 2026-03-26';

    const holidayExample = [...holidayHeaders].fill('');
    holidayExample[0] = '2026-01-01';
    holidayExample[1] = 'New Year';

    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([stepHeaders, stepExample]), "Steps & Norms");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([bookHeaders, bookExample]), "Books & Chapters");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([priorityHeaders, priorityExample]), "Execution Priority");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([teamHeaders, teamExample]), "Team Members");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([holidayHeaders, holidayExample]), "Holidays");

    XLSX.writeFile(wb, "Project_Plan_Template.xlsx");
  };

  const processFile = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        
        let foundAny = false;
        
        // Parse "Steps & Norms"
        if (workbook.SheetNames.includes("Steps & Norms")) {
            const arr = XLSX.utils.sheet_to_json(workbook.Sheets["Steps & Norms"], { defval: "" });
            if (arr.length > 0) { onUploadSteps(arr); foundAny = true; }
        }
        
        // Parse "Books & Chapters"
        if (workbook.SheetNames.includes("Books & Chapters")) {
            const arr = XLSX.utils.sheet_to_json(workbook.Sheets["Books & Chapters"], { defval: "" });
            if (arr.length > 0) { onUploadBooks(arr); foundAny = true; }
        }
        
        // Parse "Execution Priority"
        if (workbook.SheetNames.includes("Execution Priority")) {
            const arr = XLSX.utils.sheet_to_json(workbook.Sheets["Execution Priority"], { defval: "" });
            if (arr.length > 0) { onUploadPriority(arr); foundAny = true; }
        }
        
        // Parse "Team Members"
        if (workbook.SheetNames.includes("Team Members")) {
            const arr = XLSX.utils.sheet_to_json(workbook.Sheets["Team Members"], { defval: "" });
            if (arr.length > 0) { onUploadTeam(arr); foundAny = true; }
        }
        
        // Parse "Holidays"
        if (workbook.SheetNames.includes("Holidays")) {
            const arr = XLSX.utils.sheet_to_json(workbook.Sheets["Holidays"], { defval: "" });
            if (arr.length > 0) { onUploadHolidays(arr); foundAny = true; }
        }

        if (foundAny) {
           alert("Successfully parsed and populated wizards from the template!");
        } else {
           alert("Couldn't find valid data in the expected Sheet names. Make sure you use the downloaded template formats.");
        }

      } catch (error) {
        console.error("XLSX parsing error:", error);
        alert("Failed to parse Excel file.");
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (!file.name.match(/\.(xlsx|xls)$/i)) {
          alert("Unified bulk upload requires the .xlsx Template.");
          return;
      }
      processFile(file);
    }
  };

  return (
    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', background: 'rgba(255,255,255,0.05)', padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
      <span style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginRight: 'auto' }}>
        <strong>Power Mode:</strong> Hydrate all setup tabs simultaneously via single Excel map:
      </span>
      <button 
        type="button"
        className="btn btn-outline btn-sm"
        onClick={handleDownloadTemplate}
        title="Download Master Template"
        style={{ padding: '0 8px' }}
      >
        <Download size={14} style={{ marginRight: 4 }} />
        Get Template
      </button>

      <button
        type="button"
        className="btn btn-primary btn-sm"
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload size={14} style={{ marginRight: 4 }} />
        Unified Upload
      </button>

      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        accept=".xlsx, .xls"
        onChange={handleFileChange}
      />
    </div>
  );
}
