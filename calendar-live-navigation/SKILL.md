---
name: calendar-live-navigation
description: Run and operate calendar-based driving reminders with fixed origins, destination extraction, live ETA checks, dedupe state, and cron delivery. Use when building, testing, or debugging a local assistant that reads calendar events, decides when travel reminders are due, generates Waze or Maps navigation links, answers leave-time questions, or turns saved origins like home and office into live trip guidance.
---

# Calendar Live Navigation

## Overview

Use this skill for an origin-aware calendar navigation assistant, not a plain calendar summary.

This skill covers four connected jobs:
- read upcoming calendar events
- extract only usable physical destinations
- compute navigation links and live driving ETA
- send reminder messages only when a reminder is actually due

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

Do not let the cron worker freeform its own logic when the local app already computed the due reminders.

## Operating rules

- Start with machine-readable output when validating behavior.
- Separate extraction errors from routing errors from delivery errors.
- Treat `no reminder due` as success, not failure.
- Prefer short reminder text with summary, minutes remaining, destination, and navigation link.
- When the user asks debugging questions, inspect skipped reasons and state files before guessing.

## Recommended local app shape

A good local helper app for this skill should support:
- `check` for due reminder detection
- `origins-list` and `origins-resolve` for fixed origins
- `origins-save` for durable user-confirmed places
- `trip` for origin-aware ETA and leave-time checks
- JSON output for automation
- dry-run mode for safe validation

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
