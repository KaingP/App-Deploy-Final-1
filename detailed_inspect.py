import pandas as pd
import json

df_ca = pd.read_excel('Danh_sach_ca.xlsx', sheet_name='CaTruc')
print("=== CaTruc ===")
print(df_ca)

df_tv = pd.read_excel('Danh_sach_ca.xlsx', sheet_name='ThanhVien')
print("\n=== ThanhVien ===")
print(df_tv)

df_dk = pd.read_excel('Danh_sach_ca.xlsx', sheet_name='DangKiCa')
print("\n=== DangKiCa ===")
print(df_dk)

df_50 = pd.read_excel('Danh_sach_dang_ky_truc_ca_50_nguoi.xlsx')
print("\n=== Danh_sach_dang_ky_truc_ca_50_nguoi.xlsx ===")
print("Shape:", df_50.shape)
print("Columns:", list(df_50.columns))
print(df_50.head(10).to_dict(orient='records'))
