# calendar-live-navigation-skill

Portable **OpenClaw skill package** for calendar-driven travel reminders and live ETA answers.

This repo is no longer just a playbook. It now includes the runnable helper app, generic template data, install/bootstrap scripts, and packaged artifacts so another agent can install and operate it from the repo alone.

## What this package is for
Use `calendar-live-navigation` when an agent needs to:
- send driving reminders before meetings
- inspect why a reminder did or did not fire
- answer ETA questions from saved origins like `home` and `office`
- compute leave time for a meeting with a physical destination
- compare commute time from multiple saved origins
- debug calendar extraction, routing, dedupe, or cron issues

## What is included

### Skill source
- `calendar-live-navigation/SKILL.md`
- `calendar-live-navigation/references/*`

### Bundled runnable app
- `calendar-live-navigation/assets/calendar-navigation-app/`
  - `src/index.js`
  - `test/index.test.js`
  - `package.json`
  - `README.md`
  - `data/templates/*.json`

### Helper scripts
- `calendar-live-navigation/scripts/install-app.sh`
- `calendar-live-navigation/scripts/bootstrap-app.sh`
- `calendar-live-navigation/scripts/package-skill.sh`
- `calendar-live-navigation/scripts/validate-package.sh`

### Packaged artifacts
- `calendar-live-navigation.skill`
- `calendar-live-navigation.zip`

## Repo layout

```text
calendar-live-navigation-skill/
├── README.md
├── calendar-live-navigation.skill
├── calendar-live-navigation.zip
└── calendar-live-navigation/
    ├── SKILL.md
    ├── assets/
    │   └── calendar-navigation-app/
    │       ├── README.md
    │       ├── data/
    │       │   └── templates/
    │       ├── package.json
    │       ├── src/
    │       └── test/
    ├── references/
    └── scripts/
```

## Install into another workspace

Clone the repo, then run:

```bash
./calendar-live-navigation/scripts/install-app.sh /path/to/workspace
```

That will:
- copy the bundled app into `/path/to/workspace/calendar-navigation-app`
- create writable data files from the generic templates
- print the next commands to run

## Bootstrap and configure

After install:

1. Open `/path/to/workspace/calendar-navigation-app/data/fixed-origins.json`
2. Replace the example `home` and `office` entries with real user-confirmed addresses
3. Keep `sent-reminders.json` and `sent-reminders-whatsapp.json` as local writable state files
4. Confirm Google Calendar access works through `gog`

## Required environment
- Node.js 20+
- `gog` CLI with Google Calendar auth for live agenda reads
- outbound network access for live geocoding and Waze routing when using live ETA

## Basic operation

From the installed app directory:

```bash
npm test
node src/index.js check --dry-run --json
node src/index.js origins-list --json
node src/index.js origins-save --label "Home" --address "123 Real Street, Real City" --json
node src/index.js trip --origin home --destination office --json
```

## Rebuild the package artifacts

```bash
./calendar-live-navigation/scripts/package-skill.sh
```

## Validate the package

```bash
./calendar-live-navigation/scripts/validate-package.sh
```

Validation covers:
- required package files exist
- install/bootstrap into a temp workspace succeeds
- the installed app test suite passes
- packaged `.skill` and `.zip` contain the bundled app and scripts

## Generic by design
This repo intentionally contains:
- no personal calendar ids
- no private addresses
- no owner-specific state
- no private chat ids
- no personal email addresses

It ships only the reusable **calendar navigation pattern** plus generic starter templates.

## What another agent needs after getting the repo link
1. Clone or download the repo
2. Install the app into its workspace with `scripts/install-app.sh`
3. Replace the example fixed origins with real user-confirmed places
4. Make sure `gog` auth works in that environment
5. Run the installed app commands or cron wrapper prompts described in `SKILL.md`
