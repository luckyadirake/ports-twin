import type { LensConfig, LensId } from '@meridian/contracts';

/**
 * A LENS IS CONFIGURATION. Under 60 lines each, no data path, no selector, no
 * model call of its own. If a lens needs one, the L1 model is wrong — escalate.
 * "A ninth audience is a config file, not a programme" is the close of Act II,
 * and this file is the evidence. Print it.
 */

const L = (c: LensConfig): LensConfig => c;

export const LENSES: Record<LensId, LensConfig> = {
  operations: L({
    id: 'operations', label: 'Terminal operations', audience: 'Duty manager',
    overlays: ['berthWindows', 'agvFlow', 'digHeat', 'exceptionPins'],
    kpis: ['movesPerHour', 'vesselTurnaroundH', 'yardDigMoves', 'truckTurnTimeMin'],
    vocabulary: { 'kpis.movesPerHour': 'Gang rate', 'terminal.berths': 'Windows', 'terminal.stacks': 'Blocks' },
    inspector: ['berth', 'block', 'gate'], maxBand: 'AUTO', accent: 'var(--m-cyan)',
  }),
  engineering: L({
    id: 'engineering', label: 'Equipment engineering', audience: 'Crane engineer',
    overlays: ['healthHalos', 'loadSpectra', 'dutyCycle'],
    kpis: ['assetAvailabilityPct', 'movesPerHour', 'energyKwhPerMove'],
    vocabulary: { 'assets.rulHours': 'Remaining life', 'assets.envelope': 'Envelope', 'kpis.movesPerHour': 'Duty cycle' },
    inspector: ['asset'], maxBand: 'ASSIST', accent: 'var(--m-amber)',
  }),
  safety: L({
    id: 'safety', label: 'Safety & HSE', audience: 'Safety officer',
    overlays: ['exclusionZones', 'proximity', 'dgSegregation', 'plume'],
    kpis: ['assetAvailabilityPct', 'yardDigMoves'],
    vocabulary: { 'terminal.fleet': 'Moving plant', 'terminal.stacks': 'Segregation' },
    inspector: ['zones', 'block'], maxBand: 'ADVISE', accent: 'var(--m-red)',
  }),
  otsec: L({
    id: 'otsec', label: 'OT security', audience: 'OT security lead',
    overlays: ['otSegments', 'dependencyEdges', 'blastRadius'],
    kpis: ['assetAvailabilityPct'],
    vocabulary: { 'assets': 'Dependency graph', 'terminal.cranes': 'Zone 2 endpoints' },
    inspector: ['dependencies', 'asset'], maxBand: 'ADVISE', accent: 'var(--m-cyan)',
  }),
  energy: L({
    id: 'energy', label: 'Energy & sustainability', audience: 'Energy manager',
    overlays: ['carbonRibbon', 'microgrid', 'shorePower'],
    kpis: ['energyKwhPerMove', 'co2gPerMove', 'movesPerHour'],
    vocabulary: { 'terminal.fleet': 'Charging fleet', 'kpis.movesPerHour': 'Throughput' },
    inspector: ['energy'], maxBand: 'ASSIST', accent: 'var(--m-mint)',
  }),
  commercial: L({
    id: 'commercial', label: 'Planning & commercial', audience: 'Commercial planner',
    overlays: ['connectionThreads', 'freeTimeRings', 'pharmaThread'],
    kpis: ['connectionsAtRisk', 'teuAtRisk', 'demurrageExposure', 'gateSlotsForfeited'],
    vocabulary: { 'terminal.berths': 'Berth windows', 'portHorizon.conns': 'Connections' },
    inspector: ['connections', 'berth'], maxBand: 'ASSIST', accent: 'var(--m-amber)',
  }),
  projects: L({
    id: 'projects', label: 'Capital projects', audience: 'Project manager',
    overlays: ['asBuiltWireframe', 'deviationMarks', 'commissioningState'],
    kpis: ['assetAvailabilityPct'],
    vocabulary: { 'terminal.cranes': 'Handover state', 'terminal.stacks': 'As-built' },
    inspector: ['projects'], maxBand: 'ADVISE', accent: 'var(--m-cyan)',
  }),
  group: L({
    id: 'group', label: 'Group executive', audience: 'Group exec',
    overlays: ['rollupFrame'],
    kpis: ['teuAtRisk', 'vesselTurnaroundH', 'truckTurnTimeMin', 'demurrageExposure', 'co2gPerMove', 'assetAvailabilityPct'],
    // the translation test: if the group view still speaks terminal, the
    // vocabulary layer is not doing its job.
    vocabulary: {
      'kpis.movesPerHour': 'Throughput', 'kpis.yardDigMoves': 'Wasted handling',
      'kpis.truckTurnTimeMin': 'Customer wait', 'kpis.teuAtRisk': 'Volume exposed',
    },
    inspector: ['rollup'], maxBand: 'ADVISE', accent: 'var(--m-mint)',
  }),
};

export const LENS_ORDER: LensId[] = [
  'operations', 'engineering', 'safety', 'otsec', 'energy', 'commercial', 'projects', 'group',
];
