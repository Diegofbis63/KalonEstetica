# ✨ KÂLON Multiespacio Estético — Inteligencia Operativa

![KÂLON Hero](https://kalon-estetica.vercel.app/assets/centro-kalon-estetica.png)

## 💎 Visión General
**KÂLON** no es solo una landing page; es una plataforma de **Inteligencia Operativa** diseñada para transformar un centro de estética tradicional en un negocio automatizado de alto rendimiento. Combina una interfaz de usuario de lujo con un motor de procesamiento de lenguaje natural (NLP) local que gestiona citas de forma autónoma las 24 horas del día.

---

## 🛠️ Stack Tecnológico (The Dream Team Stack)

### **Frontend (Vanguardia Visual)**
- **Framework**: [Next.js 14](https://nextjs.org/) (App Router) con TypeScript para máxima estabilidad.
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) con diseño **Glassmorphism** y tipografía serif premium.
- **Interactividad**: [Framer Motion](https://www.framer.com/motion/) y **ScrollReveal** para una experiencia de usuario fluida y "viva".
- **Gestión de Estado**: React Hooks & Context API para sincronización de datos en tiempo real.

### **Backend & Base de Datos (Robustez)**
- **Database**: [Neon DB](https://neon.tech/) (PostgreSQL Serverless) para una escalabilidad instantánea.
- **Serverless Runtime**: Vercel Edge / Node Functions.
- **Lógica de Servidor**: Arquitectura modular con servicios desacoplados para base de datos, NLP y gestión de estados.

### **Inteligencia Artificial (NLP Local - 0 Cost)**
- **Motor**: [node-nlp](https://github.com/axa-group/nlp.js) personalizado.
- **Entrenamiento**: Modelo entrenado desde cero con un corpus específico para el sector estético cordobés.
- **Ventaja**: **Costo $0**. Al ser un modelo local, no depende de APIs externas (como OpenAI), eliminando costos por mensaje y garantizando privacidad total.

---

## 🚀 Funcionalidades Clave

### 🤖 Chatbot Omnicanal (Web & WhatsApp)
- **Reconocimiento de Intenciones**: El bot entiende si el usuario quiere saludar, consultar precios o agendar directamente.
- **Identificación de Clientes**: Reconoce automáticamente a clientes recurrentes por su número de teléfono o ID, manteniendo el historial de conversación.
- **Carrito de Servicios**: Permite agendar múltiples servicios en una sola sesión (Cejas + Faciales, etc.).

### 📅 Gestión Automática de Turnos
- **Cálculo de Disponibilidad**: Busca huecos contiguos basados en la **duración total** de los servicios elegidos.
- **Validación de Comprobantes**: El sistema detecta cuando el usuario envía una imagen (comprobante) y confirma el turno automáticamente en la base de datos sin intervención humana.
- **Escudo de Cortesía**: Lógica unificada que evita que el bot sea repetitivo y gestiona las despedidas de forma humana.

### 📊 Dashboard Administrativo (Centro de Mando)
- **Agenda Interactiva**: Cambio de estado de turnos con un clic (Pendiente, Confirmada, Realizada).
- **Gestión de Leads**: Filtro de "Clientes Potenciales" para identificar personas que iniciaron el proceso pero no concretaron.
- **KPIs Financieros**: Visualización de ingresos estimados, clientes activos y tasas de conversión.

---

## 🧠 Lógica de Negocio: La Máquina de Estados

El corazón del sistema es una **Máquina de Estados Finita (FSM)** que garantiza que el bot nunca pierda el hilo de la conversación:

1. **Exploración**: El bot presenta el menú dinámico desde `categories` y `services` de la DB.
2. **Reserva**: Recolecta Nombre y WhatsApp de forma inteligente (limpieza de frases).
3. **Propuesta**: Ofrece huecos disponibles cruzando datos con `appointments` en tiempo real.
4. **Validación**: Espera la transferencia (50% de seña) y confirma al recibir la captura de pantalla.

---

## 📈 Instrucciones de Escalabilidad

El proyecto ha sido diseñado para crecer sin tocar el código fuente:

- **Cambio de Precios/Servicios**: Se gestiona directamente desde la base de datos Neon. El bot lee los cambios instantáneamente.
- **Nuevas Categorías**: Solo basta con añadir una entrada en la tabla `categories`, y el flujo de navegación del chatbot se adaptará automáticamente.
- **Re-entrenamiento**: La lógica de NLP está separada en `/Entrenamiento NLP`, permitiendo mejorar la comprensión del bot sin afectar la lógica de citas.

---

## 📦 Instalación y Despliegue

1. **Clonar repositorio**: `git clone ...`
2. **Variables de Entorno**: Configurar `DATABASE_URL` y `WHATSAPP_API_URL` en el archivo `.env`.
3. **Instalación**: `npm install`
4. **Desarrollo**: `npm run dev`
5. **Deploy**: Configurado para despliegue automático en **Vercel**.

---

> [!NOTE]
> Este proyecto representa la unión perfecta entre **Estética de Lujo** y **Software de Ingeniería de Datos**. Desarrollado por **Diegofbis63** & **Antigravity AI**.
