#!/usr/bin/env sh
set -eu

usage() {
  echo "Usage: $0 <target-workspace-dir> [app-dir-name]" >&2
}

if [ "${1:-}" = "" ]; then
  usage
  exit 1
fi

TARGET_WORKSPACE=$1
APP_DIR_NAME=${2:-calendar-navigation-app}
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
SKILL_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
SOURCE_APP_DIR="$SKILL_DIR/assets/calendar-navigation-app"
TARGET_APP_DIR="$TARGET_WORKSPACE/$APP_DIR_NAME"

if [ ! -d "$SOURCE_APP_DIR" ]; then
  echo "Bundled app not found: $SOURCE_APP_DIR" >&2
  exit 1
fi

mkdir -p "$TARGET_WORKSPACE"
rm -rf "$TARGET_APP_DIR"
mkdir -p "$TARGET_APP_DIR"
cp -R "$SOURCE_APP_DIR"/. "$TARGET_APP_DIR"/

"$SCRIPT_DIR/bootstrap-app.sh" "$TARGET_APP_DIR"

echo "Installed app to $TARGET_APP_DIR"
echo "Run from there:"
echo "  npm test"
echo "  node src/index.js check --dry-run --json"
