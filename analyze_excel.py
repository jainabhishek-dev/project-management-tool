import pandas as pd
import json
import os

file_path = r'c:\Users\Archi\Projects\project_management\templates\Project Template (NEW) - Do NOT Edit.xlsx'

def analyze_excel(path):
    try:
        xl = pd.ExcelFile(path)
        sheet_names = xl.sheet_names
        print(f"Sheet names: {sheet_names}")
        
        data = {}
        for sheet in sheet_names:
            print(f"Reading sheet: {sheet}")
            df = pd.read_excel(path, sheet_name=sheet, nrows=50) # Just 50 rows for snapshot
            # Convert columns to string and records to string if needed
            data[str(sheet)] = {
                "columns": [str(c) for c in df.columns],
                "head": df.head(10).replace({pd.NA: None}).to_dict(orient='records')
            }
        
        # Simple encoder for common non-serializable types
        def default_encoder(obj):
            if hasattr(obj, 'isoformat'):
                return obj.isoformat()
            if isinstance(obj, pd.Timestamp):
                return obj.isoformat()
            return str(obj)

        with open('excel_analysis.json', 'w') as f:
            json.dump(data, f, indent=2, default=default_encoder)
        print("Analysis saved to excel_analysis.json")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    analyze_excel(file_path)
