import { Model } from '@nozbe/watermelondb';
import { field, date, readonly, children } from '@nozbe/watermelondb/decorators';
import type WorkSessionInterval from './WorkSessionInterval';
import type WorkSessionFormItem from './WorkSessionFormItem';
import type WorkSessionGpsPoint from './WorkSessionGpsPoint';

export type WorkSessionStatus = 'ACTIVE' | 'PAUSED' | 'CLOSED';

/** Sesión de trabajo: una jornada de un técnico con un equipo, en un sector.
 *  Lifecycle: Iniciar (swipe) → status=ACTIVE + primer interval(active) →
 *  Pausar/Reanudar (swipe, N veces) → Cerrar (tap + confirm) → status=CLOSED.
 *  Duración efectiva = sum(intervals WHERE kind='active'). NO se persiste para
 *  evitar drift con los intervals.
 *  `started_on_device_id` previene que celular B cierre una sesión iniciada en A. */
export default class WorkSession extends Model {
  static table = 'work_sessions';
  static associations = {
    work_session_intervals:  { type: 'has_many' as const, foreignKey: 'session_id' },
    work_session_form_items: { type: 'has_many' as const, foreignKey: 'session_id' },
    work_session_gps_points: { type: 'has_many' as const, foreignKey: 'session_id' },
  };

  @field('project_id') projectId!: string;
  @field('user_id') userId!: string;
  @field('equipment_id') equipmentId!: string;
  @field('activity_id') activityId!: string;
  @field('sector_id') sectorId!: string | null;
  @field('shift_id') shiftId!: string | null;

  @field('started_at') startedAt!: number;
  @field('ended_at') endedAt!: number | null;

  @field('status') status!: WorkSessionStatus;
  @field('started_on_device_id') startedOnDeviceId!: string | null;
  @field('auto_closed') autoClosed!: boolean;
  @field('notes') notes!: string | null;

  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;

  @children('work_session_intervals')  intervals!: WorkSessionInterval[];
  @children('work_session_form_items') formItems!: WorkSessionFormItem[];
  @children('work_session_gps_points') gpsPoints!: WorkSessionGpsPoint[];
}
