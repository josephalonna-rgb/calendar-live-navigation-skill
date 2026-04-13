#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
SKILL_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
REPO_DIR=$(CDPATH= cd -- "$SKILL_DIR/.." && pwd)
SKILL_NAME=$(basename "$SKILL_DIR")

cd "$REPO_DIR"
rm -f "$SKILL_NAME.skill" "$SKILL_NAME.zip"
zip -qr "$SKILL_NAME.skill" "$SKILL_NAME"
zip -qr "$SKILL_NAME.zip" "$SKILL_NAME"
echo "Built $REPO_DIR/$SKILL_NAME.skill"
echo "Built $REPO_DIR/$SKILL_NAME.zip"
