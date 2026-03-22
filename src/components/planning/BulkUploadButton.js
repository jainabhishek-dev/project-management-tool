'use client';

import { useRef } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { Upload, Download } from 'lucide-react';

export default function BulkUploadButton({ 
  onUpload, 
  templateHeaders, 
  templateName = "template",
  label = "Bulk Upload"
}) {
  const fileInputRef = useRef(null);

  const handleDownloadTemplate = () => {
    // Generate an empty single row with headers to demonstrate column format
    const templateData = [templateHeaders];
    const csvContent = Papa.unparse(templateData);

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `${templateName}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const processFile = (file) => {
    const ext = file.name.split('.').pop().toLowerCase();

    if (ext === 'csv') {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          onUpload(results.data);
          fileInputRef.current.value = ''; // Reset
        },
        error: (error) => {
          console.error("PapaParse Error:", error);
          alert("Failed to parse CSV file.");
          fileInputRef.current.value = '';
        }
      });
    } else if (ext === 'xlsx' || ext === 'xls') {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array', cellDates: true });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          
          // Defval ensures empty cells aren't omitted from the object keys
          const jsonArray = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
          onUpload(jsonArray);
        } catch (error) {
          console.error("XLSX parsing error:", error);
          alert("Failed to parse Excel file.");
        } finally {
          fileInputRef.current.value = '';
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      alert("Unsupported file format. Please upload CSV or XLSX.");
      fileInputRef.current.value = '';
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      processFile(file);
    }
  };

  return (
    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
      <button 
        type="button"
        className="btn btn-outline btn-sm"
        onClick={handleDownloadTemplate}
        title="Download CSV Template"
        style={{ padding: '0 8px' }}
      >
        <Download size={14} style={{ marginRight: 4 }} />
        Template
      </button>

      <button
        type="button"
        className="btn btn-primary btn-sm"
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload size={14} style={{ marginRight: 4 }} />
        {label}
      </button>

      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
        onChange={handleFileChange}
      />
    </div>
  );
}
