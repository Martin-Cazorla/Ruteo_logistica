# RUTEO LOGÍSTICA

# Engineering Handbook

## Documento 05

# FLUJO DE TRABAJO (SDLC)

**Versión:** 1.0

**Estado:** Activo

**Proyecto:** Ruteo Logística

**Documentos relacionados**

- Documento 01 – Prompt Maestro
- Documento 02 – Filosofía del Proyecto
- Documento 03 – Objetivos del Proyecto
- Documento 04 – Arquitectura General

---

# 1. Propósito

Este documento establece el flujo oficial de trabajo para el desarrollo de Ruteo Logística.

Su objetivo es garantizar que todas las funcionalidades se desarrollen siguiendo un proceso ordenado, repetible y documentado.

Ningún cambio importante deberá realizarse fuera de este flujo.

---

# 2. Principios del Flujo de Trabajo

Todo desarrollo deberá cumplir los siguientes principios:

- Planificar antes de programar.
- Comprender antes de modificar.
- Documentar antes de integrar.
- Auditar antes de finalizar.
- Registrar toda decisión técnica.

---

# 3. Ciclo de Vida del Desarrollo (SDLC)

Todo desarrollo seguirá el siguiente ciclo:

```text
Idea
   │
   ▼
Análisis
   │
   ▼
Planificación
   │
   ▼
Diseño
   │
   ▼
Desarrollo
   │
   ▼
Revisión Técnica
   │
   ▼
Auditoría
   │
   ▼
Documentación
   │
   ▼
Integración
   │
   ▼
Cierre
```

No se permitirá omitir etapas.

---

# 4. Etapa 1 – Identificación de la Necesidad

Antes de escribir código se deberá responder:

- ¿Qué problema resuelve?
- ¿Qué módulo será afectado?
- ¿Existe una solución similar?
- ¿Puede reutilizarse código existente?
- ¿Afecta otras pantallas?

Toda funcionalidad deberá tener un objetivo claro.

---

# 5. Etapa 2 – Análisis

Antes de modificar el proyecto deberá analizarse:

- arquitectura actual;
- módulos relacionados;
- dependencias;
- impacto esperado;
- posibles riesgos.

Toda decisión deberá justificarse técnicamente.

---

# 6. Etapa 3 – Planificación

Toda funcionalidad deberá registrarse previamente en el Roadmap.

La planificación deberá incluir:

- objetivo;
- prioridad;
- complejidad;
- dependencias;
- criterios de aceptación.

---

# 7. Etapa 4 – Diseño

Antes de implementar deberá definirse:

- estructura HTML;
- componentes reutilizables;
- estilos necesarios;
- lógica JavaScript;
- interacción con Services;
- impacto sobre el State.

Siempre se priorizará la reutilización.

---

# 8. Etapa 5 – Desarrollo

Durante la implementación deberán respetarse:

## HTML

- semántico;
- accesible;
- limpio.

## SCSS

- Mobile First;
- componentes reutilizables;
- sin duplicaciones.

## JavaScript

- modular;
- desacoplado;
- documentado;
- siguiendo ES Modules.

## Firebase

Toda interacción deberá pasar por Services.

---

# 9. Etapa 6 – Revisión Técnica

Antes de integrar cualquier cambio deberá realizarse una revisión técnica.

La revisión verificará:

- arquitectura;
- responsabilidades;
- reutilización;
- organización;
- calidad del código.

---

# 10. Etapa 7 – Auditoría

Toda funcionalidad deberá superar una auditoría técnica.

La auditoría verificará:

- funcionamiento;
- responsive;
- accesibilidad;
- rendimiento;
- seguridad;
- experiencia de usuario;
- documentación.

No podrá integrarse código que no apruebe la auditoría.

---

# 11. Etapa 8 – Documentación

Todo cambio importante deberá reflejarse en:

- Bitácora Técnica;
- Roadmap;
- Historial de Versiones;
- Deuda Técnica;
- documentación correspondiente.

La documentación forma parte del desarrollo.

---

# 12. Etapa 9 – Integración

Una funcionalidad podrá integrarse únicamente cuando:

- esté finalizada;
- haya sido auditada;
- esté documentada;
- no rompa funcionalidades existentes.

---

# 13. Etapa 10 – Cierre

Al finalizar cada tarea deberá verificarse:

- actualización del Roadmap;
- actualización de la Bitácora;
- registro de la versión;
- identificación de mejoras futuras;
- registro de deuda técnica (si corresponde).

---

# 14. Flujo Oficial para Trabajar con Gemini

Cada sesión de desarrollo deberá comenzar con el siguiente proceso:

1. Revisar el Roadmap.
2. Identificar la tarea.
3. Analizar la arquitectura.
4. Consultar la documentación relacionada.
5. Solicitar una propuesta de implementación.
6. Implementar.
7. Ejecutar la auditoría.
8. Actualizar la documentación.
9. Registrar los cambios.

---

# 15. Flujo Oficial para Trabajar con NotebookLM

Antes de comenzar una nueva funcionalidad se recomienda consultar:

1. Prompt Maestro.
2. Filosofía del Proyecto.
3. Objetivos.
4. Arquitectura General.
5. Arquitectura específica del módulo.
6. Manual de Componentes (cuando exista).

Esto garantiza respuestas consistentes por parte de la IA.

---

# 16. Flujo para Corrección de Errores

Cuando se detecte un error:

1. Reproducir el problema.
2. Identificar el origen.
3. Analizar el impacto.
4. Diseñar la solución.
5. Implementar la corrección.
6. Ejecutar pruebas.
7. Documentar la solución.
8. Actualizar la Bitácora.
9. Registrar el cambio en el Historial de Versiones.

Nunca se aplicarán correcciones sin comprender la causa del problema.

---

# 17. Flujo para Refactorización

Antes de refactorizar deberá verificarse:

- que exista una mejora clara;
- que no cambie el comportamiento esperado;
- que reduzca complejidad;
- que mejore la mantenibilidad.

Toda refactorización deberá documentarse.

---

# 18. Checklist de Desarrollo

Antes de finalizar una tarea verificar:

- Código limpio.
- Arquitectura respetada.
- Sin duplicaciones.
- Responsive validado.
- Accesibilidad revisada.
- Sin errores en consola.
- Services correctamente utilizados.
- Controllers con responsabilidad única.
- Componentes reutilizables.
- Documentación actualizada.

---

# 19. Definition of Ready (DoR)

Una tarea está lista para comenzar cuando:

- existe un objetivo claro;
- se conoce el alcance;
- se identificaron dependencias;
- existen criterios de aceptación;
- la arquitectura fue analizada.

---

# 20. Definition of Done (DoD)

Una tarea solo estará finalizada cuando:

- el código funcione correctamente;
- pase la auditoría técnica;
- sea responsive;
- sea accesible;
- esté documentada;
- esté registrada en la Bitácora;
- actualice el Roadmap;
- registre la versión correspondiente.

---

# 21. Flujo de Mejora Continua

Después de cada desarrollo se realizará una revisión para identificar:

- oportunidades de simplificación;
- reutilización de componentes;
- reducción de deuda técnica;
- optimización de rendimiento;
- mejoras de experiencia de usuario.

La mejora continua forma parte del ciclo de desarrollo.

---

# 22. Compromiso del Equipo

Todo desarrollo de Ruteo Logística seguirá este flujo de trabajo.

La prioridad será mantener la calidad, la coherencia arquitectónica y la documentación sincronizada con el código.

El objetivo no es desarrollar más rápido, sino desarrollar mejor.

---

## Próximos documentos relacionados

- Documento 06 – Convenciones del Proyecto
- Documento 07 – Arquitectura JavaScript
- Documento 08 – Arquitectura SCSS
- Documento 09 – Sistema de Componentes
- Documento 10 – Firebase

---

**Fin del Documento 05 – Flujo de Trabajo**

**Engineering Handbook – Ruteo Logística v1.0**
