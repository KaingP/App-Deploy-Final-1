import sys
import os
import json
import pandas as pd

sys.stdout.reconfigure(encoding='utf-8')

def inspect_file(file_path):
    print(f"==================================================")
    print(f"FILE: {file_path}")
    if not os.path.exists(file_path):
        print(f"File not found: {file_path}")
        return
    xl = pd.ExcelFile(file_path)
    print(f"Sheets: {xl.sheet_names}")
    for sheet in xl.sheet_names:
        df = pd.read_excel(file_path, sheet_name=sheet)
        print(f"\n--- Sheet: {sheet} (Shape: {df.shape}) ---")
        print("Columns:", list(df.columns))
        print("Sample data:")
        print(df.head(10))
        print("Unique counts / summary:")
        for col in df.columns[:5]:
            print(f"  {col}: {df[col].nunique()} unique values")

if __name__ == '__main__':
    inspect_file("Danh_sach_ca.xlsx")
    inspect_file("Danh_sach_dang_ky_truc_ca_50_nguoi.xlsx")
