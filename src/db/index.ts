import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';

import { schema } from './schema';
import { migrations } from './migrations';
import User from './models/User';
import Project from './models/Project';
import Location from './models/Location';
import Protocol from './models/Protocol';
import ProtocolItem from './models/ProtocolItem';
import ProtocolTemplate from './models/ProtocolTemplate';
import ProtocolTemplateItem from './models/ProtocolTemplateItem';
import Evidence from './models/Evidence';
import NonConformity from './models/NonConformity';
import Plan from './models/Plan';
import PlanAnnotation from './models/PlanAnnotation';
import AnnotationComment from './models/AnnotationComment';
import AnnotationCommentPhoto from './models/AnnotationCommentPhoto';
import DashboardNote from './models/DashboardNote';
import UserProjectAccess from './models/UserProjectAccess';
import PhoneContact from './models/PhoneContact';
import PlanMeasurement from './models/PlanMeasurement';
import ProtocolApproval from './models/ProtocolApproval';
import Equipment from './models/Equipment';
import ProtocolEquipment from './models/ProtocolEquipment';
import SyncQueueItem from './models/SyncQueueItem';
import ProjectSector from './models/ProjectSector';
import Activity from './models/Activity';
import EquipmentActivity from './models/EquipmentActivity';
import WorkShift from './models/WorkShift';
import SessionFormTemplate from './models/SessionFormTemplate';
import SessionFormTemplateItem from './models/SessionFormTemplateItem';
import WorkSession from './models/WorkSession';
import WorkSessionInterval from './models/WorkSessionInterval';
import WorkSessionFormItem from './models/WorkSessionFormItem';
import WorkSessionGpsPoint from './models/WorkSessionGpsPoint';
import SummaryRow from './models/SummaryRow';
import LabAuxTable from './models/LabAuxTable';
import RecycleBinEntry from './models/RecycleBinEntry';
import Sample from './models/Sample';

const adapter = new SQLiteAdapter({
  schema,
  migrations,
  dbName: 'scua_local_db',
  jsi: true,
  onSetUpError: (error) => {
    console.error('[DB] Error inicializando SQLite:', error);
  },
});

export const database = new Database({
  adapter,
  modelClasses: [
    User, Project, Location, Protocol, ProtocolItem,
    ProtocolTemplate, ProtocolTemplateItem,
    Evidence, NonConformity, Plan, PlanAnnotation,
    AnnotationComment, AnnotationCommentPhoto,
    DashboardNote, UserProjectAccess, PhoneContact, PlanMeasurement,
    ProtocolApproval, Equipment, ProtocolEquipment,
    SyncQueueItem, ProjectSector,
    Activity, EquipmentActivity, WorkShift,
    SessionFormTemplate, SessionFormTemplateItem,
    WorkSession, WorkSessionInterval, WorkSessionFormItem, WorkSessionGpsPoint,
    SummaryRow, LabAuxTable, RecycleBinEntry, Sample,
  ],
});

export const usersCollection = database.get<User>('users');
export const projectsCollection = database.get<Project>('projects');
export const locationsCollection = database.get<Location>('locations');
export const protocolsCollection = database.get<Protocol>('protocols');
export const protocolItemsCollection = database.get<ProtocolItem>('protocol_items');
export const protocolTemplatesCollection = database.get<ProtocolTemplate>('protocol_templates');
export const protocolTemplateItemsCollection = database.get<ProtocolTemplateItem>('protocol_template_items');
export const evidencesCollection = database.get<Evidence>('evidences');
export const nonConformitiesCollection = database.get<NonConformity>('non_conformities');
export const plansCollection = database.get<Plan>('plans');
export const planAnnotationsCollection = database.get<PlanAnnotation>('plan_annotations');
export const annotationCommentsCollection = database.get<AnnotationComment>('annotation_comments');
export const annotationCommentPhotosCollection = database.get<AnnotationCommentPhoto>('annotation_comment_photos');
export const dashboardNotesCollection = database.get<DashboardNote>('dashboard_notes');
export const userProjectAccessCollection = database.get<UserProjectAccess>('user_project_access');
export const phoneContactsCollection = database.get<PhoneContact>('phone_contacts');
export const planMeasurementsCollection = database.get<PlanMeasurement>('plan_measurements');
export const protocolApprovalsCollection = database.get<ProtocolApproval>('protocol_approvals');
export const equipmentCollection         = database.get<Equipment>('equipment');
export const protocolEquipmentCollection = database.get<ProtocolEquipment>('protocol_equipment');
export const syncQueueCollection         = database.get<SyncQueueItem>('sync_queue');
export const projectSectorsCollection    = database.get<ProjectSector>('project_sectors');

// v27 — Trazabilidad Operacional
export const activitiesCollection                = database.get<Activity>('activities');
export const equipmentActivitiesCollection       = database.get<EquipmentActivity>('equipment_activities');
export const workShiftsCollection                = database.get<WorkShift>('work_shifts');
export const sessionFormTemplatesCollection      = database.get<SessionFormTemplate>('session_form_templates');
export const sessionFormTemplateItemsCollection  = database.get<SessionFormTemplateItem>('session_form_template_items');
export const workSessionsCollection              = database.get<WorkSession>('work_sessions');
export const workSessionIntervalsCollection      = database.get<WorkSessionInterval>('work_session_intervals');
export const workSessionFormItemsCollection      = database.get<WorkSessionFormItem>('work_session_form_items');
export const workSessionGpsPointsCollection      = database.get<WorkSessionGpsPoint>('work_session_gps_points');
export const summaryRowsCollection               = database.get<SummaryRow>('summary_rows');
export const labAuxTablesCollection              = database.get<LabAuxTable>('lab_aux_tables');
export const recycleBinCollection                = database.get<RecycleBinEntry>('recycle_bin');
export const samplesCollection                   = database.get<Sample>('samples');
