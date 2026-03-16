# 📔 Guía Funcional y de Usuario — KÂLON Estética

Esta guía detalla el funcionamiento del ecosistema KÂLON desde la perspectiva del usuario final y el administrador del negocio.

---

## 🙋‍♂️ 1. Experiencia del Usuario (El Chatbot)

El asistente inteligente está diseñado para ser invisible pero eficiente. Su objetivo es convertir una consulta en una seña pagada.

### **Flujo de Conversación Inteligente**
1.  **Bienvenida Dinámica**: El bot reconoce si es la primera vez que el usuario escribe o si ya es un cliente conocido.
2.  **Selección de Servicios (Modo Carrito)**:
    - El usuario navega por categorías (ej: "Tratamientos Faciales").
    - Selecciona uno o varios servicios. El bot suma precios y duraciones automáticamente.
3.  **Recolección de Datos con NLP**:
    - No hace falta escribir el nombre perfecto. El bot extrae el nombre de frases como: *"Hola, anotame como Diego Federico"*.
4.  **Agendamiento Preciso**:
    - El sistema busca huecos libres en la agenda real.
    - Si un tratamiento dura 120 minutos, solo ofrecerá horarios donde haya 2 horas seguidas disponibles.
5.  **Confirmación por Comprobante**:
    - El bot solicita el Alias/CBU y el 50% de la seña.
    - Al detectar la carga de una imagen (comprobante), el turno pasa de "Pendiente" a "**Confirmado**" automáticamente.

---

## 👩‍💼 2. Dashboard del Administrador

El panel central (`/dashboard`) es donde ocurre el control del negocio.

### **Módulos Principales**
-   **Agenda del Día**: Lista de todos los turnos para hoy. 
    -   *Interacción*: Puedes cambiar el estado (Pendiente -> Confirmada -> Realizada) haciendo clic sobre el badge de color.
    -   *WhatsApp Rápido*: Un botón permite abrir un chat directo con el cliente sin agendarlo en tu celular.
-   **Clientes Potenciales (Leads)**: 
    -   Muestra a personas que interactuaron con el bot pero no terminaron de agendar. 
    -   *Valor Real*: Permite al dueño hacer "Remarketing" manual para cerrar esas ventas perdidas.
-   **Finanzas e Ingresos**: 
    -   Suma automática de los ingresos del día y del mes basado en los servicios realizados.
    -   Visualización de "Ingresos Proyectados" basado en las citas confirmadas.

---

## 🔧 3. Guía de Escalabilidad y Precios

KÂLON ha sido construido de forma **Modular**. Esto significa que puedes cambiar el negocio sin contratar a un programador cada vez.

### **¿Cómo cambiar un precio o añadir un servicio?**
1.  Ingresa a tu consola de **Neon DB / Supabase**.
2.  Busca la tabla `services`.
3.  **Editar Precio**: Cambia el valor en la columna `price`. El bot lo dirá actualizado en el próximo mensaje.
4.  **Añadir Servicio**: Crea una nueva fila con el `category_id` correspondiente. El bot lo incluirá automáticamente en el menú.

### **¿Cómo mejorar la comprensión del bot?**
Si notas que el bot no entiende una frase específica de Córdoba (ej: *"Che, agendame..."*):
1.  Añade esa frase al archivo `corpus-es.json` en la carpeta `Entrenamiento NLP`.
2.  El sistema aprenderá esa nueva forma de hablar en el próximo reinicio.

---

## 🔐 4. Seguridad y Sincronización
-   **Neon DB**: Todos los datos están en la nube con backups diarios automáticos.
-   **Privacidad**: El historial de chat es privado y solo accesible por el administrador desde el dashboard.
-   **Tokens**: No hay APIs externas que puedan "cortarse" por falta de pago de suscripción (GPT), lo que garantiza un funcionamiento 24/7.

---

> [!TIP]
> **KÂLON** está diseñado para ser tu empleado más eficiente: nunca duerme, nunca olvida una cita y siempre cobra la seña por adelantado.
