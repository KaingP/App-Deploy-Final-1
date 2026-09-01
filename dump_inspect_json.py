import pandas as pd
import json

def run():
    out = {}
    
    # 1. Danh_sach_ca.xlsx
    xl_ca = pd.ExcelFile('Danh_sach_ca.xlsx')
    out['Danh_sach_ca'] = {}
    for s in xl_ca.sheet_names:
        df = pd.read_excel('Danh_sach_ca.xlsx', sheet_name=s)
        # convert timestamp / times to str
        out['Danh_sach_ca'][s] = df.astype(str).to_dict(orient='records')
        
    # 2. Danh_sach_dang_ky_truc_ca_50_nguoi.xlsx
    xl_50 = pd.ExcelFile('Danh_sach_dang_ky_truc_ca_50_nguoi.xlsx')
    out['Danh_sach_dang_ky_50'] = {}
    for s in xl_50.sheet_names:
        df = pd.read_excel('Danh_sach_dang_ky_truc_ca_50_nguoi.xlsx', sheet_name=s)
        out['Danh_sach_dang_ky_50'][s] = {
            'columns': list(df.columns),
            'records': df.astype(str).to_dict(orient='records')
        }
        
    with open('inspect_data.json', 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print("Exported inspect_data.json successfully")

if __name__ == '__main__':
    run()
