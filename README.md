# Microservicio Catálogo de Autos

Servicio web REST desarrollado con **Node.js y Express** que permite consultar y administrar un catálogo básico de automóviles.

## Esquema del automóvil

| Campo | Tipo | Obligatorio | Regla |
|---|---|---|---|
| `id` | Texto (UUID) | Lo asigna el servicio | No editable |
| `marca` | Texto | Sí | 2 a 50 caracteres |
| `modelo` | Texto | Sí | 1 a 50 caracteres |
| `anio` | Entero | Sí | Entre 1950 y el año actual + 1 |
| `precio` | Número | Sí | Mayor que 0 (2 decimales) |
| `color` | Texto | Sí | 3 a 30 caracteres |

## Documentación de rutas

URL base en producción: `https://<nombre-del-servicio>.onrender.com`

| Método | Ruta | Descripción | Acceso |
|---|---|---|---|
| GET | `/salud` | Verifica que el servicio esté operando | Público |
| POST | `/api/v1/auth/token` | Entrega un token JWT (vigencia de 30 min) | Público |
| GET | `/api/v1/autos` | Lista autos con filtros, orden y paginación | Lector / Administrador |
| GET | `/api/v1/autos/:id` | Devuelve un auto por su id | Lector / Administrador |
| POST | `/api/v1/autos` | Registra un auto nuevo | Administrador |
| PUT | `/api/v1/autos/:id` | Actualiza un auto (se envían los 5 campos) | Administrador |
| DELETE | `/api/v1/autos/:id` | Elimina un auto | Administrador |

### Autenticación

`POST /api/v1/auth/token`

```json
{ "usuario": "admin", "password": "admin123" }
```

Respuesta (200):

```json
{ "token": "eyJhbGciOi...", "tipo": "Bearer", "expira_en": "30 minutos", "rol": "administrador" }
```

En las demás rutas se envía el encabezado `Authorization: Bearer <token>`.

### Listar autos

`GET /api/v1/autos?marca=Toyota&precio_max=400000&ordenar=-precio&pagina=1&limite=10`

| Parámetro | Descripción |
|---|---|
| `marca`, `modelo`, `color`, `anio` | Filtros por coincidencia exacta (sin distinguir mayúsculas) |
| `precio_min`, `precio_max` | Rango de precio |
| `ordenar` | `marca`, `modelo`, `anio`, `precio` o `color`; con `-` al inicio es descendente |
| `pagina` | Por defecto 1 |
| `limite` | Por defecto 20, máximo 100 |

Respuesta (200):

```json
{
  "datos": [
    { "id": "b7e2c1a4-5d3f-4c8a-9a61-2f0d8e7b1c33", "marca": "Toyota", "modelo": "Corolla",
      "anio": 2024, "precio": 385000, "color": "Blanco" }
  ],
  "paginacion": { "pagina": 1, "limite": 10, "total": 1 }
}
```

### Crear / actualizar un auto

`POST /api/v1/autos` (respuesta 201) y `PUT /api/v1/autos/:id` (respuesta 200)

```json
{ "marca": "Kia", "modelo": "Rio", "anio": 2024, "precio": 310000, "color": "Verde" }
```

### Eliminar un auto

`DELETE /api/v1/autos/:id` responde 204 sin contenido.

## Formato de errores

```json
{ "error": { "codigo": "AUTO_NO_ENCONTRADO", "mensaje": "...", "detalles": [] } }
```

| HTTP | Código | Situación |
|---|---|---|
| 400 | `JSON_MALFORMADO` / `PARAMETROS_INVALIDOS` | Cuerpo o parámetros mal formados |
| 401 | `NO_AUTENTICADO` / `TOKEN_INVALIDO` / `CREDENCIALES_INVALIDAS` | Falta token, vencido o credenciales erróneas |
| 403 | `SIN_PERMISOS` | Un lector intenta modificar el catálogo |
| 404 | `AUTO_NO_ENCONTRADO` / `RUTA_NO_ENCONTRADA` | Recurso o ruta inexistente |
| 409 | `AUTO_DUPLICADO` | Misma marca, modelo, año y color |
| 422 | `DATOS_INVALIDOS` | Datos que no cumplen las reglas (detalle por campo) |
| 429 | `DEMASIADAS_PETICIONES` | Más de 100 peticiones por minuto |
| 500 | `ERROR_INTERNO` | Falla interna (el detalle solo se guarda en bitácora) |

## Seguridad

JWT con roles (lector y administrador), `helmet` para encabezados seguros, límite de peticiones, CORS configurable, validación de entradas, tamaño máximo del cuerpo (10 KB) y secretos en variables de entorno.

## Variables de entorno

| Variable | Uso |
|---|---|
| `JWT_SECRET` | Clave para firmar los tokens (obligatoria en producción) |
| `ADMIN_PASSWORD` | Contraseña del usuario `admin` |
| `LECTOR_PASSWORD` | Contraseña del usuario `lector` |
| `CORS_ORIGIN` | Sitio autorizado para consumir la API (por defecto `*`) |



