# IF Backend Main

API principal de InflightOS. Centraliza la operacion del ERP: organizaciones, clientes, oportunidades, proyectos, misiones, lotes de medios, entregables, solicitudes de factura e integraciones con el servicio de conectores.

## Que Hace

- Expone endpoints REST bajo NestJS para los dominios principales del negocio.
- Gestiona autenticacion web/native, sesiones JWT, refresh tokens por cookie y validacion de permisos.
- Persiste datos operativos en MongoDB usando Mongoose.
- Mantiene capacidades transversales de auditoria, eventos, idempotencia, salud HTTP y control de acceso.
- Se integra con `if-connectors-backend` mediante un cliente runtime para espejar conectores por proyecto.

## Estructura Del Proyecto

```text
src/
  app.module.ts                # Ensambla configuracion, base de datos, plataforma y modulos de negocio
  main.ts                      # Bootstrap de NestJS
  common/                      # Errores, tipos y utilidades compartidas
  platform/                    # Capacidades transversales de infraestructura
    access-control/            # Roles, permisos, policies, guards y scopes
    audit/                     # Registro de auditoria
    auth-http/                 # Controladores de autenticacion HTTP
    config/                    # Validacion y lectura de variables de entorno
    database/                  # Soporte transaccional
    events/                    # Eventos internos y handlers
    health/                    # Health checks
    http/                      # Configuracion global HTTP y request context
    idempotency/               # Control de idempotencia por request
    identity/                  # Usuarios, credenciales y hashing
    sessions/                  # Emision, refresh y validacion de sesiones
  modules/                     # Dominios funcionales del ERP
    organizations/
    crm/
    sales/
    projects/
    flight-ops/
    image-ops/
    deliverables/
    finance/
    integrations/
test/                          # Pruebas e2e e integracion
scripts/                       # Auditorias y bootstrap operativo
```

## Dominios Principales

- `organizations`: configuracion y contexto de organizaciones.
- `crm`: clientes y datos comerciales base.
- `sales`: oportunidades comerciales.
- `projects`: Project OS, backlog, roadmap, sprints, documentacion, equipo, actividad e importaciones.
- `flight-ops`: misiones y operacion de vuelos.
- `image-ops`: lotes de medios, muestras y eventos relacionados.
- `deliverables`: entregables asociados a proyectos u operaciones.
- `finance`: solicitudes de factura.
- `integrations`: cuentas de servicio, credenciales y espejos de conectores por proyecto.

## Patrones De Diseno

- Arquitectura modular de NestJS: cada dominio agrupa `module`, `controller`, `service`, `dto` y `schema`.
- Separacion entre plataforma y negocio: `platform/` concentra seguridad, sesiones, auditoria y HTTP; `modules/` concentra casos de uso.
- DTOs validados con `class-validator` y transformados con `class-transformer`.
- Schemas Mongoose por agregado o recurso persistente.
- Guards y decorators para autenticacion, autorizacion y contexto del principal autenticado.
- Mappers para separar modelo interno, documento persistido y respuesta HTTP cuando aplica.
- Filtro global de excepciones y codigos de razon estables para errores de API.
- Idempotencia y request id para operaciones sensibles a reintentos.
- Event handlers para reaccionar a cambios de dominio sin acoplar controladores.

## Tecnologias

- Node.js + TypeScript.
- NestJS 11.
- MongoDB + Mongoose.
- JWT, Passport y cookies HTTP-only para sesiones.
- Argon2 para hashing de credenciales.
- Helmet, CORS, throttling y filtros HTTP para endurecimiento de API.
- Jest, Supertest y `mongodb-memory-server` para pruebas.
- ESLint y Prettier para calidad de codigo.
- Yarn 1 como package manager declarado.

## Configuracion

La aplicacion lee `.env.local` y `.env`. Las variables se validan en `src/platform/config/app-config.ts`.

Variables clave:

- `PORT`: puerto HTTP.
- `MONGODB_URI`: conexion MongoDB.
- `CORS_ORIGINS`: origenes permitidos separados por coma.
- `JWT_ACCESS_SECRET` y `JWT_REFRESH_SECRET`: secretos de sesion.
- `JWT_ISSUER`, `JWT_AUDIENCE`, `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL`: contrato JWT.
- `REFRESH_COOKIE_*`: nombre, path, dominio, seguridad y SameSite de la cookie de refresh.
- `ARGON2_*`: parametros de hashing.
- `SUPERADMIN_*`: bootstrap opcional de superadmin.
- `DOCUMENT_IMPORT_PREVIEW_TOKEN_SECRET`: firma para previews de importacion.
- `IF_CONNECTORS_BASE_URL` y `IF_CONNECTORS_TIMEOUT_MS`: integracion con conectores.

## Comandos

```bash
yarn install
yarn start:dev
yarn build
yarn start:prod
yarn lint
yarn typecheck
yarn test
yarn test:integration
yarn test:security
yarn test:concurrency
yarn test:e2e
yarn test:release
```

## Flujo De Desarrollo

1. Configurar variables de entorno y MongoDB.
2. Ejecutar `yarn start:dev` para desarrollo local.
3. Usar `yarn test` para pruebas unitarias.
4. Usar las suites e2e/integracion antes de cambios de contrato API.
5. Ejecutar `yarn test:release` antes de considerar listo un cambio amplio.

## Relacion Con Otros Proyectos

- Lo consume `if-erp` como backend principal del ERP.
- Se comunica con `if-connectors-backend` para runtime y espejado de conectores.
- Su arquitectura esta indexada por `graphify-if` para analisis de impacto y navegacion de dependencias.
