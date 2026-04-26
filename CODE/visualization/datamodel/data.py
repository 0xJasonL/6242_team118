import kagglehub
import pandas as pd
import zipfile
import os
from dotenv import load_dotenv
import copy

DELAY_DURATION = 10 # define a delay as > 10min

load_dotenv()

downloaded_path = kagglehub.dataset_download(
    "yuanyuwendymu/airline-delay-and-cancellation-data-2009-2018",
    path="2018.csv"
)

if not downloaded_path.endswith('.zip') and zipfile.is_zipfile(downloaded_path):
    print("Detected ZIP content in CSV file. Unzipping...")
    new_path = downloaded_path + ".zip"
    os.rename(downloaded_path, new_path)
    
    with zipfile.ZipFile(new_path, 'r') as zip_ref:
        zip_ref.extractall("./data")
    csv_file = "./data/2018.csv"
else:
    csv_file = downloaded_path

df = pd.read_csv(
    csv_file, 
    encoding='latin-1', 
    sep=',', 
    low_memory=False
)

excluded_cols = ["TAXI_IN",
                 "TAXI_OUT",
                 "WHEELS_ON",
                 "WHEELS_OFF"]

cols_of_interest = [col for col in list(df.columns) if col not in excluded_cols]

if cols_of_interest:
  df_subset = df[cols_of_interest].copy()
else:
  df_subset = copy.deepcopy(df)

# TIME columns are in 0000 hrs format, so changing them to minutes from 0000 midnight
time_cols = ['DEP_TIME', 'ARR_TIME', 'ACTUAL_ELAPSED_TIME', 'CRS_DEP_TIME', 'CRS_ARR_TIME', 'CRS_ELAPSED_TIME']

def convert_multiple_hhmm(df, cols):
    for col in cols:
        df[col + '_MINUTES'] = (df[col] // 100) * 60 + (df[col] % 100)
    return df

df_subset = convert_multiple_hhmm(df_subset, time_cols)

# parsing for datetime
df_subset["FL_DATE"] = pd.to_datetime(df_subset["FL_DATE"])
df_subset["FL_DATE_MONTH"] = df_subset["FL_DATE"].dt.month
df_subset["FL_DATE_DAY"] = df_subset["FL_DATE"].dt.dayofweek
df_subset["FL_TIME"] = df_subset["FL_DATE"].dt.time
df_subset["FL_DATE_WEEK"] = df_subset["FL_DATE"].dt.isocalendar().week
df_subset["IS_WEEKEND"] = df_subset["FL_DATE_DAY"].isin([5,6])


# adding graph (edges/nodes) related features
df_edges = df_subset[["ORIGIN", "DEST"]].dropna()

edge_weights = (
    df_edges
    .groupby(["ORIGIN", "DEST"])
    .size()
    .reset_index(name="WEIGHT")
)

df_subset = df_subset.merge(edge_weights,
                left_on = ["ORIGIN", "DEST"],
                right_on = ["ORIGIN", "DEST"] )

# Unique routes only
routes_df = df_subset[["ORIGIN", "DEST"]].drop_duplicates()

# Out-degree (unique destinations from airport)
out_degree = routes_df.groupby('ORIGIN').size().reset_index(name='ORIGIN_DEGREES')

# In-degree (unique origins to airport)
in_degree = routes_df.groupby('DEST').size().reset_index(name='DEST_DEGREES')

df_subset = df_subset.merge(out_degree,left_on='ORIGIN', right_on='ORIGIN')
df_subset = df_subset.merge(in_degree,left_on='DEST', right_on='DEST')

# delay labels
delay_cols = ['CARRIER_DELAY', 'WEATHER_DELAY', 'NAS_DELAY', 'SECURITY_DELAY','LATE_AIRCRAFT_DELAY']
df_subset['TOTAL_DELAY_FRM_CATEGORIES'] = df_subset[delay_cols].sum(axis=1) # total delay duration
df_subset['NETT_DELAY'] = df_subset['ARR_DELAY'] + df_subset['DEP_DELAY']
df_subset['ARR_DELAY_TAG'] = df_subset['ARR_DELAY'] > DELAY_DURATION
df_subset['DEP_DELAY_TAG'] = df_subset['DEP_DELAY'] > DELAY_DURATION
df_subset['DELAY_TAG'] = df_subset['DEP_DELAY_TAG'] | df_subset['ARR_DELAY_TAG'] # either arr/dep late 10min = Delay

df_subset.to_csv('data.csv')
