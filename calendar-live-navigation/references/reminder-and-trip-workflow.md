# Reminder And Trip Workflow

## Package assumptions

This skill package ships with a bundled app under `assets/calendar-navigation-app/` and helper scripts under `scripts/`.

Recommended setup before operation:
1. `scripts/install-app.sh <target-workspace-dir>`
2. Replace the example entries in `data/fixed-origins.json`
3. Verify `gog` access and app tests
4. Run the installed copy from the target workspace

## Reminder mode

Use reminder mode when the system needs to decide whether a calendar event deserves a travel reminder right now.

### Inputs
- calendar agenda JSON or live agenda command output
- current time
- lead minutes
- lookahead minutes
- reminder window minutes
- sent-state file path
- fixed-origins file path

### Flow
1. Load upcoming events.
2. Filter to the lookahead horizon.
3. Identify events that are due inside the reminder window.
4. Extract a usable physical destination from the event location.
5. Skip remote-only or weak destinations.
6. For each configured saved origin, compute live ETA and latest leave time when available.
7. Build navigation links.
8. Check dedupe state.
9. Return due reminders plus skipped reasons.
10. Persist sent-state only when not in dry-run mode.

### Good reminder output
Keep it short and actionable:
- meeting summary
- how long remains
- destination
- per-origin commute line, for example `from home` and `from office`
- latest leave time for each origin when available
- navigation link

### Healthy reminder outcomes
- reminder sent
- no reminder due
- skipped because destination is weak
- skipped because already sent

`No reminder due` is a normal success case.

## Trip mode

Use trip mode when the user asks for ETA, leave time, or route guidance.

### Inputs
- origin text or saved origin alias
- destination text or saved origin alias
- optional meeting start time
- routing provider

### Flow
1. Resolve origin through saved fixed origins first.
2. Resolve destination through saved fixed origins when applicable.
3. Normalize both locations into routable addresses.
4. Build fallback Google Maps and Waze links.
5. Fetch live routing if available.
6. Return ETA, no-traffic ETA, traffic delta, distance, and leave time when possible.
7. If live routing fails, return a truthful fallback status instead of invented numbers.

## Fixed origins

Each saved origin should carry:
- id
- label
- aliases
- raw address
- derived Google Maps search link

Only create durable origins after user confirmation.
Do not ship personal addresses inside the package.

## Failure handling

### Destination extraction failure
Report that the meeting location is not navigable enough yet.

### Geocoding failure
Report which side failed, origin or destination, and preserve fallback links if possible.

### Routing failure
Return `live-eta-unavailable` style status and avoid fake certainty.

If one saved origin fails and another succeeds, keep the successful origin in the reminder and mark only the failed one as unavailable.

### Delivery failure
Separate a delivery problem from a reminder-selection problem. The selection logic may still be correct even when the message did not land.
