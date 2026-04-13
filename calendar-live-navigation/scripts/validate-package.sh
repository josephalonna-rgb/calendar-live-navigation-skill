#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
SKILL_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
REPO_DIR=$(CDPATH= cd -- "$SKILL_DIR/.." && pwd)
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT INT TERM

EXPECTED_FILES="
$SKILL_DIR/SKILL.md
$SKILL_DIR/references/cron-prompt-patterns.md
$SKILL_DIR/references/reminder-and-trip-workflow.md
$SKILL_DIR/assets/calendar-navigation-app/package.json
$SKILL_DIR/assets/calendar-navigation-app/src/index.js
$SKILL_DIR/assets/calendar-navigation-app/test/index.test.js
$SKILL_DIR/assets/calendar-navigation-app/data/templates/fixed-origins.template.json
$SKILL_DIR/scripts/install-app.sh
$SKILL_DIR/scripts/bootstrap-app.sh
$SKILL_DIR/scripts/package-skill.sh
"

for file in $EXPECTED_FILES; do
  [ -f "$file" ] || {
    echo "Missing required file: $file" >&2
    exit 1
  }
done

"$SCRIPT_DIR/package-skill.sh" >/dev/null
"$SCRIPT_DIR/install-app.sh" "$TMP_DIR/workspace" >/dev/null
npm test --prefix "$TMP_DIR/workspace/calendar-navigation-app"
node "$TMP_DIR/workspace/calendar-navigation-app/src/index.js" origins-list --json > "$TMP_DIR/origins-list.json"

unzip -l "$REPO_DIR/calendar-live-navigation.skill" | grep 'calendar-live-navigation/assets/calendar-navigation-app/src/index.js' >/dev/null
unzip -l "$REPO_DIR/calendar-live-navigation.skill" | grep 'calendar-live-navigation/scripts/install-app.sh' >/dev/null
unzip -l "$REPO_DIR/calendar-live-navigation.zip" | grep 'calendar-live-navigation/assets/calendar-navigation-app/data/templates/fixed-origins.template.json' >/dev/null

echo "Validation passed"
echo "Temporary install path: $TMP_DIR/workspace/calendar-navigation-app"
