# 🧠 Estructura y Lógica del Chatbot KÂLON (Versión Evolucionada)

Este documento detalla el funcionamiento interno del asistente virtual tras la actualización al sistema de **Multi-Servicios (Carrito)** e integración con **NLP**.

---

## 🏗️ Nueva Arquitectura de Inteligencia

El bot ha migrado a un entorno **Node.js Runtime** para soportar el procesador de lenguaje natural.

1. **Motor NLP (Natural Language Processing)**: Utiliza `node-nlp` con el corpus `corpus-es.json`.
2. **Detección de Intenciones**: Identifica si el usuario saluda, quiere agendar, lista servicios, o niega una opción.
3. **Independencia de Canal**: En WhatsApp utiliza NLP puro; en Web mantiene una interfaz híbrida.
4. **Streaming SSE**: Mantiene la respuesta palabra por palabra en la web para una experiencia premium.

---

## ⚙️ Máquina de Estados Actualizada (State Machine)

El flujo ahora permite navegar por jerarquías y acumular servicios:

| Etapa (`stage`) | Descripción | Transición |
| :--- | :--- | :--- |
| `greeting` | Bienvenida inicial. | Detecta intención de agendar -> `parent_selection` |
| `parent_selection` | Lista de **Categorías** (Padres). | El usuario elige categoría -> `sub_service_selection` |
| `sub_service_selection` | Muestra **Sub-servicios** de la categoría actual. | El usuario elige servicio -> Navega a siguiente categoría pendiente o a `cart_review` |
| `cart_review` | **Resumen Detallado** (Precios y Duración). | Muestra listado completo. Confirmación -> `name_collection`. Modificar -> `parent_selection`. |
| `name_collection` | Solicita nombre (con limpieza de frases). | Nombre extraído inteligentemente -> `phone_collection` |
| `phone_collection` | Solicita/Confirma WhatsApp. | Teléfono recibido -> `availability_proposal` |
| `availability_proposal` | Busca huecos en ventanas de 30m. | Basado en **Duración Total** acumulada. Horario aceptado -> `payment_request` |
| `payment_request` | Pide seña del 50% y Alias. | Espera comprobante -> `waiting_for_receipt` |
| `waiting_for_receipt` | Bloqueo de espera de imagen. | Recibe imagen -> `done` |
| `done` | Confirmación final. | Cita confirmada en DB. |

---

## 📅 Lógica de Disponibilidad Acumulativa

A diferencia de la versión anterior, el bot ahora suma la duración de todos los servicios en el carrito:

- **Cálculo de Bloques Contiguos**: Si la sesión dura 1h 30m, el bot busca espacios de 90 minutos libres sin solaparse con otros turnos existentes.
- **Precisión de 30 minutos**: La búsqueda de huecos se realiza en intervalos de 30 minutos, permitiendo agendar a las 10:00, 10:30, 11:00, etc.
- **Ventana de Atención**: Las opciones se ofrecen dentro del rango de **09:00hs a 20:00hs**.
- **Validación en Tiempo Real**: Cruce de datos constante con la tabla `appointments` de Neon DB.

---

## 🧼 Limpieza y Extracción de Datos Inteligente

Para lograr un 99% de precisión en la recolección de datos, el bot utiliza:

1. **Fuzzy Matching (Levenshtein)**: Tolera errores ortográficos del cliente (ej: "piling" -> "Peeling", "uñas" -> "Uñas").
2. **Extracción de Nombres**: Filtra frases de relleno como "Mi nombre es...", "Hola soy...", "Si, anotame como..." para extraer únicamente el nombre propio con su capitalización correcta.
3. **Validación de Categorías Secuenciales**: Si el cliente pide múltiples categorías al inicio (ej: "Cejas y Faciales"), el bot crea una cola de espera y navega por cada una ordenadamente antes de cerrar el pedido.

---

## 💳 Cerrojero de Pago y Validación 24/7

El bot actúa como un cajero automático para reservas:

- **Cálculo de Seña**: Calcula automáticamente el 50% del total acumulado.
- **Detección de Multimedia**: Si el usuario envía una imagen (captura de pantalla) mientras está en estado de pago, el bot:
    1. Guarda la URL de la imagen en `chat_logs`.
    2. Inserta la cita en `appointments` con la lista completa de servicios.
    3. Marca la cita como **Confirmada** sin intervención humana.

---

## 📂 Persistencia y CRM Integrado

- **Leads**: Se crean automáticamente con un `intent_score` basado en el progreso del carrito (70-100 puntos).
- **Categorías**: El bot lee dinámicamente la tabla `categories` para el primer listado.
- **Servicios**: Los precios y duraciones se obtienen de la tabla `services`.

---

> [!IMPORTANT]
> Este documento es para uso técnico interno y reside solo en el entorno local del servidor. La lógica principal se encuentra en `api/chat.ts`.
