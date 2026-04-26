import joblib
import pandas as pd
import numpy as np
from datetime import time

from sklearn.base import BaseEstimator, TransformerMixin

class TimeCyclicalEncoder(BaseEstimator, TransformerMixin):
    def __init__(self, time_col):
        self.time_col = time_col
    def fit(self, X, y=None):
        return self
    def transform(self, X):
        X = X.copy()
        def get_minutes(t):
            # Handles Python time objects
            return (t.hour * 60) + t.minute
        minutes = X[self.time_col].apply(get_minutes)
        X['dep_time_sin'] = np.sin(2 * np.pi * minutes / 1440)
        X['dep_time_cos'] = np.cos(2 * np.pi * minutes / 1440)
        return X.drop(columns=[self.time_col])

# load model
model_pipeline = joblib.load('final_flight_pipeline.pkl')

# Create a new flight example
# Note that it's a list, so can pass multiple flights or just one
new_flight = pd.DataFrame([{
    'FL_DATE_MONTH': 12,
    'FL_DATE_DAY': 2,
    'IS_WEEKEND': 0,
    'FL_TIME': time(14, 30), # 2:30 PM
    'ORIGIN': 'ORD',
    'DEST': 'LGA',
    'OP_CARRIER': 'UA'
}])

# Run prediction
prediction = model_pipeline.predict(new_flight)
final_result = max(0, prediction[0])

print(f"--- Flight Delay Prediction ---")
print(f"Predicted Departure Delay: {final_result:.1f} minutes")