#!/bin/bash
# Get the directory of the script
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

# Activate macOS virtual environment
if [ -d "venv" ]; then
    source venv/bin/activate
else
    echo "Virtual environment venv not found!"
fi

uvicorn main:app --host 127.0.0.1 --port 8001 --reload
