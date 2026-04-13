# Calendar Navigation App

Portable Node.js CLI for calendar-driven travel reminders and live ETA checks.

This app is bundled inside the `calendar-live-navigation` skill package so another agent can install it into a workspace and operate it locally.

## What it does
- reads upcoming calendar events via `gog calendar +agenda --format json`
- finds events that are due for a travel reminder
- extracts usable physical destinations
- generates Waze and Google Maps links
- stores local dedupe state so the same reminder is not sent twice
- resolves saved fixed origins like `home` and `office`
- answers `trip` requests with live ETA when routing is available

## Included data templates
The packaged app ships with generic templates under `data/templates/`:
- `fixed-origins.template.json`
- `sent-reminders.template.json`
- `sent-reminders-whatsapp.template.json`

Run the skill bootstrap script after install to create writable live files in `data/`.

## Requirements
- Node.js 20+
- `gog` CLI with Google Calendar access for live agenda reads
- outbound network access for live geocoding and Waze routing when using `trip` or reminder ETA enrichment

## Usage
From an installed app directory:

```bash
npm test
node src/index.js check --dry-run --json
node src/index.js origins-list --json
node src/index.js origins-resolve --query home --json
node src/index.js trip --origin home --destination office --json
```

## Commands

### `check`
Reads the agenda, filters due events, and emits reminder candidates.

```bash
node src/index.js check --dry-run --json --lead-minutes 30 --lookahead-minutes 120
```

### `origins-list`
Lists saved fixed origins.

```bash
node src/index.js origins-list --json
```

### `origins-resolve`
Resolves a saved origin label, alias, or id.

```bash
node src/index.js origins-resolve --query office --json
```

### `origins-save`
Adds or updates a saved fixed origin.

```bash
node src/index.js origins-save \
  --label "Parents" \
  --address "500 Parent Avenue, Example City" \
  --alias parents \
  --json
```

### `trip`
Resolves the origin and destination, builds fallback links, and returns live ETA when available.

```bash
node src/index.js trip --origin home --destination office --json
node src/index.js trip --origin home --destination "300 Destination Road, Example City" --json
```

## Main shared flags
- `--lead-minutes <n>` default `45`
- `--lookahead-minutes <n>` default `180`
- `--window-minutes <n>` default `5`
- `--state-path <path>` default `./data/sent-reminders.json`
- `--fixed-origins-path <path>` default `./data/fixed-origins.json`
- `--dry-run` do not write state
- `--json` emit machine-readable output
- `--agenda-file <path>` use local JSON instead of calling `gog`
- `--now <iso>` override current time for tests and debugging

## Fixed origins template shape

```json
{
  "id": "home",
  "label": "Home",
  "aliases": ["home"],
  "address": "123 Example Street, Example City",
  "googleMapsUrl": "https://www.google.com/maps/search/?api=1&query=123%20Example%20Street%2C%20Example%20City"
}
```

## Notes
- This package intentionally contains only generic template data.
- Replace the example fixed origins with real user-confirmed places after install.
- If live routing fails, the app returns a truthful fallback status and still includes navigation links when possible.
