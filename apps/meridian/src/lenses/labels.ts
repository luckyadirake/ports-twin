import type { KpiSet } from '@meridian/contracts';

export const KPI_LABEL: Record<keyof KpiSet, string> = {
  vesselTurnaroundH: 'Turnaround', movesPerHour: 'Gang rate',
  yardDigMoves: 'Unproductive moves', yardRehandleRate: 'Re-handle rate',
  truckTurnTimeMin: 'Truck turn time', gateSlotsForfeited: 'Appointments lapsed',
  connectionsAtRisk: 'Connections at risk', teuAtRisk: 'TEU exposed',
  energyKwhPerMove: 'Energy per move', co2gPerMove: 'Carbon per move',
  demurrageExposure: 'Demurrage exposure', assetAvailabilityPct: 'Asset availability',
  anchorageWaitH: 'Anchorage wait', fuelTonnesSaved: 'Bunkers saved',
};

/** Which direction is good, so the comparison can colour honestly. */
export const LOWER_BETTER: Record<keyof KpiSet, boolean> = {
  vesselTurnaroundH: true, movesPerHour: false, yardDigMoves: true, yardRehandleRate: true,
  truckTurnTimeMin: true, gateSlotsForfeited: true, connectionsAtRisk: true, teuAtRisk: true,
  energyKwhPerMove: true, co2gPerMove: true, demurrageExposure: true, assetAvailabilityPct: false,
  anchorageWaitH: true, fuelTonnesSaved: false,
};
