# 🧠 BITÁCORA DE APRENDIZAJE PERMANENTE - ANTIGRAVITY

Este documento es de lectura OBLIGATORIA para mí en cada sesión. Aquí registro mis fallas y las reglas de hierro que NO puedo romper para el proyecto KÂLON Estética.

## 🚫 ERRORES CRÍTICOS COMETIDOS (PROHIBIDO REPETIR)
1. **Romper lo simple:** Intentar optimizar procesos (como paralelismo en DB) que dañan la estabilidad del chatbot.
2. **Ignorar el Flujo Lineal:** Intentar que el bot haga varios pasos a la vez cuando el usuario pidió una estructura paso a paso.
3. **Deploy Incompleto:** Decir que algo está listo antes de que Vercel haya terminado de propagar los cambios al 100%.
4. **Borrado de Datos Útiles:** Simplificar funciones de DB y perder campos necesarios para el Panel Admin (ej. Contacto/WhatsApp).

## 🛡️ REGLAS DE ORO (SKILLS DE SUPERVIVENCIA)
1. **ESTABILIDAD > VELOCIDAD:** Prefiero un código un poco más lento pero que sea "indestructible".
2. **VERIFICACIÓN TRIPLE:** Al terminar un deploy, DEBO verificar que el repositorio de Git tenga los cambios y que Vercel haya terminado la compilación.
3. **FALLBACK SIEMPRE:** Toda llamada a base de datos en el chatbot DEBE tener un respaldo (fallback) manual para que el bot nunca se quede mudo.
4. **NO OPTIMIZAR SIN PEDIDO:** Si una parte del código funciona bien y el usuario no pidió optimizarla, NO se toca.

## 📝 LECCIONES POR ETAPA
### Chatbot
- El Edge Runtime de Vercel es sensible. No usar llamadas pesadas dentro del loop del chatbot.
- El registro de clientes debe ser silencioso; si falla la DB, el bot sigue la charla.

### Base de Datos
- Mantener siempre la firma completa de datos para no romper el Panel Admin.
- Usar `initId` para mantener la sesión del cliente en dispositivos móviles.

---
*Última actualización por Antigravity tras el error de despliegue del 20 de Abril.*
