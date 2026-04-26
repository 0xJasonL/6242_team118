## Predicting for Punctuality: Visualizing US Flight Delays
Group 118

This folder contains the integrated version of the project:

- the overview dashboard
- the regional explorer
- the local prediction frontend
- the backend that serves the trained delay prediction model

The guide below walks through the full setup flow, starting from data preparation.

---

## What This Project Does

The project uses 2018 US domestic flight data to:

- prepare an enriched flight dataset
- train and save a departure delay prediction pipeline
- serve that model through a local backend API
- display insights and predictions in a combined dashboard

---

## Project Structure

```text
├── delay_duration                      Notebook, supporting scripts & model pickle for predicting delay duration
├── delay_probability                   Notebook, supporting scripts & model pickle for predicting delay probability
├── docs                                Final Report and Final poster files
└── visualization
    ├── combined-dashboard
    │   ├── backend                     Local API for model prediction
    │   ├── dashboard                   Regional Explorer page
    │   ├── model
    │   ├── shared                      Shared navigation styling   
    │   └── visualisation-dashboard     Overview dashboard page
    └── datamodel

```

---

## Prerequisites

Before starting, make sure you have:

- Python 3.11 recommended
- a Kaggle account
- a Kaggle API token
- a modern browser such as Chrome, Edge, or Firefox

---

## Full Setup

### 1. Clone the repository

```bash
git clone <repo-url>
cd 6242-data-visualization
```

### 2. Prepare the dataset

The data preparation step lives in [datamodel/data.py](GitHub/6242_118/datamodel/data.py).

Go into `datamodel`:

```bash
cd datamodel
```

Install the required packages:

```bash
python -m pip install -r requirements.txt
```

Create a `.env` file in `datamodel/` and add your Kaggle token:

```env
KAGGLE_API_TOKEN=your_token_here
```

To get your token:

1. Sign in to [kaggle.com](https://www.kaggle.com/)
2. Open [kaggle.com/settings](https://www.kaggle.com/settings)
3. Under `API`, click `Generate New Token`
4. Copy the token value into `.env`

Run the dataset preparation script:

```bash
python data.py
```

This script:

- downloads the airline dataset from Kaggle
- engineers route, date, and delay-related features
- writes the processed dataset to `datamodel/data.csv`

### 3. Train and save the model

Open [datamodel/model_delay_mins.ipynb](C:/Users/Admin/Documents/GitHub/6242-data-visualization/datamodel/model_delay_mins.ipynb) and run the notebook cells in order.

The notebook:

- loads `data.csv`
- trains multiple regression models
- compares them using MAE
- saves the best pipeline as `final_flight_pipeline.pkl`

Make sure the following file exists before you continue:

```text
datamodel/final_flight_pipeline.pkl
```

### 4. Start the prediction backend

Go to the backend folder:

```bash
cd ..\combined-dashboard\backend
```

Install the backend dependencies:

```bash
python -m pip install -r requirements.txt
```

Start the backend server:

```bash
python server.py
```

The backend starts at:

```text
http://127.0.0.1:8000
```

You can check that it is running by visiting:

```text
http://127.0.0.1:8000/api/health
```

More backend details are in [backend/README.md](C:/Users/Admin/Documents/GitHub/6242-data-visualization/combined-dashboard/backend/README.md).

### 5. Start the dashboard frontend

Open a new terminal and go to:

```bash
cd ..\
```

You should now be inside:

```text
6242-data-visualization/combined-dashboard
```

Start a simple local web server:

```bash
python -m http.server 5500
```

### 6. Open the app

Open the overview dashboard:

```text
http://localhost:5500/visualisation-dashboard/frontend/index.html
```

Or open the regional explorer directly:

```text
http://localhost:5500/dashboard/us_region_dashboard_echarts.html
```

Use the top navigation bar to move between the two pages.

---

## Pages

| Page | URL | Description |
|---|---|---|
| Overview Dashboard | `http://localhost:5500/visualisation-dashboard/frontend/index.html` | Airport network map, temporal heatmap, carrier delays, delay causes, and departure-time insights |
| Regional Explorer | `http://localhost:5500/dashboard/us_region_dashboard_echarts.html` | Regional route map, filtered delay summaries, and automatic departure delay prediction |

---

## Important Notes

- Always open the dashboard through `http://localhost:5500/...`, not by double-clicking the HTML files.
- The prediction feature requires both the frontend server and the backend server to be running.
- The backend expects the trained model file at `datamodel/final_flight_pipeline.pkl`.
- On first load, the regional map may fetch US GeoJSON from a public CDN.

---

## Troubleshooting

### The dashboard loads but prediction does not work

Check that:

- `combined-dashboard/backend/server.py` is running
- `datamodel/final_flight_pipeline.pkl` exists
- the backend is reachable at `http://127.0.0.1:8000/api/health`

### The charts stay on loading

Make sure you started the frontend from inside `combined-dashboard/`:

```bash
python -m http.server 5500
```

### Port 5500 is already in use

Use another port:

```bash
python -m http.server 8080
```

Then open:

```text
http://localhost:8080/visualisation-dashboard/frontend/index.html
```

### Port 8000 is already in use

Set a different backend port before starting the server:

```bash
set PORT=8001
python server.py
```

If you change the backend port, update the frontend backend URL accordingly.
