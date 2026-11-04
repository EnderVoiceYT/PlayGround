import * as THREE from 'three';

export const CELL = 2.2;
export const GRID_W = 64;
export const GRID_H = 50;

export const ROOMS = {
  lobby: {
    name: 'Main Lobby', sub: 'St. Aldric Hospital · Quarantine Ward', zone: 'hospital',
    rect: [6, 5, 18, 12], lights: [[9.3, 7.2], [14.8, 9.2]],
    blurb: 'The evacuation stopped six hours ago.',
  },
  reception: {
    name: 'Reception', sub: 'Intake & Records', zone: 'hospital',
    rect: [20, 5, 28, 12], lights: [[23, 7], [26.2, 10]],
    blurb: 'Every name on the intake list is crossed out.',
  },
  generator: {
    name: 'Generator Room', sub: 'Emergency Power · Grid B', zone: 'industrial',
    rect: [34, 5, 43, 12], lights: [[37, 7], [41, 9.4]],
    blurb: 'The building is holding its breath.',
  },
  security: {
    name: 'Security Office', sub: 'Level 3 Operations', zone: 'hospital',
    rect: [45, 5, 56, 12], lights: [[48, 7], [53, 10]],
    blurb: 'Monitors show rooms that should be empty.',
  },
  ward: {
    name: 'Quarantine Ward', sub: 'Ward 03 · Isolation', zone: 'hospital',
    rect: [6, 18, 18, 27], lights: [[9, 21], [15, 25]],
    blurb: 'Restraints were tightened from the inside.',
  },
  records: {
    name: 'Records Office', sub: 'Research Archives', zone: 'hospital',
    rect: [20, 18, 28, 27], lights: [[23, 21], [25.5, 25]],
    blurb: 'Paper remembers what people tried to erase.',
  },
  cold: {
    name: 'Cold Storage', sub: 'Biological Materials', zone: 'lab',
    rect: [34, 18, 43, 27], lights: [[37, 21], [41, 25]],
    blurb: 'Condensation crawls across the drawers.',
  },
  observation: {
    name: 'Observation Suite', sub: 'Containment · Subject 0', zone: 'lab',
    rect: [45, 18, 56, 27], lights: [[48, 21], [53, 25]],
    blurb: 'The glass is scratched on the inside.',
  },
  boiler: {
    name: 'Boiler Room', sub: 'Thermal Plant', zone: 'industrial',
    rect: [6, 34, 18, 43], lights: [[9, 37], [15, 41]],
    blurb: 'Heat, rust, and something breathing through the pipes.',
  },
  pump: {
    name: 'Pump Station', sub: 'Flood Control', zone: 'tunnel',
    rect: [20, 34, 28, 43], lights: [[23, 37], [26.5, 41]],
    blurb: 'Black water moves against the current.',
  },
  morgue: {
    name: 'Morgue', sub: 'Pathology · Cold Annex', zone: 'hospital',
    rect: [34, 34, 43, 43], lights: [[37, 37], [41, 41]],
    blurb: 'The drawers are all open. The bags are not.',
  },
  maintenance: {
    name: 'Maintenance', sub: 'Service Elevator · Surface Access', zone: 'industrial',
    rect: [45, 34, 56, 43], lights: [[48, 37], [53, 41]],
    blurb: 'One way out. If the power holds.',
  },
};

export const CORRIDORS = [
  { id: 'corridor-h', rect: [6, 14, 58, 16], zone: 'corridorH' },
  { id: 'corridor-v', rect: [30, 5, 32, 44], zone: 'corridorV' },
  { id: 'corridor-h2', rect: [6, 30, 58, 32], zone: 'corridorT' },
];

export const CONNECTORS = [
  { rect: [10, 12, 11, 14], zone: 'hospital' },
  { rect: [23, 12, 24, 14], zone: 'hospital' },
  { rect: [37, 12, 38, 14], zone: 'industrial' },
  { rect: [49, 12, 50, 14], zone: 'hospital' },
  { rect: [10, 16, 11, 18], zone: 'hospital' },
  { rect: [23, 16, 24, 18], zone: 'hospital' },
  { rect: [37, 16, 38, 18], zone: 'lab' },
  { rect: [49, 16, 50, 18], zone: 'lab' },
  { rect: [10, 27, 11, 30], zone: 'hospital' },
  { rect: [23, 27, 24, 30], zone: 'hospital' },
  { rect: [37, 27, 38, 30], zone: 'lab' },
  { rect: [49, 27, 50, 30], zone: 'lab' },
  { rect: [10, 32, 11, 34], zone: 'industrial' },
  { rect: [23, 32, 24, 34], zone: 'tunnel' },
  { rect: [37, 32, 38, 34], zone: 'hospital' },
  { rect: [49, 32, 50, 34], zone: 'industrial' },
  { rect: [18, 8, 20, 10], zone: 'hospital' },
  { rect: [18, 22, 20, 24], zone: 'hospital' },
  { rect: [43, 22, 45, 24], zone: 'lab' },
  { rect: [43, 8, 45, 10], zone: 'industrial' },
  { rect: [18, 38, 20, 40], zone: 'tunnel' },
  { rect: [28, 38, 34, 40], zone: 'tunnel' },
  { rect: [43, 38, 45, 40], zone: 'industrial' },
];

const H = (x, z, extra = {}) => ({ x: x * CELL, z: z * CELL, orient: 'h', width: 4.15, ...extra });
const V = (x, z, extra = {}) => ({ x: x * CELL, z: z * CELL, orient: 'v', width: 4.15, ...extra });

// Doors sit inside the short link corridors. Locked doors still block navigation
// until unlocked with the matching key item.
export const DOOR_DEFS = [
  { id: 'lobby-main', ...H(11, 13), label: 'Lobby' },
  { id: 'reception-main', ...H(24, 13), label: 'Reception' },
  { id: 'generator-main', ...H(38, 13), label: 'Generator' },
  { id: 'security-main', ...H(50, 13), label: 'Security' },
  { id: 'ward-main', ...H(11, 17), label: 'Ward 03' },
  { id: 'records-main', ...H(24, 17), label: 'Records' },
  { id: 'cold-main', ...H(38, 17), label: 'Cold Storage', locked: 'card', lockLabel: 'Security Card' },
  { id: 'observation-main', ...H(50, 17), label: 'Observation' },
  { id: 'ward-h2', ...H(11, 29), label: 'Ward 03' },
  { id: 'records-h2', ...H(24, 29), label: 'Records' },
  { id: 'cold-h2', ...H(38, 29), label: 'Cold Storage', locked: 'card', lockLabel: 'Security Card' },
  { id: 'observation-h2', ...H(50, 29), label: 'Observation' },
  { id: 'boiler-h2', ...H(11, 33), label: 'Boiler' },
  { id: 'pump-h2', ...H(24, 33), label: 'Pump Station', locked: 'valve', lockLabel: 'Valve Wheel' },
  { id: 'morgue-h2', ...H(38, 33), label: 'Morgue' },
  { id: 'maintenance-h2', ...H(50, 33), label: 'Maintenance' },
  { id: 'lobby-reception', ...V(19, 9), label: 'Reception' },
  { id: 'ward-records', ...V(19, 23), label: 'Records' },
  { id: 'cold-observation', ...V(44, 23), label: 'Observation' },
  { id: 'generator-security', ...V(44, 9), label: 'Security' },
  { id: 'boiler-pump', ...V(19, 39), label: 'Pump Station', locked: 'valve', lockLabel: 'Valve Wheel' },
  { id: 'morgue-maintenance', ...V(44, 39), label: 'Maintenance' },
];

export const PICKUP_DEFS = [
  { id: 'battery-lobby', item: 'battery', count: 1, gx: 8.0, gy: 11.3, height: 0.35 },
  { id: 'note-lobby', note: 'evac', gx: 12.35, gy: 7.55, height: 0.98 },
  { id: 'card-reception', item: 'card', count: 1, gx: 24.0, gy: 7.8, height: 1.02, key: true },
  { id: 'ammo-reception', item: 'ammo', count: 9, gx: 26.6, gy: 10.6, height: 0.35 },
  { id: 'note-reception', note: 'security', gx: 21.4, gy: 10.4, height: 0.85 },
  { id: 'fuse-ward', item: 'fuse', count: 1, gx: 16.4, gy: 21.0, height: 0.92, key: true },
  { id: 'medkit-ward', item: 'medkit', count: 1, gx: 7.4, gy: 26.2, height: 0.35 },
  { id: 'ammo-ward', item: 'ammo', count: 8, gx: 17.0, gy: 25.6, height: 0.35 },
  { id: 'note-ward', note: 'patient', gx: 9.8, gy: 18.8, height: 0.85 },
  { id: 'battery-records', item: 'battery', count: 1, gx: 26.0, gy: 19.4, height: 0.35 },
  { id: 'flares-records', item: 'flare', count: 2, gx: 21.5, gy: 26.0, height: 0.35 },
  { id: 'note-records', note: 'orpheus', gx: 24.0, gy: 24.2, height: 0.86 },
  { id: 'fuse-cold', item: 'fuse', count: 1, gx: 39.5, gy: 22.4, height: 0.95, key: true },
  { id: 'ammo-cold', item: 'ammo', count: 12, gx: 42.0, gy: 26.1, height: 0.35 },
  { id: 'battery-cold', item: 'battery', count: 1, gx: 35.0, gy: 20.4, height: 0.35 },
  { id: 'ammo-security', item: 'ammo', count: 12, gx: 53.6, gy: 6.5, height: 0.35 },
  { id: 'flares-security', item: 'flare', count: 2, gx: 54.8, gy: 9.5, height: 0.35 },
  { id: 'note-security', note: 'securitylog', gx: 51.0, gy: 9.5, height: 0.85 },
  { id: 'battery-observation', item: 'battery', count: 1, gx: 53.4, gy: 26.0, height: 0.35 },
  { id: 'flare-observation', item: 'flare', count: 1, gx: 48.5, gy: 25.5, height: 0.35 },
  { id: 'note-observation', note: 'subject0', gx: 47.0, gy: 19.5, height: 0.85 },
  { id: 'note-generator', note: 'power', gx: 36.5, gy: 11.2, height: 0.85 },
  { id: 'ammo-generator', item: 'ammo', count: 9, gx: 42.2, gy: 11.0, height: 0.35 },
  { id: 'valve-boiler', item: 'valve', count: 1, gx: 7.2, gy: 38.2, height: 0.75, key: true },
  { id: 'note-boiler', note: 'boiler', gx: 15.5, gy: 42.0, height: 0.85 },
  { id: 'flare-boiler', item: 'flare', count: 1, gx: 16.4, gy: 35.5, height: 0.35 },
  { id: 'fuse-pump', item: 'fuse', count: 1, gx: 24.0, gy: 41.5, height: 0.72, key: true },
  { id: 'medkit-pump', item: 'medkit', count: 1, gx: 27.4, gy: 42.0, height: 0.35 },
  { id: 'note-pump', note: 'pump', gx: 21.0, gy: 35.0, height: 0.85 },
  { id: 'ammo-morgue', item: 'ammo', count: 10, gx: 42.0, gy: 42.0, height: 0.35 },
  { id: 'note-morgue', note: 'morgue', gx: 38.0, gy: 40.6, height: 0.85 },
  { id: 'ammo-maintenance', item: 'ammo', count: 9, gx: 47.0, gy: 41.5, height: 0.35 },
  { id: 'medkit-maintenance', item: 'medkit', count: 1, gx: 52.8, gy: 35.2, height: 0.35 },
  { id: 'note-maintenance', note: 'maintenance', gx: 52.0, gy: 42.0, height: 0.85 },
];

export const SAVE_STATIONS = [
  { id: 'save-lobby', name: 'Emergency Recorder', gx: 7.0, gy: 6.5, rot: 0, charges: 2 },
  { id: 'save-security', name: 'Security Recorder', gx: 46.4, gy: 10.8, rot: -Math.PI / 2, charges: 2 },
  { id: 'save-morgue', name: 'Pathology Recorder', gx: 35.0, gy: 42.0, rot: 0, charges: 2 },
];

export const VENTS = [
  { id: 'vent-ward', gx: 16.8, gy: 18.7, rot: 0 },
  { id: 'vent-cold', gx: 34.8, gy: 26.6, rot: 0 },
  { id: 'vent-boiler', gx: 17.1, gy: 42.0, rot: Math.PI },
  { id: 'vent-pump', gx: 20.8, gy: 40.5, rot: Math.PI / 2 },
  { id: 'vent-morgue', gx: 42.0, gy: 35.0, rot: 0 },
  { id: 'vent-maintenance', gx: 55.2, gy: 42.0, rot: -Math.PI / 2 },
];

export const NOTES = {
  evac: {
    title: 'MANDATORY EVACUATION',
    meta: 'St. Aldric Hospital · 03:12',
    body: `All non-essential personnel are to leave via the service elevator.\n\nDo not use the main stairwell. Do not enter Ward 03 without a light. The quarantine seal failed at 02:47.\n\nIf you can hear this, the grid is down. Three ceramic fuses are kept in the wards and the lower plant. Restore the generator. The elevator will not move without power.\n\n— Dr. Aris Vale, Duty Administrator`,
  },
  security: {
    title: 'SECURITY ISSUE LOG',
    meta: 'Card 04 · Dr. A. Vale',
    body: `Issued one security card to Dr. Aris Vale, clearance FOUR.\n\nCold Storage remains sealed under Protocol 9. No exceptions.\n\nAt 02:31 the west cameras went white. At 02:36 they came back. There was a shape in the ward corridor that did not appear on the thermal feed.\n\nAt 02:40 every door on sublevel three closed by itself.`,
  },
  patient: {
    title: 'PATIENT OBSERVATION · 0-19',
    meta: 'Ward 03 · Dr. H. Mire',
    body: `Subject exhibits acute photophobia. Exposure to a focused beam produces convulsions, then rapid retreat.\n\nIn complete darkness the subject becomes bold. It mimics the breathing of nearby patients. It has learned the sound of the door latch.\n\nRecommendation: keep the corridor lights on. Do not leave the ward unlit. Do not let it hear you alone.`,
  },
  orpheus: {
    title: 'PROJECT ORPHEUS',
    meta: 'Research memorandum · internal',
    body: `We believed darkness was an absence.\n\nIt is a membrane. The specimens do not live in it; they press against it from the other side. Light thins the membrane. Some of them hate the thinning. Others are drawn to it like moths to a wound.\n\nThe generator is not for comfort. It is a seal. Keep the grid alive.`,
  },
  power: {
    title: 'EMERGENCY POWER PROTOCOL',
    meta: 'Grid B · maintenance card',
    body: `1. Recover three ceramic fuses. Ward 03, Cold Storage, Pump Station.\n2. Seat all three fuses in the breaker console. The housing will not accept a partial load.\n3. Hold the breaker for three seconds.\n\nWhen the grid returns, expect the lights to come on in sequence. Expect the building to wake with them. The service elevator will release.\n\nDo not be in the tunnels when the pumps restart.`,
  },
  securitylog: {
    title: 'FINAL SHIFT · AUDIO TRANSCRIPT',
    meta: 'Security Office · 02:58',
    body: `"The card is in reception. I left it on the desk."\n\n"Cold storage? You don't want to go in there. The fuse is in there, I know, but—"\n\n[metal scraping]\n\n"Turn your light off. Turn it off. It can see the beam through the—"\n\n[recording ends]`,
  },
  subject0: {
    title: 'CONTAINMENT NOTICE · SUBJECT 0',
    meta: 'Observation Suite · clearance FOUR',
    body: `Subject 0 is not to be illuminated under any circumstance.\n\nIt does not avoid light. It drinks it. The observation lamps were removed after the third incident.\n\nIf the glass is warm, leave the suite. If you can hear someone breathing on the other side, do not answer.\n\nIt has been in there for eleven years. It has not eaten in six days.`,
  },
  boiler: {
    title: 'MAINTENANCE TICKET · 771',
    meta: 'Boiler Room · signed T. Rook',
    body: `Pump gate actuator seized again. I took the valve wheel off the housing so nobody would try to force it while the pressure is up.\n\nIt is on the bench by the boiler. Put it back, turn it counter-clockwise, and the gate will open.\n\nIf the pressure gauge is in the red, do not open the gate. If the gauge is black, run.`,
  },
  pump: {
    title: 'FLOOD CONTROL MANUAL',
    meta: 'Pump Station · laminated card',
    body: `The lower tunnels flood during grid failure. The pumps require the auxiliary fuse located beside the east manifold.\n\nDo not stand in the water while the pumps are offline.\n\nThe water is deeper than it looks. It is also warmer than it should be.`,
  },
  morgue: {
    title: 'PATHOLOGY LOG · 02:44',
    meta: 'Morgue · last entry',
    body: `Fourteen bags. Thirteen bodies.\n\nI counted them twice. The extra bag is moving. It is not breathing, but the zipper is moving.\n\nThe recorder in the corner still works. Use it if you need to leave a mark. But a recorder is not a rescue. Nobody is coming.\n\n— T. Rook`,
  },
  maintenance: {
    title: 'SERVICE ELEVATOR · STARTUP',
    meta: 'Maintenance · taped to the panel',
    body: `The elevator is on the emergency circuit. No grid, no doors.\n\nOnce the generator is online, press the call button and get inside. The doors will take nine seconds. The car will not wait.\n\nWhatever follows you down here will not fit through the gap. Probably.`,
  },
};

export const ROOM_LIGHT_COLORS = {
  hospital: 0xd9e7dd,
  lab: 0xc4e0db,
  industrial: 0xffcf96,
  tunnel: 0xa9b8ae,
  corridorH: 0xd2dfd6,
  corridorV: 0xbcd5d1,
  corridorT: 0xffb570,
};

export const ROOM_LIGHT_INTENSITY = {
  hospital: 26,
  lab: 22,
  industrial: 19,
  tunnel: 16,
  corridorH: 18,
  corridorV: 18,
  corridorT: 15,
};

export const CORRIDOR_LIGHTS = [
  { x: 14, z: 15.2, zone: 'corridorH', orient: 'h' },
  { x: 27, z: 15.2, zone: 'corridorH', orient: 'h' },
  { x: 41, z: 15.2, zone: 'corridorH', orient: 'h' },
  { x: 52, z: 15.2, zone: 'corridorH', orient: 'h' },
  { x: 31, z: 9, zone: 'corridorV', orient: 'v' },
  { x: 31, z: 23, zone: 'corridorV', orient: 'v' },
  { x: 31, z: 37, zone: 'corridorV', orient: 'v' },
  { x: 14, z: 31.2, zone: 'corridorT', orient: 'h' },
  { x: 27, z: 31.2, zone: 'corridorT', orient: 'h' },
  { x: 41, z: 31.2, zone: 'corridorT', orient: 'h' },
  { x: 52, z: 31.2, zone: 'corridorT', orient: 'h' },
];

export const EMERGENCY_LIGHTS = [
  { x: 15.2, z: 14.18, rot: 0 },
  { x: 30.2, z: 14.18, rot: 0 },
  { x: 45.2, z: 14.18, rot: 0 },
  { x: 15.0, z: 30.18, rot: 0 },
  { x: 32.0, z: 30.18, rot: 0 },
  { x: 47.0, z: 30.18, rot: 0 },
  { x: 30.18, z: 11.0, rot: Math.PI / 2 },
  { x: 30.18, z: 35.0, rot: Math.PI / 2 },
  { x: 7.0, z: 27.8, rot: 0 },
  { x: 34.0, z: 27.8, rot: 0 },
  { x: 22.0, z: 33.8, rot: 0 },
  { x: 44.0, z: 33.8, rot: 0 },
];

export const DOOR_SIGNS = [
  { x: 11, z: 12.72, text: 'WARD 03', rot: 0 },
  { x: 24, z: 12.72, text: 'RECORDS', rot: 0 },
  { x: 38, z: 12.72, text: 'GENERATOR', rot: 0 },
  { x: 50, z: 12.72, text: 'SECURITY', rot: 0 },
  { x: 11, z: 30.55, text: 'BOILER', rot: Math.PI },
  { x: 24, z: 30.55, text: 'PUMP', rot: Math.PI },
  { x: 38, z: 30.55, text: 'MORGUE', rot: Math.PI },
  { x: 50, z: 30.55, text: 'MAINTENANCE', rot: Math.PI },
];

export const PLAYER_START = { x: 12, y: 10.2 };
export const ELEVATOR_POS = { x: 54.4, y: 39.0 };
export const GENERATOR_CONSOLE = { x: 36.2, y: 10.8 };

export function gridIndex(x, y) { return y * GRID_W + x; }
export function cellCenter(gx, gy, y = 0) {
  return new THREE.Vector3((gx + 0.5) * CELL, y, (gy + 0.5) * CELL);
}
export function worldToCell(x, z) {
  return { x: Math.floor(x / CELL), y: Math.floor(z / CELL) };
}
