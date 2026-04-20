# 🧠 BITÁCORA DE APRENDIZAJE PERMANENTE - ANTIGRAVITY

Este documento es de lectura OBLIGATORIA para mí en cada sesión. Aquí registro mis fallas y las reglas de hierro que NO puedo romper para el proyecto KÂLON Estética.

## 🚫 ERRORES CRÍTICOS COMETIDOS (PROHIBIDO REPETIR)
1. **Romper lo simple:** Intentar optimizar procesos que dañan la estabilidad (como bajar los `maxSteps` excesivamente).
2. **Redundancia Conversacional:** No repetir confirmaciones de registro si el usuario ya pidió una acción específica. El bot debe ser directo.
3. **Simplificación Excesiva:** Borrar instrucciones de uso de herramientas (como pasó hoy en `ai.ts`) hace que la IA no sepa operar y crashee.
4. **Ignorar Etiquetas de Estado:** El bot necesita saber si el cliente es "NUEVO" o "IDENTIFICADO" en cada mensaje para no dar vueltas.

## 🛡️ REGLAS DE ORO (SKILLS DE SUPERVIVENCIA)
1. **ESTABILIDAD > TODO:** Mantener `maxSteps: 15` siempre; si la IA tiene margen para "pensar", no da el error "¡Ups!".
2. **VERIFICACIÓN TRIPLE:** Al terminar un deploy, DEBO verificar que el repositorio de Git tenga los cambios y que Vercel haya terminado la compilación.
3. **RESPETAR EL FRASEO:** Si el usuario pide un texto exacto (ej: "Romina acá tenés los servicios..."), se usa ese texto sin inventar alternativas.
4. **NO OPTIMIZAR SIN PEDIDO:** Si una parte del código funciona bien y el usuario no pidió optimizarla, NO se toca.

## 📝 LECCIONES POR ETAPA
### Chatbot
- El bot debe ser visual: Traer imágenes con 'consultar_servicios' es la prioridad máxima.
- Si el cliente da su nombre y pide un servicio en el mismo mensaje, SALTAR la confirmación de registro e ir directo a los servicios.

### Base de Datos
- Las consultas en paralelo (`Promise.all`) son mejores que los bucles `for` para traer varios servicios a la vez.

---
*Última actualización: 20 de Abril de 2026 - Estabilización Crítica del Flujo de Registro y Catálogo.*

