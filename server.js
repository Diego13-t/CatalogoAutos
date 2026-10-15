const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'secreto-solo-para-desarrollo';

// Usuarios de ejemplo (en un sistema real estarian en una base de datos con contrasenas cifradas)
const USUARIOS = [
  { usuario: 'admin', password: process.env.ADMIN_PASSWORD || 'admin123', rol: 'administrador' },
  { usuario: 'lector', password: process.env.LECTOR_PASSWORD || 'lector123', rol: 'lector' },
];

// Catalogo en memoria (se reinicia cada vez que el servicio se reinicia)
let autos = [
  { id: randomUUID(), marca: 'Toyota', modelo: 'Corolla', anio: 2024, precio: 385000.0, color: 'Blanco' },
  { id: randomUUID(), marca: 'Nissan', modelo: 'Versa', anio: 2023, precio: 290000.0, color: 'Gris' },
  { id: randomUUID(), marca: 'Mazda', modelo: 'Mazda3', anio: 2024, precio: 420000.0, color: 'Rojo' },
  { id: randomUUID(), marca: 'Volkswagen', modelo: 'Jetta', anio: 2022, precio: 340000.0, color: 'Negro' },
  { id: randomUUID(), marca: 'Chevrolet', modelo: 'Aveo', anio: 2021, precio: 215000.0, color: 'Azul' },
];

// ---------- Utilidades ----------
function enviarError(res, status, codigo, mensaje, detalles = []) {
  return res.status(status).json({ error: { codigo, mensaje, detalles } });
}

function validarAuto(datos, parcial = false) {
  const errores = [];
  const anioMax = new Date().getFullYear() + 1;
  const reglas = {
    marca: (v) => typeof v === 'string' && v.trim().length >= 2 && v.trim().length <= 50,
    modelo: (v) => typeof v === 'string' && v.trim().length >= 1 && v.trim().length <= 50,
    anio: (v) => Number.isInteger(v) && v >= 1950 && v <= anioMax,
    precio: (v) => typeof v === 'number' && Number.isFinite(v) && v > 0,
    color: (v) => typeof v === 'string' && v.trim().length >= 3 && v.trim().length <= 30,
  };
  const mensajes = {
    marca: 'Debe ser texto de 2 a 50 caracteres.',
    modelo: 'Debe ser texto de 1 a 50 caracteres.',
    anio: `Debe ser un entero entre 1950 y ${anioMax}.`,
    precio: 'Debe ser un numero mayor que 0.',
    color: 'Debe ser texto de 3 a 30 caracteres.',
  };
  for (const campo of Object.keys(reglas)) {
    const presente = datos[campo] !== undefined;
    if (!presente && !parcial) {
      errores.push({ campo, problema: 'Campo obligatorio.' });
    } else if (presente && !reglas[campo](datos[campo])) {
      errores.push({ campo, problema: mensajes[campo] });
    }
  }
  return errores;
}

function limpiarAuto(d) {
  return {
    marca: d.marca.trim(),
    modelo: d.modelo.trim(),
    anio: d.anio,
    precio: Math.round(d.precio * 100) / 100,
    color: d.color.trim(),
  };
}

function esDuplicado(a, ignorarId = null) {
  const igual = (x, y) => x.toLowerCase() === y.toLowerCase();
  return autos.some(
    (o) => o.id !== ignorarId && igual(o.marca, a.marca) && igual(o.modelo, a.modelo) &&
           o.anio === a.anio && igual(o.color, a.color)
  );
}

// ---------- Middlewares globales ----------
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({ limit: '10kb' }));
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) =>
      enviarError(res, 429, 'DEMASIADAS_PETICIONES', 'Se superó el límite de peticiones por minuto.'),
  })
);

// ---------- Autenticacion y autorizacion ----------
function autenticar(req, res, next) {
  const encabezado = req.headers.authorization || '';
  const [tipo, token] = encabezado.split(' ');
  if (tipo !== 'Bearer' || !token) {
    return enviarError(res, 401, 'NO_AUTENTICADO', 'Falta el token de acceso.');
  }
  try {
    req.usuario = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return enviarError(res, 401, 'TOKEN_INVALIDO', 'El token es inválido o ya venció.');
  }
}

function soloAdmin(req, res, next) {
  if (req.usuario.rol !== 'administrador') {
    return enviarError(res, 403, 'SIN_PERMISOS', 'Esta operación requiere rol de administrador.');
  }
  next();
}

// ---------- Rutas publicas ----------
app.get('/', (req, res) => {
  res.json({ servicio: 'Catálogo de autos', version: 'v1', documentacion: 'Ver README.md', salud: '/salud' });
});

app.get('/salud', (req, res) => res.json({ estado: 'ok', hora: new Date().toISOString() }));

app.post('/api/v1/auth/token', (req, res) => {
  const { usuario, password } = req.body || {};
  const encontrado = USUARIOS.find((u) => u.usuario === usuario && u.password === password);
  if (!encontrado) {
    return enviarError(res, 401, 'CREDENCIALES_INVALIDAS', 'Usuario o contraseña incorrectos.');
  }
  const token = jwt.sign({ usuario: encontrado.usuario, rol: encontrado.rol }, JWT_SECRET, { expiresIn: '30m' });
  res.json({ token, tipo: 'Bearer', expira_en: '30 minutos', rol: encontrado.rol });
});

// ---------- Rutas protegidas: catalogo ----------
const api = express.Router();
api.use(autenticar);

api.get('/autos', (req, res) => {
  const { marca, modelo, color, anio, precio_min, precio_max, ordenar } = req.query;
  const pagina = parseInt(req.query.pagina ?? '1', 10);
  const limite = parseInt(req.query.limite ?? '20', 10);

  const errores = [];
  if (!Number.isInteger(pagina) || pagina < 1) errores.push({ campo: 'pagina', problema: 'Debe ser un entero mayor o igual a 1.' });
  if (!Number.isInteger(limite) || limite < 1 || limite > 100) errores.push({ campo: 'limite', problema: 'Debe ser un entero entre 1 y 100.' });
  if (anio !== undefined && !Number.isInteger(Number(anio))) errores.push({ campo: 'anio', problema: 'Debe ser un entero.' });
  if (precio_min !== undefined && isNaN(Number(precio_min))) errores.push({ campo: 'precio_min', problema: 'Debe ser numérico.' });
  if (precio_max !== undefined && isNaN(Number(precio_max))) errores.push({ campo: 'precio_max', problema: 'Debe ser numérico.' });
  const camposOrden = ['marca', 'modelo', 'anio', 'precio', 'color'];
  if (ordenar !== undefined && !camposOrden.includes(ordenar.replace(/^-/, ''))) {
    errores.push({ campo: 'ordenar', problema: `Valores permitidos: ${camposOrden.join(', ')} (con "-" para descendente).` });
  }
  if (errores.length) return enviarError(res, 400, 'PARAMETROS_INVALIDOS', 'Hay parámetros de consulta inválidos.', errores);

  const igual = (a, b) => a.toLowerCase() === String(b).toLowerCase();
  let resultado = autos.filter(
    (a) =>
      (!marca || igual(a.marca, marca)) &&
      (!modelo || igual(a.modelo, modelo)) &&
      (!color || igual(a.color, color)) &&
      (anio === undefined || a.anio === Number(anio)) &&
      (precio_min === undefined || a.precio >= Number(precio_min)) &&
      (precio_max === undefined || a.precio <= Number(precio_max))
  );

  if (ordenar) {
    const desc = ordenar.startsWith('-');
    const campo = ordenar.replace(/^-/, '');
    resultado.sort((x, y) => {
      const r = typeof x[campo] === 'string' ? x[campo].localeCompare(y[campo]) : x[campo] - y[campo];
      return desc ? -r : r;
    });
  }

  const total = resultado.length;
  const inicio = (pagina - 1) * limite;
  res.json({ datos: resultado.slice(inicio, inicio + limite), paginacion: { pagina, limite, total } });
});

api.get('/autos/:id', (req, res) => {
  const auto = autos.find((a) => a.id === req.params.id);
  if (!auto) return enviarError(res, 404, 'AUTO_NO_ENCONTRADO', 'No existe un automóvil con el identificador indicado.');
  res.json(auto);
});

api.post('/autos', soloAdmin, (req, res) => {
  const errores = validarAuto(req.body || {});
  if (errores.length) return enviarError(res, 422, 'DATOS_INVALIDOS', 'Los datos no cumplen las reglas de validación.', errores);
  const nuevo = limpiarAuto(req.body);
  if (esDuplicado(nuevo)) return enviarError(res, 409, 'AUTO_DUPLICADO', 'Ya existe un automóvil con la misma marca, modelo, año y color.');
  const auto = { id: randomUUID(), ...nuevo };
  autos.push(auto);
  res.status(201).location(`/api/v1/autos/${auto.id}`).json(auto);
});

api.put('/autos/:id', soloAdmin, (req, res) => {
  const indice = autos.findIndex((a) => a.id === req.params.id);
  if (indice === -1) return enviarError(res, 404, 'AUTO_NO_ENCONTRADO', 'No existe un automóvil con el identificador indicado.');
  const errores = validarAuto(req.body || {});
  if (errores.length) return enviarError(res, 422, 'DATOS_INVALIDOS', 'Los datos no cumplen las reglas de validación.', errores);
  const actualizado = limpiarAuto(req.body);
  if (esDuplicado(actualizado, req.params.id)) return enviarError(res, 409, 'AUTO_DUPLICADO', 'Ya existe un automóvil con la misma marca, modelo, año y color.');
  autos[indice] = { id: req.params.id, ...actualizado };
  res.json(autos[indice]);
});

api.delete('/autos/:id', soloAdmin, (req, res) => {
  const antes = autos.length;
  autos = autos.filter((a) => a.id !== req.params.id);
  if (autos.length === antes) return enviarError(res, 404, 'AUTO_NO_ENCONTRADO', 'No existe un automóvil con el identificador indicado.');
  res.status(204).send();
});

app.use('/api/v1', api);

// ---------- Manejo de errores ----------
app.use((req, res) => enviarError(res, 404, 'RUTA_NO_ENCONTRADA', 'La ruta solicitada no existe.'));

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return enviarError(res, 400, 'JSON_MALFORMADO', 'El cuerpo de la petición no es un JSON válido.');
  }
  console.error(err); // el detalle solo queda en bitácora
  enviarError(res, 500, 'ERROR_INTERNO', 'Ocurrió un error interno en el servicio.');
});

app.listen(PORT, () => console.log(`Servicio de catálogo de autos escuchando en el puerto ${PORT}`));
