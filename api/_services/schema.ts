
import { pgTable, uuid, text, numeric, integer, boolean, timestamp, jsonb } from 'drizzle-orm/pg-core';

export const admin_users = pgTable('admin_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  password_hash: text('password_hash').notNull(),
  username: text('username'),
  role: text('role'),
  raw_password: text('raw_password'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const categories = pgTable('categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  image_url: text('image_url'),
  active: boolean('active').default(true),
  sort_order: integer('sort_order').default(0),
  organization_id: uuid('organization_id'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const services = pgTable('services', {
  id: uuid('id').primaryKey().defaultRandom(),
  category_id: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
  category: text('category'), 
  title: text('title').notNull(),
  description: text('description'),
  price: numeric('price', { precision: 10, scale: 2 }),
  duration: text('duration'), 
  duration_min: integer('duration_min').notNull().default(0),
  image_url: text('image_url'),
  active: boolean('active').default(true),
  sort_order: integer('sort_order').default(0),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const leads = pgTable('leads', {
  id: uuid('id').primaryKey().defaultRandom(),
  organization_id: uuid('organization_id'),
  client_name: text('client_name').notNull(),
  contact_info: jsonb('contact_info'),
  intent_score: integer('intent_score').default(0),
  status: text('status').default('new'),
  is_bot_enabled: boolean('is_bot_enabled').default(true),
  chat_history: jsonb('chat_history').default([]),
  category_id: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
  current_state: jsonb('current_state'),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const appointments = pgTable('appointments', {
  id: uuid('id').primaryKey().defaultRandom(),
  lead_id: uuid('lead_id').references(() => leads.id, { onDelete: 'cascade' }),
  organization_id: uuid('organization_id'),
  date_time: timestamp('date_time', { withTimezone: true }).notNull(),
  service_type: text('service_type').notNull(),
  status: text('status').default('confirmed'),
  total_price: numeric('total_price', { precision: 10, scale: 2 }),
  total_duration: integer('total_duration'),
  selected_services: jsonb('selected_services'),
  category_id: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
  payment_method: text('payment_method'),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const chat_logs = pgTable('chat_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  lead_id: uuid('lead_id').references(() => leads.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  content: text('content'),
  media_url: text('media_url'),
  media_data: text('media_data'),
  sent_to_whatsapp: boolean('sent_to_whatsapp').default(false),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const user_permissions = pgTable('user_permissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id').references(() => admin_users.id, { onDelete: 'cascade' }),
  category_id: uuid('category_id').references(() => categories.id, { onDelete: 'cascade' }),
});
