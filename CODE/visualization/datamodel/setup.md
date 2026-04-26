# Setup

## Recreate The Dataset

1. Install the Python dependencies:

```bash
python -m pip install -r requirements.txt
```

2. Go to [kaggle.com](https://www.kaggle.com/) and sign in or create an account.

3. Open [kaggle.com/settings](https://www.kaggle.com/settings), then under `API` -> `API Tokens`, click `Generate New Token`.

4. Copy the API token and place it in `.env` under `KAGGLE_API_TOKEN`.

5. Run [data.py](C:/Users/Admin/Documents/GitHub/6242-data-visualization/datamodel/data.py) to generate `dataset.csv`.
