# 🧠 BITÁCORA DE APRENDIZAJE PERMANENTE - ANTIGRAVITY

Este documento es de lectura OBLIGATORIA para mí en cada sesión. Aquí registro mis fallas y las reglas de hierro que NO puedo romper para el proyecto KÂLON Estética.

## 🚫 ERRORES CRÍTICOS COMETIDOS (PROHIBIDO REPETIR)
1. **Romper lo simple:** Intentar optimizar procesos que dañan la estabilidad (como bajar los `maxSteps` excesivamente).
2. **Redundancia Conversacional:** No repetir confirmaciones de registro si el usuario ya pidió una acción específica. El bot debe ser directo y usar el nombre del cliente.
3. **Omisión de Catálogo:** NUNCA eliminar la llamada a `listar_categorias_principales` en el Paso 1. El cliente DEBE ver la foto maestra al registrarse.
4. **Ignorar Etiquetas de Estado:** El bot necesita saber si el cliente es "NUEVO" o "IDENTIFICADO" en cada mensaje para no dar vueltas.

## 🛡️ REGLAS DE ORO (SKILLS DE SUPERVIVENCIA)
1. **ESTABILIDAD > TODO:** Mantener `maxSteps: 15` siempre.
2. **VERIFICACIÓN TRIPLE:** Al terminar un deploy, DEBO verificar que el repositorio de Git tenga los cambios y que Vercel haya terminado la compilación.
3. **RESPETAR EL FRASEO:** Si el usuario pide un texto exacto (ej: "Romina acá tenés los servicios..."), se usa ese texto sin inventar alternativas.
4. **NO TOCAR LOGICA:** Si me piden cambiar un texto, NO muevo las llamadas a herramientas ni cambio el flujo de etapas.

## 📝 LECCIONES POR ETAPA
### Chatbot
- El bot debe ser visual: Traer imágenes con 'consultar_servicios' es la prioridad máxima.
- Si el cliente da su nombre y pide un servicio en el mismo mensaje, SALTAR la confirmación de registro e ir directo a los servicios.

### Base de Datos
- Priorizar estabilidad: El procesamiento secuencial es preferible al paralelo para evitar crasheos. NO OPTIMIZAR si no se solicita expresamente.

---
*Última actualización: 20 de Abril de 2026 - Estabilización Crítica del Flujo de Registro y Catálogo.*

