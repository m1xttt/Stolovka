set -eu

: "${PORT:=8000}"
: "${WORKERS:=1}"
: "${THREADS:=4}"
: "${TIMEOUT:=120}"
: "${CANTEEN_DB:=/data/canteen.db}"
: "${CANTEEN_REPORTS_DIR:=/data/reports}"

mkdir -p "$(dirname "$CANTEEN_DB")" "$CANTEEN_REPORTS_DIR"

python -c "from app import init_db; init_db()"

exec gunicorn \
  --bind "0.0.0.0:${PORT}" \
  --workers "${WORKERS}" \
  --threads "${THREADS}" \
  --timeout "${TIMEOUT}" \
  app:app
