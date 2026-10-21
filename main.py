import sys
from pathlib import Path
import uvicorn

# Ensure the repository root is in sys.path
ROOT_DIR = Path(__file__).resolve().parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

if __name__ == '__main__':
    print('Starting Reverse Code Arena server on http://127.0.0.1:8000 ...')
    uvicorn.run('api.main:app', host='127.0.0.1', port=8000, reload=True)
