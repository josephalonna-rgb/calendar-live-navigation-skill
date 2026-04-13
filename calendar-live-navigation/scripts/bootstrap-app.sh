#!/usr/bin/env sh
set -eu

usage() {
  echo "Usage: $0 <installed-app-dir> [--force]" >&2
}

if [ "${1:-}" = "" ]; then
  usage
  exit 1
fi

APP_DIR=$1
FORCE=${2:-}
TEMPLATE_DIR="$APP_DIR/data/templates"
DATA_DIR="$APP_DIR/data"

if [ ! -d "$APP_DIR" ]; then
  echo "App directory not found: $APP_DIR" >&2
  exit 1
fi

if [ ! -d "$TEMPLATE_DIR" ]; then
  echo "Template directory not found: $TEMPLATE_DIR" >&2
  exit 1
fi

mkdir -p "$DATA_DIR"

copy_template() {
  src_name=$1
  dest_name=$2
  src="$TEMPLATE_DIR/$src_name"
  dest="$DATA_DIR/$dest_name"

  if [ ! -f "$src" ]; then
    echo "Missing template: $src" >&2
    exit 1
  fi

  if [ -f "$dest" ] && [ "$FORCE" != "--force" ]; then
    echo "Preserved existing $dest"
    return 0
  fi

  cp "$src" "$dest"
  echo "Wrote $dest"
}

copy_template fixed-origins.template.json fixed-origins.json
copy_template sent-reminders.template.json sent-reminders.json
copy_template sent-reminders-whatsapp.template.json sent-reminders-whatsapp.json

echo "Bootstrap complete. Next steps:"
echo "1. Replace the example addresses in $DATA_DIR/fixed-origins.json"
echo "2. Confirm gog calendar auth works"
echo "3. Run: npm test"
echo "4. Run: node src/index.js check --dry-run --json"
