# Cron Prompt Patterns

Use a cron agent turn only as a thin wrapper around the installed local helper app.

## Before wiring cron

Install and bootstrap the app first:

```text
./calendar-live-navigation/scripts/install-app.sh /path/to/workspace
```

Then run cron commands from the installed app directory, not from the read-only packaged asset copy.

## Telegram reminder prompt

```text
Run the local calendar navigation reminder app and decide whether a reminder is due.

Steps:
1. Run the local check command with JSON output.
2. Parse the JSON output.
3. If there are no due reminders, reply exactly NO_REPLY.
4. If there are due reminders, return a short user-facing message.
5. For each due reminder, include:
   - meeting summary
   - minutes remaining
   - destination
   - ETA from home
   - latest leave time from home
   - ETA from office
   - latest leave time from office
   - navigation link
6. Keep it concise and useful.
7. Do not use the message tool yourself. The cron runner owns delivery.

Output rules:
- If nothing is due: NO_REPLY
- If something is due: plain text only
```

## WhatsApp reminder prompt

```text
Run the local calendar navigation reminder app and decide whether a reminder is due for WhatsApp delivery.

Steps:
1. Run the local check command with JSON output and the WhatsApp-specific state file.
2. Parse the JSON output.
3. If there are no due reminders, reply exactly NO_REPLY.
4. If there are due reminders, return a short user-facing message.
5. For each due reminder, include:
   - meeting summary
   - minutes remaining
   - destination
   - ETA from home
   - latest leave time from home
   - ETA from office
   - latest leave time from office
   - navigation link
6. Keep it concise and useful.
7. Do not use the message tool yourself. The cron runner owns delivery.

Output rules:
- If nothing is due: NO_REPLY
- If something is due: plain text only
```

## Operational notes

- Run every 5 minutes unless the use case clearly needs a different cadence.
- Use a timeout that leaves headroom for calendar fetch plus routing, not a razor-thin timeout.
- Keep Telegram and WhatsApp state files separate so dedupe stays channel-specific when needed.
- If a run times out, inspect timeout budget separately from reminder logic.
- Keep the app responsible for structured route computation, and keep the cron prompt responsible only for concise wording.
