# calendar-live-navigation-skill

```text
  ____    _    _     _____ _   _ ____    _    ____  
 / ___|  / \  | |   | ____| \ | |  _ \  / \  / ___| 
| |     / _ \ | |   |  _| |  \| | | | |/ _ \\___ \ 
| |___ / ___ \| |___| |___| |\  | |_| / ___ \___) |
 \____/_/   \_\_____|_____|_| \_|____/_/   \_\____/ 

 _     _____     _______   _   _    ___     ___    _  _____ ___ ___  _   _ 
| |   |_ _\ \   / / ____| | \ | |  / \ \   / / |  / \|_   _|_ _/ _ \| \ | |
| |    | | \ \ / /|  _|   |  \| | / _ \\ \ / /| | / _ \ | |  | | | | |  \| |
| |___ | |  \ V / | |___  | |\  |/ ___ \\ V / | |/ ___ \| |  | | |_| | |\  |
|_____|___|  \_/  |_____| |_| \_/_/   \_\\_/  |_____/_/   \_\_| |___/|_| \_|

       .-""-.
      / .--. \
     / /    \ \
     | |    | |
     | |.-""-.|
    ///`.::::.`\\\
   ||| ::/  \:: ;||
   ||; ::\__/:: ;||
    \\\ '::::' ///
     `=':-..-'`
        Joseph
```

Reusable **OpenClaw skill** for calendar-driven travel reminders and live ETA answers.

This repo packages a generic workflow for an agent that needs to:
- read upcoming calendar events
- extract usable physical destinations
- dedupe reminder sends
- resolve saved origins like `home` and `office`
- answer `when should I leave` with live routing when available
- drive cron-based reminder delivery without making things up

## What this skill is for
Use `calendar-live-navigation` when an agent needs to:
- send driving reminders before meetings
- inspect why a meeting reminder did or did not fire
- answer ETA questions from saved origins
- compute leave time for a meeting with a physical destination
- debug calendar extraction, routing, dedupe, or cron issues

## Workflow, in one picture

```text
Calendar events or trip question
              |
              v
+-------------------------------+
| Reminder mode or trip mode?   |
+-------------------------------+
      |                     |
      v                     v
+------------------+   +----------------------+
| Reminder mode    |   | Trip mode            |
| due right now?   |   | origin -> destination|
+------------------+   +----------------------+
      |                     |
      v                     v
+------------------+   +----------------------+
| Extract usable   |   | Resolve fixed origins|
| physical place   |   | first                |
+------------------+   +----------------------+
      |                     |
      v                     v
+------------------+   +----------------------+
| Weak destination?|   | Build fallback links |
+------------------+   +----------------------+
      |                     |
   yes | no                  v
      v                +----------------------+
+------------------+   | Fetch live ETA if    |
| Skip honestly    |   | available            |
+------------------+   +----------------------+
      |                     |
      v                     v
+------------------+   +----------------------+
| Check dedupe     |   | Return ETA or        |
| state            |   | truthful fallback    |
+------------------+   +----------------------+
      |
      v
+------------------+
| Send reminder or |
| return NO_REPLY  |
+------------------+
```

## What is included

### Skill source
- `calendar-live-navigation/SKILL.md`
  - main operating instructions
  - reminder vs trip workflow
  - fixed-origin rules
  - debugging order

### References
- `calendar-live-navigation/references/reminder-and-trip-workflow.md`
  - the full reminder and trip execution pattern
  - fixed-origin data expectations
  - failure handling guidance
- `calendar-live-navigation/references/cron-prompt-patterns.md`
  - reusable cron prompt templates
  - timeout and delivery notes

### Packaged artifacts
- `calendar-live-navigation.skill`
  - packaged skill artifact
- `calendar-live-navigation.zip`
  - zip export for easy sharing

## Principles baked into the skill
- **Do not fake ETA**
- **Skip weak destinations instead of sending junk links**
- **Resolve saved origins before guessing**
- **Treat no reminder due as success**
- **Separate selection bugs from delivery bugs**
- **Keep cron workers thin and deterministic**

## Example triggers
This skill should trigger on asks like:
- `send me navigation reminders before meetings`
- `why did this calendar reminder not fire`
- `how long from home to office right now`
- `when should I leave for this meeting`
- `turn calendar events into Waze reminders`

## Repo layout

```text
calendar-live-navigation-skill/
├── README.md
├── calendar-live-navigation.skill
├── calendar-live-navigation.zip
└── calendar-live-navigation/
    ├── SKILL.md
    └── references/
        ├── cron-prompt-patterns.md
        └── reminder-and-trip-workflow.md
```

## Generic by design
This repo intentionally contains:
- no personal calendar ids
- no private addresses
- no account-specific credentials
- no private chat ids
- no owner-specific rules

It captures the reusable **calendar navigation pattern**, not my personal config.
