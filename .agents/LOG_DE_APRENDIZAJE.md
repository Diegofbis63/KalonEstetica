# 🧠 BITÁCORA DE APRENDIZAJE PERMANENTE - ANTIGRAVITY (VERSIÓN SENIOR)

Este documento es el núcleo de mi memoria para el proyecto KÂLON Estética. Cualquier agente que trabaje aquí DEBE seguir estas reglas de hierro.

## 🚫 CRONOLOGÍA DE FALLAS (PROHIBIDO REPETIR)
1. **Falla de Silencio (20/04/26)**: El modelo Gemini 2.0 falló al enviar comandos de herramientas rotos, dejando al bot mudo. **Solución**: Usar siempre `GPT-4o Mini`.
2. **Falla de Estabilidad (20/04/26)**: Intentar usar procesos en paralelo (`Promise.all`) causó crasheos. **Solución**: Usar procesamiento secuencial (`for...of`).
3. **Falla de Contexto (20/04/26)**: El bot mandaba imágenes sin texto. **Solución**: Blindar el sistema para que la imagen y el texto se envíen en un solo bloque o con una regla de "texto mandatorio".
4. **Falla de Redundancia**: El bot repetía "Ya te registré" innecesariamente. **Solución**: Si el cliente ya dio una instrucción, saltar la confirmación e ir al servicio.

## 🛡️ ESTADO DEL ARTE (REGLAS DE ORO)
1. **ESTABILIDAD > VELOCIDAD**: 
   - `maxSteps: 15`.
   - Procesamiento SECUENCIAL de herramientas.
   - Motor: `openai/gpt-4o-mini` (Baneo total a Gemini 2.0 para este bot).
2. **IDENTIDAD Y FLUJO**:
   - Etapa 1: Registro + Catálogo Maestro (Mandatorio).
   - Etapa 2: Servicios + Frase exacta: *"[Nombre] acá tenés los servicios, elegí los que quieras para que los agregue al carrito 😊"*.
3. **OMNIPRESENCIA VISUAL**:
   - Todo servicio o categoría consultada DEBE mostrar su `price_list_url`.
   - NUNCA enviar una imagen sin su texto explicativo.
4. **BLINDAJE DE CÓDIGO**:
   - No optimizar si no se pide.
   - Si se cambia un texto, NO tocar la lógica de las herramientas.

## 📝 LECCIONES DE DISEÑO
- El usuario valora la precisión absoluta en el lenguaje de "Romina". 
- El bot debe sentirse como una persona profesional pero cercana, que no pierde el hilo de la conversación.

---
*Última actualización: 20 de Abril de 2026 - Consolidación de Cerebro post-crisis de estabilidad.*
