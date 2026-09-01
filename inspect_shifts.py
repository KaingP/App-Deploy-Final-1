import json
import pandas as pd

df_ca = pd.read_excel('Danh_sach_ca.xlsx', sheet_name='CaTruc')
print("Total rows in CaTruc:", len(df_ca))
print(df_ca['Loại'].value_counts())
print("\nUnique Điểm bán:", df_ca['Điểm bán'].unique())
print("\nUnique Thứ:", df_ca['Thứ'].unique())
print("\nUnique Khung giờ (Bắt đầu - Kết thúc):")
df_ca['KhungGio'] = df_ca['Bắt đầu'].astype(str) + ' - ' + df_ca['Kết thúc'].astype(str)
print(df_ca[['Loại', 'Điểm bán', 'Thứ', 'KhungGio', 'Số người trực']].drop_duplicates().to_string())

# Check all shifts
print("\nFull CaTruc:")
print(df_ca.to_string())
