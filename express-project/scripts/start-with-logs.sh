#!/bin/sh
# Wrapper to start the backend and redirect stdout/stderr to log.txt
# Place this file at express-project/scripts/start-with-logs.sh

# Move to project root (one level up from scripts)
cd "$(dirname "$0")/.." || exit 1

LOGFILE=log.txt

# Create log file if not exists and ensure writable
touch "$LOGFILE" 2>/dev/null || {
  echo "Failed to create ${LOGFILE}, check permissions" >&2
  exit 1
}

echo "----- $(date '+%Y-%m-%d %H:%M:%S') - npm start -----" >> "$LOGFILE"

# Start the app and append both stdout and stderr to the logfile
exec node app.js >> "$LOGFILE" 2>&1
