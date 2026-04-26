import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import copy
import gc
import ast
import shap
import pickle
import xgboost
import utils as utils

from pathlib import Path
from feature_engine.outliers import OutlierTrimmer
from sklearn import metrics
from xgboost import XGBClassifier
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import MultiLabelBinarizer,OrdinalEncoder
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LogisticRegression, LinearRegression
from sklearn.neighbors import KNeighborsClassifier
from sklearn.tree import DecisionTreeClassifier
from sklearn.metrics import roc_auc_score,roc_curve


import statistics

pd.set_option('display.max_columns', None)

def df_summary(df):
    summary = pd.DataFrame({
        'dtype': df.dtypes,
        'non_null': df.notnull().sum(),
        'null_count': df.isnull().sum(),
        'null_pct': (df.isnull().mean()*100).round(2),
        'unique': df.nunique().sum()
    })
    return print(summary)

def pickle_model(model_obj,name):
    with open(name, 'wb') as f:
        pickle.dump(model_obj, f)

def unpickle_model(model_name):
    with open(model_name, 'rb') as f:
        return pickle.load(f)
    
    import pandas as pd
import networkx as nx

def build_graph(edge_weights):
    """
    Builds a directed graph from edge weights and calculates hub stats and PageRank.
    Returns a tuple of (Graph object, in_strength, out_strength, pagerank_df)
    """
    # 3. Build directed graph
    G = nx.DiGraph()

    for _, row in edge_weights.iterrows():
        G.add_edge(
            row["ORIGIN"],
            row["DEST"],
            weight=row["WEIGHT"]
        )

    # 4. Basic network stats
    print(f"Number of airports (nodes): {G.number_of_nodes()}")
    print(f"Number of routes (edges): {G.number_of_edges()}")

    # 5. Identify major hubs
    in_strength = dict(G.in_degree(weight="WEIGHT"))
    out_strength = dict(G.out_degree(weight="WEIGHT"))

    # 6. PageRank
    pagerank = nx.pagerank(G, weight="WEIGHT")
    df_pr = pd.DataFrame(list(pagerank.items()), columns=['Airport', 'Pagerank score'])

    return G, in_strength, out_strength, df_pr

def downsample_df(df):
    for col in df.select_dtypes(include=['float64','int64']).columns: # downsample
        df[col] = pd.to_numeric(df[col], downcast='float')
        
    for col in df.select_dtypes(include=['object']).columns: # downsample
        df[col] = df[col].astype('category')
        
    return df

def convert_multiple_hhmm(df, cols):
    for col in cols:
        df[col + '_MINUTES'] = (df[col] // 100) * 60 + (df[col] % 100)
    return df

def add_edge_weights(df):
    df_edges = df[["ORIGIN", "DEST"]].dropna()

    edge_weights = (
        df_edges
        .groupby(["ORIGIN", "DEST"])
        .size()
        .reset_index(name="WEIGHT")
    )

    df = df.merge(edge_weights,
                    left_on = ["ORIGIN", "DEST"],
                    right_on = ["ORIGIN", "DEST"] )
    # edge_weights.to_csv(GRAPH_PATH, index=False)
    return df

def add_degrees(df):
    # Unique routes only
    routes_df = df[["ORIGIN", "DEST"]].drop_duplicates()

    # Out-degree (unique destinations from airport)
    out_degree = routes_df.groupby('ORIGIN').size().reset_index(name='ORIGIN_DEGREES')

    # In-degree (unique origins to airport)
    in_degree = routes_df.groupby('DEST').size().reset_index(name='DEST_DEGREES')
    
    df = df.merge(out_degree,left_on='ORIGIN', right_on='ORIGIN')
    df = df.merge(in_degree,left_on='DEST', right_on='DEST')
    
    return df

def read_csv_parquet(path):
    df = pd.read_csv(path)
    df.drop(columns=["Unnamed: 27"], inplace=True)
    df.to_parquet('/Users/jason/Documents/coding/6242'+r'/2018_parq', index=False)
    return df

def merge_pr(df,df2):
    df = df.merge(df2,left_on='ORIGIN', right_on='Airport')
    return df

def add_delay_labels(df,duration):
    delay_cols = ['CARRIER_DELAY', 'WEATHER_DELAY', 'NAS_DELAY', 'SECURITY_DELAY','LATE_AIRCRAFT_DELAY']
    df['TOTAL_DELAY_FRM_CATEGORIES'] = df[delay_cols].sum(axis=1) # total delay duration
    df['NETT_DELAY'] = df['ARR_DELAY'] + df['DEP_DELAY']
    df['ARR_DELAY_LABEL'] = df['ARR_DELAY'] > duration
    df['DEP_DELAY_LABEL'] = df['DEP_DELAY'] > duration
    df['DELAY_LABEL'] = df['DEP_DELAY_LABEL'] | df['ARR_DELAY_LABEL'] # either arr/dep late 10min = Delay

    for col in delay_cols:
        # np.where(condition, value_if_true, value_if_false)
        df[f'{col}_LABEL'] = (df[col].fillna(0) >= duration).astype('int')
    return df