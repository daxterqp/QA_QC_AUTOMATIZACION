import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';

/** Punto GPS capturado durante una sesión activa.
 *  Append-only (sin updated_at). Dedup por proximidad <3m se aplica ANTES de
 *  crear el registro en `useGpsCapture.startTracking` y en `BackgroundLocationTask`. */
export default class WorkSessionGpsPoint extends Model {
  static table = 'work_session_gps_points';

  @field('session_id') sessionId!: string;
  @field('captured_at') capturedAt!: number;
  @field('latitude') latitude!: number;
  @field('longitude') longitude!: number;
  @field('accuracy_m') accuracyM!: number | null;

  @readonly @date('created_at') createdAt!: Date;
}
