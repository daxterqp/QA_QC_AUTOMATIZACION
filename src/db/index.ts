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
    DashboardNote, UserProjectAccess, PhoneContact,
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
