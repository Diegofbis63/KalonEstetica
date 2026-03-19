
# KÂLON Naming Dictionary (Audit Result)
Este documento es la Fuente de Verdad para la nomenclatura del proyecto. Se ha realizado una auditoría completa para eliminar colisiones entre Frontend, API, Drizzle y Base de Datos (Neon).

## 1. Mapeo de Entidades Principales
Entidad | Propiedad DB (Neon) | Drizzle Schema | API Response (JSON) | Frontend (Zod/UI)
--- | --- | --- | --- | ---
**Categoría** | `id`, `name` | `id`, `name` | `id`, `name` | `id`, `name`
**Servicio** | `title`, `price` | `title`, `price` | `title`, `price` | `title`, `price`
**Turno** | `total_price` | `total_price` | `total_price` | `total_price`
**Cliente** | `client_name` | `client_name` | `client_name` | `client_name`
**Contacto** | `contact_info` | `contact_info` | `phone`, `email` | `phone`, `email`
**Staff** | `role`, `is_active` | `role`, `is_active` | `role`, `specialties` | `role`, `specialties`

## 2. Estandarización de Estados (Turnos)
Se ha unificado la nomenclatura de estados para evitar fragmentación entre español (REALIZADA) e inglés (confirmed).

Estado Interno (DB/Code) | Significado UI | Acciones Permitidas
--- | --- | ---
`pending` | Pendiente | Confirmar, Cancelar
`confirmed` | Confirmado | Realizar, Cancelar
`REALIZADA` | Realizada | Facturar (Solo Admin)
`canceled` | Anulado | Auditoría

## 3. Estado de Leads (Chatbot)
Nomenclatura para la canalización de ventas.

Estado | Significado
--- | ---
`new` | Nuevo contacto (Sin IA)
`active` | IA respondiendo / Intent identificado
`qualified` | Turno agendado / Cliente VIP
`converted` | Servicio ya realizado (Proveniente de cita REALIZADA)

## 4. Arquitectura de APIs (Consolidada)
Endpoint | Propósito | Entidades Manejadas
--- | --- | ---
`/api/cms` | Catálogo de servicios | `categories`, `services`
`/api/team` | Gestión de equipo | `staff`, `admin_users` (RBAC)
`/api/admin` | Operaciones CORE | `system_logs`, `view_system_metrics`, `dashboard`
`/api/income` | Finanzas | `view_category_performance`, `income_reports`

---
*Ultima Actualización: 2026-03-19 — Antigravity Assistant*
