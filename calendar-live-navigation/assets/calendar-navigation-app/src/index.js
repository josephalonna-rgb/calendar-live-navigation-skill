import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const DEFAULT_STATE_PATH = path.join(ROOT, 'data', 'sent-reminders.json');
const DEFAULT_FIXED_ORIGINS_PATH = path.join(ROOT, 'data', 'fixed-origins.json');

const DEFAULTS = {
  command: 'check',
  leadMinutes: 45,
  lookaheadMinutes: 180,
  windowMinutes: 5,
  dryRun: false,
  json: false,
  statePath: DEFAULT_STATE_PATH,
  agendaFile: null,
  now: null,
  fixedOriginsPath: DEFAULT_FIXED_ORIGINS_PATH,
  origin: null,
  destination: null,
  label: null,
  address: null,
  aliases: [],
  id: null,
  query: null,
  provider: 'waze-live',
};

const WAZE_ROUTING_URL = 'https://routing-livemap-il.waze.com/RoutingManager/routingRequest';
const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
const DEFAULT_USER_AGENT = 'calendar-navigation-app/1.0';
const REMINDER_ROUTE_ORIGIN_IDS = ['home', 'office'];

const REMOTE_HINTS = [
  'zoom',
  'meet.google.com',
  'google meet',
  'teams',
  'microsoft teams',
  'webex',
  'hangout',
  'remote',
  'virtual',
  'phone call',
  'conference call',
  'video call',
  'call in',
  'dial in',
  'online',
  'webinar',
];

const UNUSABLE_HINTS = [
  'meeting room',
  'boardroom',
  'conference room',
  'classroom',
  'floor',
  'room',
  'office hour',
  'focus time',
  'tentative',
];

function parseArgs(argv) {
  const options = { ...DEFAULTS, aliases: [] };
  const args = [...argv];

  if (args[0] && !args[0].startsWith('--')) {
    options.command = args.shift();
  }

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const next = args[i + 1];

    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--lead-minutes') {
      options.leadMinutes = Number(next);
      i += 1;
    } else if (arg === '--lookahead-minutes') {
      options.lookaheadMinutes = Number(next);
      i += 1;
    } else if (arg === '--window-minutes') {
      options.windowMinutes = Number(next);
      i += 1;
    } else if (arg === '--state-path') {
      options.statePath = path.resolve(next);
      i += 1;
    } else if (arg === '--agenda-file') {
      options.agendaFile = path.resolve(next);
      i += 1;
    } else if (arg === '--now') {
      options.now = next;
      i += 1;
    } else if (arg === '--fixed-origins-path') {
      options.fixedOriginsPath = path.resolve(next);
      i += 1;
    } else if (arg === '--origin') {
      options.origin = next;
      i += 1;
    } else if (arg === '--destination') {
      options.destination = next;
      i += 1;
    } else if (arg === '--label') {
      options.label = next;
      i += 1;
    } else if (arg === '--address') {
      options.address = next;
      i += 1;
    } else if (arg === '--alias') {
      options.aliases.push(next);
      i += 1;
    } else if (arg === '--aliases') {
      options.aliases.push(...String(next).split(',').map((value) => value.trim()).filter(Boolean));
      i += 1;
    } else if (arg === '--id') {
      options.id = next;
      i += 1;
    } else if (arg === '--query') {
      options.query = next;
      i += 1;
    } else if (arg === '--provider') {
      options.provider = next;
      i += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isFinite(options.leadMinutes) || options.leadMinutes < 0) {
    throw new Error('leadMinutes must be a non-negative number');
  }
  if (!Number.isFinite(options.lookaheadMinutes) || options.lookaheadMinutes <= 0) {
    throw new Error('lookaheadMinutes must be a positive number');
  }
  if (!Number.isFinite(options.windowMinutes) || options.windowMinutes < 0) {
    throw new Error('windowMinutes must be a non-negative number');
  }

  return options;
}

function parseEventDate(value) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00.000Z`);
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function fetchAgenda(options = {}) {
  const raw = options.agendaFile
    ? fs.readFileSync(options.agendaFile, 'utf8')
    : execFileSync('gog', ['calendar', '+agenda', '--format', 'json'], { encoding: 'utf8' });

  return JSON.parse(raw);
}

function splitLocationParts(location = '') {
  return location
    .split(/[,;\n]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function looksLikeUrl(value = '') {
  return /^https?:\/\//i.test(value.trim());
}

function containsRemoteHint(value = '') {
  const normalized = value.toLowerCase();
  return REMOTE_HINTS.some((hint) => normalized.includes(hint));
}

function looksRoomOnly(value = '') {
  const normalized = value.toLowerCase().trim();
  if (!normalized) return true;
  if (/^(room|floor|meeting room|boardroom|conference room|classroom)\b/.test(normalized)) {
    return true;
  }
  if (/\b\d{1,2}(st|nd|rd|th)? floor\b/.test(normalized)) {
    return true;
  }
  return UNUSABLE_HINTS.some((hint) => normalized.includes(hint));
}

function looksUsableDestination(value = '') {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (looksLikeUrl(trimmed) || containsRemoteHint(trimmed) || looksRoomOnly(trimmed)) return false;
  if (trimmed.length < 6) return false;
  if (!/[a-zA-Z\u0590-\u05FF]/.test(trimmed)) return false;
  return true;
}

function extractDestination(location = '') {
  const normalized = location.trim();
  if (!normalized) {
    return { destination: null, reason: 'missing-location' };
  }

  const segments = normalized
    .split(/[;\n]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  let sawRemote = false;

  for (const segment of segments) {
    if (looksLikeUrl(segment) || containsRemoteHint(segment)) {
      sawRemote = true;
    }

    const commaParts = segment.split(',').map((part) => part.trim()).filter(Boolean);
    for (let size = Math.min(3, commaParts.length); size >= 1; size -= 1) {
      for (let start = 0; start <= commaParts.length - size; start += 1) {
        const candidateParts = commaParts.slice(start, start + size);
        if (candidateParts.some((part) => looksLikeUrl(part) || containsRemoteHint(part))) {
          sawRemote = true;
          continue;
        }
        const candidate = candidateParts.join(', ');
        if (looksUsableDestination(candidate)) {
          return { destination: candidate, reason: null };
        }
      }
    }
  }

  return { destination: null, reason: sawRemote ? 'remote-or-unusable-location' : 'unusable-location' };
}

function buildWazeLink(destination) {
  return `https://waze.com/ul?q=${encodeURIComponent(destination)}&navigate=yes`;
}

function buildGoogleMapsSearchUrl(address) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

function buildGoogleMapsDirectionsUrl(origin, destination) {
  const url = new URL('https://www.google.com/maps/dir/');
  url.searchParams.set('api', '1');
  url.searchParams.set('origin', origin);
  url.searchParams.set('destination', destination);
  url.searchParams.set('travelmode', 'driving');
  return url.toString();
}

function normalizeLookupValue(value = '') {
  return value
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function makeOriginId(label = '', fallback = 'origin') {
  const base = normalizeLookupValue(label)
    .replace(/[^a-z0-9\u0590-\u05FF ]/g, '')
    .replace(/\s+/g, '-');
  return base || fallback;
}

function normalizeFixedOrigin(origin) {
  const aliases = Array.from(new Set([
    ...(Array.isArray(origin.aliases) ? origin.aliases : []),
    origin.label,
    origin.id,
  ].filter(Boolean)));

  return {
    id: origin.id || makeOriginId(origin.label),
    label: origin.label || origin.id,
    aliases,
    address: origin.address,
    googleMapsUrl: origin.googleMapsUrl || buildGoogleMapsSearchUrl(origin.address),
  };
}

function loadFixedOrigins(fixedOriginsPath = DEFAULT_FIXED_ORIGINS_PATH) {
  if (!fs.existsSync(fixedOriginsPath)) {
    return { user: null, updatedAt: null, origins: [] };
  }

  const raw = JSON.parse(fs.readFileSync(fixedOriginsPath, 'utf8'));
  const origins = Array.isArray(raw.origins) ? raw.origins.map(normalizeFixedOrigin) : [];
  return {
    user: raw.user || null,
    updatedAt: raw.updatedAt || null,
    origins,
  };
}

function saveFixedOrigins(fixedOriginsPath, data) {
  fs.mkdirSync(path.dirname(fixedOriginsPath), { recursive: true });
  fs.writeFileSync(fixedOriginsPath, JSON.stringify({
    ...data,
    updatedAt: new Date().toISOString(),
  }, null, 2));
}

function resolveFixedOrigin(query, fixedOrigins) {
  if (!query) {
    return { match: null, reason: 'missing-query' };
  }

  const normalizedQuery = normalizeLookupValue(query);
  const exactMatches = fixedOrigins.origins.filter((origin) => {
    const values = [origin.id, origin.label, ...(origin.aliases || [])].map(normalizeLookupValue);
    return values.includes(normalizedQuery);
  });

  if (exactMatches.length === 1) {
    return { match: exactMatches[0], reason: null };
  }
  if (exactMatches.length > 1) {
    return { match: null, reason: 'ambiguous-query', candidates: exactMatches };
  }

  const partialMatches = fixedOrigins.origins.filter((origin) => {
    const values = [origin.id, origin.label, ...(origin.aliases || [])].map(normalizeLookupValue);
    return values.some((value) => value.includes(normalizedQuery) || normalizedQuery.includes(value));
  });

  if (partialMatches.length === 1) {
    return { match: partialMatches[0], reason: null };
  }
  if (partialMatches.length > 1) {
    return { match: null, reason: 'ambiguous-query', candidates: partialMatches };
  }

  return { match: null, reason: 'not-found' };
}

function upsertFixedOrigin(fixedOrigins, input) {
  const normalized = normalizeFixedOrigin({
    id: input.id || makeOriginId(input.label),
    label: input.label,
    aliases: input.aliases,
    address: input.address,
    googleMapsUrl: input.googleMapsUrl,
  });

  const existingIndex = fixedOrigins.origins.findIndex((origin) => origin.id === normalized.id);
  const nextOrigins = [...fixedOrigins.origins];

  if (existingIndex >= 0) {
    nextOrigins[existingIndex] = normalized;
  } else {
    nextOrigins.push(normalized);
  }

  return {
    ...fixedOrigins,
    origins: nextOrigins,
  };
}

function normalizePlaceInput(input, context = {}) {
  const trimmed = String(input || '').trim();
  if (!trimmed) {
    return { ok: false, reason: 'missing-input' };
  }

  const fixedOrigins = context.fixedOrigins || { origins: [] };
  const resolution = resolveFixedOrigin(trimmed, fixedOrigins);
  if (resolution.match) {
    return {
      ok: true,
      type: 'fixed-origin',
      source: context.kind === 'origin' ? 'saved-origin' : 'saved-place',
      input: trimmed,
      id: resolution.match.id,
      label: resolution.match.label,
      address: resolution.match.address,
      googleMapsUrl: resolution.match.googleMapsUrl,
      normalizedText: resolution.match.address,
      assumedFromFixedOrigins: true,
    };
  }

  if (looksLikeUrl(trimmed)) {
    return {
      ok: false,
      reason: 'url-not-supported',
      input: trimmed,
    };
  }

  return {
    ok: true,
    type: 'freeform-address',
    source: 'raw-input',
    input: trimmed,
    label: null,
    address: trimmed,
    googleMapsUrl: buildGoogleMapsSearchUrl(trimmed),
    normalizedText: trimmed,
    assumedFromFixedOrigins: false,
  };
}

function stableEventKey(event) {
  const basis = [event.calendar, event.summary, event.start, event.end, event.location].join('|');
  return crypto.createHash('sha1').update(basis).digest('hex');
}

function loadState(statePath = DEFAULT_STATE_PATH) {
  if (!fs.existsSync(statePath)) {
    return { sent: {} };
  }
  return JSON.parse(fs.readFileSync(statePath, 'utf8'));
}

function saveState(statePath, state) {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

function reminderWindow(eventStart, options, now) {
  const minutesUntilStart = Math.round((eventStart.getTime() - now.getTime()) / 60000);
  const lowerBound = Math.max(0, options.leadMinutes - options.windowMinutes);
  return {
    minutesUntilStart,
    isInLookahead: minutesUntilStart >= 0 && minutesUntilStart <= options.lookaheadMinutes,
    isDue: minutesUntilStart >= lowerBound && minutesUntilStart <= options.leadMinutes,
  };
}

function evaluateEvents(events, options = {}, now = new Date(), state = { sent: {} }) {
  const due = [];
  const skipped = [];

  for (const event of events) {
    const startDate = parseEventDate(event.start);
    if (!startDate) {
      skipped.push({ event, reason: 'invalid-start' });
      continue;
    }

    const window = reminderWindow(startDate, options, now);
    if (!window.isInLookahead) {
      skipped.push({ event, reason: 'outside-lookahead', minutesUntilStart: window.minutesUntilStart });
      continue;
    }
    if (!window.isDue) {
      skipped.push({ event, reason: 'not-due-yet', minutesUntilStart: window.minutesUntilStart });
      continue;
    }

    const extraction = extractDestination(event.location || '');
    if (!extraction.destination) {
      skipped.push({ event, reason: extraction.reason, minutesUntilStart: window.minutesUntilStart });
      continue;
    }

    const eventKey = stableEventKey(event);
    if (state.sent?.[eventKey]) {
      skipped.push({ event, reason: 'already-sent', minutesUntilStart: window.minutesUntilStart, eventKey });
      continue;
    }

    due.push({
      event,
      eventKey,
      destination: extraction.destination,
      wazeUrl: buildWazeLink(extraction.destination),
      minutesUntilStart: window.minutesUntilStart,
    });
  }

  return { due, skipped };
}

function markSent(state, reminders, sentAt = new Date()) {
  const nextState = { sent: { ...(state.sent || {}) } };
  for (const reminder of reminders) {
    nextState.sent[reminder.eventKey] = {
      sentAt: sentAt.toISOString(),
      summary: reminder.event.summary,
      start: reminder.event.start,
      destination: reminder.destination,
      wazeUrl: reminder.wazeUrl,
    };
  }
  return nextState;
}

function formatReminderText(reminder) {
  const lines = [
    `Leave in about ${reminder.minutesUntilStart} minutes for ${reminder.event.summary}: ${reminder.destination}`,
  ];

  const routeIds = Array.isArray(reminder.routeOrder)
    ? reminder.routeOrder
    : Object.keys(reminder.routes || {});

  for (const routeId of routeIds) {
    const route = reminder.routes?.[routeId];
    if (!route) continue;

    const originName = route.originLabel || routeId;
    if (Number.isFinite(route.etaMinutes) && route.leaveAt) {
      lines.push(`From ${originName}: ${route.etaMinutes} min, leave by ${formatClockTime(route.leaveAt)}`);
    } else {
      lines.push(`From ${originName}: ETA unavailable`);
    }
  }

  lines.push(reminder.wazeUrl);
  return lines.join('\n');
}

function formatClockTime(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(11, 16);
}

function summarizeOutput(result, options, now) {
  return {
    now: now.toISOString(),
    config: {
      leadMinutes: options.leadMinutes,
      lookaheadMinutes: options.lookaheadMinutes,
      windowMinutes: options.windowMinutes,
      dryRun: options.dryRun,
      statePath: options.statePath,
      agendaFile: options.agendaFile,
      fixedOriginsPath: options.fixedOriginsPath,
      provider: options.provider,
    },
    counts: {
      due: result.due.length,
      skipped: result.skipped.length,
    },
    due: result.due.map((reminder) => ({
      eventKey: reminder.eventKey,
      summary: reminder.event.summary,
      start: reminder.event.start,
      calendar: reminder.event.calendar,
      location: reminder.event.location,
      destination: reminder.destination,
      minutesUntilStart: reminder.minutesUntilStart,
      wazeUrl: reminder.wazeUrl,
      routeOrder: reminder.routeOrder || [],
      routes: reminder.routes || {},
      text: formatReminderText(reminder),
    })),
    skipped: result.skipped.map((item) => ({
      summary: item.event.summary,
      start: item.event.start,
      location: item.event.location,
      reason: item.reason,
      minutesUntilStart: item.minutesUntilStart,
    })),
  };
}

function buildRouteLinks(origin, destination) {
  return {
    googleMapsDirectionsUrl: buildGoogleMapsDirectionsUrl(origin.normalizedText, destination.normalizedText),
    wazeDestinationUrl: buildWazeLink(destination.normalizedText),
  };
}

function getReminderRouteOrigins(fixedOrigins, originIds = REMINDER_ROUTE_ORIGIN_IDS) {
  return originIds
    .map((originId) => fixedOrigins.origins.find((origin) => origin.id === originId))
    .filter(Boolean);
}

function shapeReminderRouteEstimate(origin, routing) {
  return {
    originLabel: origin.label,
    originAddress: origin.address,
    originGoogleMapsUrl: origin.googleMapsUrl,
    status: routing.status,
    etaMinutes: routing.etaMinutes ?? null,
    etaWithoutTrafficMinutes: routing.etaWithoutTrafficMinutes ?? null,
    trafficDeltaMinutes: routing.trafficDeltaMinutes ?? null,
    distanceKm: routing.distanceKm ?? null,
    checkedAt: routing.checkedAt ?? null,
    leaveAt: routing.leaveAt ?? null,
    note: routing.note || null,
    links: routing.links || null,
  };
}

async function attachReminderRouteEstimates(reminders, options, now) {
  if (!reminders.length) {
    return reminders;
  }

  const fixedOrigins = loadFixedOrigins(options.fixedOriginsPath);
  const reminderOrigins = getReminderRouteOrigins(fixedOrigins);
  if (!reminderOrigins.length) {
    return reminders.map((reminder) => ({
      ...reminder,
      routeOrder: [],
      routes: {},
    }));
  }

  const provider = getRoutingProvider(options.provider);

  return Promise.all(reminders.map(async (reminder) => {
    const normalizedDestination = normalizePlaceInput(reminder.destination, {
      fixedOrigins,
      kind: 'destination',
    });

    if (!normalizedDestination.ok) {
      return {
        ...reminder,
        routeOrder: [],
        routes: {},
      };
    }

    const routeEntries = await Promise.all(reminderOrigins.map(async (origin) => {
      const normalizedOrigin = normalizePlaceInput(origin.id, {
        fixedOrigins,
        kind: 'origin',
      });

      const routing = normalizedOrigin.ok
        ? await provider.estimateTrip({
          origin: normalizedOrigin,
          destination: normalizedDestination,
          now,
          fetchImpl: options.fetchImpl,
        })
        : {
          status: 'origin-normalization-failed',
          etaMinutes: null,
          etaWithoutTrafficMinutes: null,
          trafficDeltaMinutes: null,
          distanceKm: null,
          checkedAt: now.toISOString(),
          leaveAt: null,
          note: 'Could not normalize the saved origin, so no ETA is available.',
          links: null,
        };

      return [origin.id, shapeReminderRouteEstimate(origin, routing)];
    }));

    return {
      ...reminder,
      routeOrder: reminderOrigins.map((origin) => origin.id),
      routes: Object.fromEntries(routeEntries),
    };
  }));
}

function roundToMinutes(seconds) {
  if (!Number.isFinite(seconds)) return null;
  return Math.max(1, Math.round(seconds / 60));
}

function roundDistanceKm(meters) {
  if (!Number.isFinite(meters)) return null;
  return Number((meters / 1000).toFixed(1));
}

function calculateLeaveAt(now, etaMinutes) {
  if (!Number.isFinite(etaMinutes)) return null;
  return new Date(now.getTime() + (etaMinutes * 60000)).toISOString();
}

async function geocodeAddress(address, options = {}) {
  const url = new URL(NOMINATIM_SEARCH_URL);
  url.searchParams.set('q', address);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');

  const response = await (options.fetchImpl || fetch)(url, {
    headers: {
      'user-agent': options.userAgent || DEFAULT_USER_AGENT,
      accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Geocoding failed with HTTP ${response.status}`);
  }

  const results = await response.json();
  const match = Array.isArray(results) ? results[0] : null;
  if (!match) {
    return null;
  }

  const lat = Number(match.lat);
  const lon = Number(match.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }

  return {
    lat,
    lon,
    displayName: match.display_name || address,
  };
}

async function resolvePlaceCoordinates(place, options = {}) {
  const resolved = await geocodeAddress(place.normalizedText, options);
  if (!resolved) {
    return {
      ok: false,
      reason: 'geocode-no-match',
      query: place.normalizedText,
    };
  }

  return {
    ok: true,
    query: place.normalizedText,
    lat: resolved.lat,
    lon: resolved.lon,
    displayName: resolved.displayName,
  };
}

async function requestWazeRoute(originCoords, destinationCoords, options = {}) {
  const url = new URL(WAZE_ROUTING_URL);
  const params = {
    from: `x:${originCoords.lon} y:${originCoords.lat}`,
    to: `x:${destinationCoords.lon} y:${destinationCoords.lat}`,
    at: '0',
    returnJSON: 'true',
    returnGeometries: 'false',
    returnInstructions: 'false',
    timeout: '60000',
    nPaths: '1',
    options: 'AVOID_TRAILS:t,AVOID_FERRIES:t,AVOID_TOLL_ROADS:t',
  };

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await (options.fetchImpl || fetch)(url, {
    headers: {
      'user-agent': options.userAgent || DEFAULT_USER_AGENT,
      accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Waze routing failed with HTTP ${response.status}`);
  }

  const payload = await response.json();
  const route = payload?.response;
  if (!route || !Array.isArray(route.results) || !route.results.length) {
    throw new Error('Waze routing returned no route results');
  }

  return route;
}

function shapeWazeRoute(route, now) {
  const realtimeSeconds = Number(route.totalRouteTime);
  const baselineSeconds = Number(route.totalRouteTimeWithoutRealtime);
  const distanceMeters = route.results.reduce((sum, segment) => sum + (Number(segment.length) || 0), 0);
  const etaMinutes = roundToMinutes(realtimeSeconds);
  const baselineEtaMinutes = roundToMinutes(baselineSeconds);

  return {
    status: 'ok',
    supportsLiveTraffic: true,
    etaMinutes,
    etaWithoutTrafficMinutes: baselineEtaMinutes,
    trafficDeltaMinutes: Number.isFinite(etaMinutes) && Number.isFinite(baselineEtaMinutes)
      ? etaMinutes - baselineEtaMinutes
      : null,
    distanceKm: roundDistanceKm(distanceMeters),
    checkedAt: now.toISOString(),
    leaveAt: calculateLeaveAt(now, etaMinutes),
  };
}

function getRoutingProvider(name = 'waze-live') {
  if (name === 'placeholder') {
    return {
      name: 'placeholder',
      supportsLiveTraffic: false,
      async estimateTrip({ origin, destination, now }) {
        return {
          provider: 'placeholder',
          status: 'no-live-eta',
          supportsLiveTraffic: false,
          etaMinutes: null,
          leaveAt: null,
          checkedAt: now.toISOString(),
          note: 'No real routing provider is configured in this environment, so this command returns normalized places and navigation links only.',
          links: buildRouteLinks(origin, destination),
        };
      },
    };
  }

  if (name !== 'waze-live') {
    throw new Error(`Unsupported routing provider: ${name}`);
  }

  return {
    name: 'waze-live',
    supportsLiveTraffic: true,
    async estimateTrip({ origin, destination, now, fetchImpl }) {
      const links = buildRouteLinks(origin, destination);

      try {
        const [originCoords, destinationCoords] = await Promise.all([
          resolvePlaceCoordinates(origin, { fetchImpl }),
          resolvePlaceCoordinates(destination, { fetchImpl }),
        ]);

        if (!originCoords.ok || !destinationCoords.ok) {
          const failures = [originCoords, destinationCoords].filter((item) => !item.ok);
          return {
            provider: 'waze-live',
            status: 'geocode-failed',
            supportsLiveTraffic: true,
            etaMinutes: null,
            etaWithoutTrafficMinutes: null,
            trafficDeltaMinutes: null,
            distanceKm: null,
            leaveAt: null,
            checkedAt: now.toISOString(),
            note: 'Could not resolve one or more places to coordinates, so no live ETA is available.',
            failures,
            links,
          };
        }

        const route = await requestWazeRoute(originCoords, destinationCoords, { fetchImpl });
        return {
          provider: 'waze-live',
          ...shapeWazeRoute(route, now),
          note: 'Live ETA from Waze routing data.',
          coordinates: {
            origin: originCoords,
            destination: destinationCoords,
          },
          links,
        };
      } catch (error) {
        return {
          provider: 'waze-live',
          status: 'live-eta-unavailable',
          supportsLiveTraffic: true,
          etaMinutes: null,
          etaWithoutTrafficMinutes: null,
          trafficDeltaMinutes: null,
          distanceKm: null,
          leaveAt: null,
          checkedAt: now.toISOString(),
          note: 'Live routing lookup failed, so only navigation links are available right now.',
          error: error.message,
          links,
        };
      }
    },
  };
}

async function runCheck(options) {
  const now = options.now ? new Date(options.now) : new Date();
  if (Number.isNaN(now.getTime())) {
    throw new Error('Invalid --now value');
  }

  const agenda = fetchAgenda(options);
  const events = Array.isArray(agenda.events) ? agenda.events : [];
  const state = loadState(options.statePath);
  const baseResult = evaluateEvents(events, options, now, state);
  const due = await attachReminderRouteEstimates(baseResult.due, options, now);
  const result = {
    ...baseResult,
    due,
  };

  if (!options.dryRun && result.due.length) {
    const nextState = markSent(state, result.due, now);
    saveState(options.statePath, nextState);
  }

  return summarizeOutput(result, options, now);
}

function runOriginsList(options) {
  const fixedOrigins = loadFixedOrigins(options.fixedOriginsPath);
  return {
    user: fixedOrigins.user,
    updatedAt: fixedOrigins.updatedAt,
    fixedOriginsPath: options.fixedOriginsPath,
    count: fixedOrigins.origins.length,
    origins: fixedOrigins.origins,
  };
}

function runOriginsResolve(options) {
  const fixedOrigins = loadFixedOrigins(options.fixedOriginsPath);
  const query = options.query || options.origin || options.label;
  const result = resolveFixedOrigin(query, fixedOrigins);

  return {
    query,
    fixedOriginsPath: options.fixedOriginsPath,
    found: Boolean(result.match),
    reason: result.reason,
    match: result.match,
    candidates: result.candidates || [],
  };
}

function runOriginsSave(options) {
  if (!options.label) {
    throw new Error('origins-save requires --label');
  }
  if (!options.address) {
    throw new Error('origins-save requires --address');
  }

  const fixedOrigins = loadFixedOrigins(options.fixedOriginsPath);
  const next = upsertFixedOrigin(fixedOrigins, {
    id: options.id,
    label: options.label,
    aliases: options.aliases,
    address: options.address,
  });

  if (!options.dryRun) {
    saveFixedOrigins(options.fixedOriginsPath, next);
  }

  const saved = next.origins.find((origin) => origin.id === (options.id || makeOriginId(options.label)));
  return {
    dryRun: options.dryRun,
    fixedOriginsPath: options.fixedOriginsPath,
    saved,
    count: next.origins.length,
  };
}

async function runTrip(options) {
  if (!options.origin) {
    throw new Error('trip requires --origin');
  }
  if (!options.destination) {
    throw new Error('trip requires --destination');
  }

  const now = options.now ? new Date(options.now) : new Date();
  if (Number.isNaN(now.getTime())) {
    throw new Error('Invalid --now value');
  }

  const fixedOrigins = loadFixedOrigins(options.fixedOriginsPath);
  const normalizedOrigin = normalizePlaceInput(options.origin, { fixedOrigins, kind: 'origin' });
  const normalizedDestination = normalizePlaceInput(options.destination, { fixedOrigins, kind: 'destination' });

  if (!normalizedOrigin.ok) {
    throw new Error(`Could not normalize origin: ${normalizedOrigin.reason}`);
  }
  if (!normalizedDestination.ok) {
    throw new Error(`Could not normalize destination: ${normalizedDestination.reason}`);
  }

  const provider = getRoutingProvider(options.provider);
  const routing = await provider.estimateTrip({
    origin: normalizedOrigin,
    destination: normalizedDestination,
    now,
    fetchImpl: options.fetchImpl,
  });

  return {
    checkedAt: now.toISOString(),
    provider: provider.name,
    origin: normalizedOrigin,
    destination: normalizedDestination,
    routing,
  };
}

function printHuman(output, command) {
  if (command === 'check') {
    if (!output.due.length) {
      console.log('No due calendar travel reminders.');
    } else {
      for (const reminder of output.due) {
        console.log(`- ${reminder.text}`);
      }
    }

    if (output.skipped.length) {
      console.log(`Skipped ${output.skipped.length} events.`);
    }
    return;
  }

  if (command === 'origins-list') {
    if (!output.origins.length) {
      console.log('No fixed origins saved.');
      return;
    }
    for (const origin of output.origins) {
      console.log(`- ${origin.label} [${origin.id}] -> ${origin.address}`);
    }
    return;
  }

  if (command === 'origins-resolve') {
    if (!output.found) {
      console.log(`No fixed origin matched: ${output.query}`);
      return;
    }
    console.log(`${output.match.label} [${output.match.id}] -> ${output.match.address}`);
    return;
  }

  if (command === 'origins-save') {
    console.log(`${output.dryRun ? 'Would save' : 'Saved'} fixed origin ${output.saved.label} [${output.saved.id}] -> ${output.saved.address}`);
    return;
  }

  if (command === 'trip') {
    console.log(`Origin: ${output.origin.normalizedText}`);
    console.log(`Destination: ${output.destination.normalizedText}`);
    console.log(output.routing.note);
    console.log(output.routing.links.googleMapsDirectionsUrl);
  }
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);

  let output;
  if (options.command === 'check') {
    output = await runCheck(options);
  } else if (options.command === 'origins-list') {
    output = runOriginsList(options);
  } else if (options.command === 'origins-resolve') {
    output = runOriginsResolve(options);
  } else if (options.command === 'origins-save') {
    output = runOriginsSave(options);
  } else if (options.command === 'trip') {
    output = await runTrip(options);
  } else {
    throw new Error(`Unknown command: ${options.command}`);
  }

  if (options.json) {
    console.log(JSON.stringify(output, null, 2));
  } else {
    printHuman(output, options.command);
  }
  return output;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

export {
  DEFAULTS,
  DEFAULT_STATE_PATH,
  DEFAULT_FIXED_ORIGINS_PATH,
  parseArgs,
  parseEventDate,
  fetchAgenda,
  splitLocationParts,
  looksLikeUrl,
  containsRemoteHint,
  looksRoomOnly,
  looksUsableDestination,
  extractDestination,
  buildWazeLink,
  buildGoogleMapsSearchUrl,
  buildGoogleMapsDirectionsUrl,
  normalizeLookupValue,
  makeOriginId,
  normalizeFixedOrigin,
  loadFixedOrigins,
  saveFixedOrigins,
  resolveFixedOrigin,
  upsertFixedOrigin,
  normalizePlaceInput,
  stableEventKey,
  loadState,
  saveState,
  reminderWindow,
  evaluateEvents,
  markSent,
  formatReminderText,
  formatClockTime,
  summarizeOutput,
  buildRouteLinks,
  getReminderRouteOrigins,
  shapeReminderRouteEstimate,
  attachReminderRouteEstimates,
  roundToMinutes,
  roundDistanceKm,
  calculateLeaveAt,
  geocodeAddress,
  resolvePlaceCoordinates,
  requestWazeRoute,
  shapeWazeRoute,
  getRoutingProvider,
  runCheck,
  runOriginsList,
  runOriginsResolve,
  runOriginsSave,
  runTrip,
  main,
};
