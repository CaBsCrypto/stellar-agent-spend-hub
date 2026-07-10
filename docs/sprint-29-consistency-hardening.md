# Sprint 29: Consistency Hardening — cierre de brechas de simplicidad

## Objetivo

Cerrar todas las brechas encontradas en la auditoria de 2026-07-07 (ver [current-state.md](./current-state.md)) sin tocar logica de pagos ni compuertas de seguridad. Foco: que la experiencia del usuario final quede **100% coherente en espanol**, que esa coherencia quede protegida por un test (no dependa de que alguien se acuerde), y que los cabos sueltos de despliegue del Horizonte 1 del roadmap se cierren en la misma pasada.

## Por que ahora

El refactor agent-first (Sprints 25-28) dejo la arquitectura y la UX en el mejor estado del proyecto, pero la traduccion se hizo en dos oleadas distintas (una mia, ingles-only; otra posterior, espanol-first) y quedaron fragmentos sin unificar. Es barato de arreglar (son strings, no logica) y de alto impacto: es literalmente lo primero que ve un usuario no experto, la audiencia que este sprint fue disenado para servir.

## Alcance

### 1. Traducir el dominio (S, ~1h)

- `src/mockPayments.mjs`: 5 campos `agentReason` en ingles -> espanol, mismo tono que el resto (`spend.mjs`, `serviceCards.mjs`).
- `src/mockProviders.mjs`: 10 campos `description` en ingles -> espanol.
- Verificar `tests/policy.test.mjs` y `tests/sprint25-product-experience.test.mjs`: si algun assert compara el texto exacto de estos campos, actualizarlo junto con el string.
- Aceptacion: `grep` de las paginas primarias no devuelve frases en ingles fuera de nombres propios (Stellar, USDC, MCP, API).

### 2. Traducir el marco de navegacion (S, ~30min)

- `src/client/routes.mjs`: `label` y `short` de las 5 rutas primarias (`/`, `/discover`, `/spend`, `/activity`, `/wallet`) a espanol, consistente con lo que ya dice cada pagina (`Inicio`, `Descubrir`, `Revisar`, `Actividad`, `Permisos` o equivalente que decidamos).
- Mantener en ingles las rutas de `Trust & Builders` (`/mpp`, `/evidence`, `/security`, `/providers`) y `/treasury`: son audiencia tecnica/builder, decision ya tomada y correcta.
- Revisar `src/client/shell.mjs` por si el label del grupo colapsado tambien merece ajuste (`"Trust & Builders"` puede quedarse: es jerga de builder, no de usuario final).
- Aceptacion: sidebar y bottom-nav dicen lo mismo idioma que el contenido de cada pagina primaria.

### 3. Traducir los cabos sueltos (S, ~30min)

- `src/client/pages/spend.mjs`: `renderPilotApproval()` completa (labels `Recipient`/`Asset contract`/`Request`, el toast `"Pilot payment approved..."`).
- `src/client/pages/activity.mjs`: el link `"Verify"` en `ledgerRow()`.
- `src/client/pages/treasury.mjs`: queda en ingles a proposito (lab tecnico oculto) — no tocar.

### 4. Capa de traduccion para labels que vienen del backend (M, ~1-2h)

Hoy `kindLabel` llega desde `productReadModels.mjs` con valores crudos en ingles (`item.evidenceType` tal cual: `"mpp-charge"`, `"contract-account"`, o el literal `"Agent receipt (simulated)"`). Traducirlos en el borde correcto evita que se vuelvan a colar en ingles la proxima vez que se agregue un tipo de evidencia:

- Crear un mapa chico de presentacion en el cliente (ej. `src/client/format.mjs` o un nuevo `src/client/labels.mjs`): `evidenceType`/`status` -> texto en espanol para mostrar.
- `activity.mjs` usa ese mapa en `ledgerRow()` en vez de imprimir `item.kindLabel` crudo.
- Mantener el valor crudo en el JSON de `/api/activity` (es API publica, debe seguir en ingles/neutral para consumidores tecnicos) — la traduccion vive solo en la capa de presentacion del cliente, no en el backend.
- Aceptacion: nuevo test en `tests/ui-pages.test.mjs` que verifica el mapeo de 3-4 valores conocidos.

### 5. Guardia de regresion de idioma (M, ~1-2h)

Para que esta brecha no se repita con el proximo refactor:

- Nuevo test `tests/ui-language.test.mjs`: renderiza cada pagina primaria (`overview`, `discover`, `spend`, `activity`, `wallet`) con datos de prueba fijos y falla si el HTML contiene palabras en ingles de una lista corta de alta senal (`the`, `and`, `service`, `payment`, `provider`, `approved`, `discovered` — palabras que no son nombres propios ni jerga tecnica aceptada como Stellar/USDC/MCP/API/PWA).
- No es un chequeo gramatical completo; es una red de seguridad barata contra el caso concreto que encontramos (un string en ingles colandose en una pagina espanola).
- Aceptacion: el test falla si se revierte cualquier fix de los puntos 1-4, y pasa limpio despues de aplicarlos.

### 6. Documentar la convencion de idioma (S, ~20min)

- Agregar una seccion corta a `docs/current-state.md` o `docs/product.md`: "Paginas primarias (Home/Discover/Review/Activity/Wallet) = espanol, audiencia no experta. Paginas Trust & Builders + /treasury = ingles, audiencia tecnica." Referenciar el test de la seccion 5 como mecanismo de enforcement.
- Evita que un futuro refactor "arregle" esto sin saber que fue una decision deliberada.

### 7. Cerrar Horizonte 1 del roadmap (S, ~20min)

Cabos sueltos que ya estaban identificados y quedan naturalmente atados a este sprint porque tambien son "dejar todo enlazado perfecto":

- Confirmar `npm run qa:full` verde con los cambios de este sprint incluidos.
- Actualizar el badge de tests en `README.md` con el conteo final.
- Dejar constancia en `docs/current-state.md` de que la brecha de idioma esta cerrada.

## Fuera de alcance

- Deploy a produccion y envio del SCF: siguen siendo decision del dueno (Horizonte 1, items 1, 2 y 4 del roadmap), no se ejecutan como parte de este sprint de codigo.
- Cualquier cambio a logica de pagos, politicas, compuertas de submit o el lab multichain.
- Traduccion de `Trust & Builders` (`/mpp`, `/evidence`, `/security`, `/providers`) — decision ya tomada de mantenerlas tecnicas/ingles.

## Orden de ejecucion

1 -> 3 -> 2 (arreglos de texto, de mas a menos visible) -> 4 -> 5 (guardia, para que el resto del sprint quede protegido) -> 6 -> 7.

## Puerta de aceptacion

- `npm test` verde incluyendo el nuevo `tests/ui-language.test.mjs`.
- Recorrido manual en `dev:watch`, desktop y 390x844: cero texto en ingles visible en Home, Discover, Review, Activity, Wallet (fuera de nombres propios/jerga tecnica aceptada).
- `docs/current-state.md` actualizado; sin cambios a compuertas de seguridad ni a `docs/scf-application.md`.
