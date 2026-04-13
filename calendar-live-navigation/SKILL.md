---
name: calendar-live-navigation
description: Run and operate calendar-based driving reminders with fixed origins, destination extraction, live ETA checks, dedupe state, and cron delivery. Use when building, testing, or debugging a local assistant that reads calendar events, decides when travel reminders are due, generates Waze or Maps navigation links, answers leave-time questions, or turns saved origins like home and office into live trip guidance.
---

# Calendar Live Navigation

## Overview

Use this skill for an origin-aware calendar navigation assistant, not a plain calendar summary.

This portable package includes:
- the skill instructions in this directory
- a bundled runnable Node app under `assets/calendar-navigation-app/`
- install and bootstrap scripts under `scripts/`
- generic template data, not personal data

## Install before operating

If the app is not already installed in the target workspace, install it from this skill package first.

Preferred flow:
1. Run `scripts/install-app.sh <target-workspace-dir>`
2. Review and replace the example entries in `<target-workspace-dir>/calendar-navigation-app/data/fixed-origins.json`
3. Confirm `gog calendar +agenda --format json` works in that environment
4. Run `npm test` in the installed app directory
5. Use the installed app for reminder and trip commands

The bundled source lives at `assets/calendar-navigation-app/`. The install script copies it into a writable workspace location and creates live data files from templates.

## Core workflow

### 1. Check whether the task is reminder mode or trip mode

Use **reminder mode** when the user wants proactive reminders before meetings.

Use **trip mode** when the user asks things like:
- how long will it take from home to work
- when should I leave
- will I make it on time
- how long from office to this meeting right now

Keep the two modes separate in your reasoning even if they share the same helper app.

### 2. Resolve origins before routing

When the origin is a saved place like `home`, `office`, `parents`, or another nickname:
- resolve it through the fixed-origin store first
- prefer saved labels and aliases over guessing
- keep the stored raw address and derived Google Maps link together

Do not invent fixed origins. Ask the user before creating durable origin labels.

### 3. Be conservative about destination quality

For reminder mode, skip low-quality destinations instead of sending junk navigation.

Skip or flag destinations that are:
- clearly remote-only
- just a room name or floor name
- too vague to navigate to confidently
- links with no usable physical destination

If a destination is weak, explain that it was skipped rather than pretending it is routable.

### 4. Prefer live ETA, but never fake it

When live routing is available:
- return current ETA
- return traffic-free ETA when available
- return traffic delta when available
- compute a leave time when the meeting start is known

When live routing fails:
- say so plainly
- return truthful fallback status
- still include navigation links when possible
- do not invent ETA numbers

### 5. Dedupe reminder sends

Reminder mode should keep local sent-state and avoid sending the same event twice.

Use a stable reminder signature derived from calendar event fields when the source does not expose a durable event id.

When testing:
- prefer dry-run mode, or
- write to a temporary state path

### 6. Keep cron delivery simple

A cron-triggered agent turn should:
- run the local check command
- parse machine-readable JSON
- reply exactly `NO_REPLY` when nothing is due
- return one concise user-facing reminder when something is due
- include per-origin commute lines for the user's saved origins, especially `home` and `office`
- include the latest leave time for each origin when live routing is available

Do not let the cron worker freeform its own logic when the local app already computed the due reminders.

## Recommended installed app surface

Use the installed app directory after bootstrap. A good local setup should support:
- `node src/index.js check --dry-run --json`
- `node src/index.js origins-list --json`
- `node src/index.js origins-resolve --query home --json`
- `node src/index.js origins-save --label <label> --address <address> --json`
- `node src/index.js trip --origin home --destination office --json`

## Operating rules

- Start with machine-readable output when validating behavior.
- Separate extraction errors from routing errors from delivery errors.
- Treat `no reminder due` as success, not failure.
- Prefer short reminder text with summary, minutes remaining, destination, per-origin ETA, latest leave time, and navigation link.
- When the user asks debugging questions, inspect skipped reasons and state files before guessing.
- Keep template data generic until the user confirms real addresses.

## Debugging order

When something looks wrong, check in this order:
1. calendar source output
2. destination extraction quality
3. fixed-origin resolution
4. geocoding and live routing
5. dedupe state
6. cron delivery target and timeout

## Resources

- `references/reminder-and-trip-workflow.md` for the full execution pattern
- `references/cron-prompt-patterns.md` for reusable cron prompt templates and delivery rules
- `assets/calendar-navigation-app/README.md` for the bundled app surface
- `scripts/validate-package.sh` for package validation
