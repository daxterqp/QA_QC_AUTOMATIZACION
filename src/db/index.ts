import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';

import { schema } from './schema';
import { migrations } from './migrations';
import User from './models/User';
import Project from './models/Project';
import Location from './models/Location';
import Protocol from './models/Protocol';
import ProtocolItem from './models/ProtocolItem';
import Evidence from './models/Evidence';
import NonConformity from './models/NonConformity';

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
  modelClasses: [User, Project, Location, Protocol, ProtocolItem, Evidence, NonConformity],
});

export const usersCollection = database.get<User>('users');
export const projectsCollection = database.get<Project>('projects');
export const locationsCollection = database.get<Location>('locations');
export const protocolsCollection = database.get<Protocol>('protocols');
export const protocolItemsCollection = database.get<ProtocolItem>('protocol_items');
export const evidencesCollection = database.get<Evidence>('evidences');
export const nonConformitiesCollection = database.get<NonConformity>('non_conformities');
