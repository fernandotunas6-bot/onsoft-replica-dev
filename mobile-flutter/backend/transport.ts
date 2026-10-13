/** Transport domain guards, independent of GPS vendor. No persistence/schema
 * migration here: callers must enforce transactions and audit on durable write. */
import { ApiFailure } from './api.ts';
export type TransportGrant = {
  userId: string; schoolId: string; active: boolean; aal: string;
  role: 'dispatcher' | 'driver' | 'guardian' | 'student';
  tripIds: readonly string[];
};
export type Position = {
  schoolId: string; tripId: string; deviceId: string; capturedAt: string;
  latitude: number; longitude: number; accuracyMeters: number;
};
function denied(code: string): never { throw new ApiFailure(403, code); }
export function authorizeTrip(grant: TransportGrant, schoolId: string, tripId: string, write = false) {
  if (!['dispatcher', 'driver', 'guardian', 'student'].includes(grant.role) || !grant.active || !grant.userId || grant.schoolId !== schoolId || !grant.tripIds.includes(tripId)) denied('TRIP_FORBIDDEN');
  if (write && (grant.aal !== 'aal2' || !['dispatcher', 'driver'].includes(grant.role))) denied('TRANSPORT_WRITE_FORBIDDEN');
}
export function validatePosition(position: Position, expected: {schoolId: string; tripId: string; deviceId: string}, now: Date) {
  if (!position || position.schoolId !== expected.schoolId || position.tripId !== expected.tripId ||
      position.deviceId !== expected.deviceId) denied('DEVICE_SCOPE_FORBIDDEN');
  const time = Date.parse(position.capturedAt);
  if (typeof position.capturedAt !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(position.capturedAt) ||
      !Number.isFinite(now.getTime()) || !Number.isFinite(time) || time > now.getTime() + 30000 ||
      time < now.getTime() - 86400000 || !Number.isFinite(position.latitude) ||
      position.latitude < -90 || position.latitude > 90 || !Number.isFinite(position.longitude) ||
      position.longitude < -180 || position.longitude > 180 || !Number.isFinite(position.accuracyMeters) ||
      position.accuracyMeters < 0 || position.accuracyMeters > 10000) throw new ApiFailure(422,'INVALID_POSITION');
}
export function positionState(position: Position | null, now: Date, active: boolean) {
  if (!active) return 'ended';
  if (!position) return 'awaiting';
  const age = now.getTime() - Date.parse(position.capturedAt);
  return Number.isFinite(age) && age >= -30000 && age <= 120000 ? 'live' : 'stale';
}
