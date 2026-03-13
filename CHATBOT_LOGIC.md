# 🧠 Estructura y Lógica del Chatbot KÂLON

Este documento detalla el funcionamiento interno del asistente virtual para facilitar su mejora y mantenimiento.

---

## 🏗️ Arquitectura de Comunicación
El bot opera a través de dos canales principales con una lógica compartida en el servidor:

1.  **Web (Client-side)**: Utiliza `src/lib/kalon-chat.ts` para conectar con el servidor mediante **SSE (Server-Sent Events)**, permitiendo una respuesta fluida tipo "streaming" (palabra por palabra).
2.  **WhatsApp (Bridge)**: Las respuestas se envían formateadas en JSON plano a través del bridge, utilizando un formateador específico para negritas (`*`) e itálicas (`_`) compatibles con WhatsApp.

---

## ⚙️ El Motor de Estados (State Machine)
El bot no responde al azar; mantiene un estado de conversación (`ConvState`) que persiste en la memoria de la sesión actual:

| Etapa (`stage`) | Gatillo / Requisito | Acción del Bot |
| :--- | :--- | :--- |
| `greeting` | Inicio de conversación | Saludo y listado de servicios disponibles. |
| `service_selection` | No se detectó servicio | Pide al usuario elegir un tratamiento del catálogo. |
| `service_clarification` | Múltiples servicios detectados | Pide confirmar si quiere agendar varios o uno solo. |
| `name_collection` | Servicio definido, nombre falta | "Un gusto habarte, ¿con quién tengo el placer?" |
| `phone_collection` | Nombre definido, celular falta | Solicita WhatsApp para enviar confirmación. |
| `availability_proposal` | Datos completos | Consulta DB y propone el próximo hueco libre. |
| `done` | Turno confirmado | Registra la cita y se despide. |

---

## 🔍 Lógica de Extracción de Datos (`extractState`)

### 1. Detección de Servicios (Scoring System)
En lugar de buscar palabras exactas, usamos un sistema de puntaje:
- **Exact Match**: +10 puntos.
- **Palabra Clave (Regex)**: +3 puntos por palabra.
- **Partial Match**: +0.5 puntos.
- Si el score es > 2.5, se considera un "match". Si hay varios con puntaje alto, se entra en etapa de aclaración.

### 2. Recolección de Datos Personales
- **Nombre**: Filtra palabras comunes ("soy", "me llamo") y extrae el sustantivo. Valida que no tenga números y tenga entre 1 y 4 palabras.
- **Teléfono**: 
  - **Web**: Busca patrones numéricos de 8 a 12 dígitos.
  - **WhatsApp**: Detecta si el usuario dice "este mismo" o "sí" para usar el número desde donde escribe.

### 3. Persistencia de Teléfono
El sistema está configurado para que, una vez que el usuario confirma un número, este se mantenga en el estado aunque se cambie de servicio, evitando preguntar dos veces.

---

## 📅 Lógica de Agendamiento Automatizado

El bot sigue reglas de negocio estrictas para proponer turnos:
1.  **Calendario**: Busca a partir de "Mañana" (no agenda para el mismo día).
2.  **Horarios**: Solo propone entre las **10:00 y las 19:00**.
3.  **Días Cerrados**: Salta automáticamente los **Domingos**.
4.  **Colisiones**: Consulta la tabla `appointments` en tiempo real para evitar duplicados en el mismo slot.
5.  **Memoria de Rechazo**: Si el usuario dice "no puedo en ese horario", el bot guarda esa fecha en `rejectedDates` y busca la siguiente.

---

## 🔌 Integración de Persistencia (Base de Datos)

- **Leads**: Si el usuario proporciona sus datos, se crea/actualiza un registro en la tabla `leads` con un `intent_score` alto.
- **Chat Logs**: Cada mensaje (usuario y bot) se guarda en `chat_logs` asociado al `lead_id`, permitiendo que el staff humano vea el historial completo desde el Dashboard.
- **Appointments**: Al confirmar, se inserta un registro en la tabla con estado `confirmed`.

---

## 🛠️ Cómo Mejorar el Bot

1.  **Añadir Contexto**: En `generateResponse`, puedes agregar más variaciones de frases para que se sienta menos mecánico.
2.  **Nuevos Servicios**: El bot lee los servicios directamente de la tabla `services`. Solo asegúrate de que el nombre del servicio en la DB sea descriptivo para el sistema de scoring.
3.  **Tratamiento de Negativas**: Puedes ampliar el regex `userRejectsStrict` en `api/chat.ts` para detectar más formas de decir que un horario no sirve.

---

> [!NOTE]  
> Este documento es para uso técnico interno. La lógica reside principalmente en `api/chat.ts`.
