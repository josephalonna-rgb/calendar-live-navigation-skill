import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildGoogleMapsDirectionsUrl,
  buildGoogleMapsSearchUrl,
  buildWazeLink,
  calculateLeaveAt,
  evaluateEvents,
  extractDestination,
  getRoutingProvider,
  loadFixedOrigins,
  loadState,
  markSent,
  normalizePlaceInput,
  parseArgs,
  reminderWindow,
  resolveFixedOrigin,
  runCheck,
  runOriginsSave,
  runTrip,
  saveState,
  shapeWazeRoute,
  stableEventKey,
} from '../src/index.js';

const FIXED_NOW = new Date('2026-04-13T07:00:00.000Z');

function makeEvent(overrides = {}) {
  return {
    calendar: 'primary',
    summary: 'Drive to meeting',
    start: '2026-04-13T07:45:00.000Z',
    end: '2026-04-13T08:30:00.000Z',
    location: '300 Destination Road, Example City',
    ...overrides,
  };
}

function makeFixedOriginsFile() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'calendar-waze-reminder-origins-'));
  const fixedOriginsPath = path.join(tempDir, 'fixed-origins.json');
  fs.writeFileSync(fixedOriginsPath, JSON.stringify({
    user: 'Test User',
    updatedAt: '2026-04-13T08:27:00.000Z',
    origins: [
      {
        id: 'home',
        label: 'Home',
        aliases: ['home'],
        address: '100 Home Street, Example City',
      },
      {
        id: 'office',
        label: 'Office',
        aliases: ['office', 'hq'],
        address: '200 Office Avenue, Example City',
      },
    ],
  }, null, 2));
  return fixedOriginsPath;
}

test('buildWazeLink encodes destination', () => {
  assert.equal(
    buildWazeLink('300 Destination Road, Example City'),
    'https://waze.com/ul?q=300%20Destination%20Road%2C%20Example%20City&navigate=yes',
  );
});

test('buildGoogleMaps helpers encode addresses', () => {
  assert.equal(
    buildGoogleMapsSearchUrl('200 Office Avenue, Example City'),
    'https://www.google.com/maps/search/?api=1&query=200%20Office%20Avenue%2C%20Example%20City',
  );
  assert.match(
    buildGoogleMapsDirectionsUrl('100 Home Street, Example City', '200 Office Avenue, Example City'),
    /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&origin=/,
  );
});

test('extractDestination skips remote-only locations', () => {
  assert.deepEqual(extractDestination('https://meet.google.com/abc-defg-hij'), {
    destination: null,
    reason: 'remote-or-unusable-location',
  });
});

test('extractDestination rejects room-only locations', () => {
  assert.deepEqual(extractDestination('TLV Office-30-3010 Meeting Room (32)'), {
    destination: null,
    reason: 'unusable-location',
  });
});

test('extractDestination picks first usable physical destination after remote token', () => {
  assert.deepEqual(
    extractDestination('https://zoom.us/j/12345, 400 Alternate Route, Example City'),
    { destination: '400 Alternate Route, Example City', reason: null },
  );
});

test('reminderWindow only triggers inside configured lead window', () => {
  const due = reminderWindow(new Date('2026-04-13T07:45:00.000Z'), {
    leadMinutes: 45,
    lookaheadMinutes: 180,
    windowMinutes: 5,
  }, FIXED_NOW);
  const early = reminderWindow(new Date('2026-04-13T08:00:00.000Z'), {
    leadMinutes: 45,
    lookaheadMinutes: 180,
    windowMinutes: 5,
  }, FIXED_NOW);

  assert.equal(due.isDue, true);
  assert.equal(early.isDue, false);
});

test('evaluateEvents returns due reminders and skips invalid destinations', () => {
  const result = evaluateEvents([
    makeEvent(),
    makeEvent({ summary: 'Zoom meeting', location: 'https://zoom.us/j/123' }),
  ], {
    leadMinutes: 45,
    lookaheadMinutes: 180,
    windowMinutes: 5,
  }, FIXED_NOW, { sent: {} });

  assert.equal(result.due.length, 1);
  assert.equal(result.due[0].destination, '300 Destination Road, Example City');
  assert.equal(result.skipped[0].reason, 'remote-or-unusable-location');
});

test('dedupe blocks repeat reminders for same event', () => {
  const event = makeEvent();
  const eventKey = stableEventKey(event);
  const state = { sent: { [eventKey]: { sentAt: FIXED_NOW.toISOString() } } };
  const result = evaluateEvents([event], {
    leadMinutes: 45,
    lookaheadMinutes: 180,
    windowMinutes: 5,
  }, FIXED_NOW, state);

  assert.equal(result.due.length, 0);
  assert.equal(result.skipped[0].reason, 'already-sent');
});

test('state round-trip persists sent reminders', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'calendar-waze-reminder-'));
  const statePath = path.join(tempDir, 'sent-reminders.json');
  const reminder = {
    event: makeEvent(),
    eventKey: stableEventKey(makeEvent()),
    destination: '300 Destination Road, Example City',
    wazeUrl: buildWazeLink('300 Destination Road, Example City'),
  };

  const nextState = markSent({ sent: {} }, [reminder], FIXED_NOW);
  saveState(statePath, nextState);
  const loaded = loadState(statePath);

  assert.deepEqual(loaded, nextState);
});

test('parseArgs supports reminder and navigation flags', () => {
  const options = parseArgs([
    'trip',
    '--dry-run',
    '--json',
    '--fixed-origins-path', './tmp/fixed-origins.json',
    '--origin', 'home',
    '--destination', 'office',
    '--provider', 'waze-live',
  ]);
  assert.equal(options.command, 'trip');
  assert.equal(options.dryRun, true);
  assert.equal(options.json, true);
  assert.match(options.fixedOriginsPath, /tmp\/fixed-origins\.json$/);
  assert.equal(options.origin, 'home');
  assert.equal(options.destination, 'office');
});

test('runCheck supports agenda-file and dry-run JSON flow', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'calendar-waze-reminder-'));
  const agendaPath = path.join(tempDir, 'agenda.json');
  const statePath = path.join(tempDir, 'state.json');
  const fixedOriginsPath = makeFixedOriginsFile();
  const agenda = {
    count: 2,
    events: [
      makeEvent(),
      makeEvent({ summary: 'Remote sync', location: 'https://meet.google.com/abc-defg-hij' }),
    ],
  };

  fs.writeFileSync(agendaPath, JSON.stringify(agenda, null, 2));

  const output = await runCheck({
    command: 'check',
    leadMinutes: 45,
    lookaheadMinutes: 180,
    windowMinutes: 5,
    dryRun: true,
    json: true,
    statePath,
    agendaFile: agendaPath,
    fixedOriginsPath,
    now: FIXED_NOW.toISOString(),
    provider: 'placeholder',
  });

  assert.equal(output.counts.due, 1);
  assert.equal(output.counts.skipped, 1);
  assert.equal(fs.existsSync(statePath), false);
  assert.match(output.due[0].wazeUrl, /^https:\/\/waze\.com\/ul\?/);
  assert.deepEqual(output.due[0].routeOrder, ['home', 'office']);
  assert.equal(output.due[0].routes.home.status, 'no-live-eta');
  assert.equal(output.due[0].routes.home.etaMinutes, null);
  assert.equal(output.due[0].routes.office.status, 'no-live-eta');
  assert.match(output.due[0].text, /From Home: ETA unavailable/);
});

test('runCheck adds live route estimates for home and office to due reminders', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'calendar-waze-reminder-'));
  const agendaPath = path.join(tempDir, 'agenda.json');
  const statePath = path.join(tempDir, 'state.json');
  const fixedOriginsPath = makeFixedOriginsFile();
  fs.writeFileSync(agendaPath, JSON.stringify({ count: 1, events: [makeEvent()] }, null, 2));

  const output = await runCheck({
    command: 'check',
    leadMinutes: 45,
    lookaheadMinutes: 180,
    windowMinutes: 5,
    dryRun: true,
    json: true,
    statePath,
    agendaFile: agendaPath,
    fixedOriginsPath,
    now: FIXED_NOW.toISOString(),
    provider: 'waze-live',
    fetchImpl: async (url) => {
      const href = String(url);

      if (href.startsWith('https://nominatim.openstreetmap.org/search')) {
        const parsed = new URL(href);
        const q = parsed.searchParams.get('q');
        const map = {
          '100 Home Street, Example City': [{ lat: '32.0600', lon: '34.8700', display_name: 'Home' }],
          '200 Office Avenue, Example City': [{ lat: '32.0651', lon: '34.7852', display_name: 'Office' }],
          '300 Destination Road, Example City': [{ lat: '32.0727', lon: '34.7868', display_name: 'Destination' }],
        };
        return new Response(JSON.stringify(map[q] || []), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      if (href.startsWith('https://routing-livemap-il.waze.com/RoutingManager/routingRequest')) {
        const parsed = new URL(href);
        const from = parsed.searchParams.get('from') || '';
        const route = from.includes('34.87')
          ? {
            totalRouteTime: 1440,
            totalRouteTimeWithoutRealtime: 1200,
            results: [{ length: 7200 }],
          }
          : {
            totalRouteTime: 720,
            totalRouteTimeWithoutRealtime: 660,
            results: [{ length: 3100 }],
          };
        return new Response(JSON.stringify({ response: route }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      throw new Error(`Unexpected URL: ${href}`);
    },
  });

  assert.deepEqual(output.due[0].routeOrder, ['home', 'office']);
  assert.equal(output.due[0].routes.home.status, 'ok');
  assert.equal(output.due[0].routes.home.etaMinutes, 24);
  assert.equal(output.due[0].routes.home.leaveAt, '2026-04-13T07:24:00.000Z');
  assert.equal(output.due[0].routes.office.status, 'ok');
  assert.equal(output.due[0].routes.office.etaMinutes, 12);
  assert.equal(output.due[0].routes.office.leaveAt, '2026-04-13T07:12:00.000Z');
  assert.match(output.due[0].text, /From Home: 24 min, leave by 07:24/);
  assert.match(output.due[0].text, /From Office: 12 min, leave by 07:12/);
});

test('runCheck keeps route fields truthful when one saved origin cannot be routed', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'calendar-waze-reminder-'));
  const agendaPath = path.join(tempDir, 'agenda.json');
  const statePath = path.join(tempDir, 'state.json');
  const fixedOriginsPath = makeFixedOriginsFile();
  fs.writeFileSync(agendaPath, JSON.stringify({ count: 1, events: [makeEvent()] }, null, 2));

  const output = await runCheck({
    command: 'check',
    leadMinutes: 45,
    lookaheadMinutes: 180,
    windowMinutes: 5,
    dryRun: true,
    json: true,
    statePath,
    agendaFile: agendaPath,
    fixedOriginsPath,
    now: FIXED_NOW.toISOString(),
    provider: 'waze-live',
    fetchImpl: async (url) => {
      const href = String(url);

      if (href.startsWith('https://nominatim.openstreetmap.org/search')) {
        const parsed = new URL(href);
        const q = parsed.searchParams.get('q');
        const map = {
          '100 Home Street, Example City': [{ lat: '32.0600', lon: '34.8700', display_name: 'Home' }],
          '300 Destination Road, Example City': [{ lat: '32.0727', lon: '34.7868', display_name: 'Destination' }],
        };
        return new Response(JSON.stringify(map[q] || []), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      if (href.startsWith('https://routing-livemap-il.waze.com/RoutingManager/routingRequest')) {
        return new Response(JSON.stringify({
          response: {
            totalRouteTime: 900,
            totalRouteTimeWithoutRealtime: 780,
            results: [{ length: 4200 }],
          },
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      throw new Error(`Unexpected URL: ${href}`);
    },
  });

  assert.equal(output.due[0].routes.home.status, 'ok');
  assert.equal(output.due[0].routes.home.etaMinutes, 15);
  assert.equal(output.due[0].routes.office.status, 'geocode-failed');
  assert.equal(output.due[0].routes.office.etaMinutes, null);
  assert.equal(output.due[0].routes.office.leaveAt, null);
  assert.match(output.due[0].text, /From Office: ETA unavailable/);
});

test('loadFixedOrigins normalizes google maps links and aliases', () => {
  const fixedOriginsPath = makeFixedOriginsFile();
  const loaded = loadFixedOrigins(fixedOriginsPath);

  assert.equal(loaded.origins.length, 2);
  assert.equal(loaded.origins[0].id, 'home');
  assert.match(loaded.origins[0].googleMapsUrl, /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=/);
  assert.deepEqual(loaded.origins[0].aliases, ['home', 'Home']);
});

test('resolveFixedOrigin matches aliases and ids', () => {
  const fixedOrigins = loadFixedOrigins(makeFixedOriginsFile());

  assert.equal(resolveFixedOrigin('home', fixedOrigins).match.id, 'home');
  assert.equal(resolveFixedOrigin('hq', fixedOrigins).match.id, 'office');
  assert.equal(resolveFixedOrigin('unknown', fixedOrigins).reason, 'not-found');
});

test('normalizePlaceInput resolves saved origins before treating values as raw addresses', () => {
  const fixedOrigins = loadFixedOrigins(makeFixedOriginsFile());

  const saved = normalizePlaceInput('office', { fixedOrigins, kind: 'origin' });
  const raw = normalizePlaceInput('300 Destination Road, Example City', { fixedOrigins, kind: 'destination' });

  assert.equal(saved.type, 'fixed-origin');
  assert.equal(saved.normalizedText, '200 Office Avenue, Example City');
  assert.equal(saved.assumedFromFixedOrigins, true);
  assert.equal(raw.type, 'freeform-address');
  assert.equal(raw.assumedFromFixedOrigins, false);
});

test('runOriginsSave persists a durable fixed origin entry', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'calendar-waze-reminder-'));
  const fixedOriginsPath = path.join(tempDir, 'fixed-origins.json');
  fs.writeFileSync(fixedOriginsPath, JSON.stringify({ user: 'Test User', origins: [] }, null, 2));

  const output = runOriginsSave({
    fixedOriginsPath,
    label: 'Parents',
    address: '500 Parent Avenue, Example City',
    aliases: ['parents', 'family'],
    dryRun: false,
  });

  const saved = loadFixedOrigins(fixedOriginsPath);
  assert.equal(output.saved.id, 'parents');
  assert.equal(saved.origins.length, 1);
  assert.equal(saved.origins[0].address, '500 Parent Avenue, Example City');
  assert.match(saved.origins[0].googleMapsUrl, /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=/);
});

test('runTrip resolves fixed origins and returns truthful placeholder routing output', async () => {
  const fixedOriginsPath = makeFixedOriginsFile();
  const output = await runTrip({
    fixedOriginsPath,
    origin: 'home',
    destination: 'office',
    provider: 'placeholder',
    now: FIXED_NOW.toISOString(),
  });

  assert.equal(output.origin.type, 'fixed-origin');
  assert.equal(output.destination.type, 'fixed-origin');
  assert.equal(output.routing.status, 'no-live-eta');
  assert.equal(output.routing.etaMinutes, null);
  assert.match(output.routing.links.googleMapsDirectionsUrl, /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&origin=/);
});

test('shapeWazeRoute derives ETA, distance and leaveAt from route payload', () => {
  const shaped = shapeWazeRoute({
    totalRouteTime: 1260,
    totalRouteTimeWithoutRealtime: 900,
    results: [
      { length: 1500 },
      { length: 3400 },
    ],
  }, FIXED_NOW);

  assert.equal(shaped.status, 'ok');
  assert.equal(shaped.supportsLiveTraffic, true);
  assert.equal(shaped.etaMinutes, 21);
  assert.equal(shaped.etaWithoutTrafficMinutes, 15);
  assert.equal(shaped.trafficDeltaMinutes, 6);
  assert.equal(shaped.distanceKm, 4.9);
  assert.equal(shaped.leaveAt, '2026-04-13T07:21:00.000Z');
});

test('calculateLeaveAt returns null without ETA', () => {
  assert.equal(calculateLeaveAt(FIXED_NOW, null), null);
});

test('waze-live provider returns live ETA when geocoding and routing succeed', async () => {
  const provider = getRoutingProvider('waze-live');
  const calls = [];
  const fetchImpl = async (url) => {
    const href = String(url);
    calls.push(href);

    if (href.startsWith('https://nominatim.openstreetmap.org/search')) {
      const parsed = new URL(href);
      const q = parsed.searchParams.get('q');
      const map = {
        '100 Home Street, Example City': [{ lat: '32.0600', lon: '34.8700', display_name: 'Home' }],
        '200 Office Avenue, Example City': [{ lat: '32.0651', lon: '34.7852', display_name: 'Office' }],
      };
      return new Response(JSON.stringify(map[q] || []), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    if (href.startsWith('https://routing-livemap-il.waze.com/RoutingManager/routingRequest')) {
      return new Response(JSON.stringify({
        response: {
          totalRouteTime: 1500,
          totalRouteTimeWithoutRealtime: 1200,
          results: [
            { length: 1000 },
            { length: 2500 },
          ],
        },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    throw new Error(`Unexpected URL: ${href}`);
  };

  const output = await provider.estimateTrip({
    origin: normalizePlaceInput('100 Home Street, Example City', { fixedOrigins: { origins: [] }, kind: 'origin' }),
    destination: normalizePlaceInput('200 Office Avenue, Example City', { fixedOrigins: { origins: [] }, kind: 'destination' }),
    now: FIXED_NOW,
    fetchImpl,
  });

  assert.equal(output.status, 'ok');
  assert.equal(output.etaMinutes, 25);
  assert.equal(output.etaWithoutTrafficMinutes, 20);
  assert.equal(output.trafficDeltaMinutes, 5);
  assert.equal(output.distanceKm, 3.5);
  assert.equal(output.leaveAt, '2026-04-13T07:25:00.000Z');
  assert.match(output.links.wazeDestinationUrl, /^https:\/\/waze\.com\/ul\?/);
  assert.equal(calls.filter((href) => href.startsWith('https://nominatim.openstreetmap.org/search')).length, 2);
  assert.equal(calls.filter((href) => href.startsWith('https://routing-livemap-il.waze.com/RoutingManager/routingRequest')).length, 1);
});

test('waze-live provider fails gracefully when geocoding cannot resolve a place', async () => {
  const fixedOriginsPath = makeFixedOriginsFile();
  const output = await runTrip({
    fixedOriginsPath,
    origin: 'home',
    destination: 'unknown place 12345',
    provider: 'waze-live',
    now: FIXED_NOW.toISOString(),
    fetchImpl: async (url) => {
      const href = String(url);
      const parsed = new URL(href);
      const q = parsed.searchParams.get('q');
      const body = q === '100 Home Street, Example City'
        ? [{ lat: '32.0600', lon: '34.8700', display_name: 'Home' }]
        : [];
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  assert.equal(output.routing.status, 'geocode-failed');
  assert.equal(output.routing.etaMinutes, null);
  assert.equal(output.routing.failures.length, 1);
  assert.equal(output.routing.failures[0].reason, 'geocode-no-match');
});

test('runTrip uses waze-live by default', async () => {
  const fixedOriginsPath = makeFixedOriginsFile();
  const output = await runTrip({
    fixedOriginsPath,
    origin: 'home',
    destination: 'office',
    now: FIXED_NOW.toISOString(),
    fetchImpl: async (url) => {
      const href = String(url);
      if (href.startsWith('https://nominatim.openstreetmap.org/search')) {
        const parsed = new URL(href);
        const q = parsed.searchParams.get('q');
        const map = {
          '100 Home Street, Example City': [{ lat: '32.0600', lon: '34.8700', display_name: 'Home' }],
          '200 Office Avenue, Example City': [{ lat: '32.0651', lon: '34.7852', display_name: 'Office' }],
        };
        return new Response(JSON.stringify(map[q] || []), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({
        response: {
          totalRouteTime: 600,
          totalRouteTimeWithoutRealtime: 540,
          results: [{ length: 2200 }],
        },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  assert.equal(output.provider, 'waze-live');
  assert.equal(output.routing.status, 'ok');
  assert.equal(output.routing.etaMinutes, 10);
});
