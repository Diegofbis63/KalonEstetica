# KÂLON MULTIESPACIO ESTÉTICO 💎

| Status | Tech Stack | Design System | Deployment |
| :--- | :--- | :--- | :--- |
| ![Development](https://img.shields.io/badge/Status-Production--Ready-emerald?style=for-the-badge) | ![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white) ![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB) | ![Liquid Luxury](https://img.shields.io/badge/Style-Liquid_Luxury-D4AF37?style=for-the-badge) | ![Vercel](https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white) |

---

## ✨ Visión del Proyecto

**KÂLON** representa la cúspide de la estética moderna. No es simplemente un sitio web, sino un ecosistema digital de alta gama diseñado para automatizar y elevar la gestión de un multiespacio estético. Bajo nuestra filosofía **Liquid Luxury**, cada interacción fluye con elegancia, ofreciendo una experiencia de usuario premium tanto para el cliente final como para el equipo administrativo.

## 🚀 Módulos Principales

### 1. Landing Page de Alta Conversión
- **Hero Dinámico**: Impacto visual inmediato con tipografía de lujo y diseño responsivo.
- **Catálogo de Servicios**: Sistema de categorías con scroll inteligente y visualización premium.
- **Galería de Resultados**: Muro de transformaciones reales con efectos de hover y diseño cohesivo.
- **Reseñas y Confianza**: Sección de testimonios y "Por qué elegirnos" con narrativa persuasiva.

### 2. Dashboard de Gestión Senior
- **Finanzas e Ingresos**: 
  - Monitoreo de KPIs en tiempo real (Facturación, Tickets, Citas).
  - Filtros personalizados por fecha y servicios.
  - **Exportación Profesional**: Generación instantánea de reportes en **Excel** y **PDF** (plantilla contable).
- **Gestión de Citas (Agenda)**:
  - Vista de tabla detallada con estados de confirmación.
  - Desglose de servicios por turno con scroll funcional para múltiples tratamientos.
  - Control directo del estado del Asistente Virtual por cliente.
- **CRM de Leads y Clientes**:
  - Seguimiento de prospectos con Score de Intención.
  - Chat en tiempo real integrado con historial de WhatsApp.
  - Base de datos de clientes con historial de frecuencia y última visita.
- **Administración del Multiespacio**:
  - **RBAC (Role Based Access Control)**: Gestión de equipo con permisos específicos por categoría.
  - Editor de servicios dinámico con sistema de arrastrar y soltar (Drag & Drop).

### 3. Asistente Virtual Inteligente (KÂLON Bot)
- **Omnicanalidad**: Funciona en la web (SSE Streaming) y mediante integración con WhatsApp.
- **Agendamiento Automatizado**: Detecta servicios, solicita datos de contacto y propone horarios disponibles consultando la base de datos en tiempo real.
- **Modo Híbrido**: Switch de sincronización global para alternar entre atención automatizada y manual.

## 🛠️ Stack Tecnológico

- **Frontend Core**: React 18 + TypeScript + Vite.
- **Styling**: Tailwind CSS + Shadcn/UI (Customizado con estética "Dark Glass").
- **Animaciones**: Framer Motion para transiciones suaves y estados de carga.
- **Data Layer**: TanStack Query (React Query) para sincronización de estado y caché eficiente.
- **Backend & DB**: API Routes (Edge Runtime) + Neon Serverless Postgre (SQL).
- **Reporting**: Biblioteca `jspdf` y `xlsx` para generación de documentos en el cliente.

## 📁 Estructura del Proyecto

```text
api/              # Endpoints Edge centralizados (Citas, Chat, Ingresos, etc.)
src/
├── components/   # UI atomizada, componentes del dashboard y landing
├── context/      # Proveedores de estado (Auth, Chat)
├── lib/          # Utilidades core, configuraciones de API y hooks
├── pages/        # Vistas principales (SPA Routing)
└── types/        # Definiciones estrictas de TypeScript
```

## 💅 Design System: Liquid Luxury

Implementamos un estándar estético de **Clase Mundial**:
- **Dark Mode**: Fondo `#020617` con acentos en `Gold (#D4AF37)`.
- **Glassmorphism**: Capas translúcidas con `backdrop-blur` y bordes de alta definición.
- **Micro-interacciones**: Feedback visual en cada clic, hover y transición de página.

---

Desarrollado para **KÂLON MULTIESPACIO ESTÉTICO**. La elegancia hecha software. 🌟
