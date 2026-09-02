// Panel de gestión — empresa de salmón y frutos del mar ahumados
//
// APP INDEPENDIENTE (fuera de Claude): pensada para correr en tu propio
// servidor con `npm run dev` / `npm run build`. Ver README.md para instalar.
//
// NOTAS:
// - GOOGLE_SCRIPT_URL abajo ya tiene tu enlace de Apps Script. Si alguna vez
//   vuelves a "Implementar" como una NUEVA implementación (no una versión de
//   la misma), la URL cambia y hay que actualizarla aquí.
// - Moneda: Real brasileño (BRL).
// - Panel de SOLO LECTURA: no hay botones para editar ni importar manualmente.
// - Caché: como esta app ya no corre dentro de Claude, el caché de respaldo
//   usa localStorage del navegador (en vez de window.storage). Eso significa
//   que el caché es por navegador/dispositivo, no compartido entre todos —
//   pero como cada dispositivo consulta Google Sheets por su cuenta, todos
//   igual terminan viendo los mismos datos en vivo.
// - VENTAS: las columnas ya están mapeadas a los nombres reales de tu API
//   (data_venda, dados_cliente, vendedor, tipo_venda, produto, kilos,
//   valor_kilo, pago, nro_nf_nfc_e, etc.), verificados contra un ejemplo real.
// - INVENTARIO, CLIENTES, PAGOS, COMPRAS (MMPP) y FLUJO todavía usan nombres
//   de columna SIN VERIFICAR (una suposición razonable, no un dato real).
//   Es muy probable que necesiten ajuste — pégame un ejemplo de cada una
//   (como hiciste con Ventas) y te devuelvo el archivo corregido.

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Search, Bell, Package, Users, ShoppingCart, TrendingUp, FileText,
  AlertTriangle, Truck, Wallet, BarChart3, RefreshCw, Wifi, WifiOff, Lock, X
} from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

/* ---------------------------- tokens de diseño --------------------------- */

const C = {
  navy: '#14283D',
  teal: '#2F6E6E',
  salmon: '#D9694A',
  bg: '#F5F6F4',
  surface: '#FFFFFF',
  border: '#E3E6E2',
  text: '#1F2A33',
  textMuted: '#5C6B70',
  success: '#2E7D5B',
  successBg: '#DCF3E6',
  warning: '#B8791E',
  warningBg: '#FBEBD1',
  danger: '#B94A3F',
  dangerBg: '#FBE2DF',
  neutralBg: '#EEF0EE',
};

const inputCls = 'w-full rounded outline-none text-sm px-2 py-1.5';
const inputStyle = { border: `1px solid ${C.border}` };

/* --------------------------- Google Sheets API ---------------------------- */

const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxC9gdvc7l5-KMPCFK9HjlS2Jq6IlWKWQ3jSeYmd3SPcmKArkM-m0hchfiB_84uTkJ54A/exec';

const SHEET_PARAMS = {
  ventas: 'Ventas',
  inventario: 'Inventario',
  comisiones: 'Comisiones',
  clientes: 'Clientes',
  pagos: 'Pagos',
  mmpp: 'Compras',
  flujo: 'Flujo',
};

async function fetchSheet(paramName) {
  const url = `${GOOGLE_SCRIPT_URL}?sheet=${encodeURIComponent(paramName)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error('La API no devolvió una lista de filas');
  return data;
}

/* ------------------------------- utilidades ------------------------------ */

const addDays = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

const monthKey = (offset = 0) => {
  const d = new Date();
  d.setMonth(d.getMonth() + offset);
  return d.toISOString().slice(0, 7);
};

const daysUntil = (dateStr) => {
  if (!dateStr) return null;
  const target = new Date(dateStr + 'T00:00:00');
  if (isNaN(target.getTime())) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((target - now) / 86400000);
};

const formatCurrency = (n) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(n) || 0);

function normalizeKey(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function cleanVal(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'string') return v.trim();
  return v;
}

function toDateOnly(v) {
  return String(v || '').slice(0, 10);
}

function toNumber(v) {
  return Number(String(v ?? '').replace(/[^0-9.,-]/g, '').replace(',', '.')) || 0;
}

/* --------------------- mapeo de columnas de cada hoja ---------------------- */

const ALIASES = {
  ventas: {
    fecha: ['datavenda', 'fecha'],
    vendedor: ['vendedor'],
    cliente: ['dadoscliente', 'cliente'],
    tipo: ['tipovenda', 'tipo'],
    documento: ['nronfnfce', 'notafiscal'],
    producto: ['produto', 'producto'],
    lote: ['lote'],
    origen: ['origen'],
    unidades: ['unidades'],
    kilos: ['kilos'],
    valorKilo: ['valorkilo'],
    valorVenta: ['valorvenda'],
    comision: ['comision', 'comissao'],
    frete: ['frete', 'flete'],
    totalNf: ['totalnf'],
    expedicao: ['expedicao'],
    fechaEntrega: ['dataentrega'],
    metodoPago: ['metodopagamento'],
    pago: ['pago'],
    fechaVencimiento: ['datavencimento'],
    fechaPago: ['datapagamento'],
    facturado: ['facturado'],
    detalle: ['detalle'],
  },
  inventario: {
    producto: ['producto', 'item', 'articulo'],
    categoria: ['categoria', 'tipo'],
    cantidad: ['cantidad', 'stock', 'disponible'],
    unidad: ['unidad', 'um'],
  },
  comisiones: {
    vendedor: ['vendedor'],
    mes: ['mes'],
    monto: ['monto', 'comision', 'valor'],
  },
  clientes: {
    nombre: ['nombre', 'cliente', 'razonsocial'],
    contacto: ['contacto', 'encargado'],
    telefono: ['telefono', 'fono', 'celular'],
    email: ['email', 'correo'],
    direccion: ['direccion'],
    rubro: ['rubro', 'giro'],
  },
  pagos: {
    mes: ['mes'],
    responsable: ['responsable', 'socio', 'quien'],
    detalle: ['detalle', 'descripcion'],
    monto: ['monto', 'valor', 'total'],
  },
  mmpp: {
    notaFiscal: ['notafiscal', 'nnotafiscal', 'numeronotafiscal', 'nfiscal'],
    proveedor: ['proveedor'],
    producto: ['producto'],
    fechaEmision: ['fechaemision', 'emision'],
    cantidadKg: ['cantidadkg', 'kg', 'cantidad'],
    valorNota: ['valornota', 'valor', 'total'],
  },
  flujo: {
    mes: ['mes'],
    ingresos: ['ingresos', 'ingreso'],
    egresos: ['egresos', 'egreso'],
  },
};

function mapRow(raw, aliasKey, idPrefix, idx) {
  const alias = ALIASES[aliasKey];
  const obj = { id: idPrefix + '-' + idx };
  Object.entries(raw).forEach(([h, val]) => {
    const nk = normalizeKey(h);
    for (const field in alias) {
      if (alias[field].includes(nk)) { obj[field] = cleanVal(val); break; }
    }
  });
  return obj;
}

function deriveEstadoVenta(pago) {
  const nk = normalizeKey(pago);
  if (['sim', 'si', 'pagado', 'pagada'].includes(nk)) return 'Pagada';
  if (['no', 'nao', 'impago', 'pendiente'].includes(nk)) return 'No pagada';
  return 'Sin definir';
}

function normalizeEstadoBoleto(v) {
  const nk = normalizeKey(v);
  if (['pagado', 'pagada', 'pago'].includes(nk)) return 'Pagado';
  return 'Pendiente';
}

const mapVenta = (r, idx) => {
  const o = mapRow(r, 'ventas', 'v', idx);
  o.fecha = toDateOnly(o.fecha);
  o.fechaEntrega = toDateOnly(o.fechaEntrega);
  o.fechaVencimiento = toDateOnly(o.fechaVencimiento);
  o.fechaPago = toDateOnly(o.fechaPago);
  o.kilos = toNumber(o.kilos);
  o.unidades = toNumber(o.unidades);
  o.valorKilo = toNumber(o.valorKilo);
  const totalCandidate = o.totalNf !== undefined && String(o.totalNf).trim() !== '' ? o.totalNf : o.valorVenta;
  o.total = toNumber(totalCandidate);
  o.estado = deriveEstadoVenta(o.pago);
  return o;
};
const mapInventario = (r, idx) => {
  const o = mapRow(r, 'inventario', 'i', idx);
  o.cantidad = toNumber(o.cantidad);
  return o;
};
const mapComision = (r, idx) => {
  const o = mapRow(r, 'comisiones', 'c', idx);
  o.monto = toNumber(o.monto);
  return o;
};
const mapCliente = (r, idx) => mapRow(r, 'clientes', 'cl', idx);
const mapPago = (r, idx) => {
  const o = mapRow(r, 'pagos', 'p', idx);
  o.monto = toNumber(o.monto);
  return o;
};
const mapFlujoRow = (r, idx) => {
  const o = mapRow(r, 'flujo', 'f', idx);
  o.ingresos = toNumber(o.ingresos);
  o.egresos = toNumber(o.egresos);
  return o;
};

function mapMmppRow(raw, id) {
  const alias = ALIASES.mmpp;
  const obj = { id, boletos: [] };
  const boletoData = {};
  Object.entries(raw).forEach(([h, val]) => {
    const nk = normalizeKey(h);
    for (const field in alias) {
      if (alias[field].includes(nk)) { obj[field] = cleanVal(val); return; }
    }
    const m = nk.match(/^boleto0?(\d)(vencimiento|venc|valor|estado)$/);
    if (m) {
      const n = m[1];
      boletoData[n] = boletoData[n] || {};
      if (m[2] === 'vencimiento' || m[2] === 'venc') boletoData[n].fechaVencimiento = cleanVal(val);
      else if (m[2] === 'valor') boletoData[n].valor = toNumber(val);
      else if (m[2] === 'estado') boletoData[n].estado = normalizeEstadoBoleto(val);
    }
  });
  obj.boletos = Object.keys(boletoData)
    .sort()
    .map((k) => ({ fechaVencimiento: '', valor: 0, estado: 'Pendiente', ...boletoData[k] }))
    .filter((b) => b.fechaVencimiento);
  obj.cantidadKg = toNumber(obj.cantidadKg);
  obj.valorNota = toNumber(obj.valorNota);
  return obj;
}

/* --------------------------------- datos de ejemplo ------------------------ */

const VENTAS_SEED = [
  { id: 'v1', fecha: addDays(-6), vendedor: 'Ricardo Battistini', cliente: 'Sin especificar', tipo: 'NFC-e', producto: 'Salmão defumado fatiado COHO 100 gr', kilos: 2, valorKilo: 238, total: 476, pago: 'SIM', estado: 'Pagada', fechaEntrega: addDays(-6), documento: '' },
  { id: 'v2', fecha: addDays(-6), vendedor: 'Ricardo Battistini', cliente: 'Sin especificar', tipo: 'no_especifica', producto: 'Ostra cozida defumada 100gr', kilos: 1, valorKilo: 270, total: 270, pago: 'no_especifica', estado: 'Sin definir', fechaEntrega: addDays(-5), documento: '' },
  { id: 'v3', fecha: addDays(-5), vendedor: 'Ricardo Battistini', cliente: 'Sin especificar', tipo: 'no_especifica', producto: 'Mexilhão cozido defumado 100gr', kilos: 1, valorKilo: 162, total: 162, pago: 'no_especifica', estado: 'Sin definir', fechaEntrega: addDays(-5), documento: '' },
];

const INVENTARIO_SEED = [
  { id: 'i1', producto: 'Salmón Ahumado en Frío 500g', categoria: 'Salmón', cantidad: 120, unidad: 'un' },
  { id: 'i2', producto: 'Salmón Ahumado en Frío 1kg', categoria: 'Salmón', cantidad: 45, unidad: 'un' },
  { id: 'i3', producto: 'Trucha Ahumada Filete', categoria: 'Trucha', cantidad: 0, unidad: 'un' },
  { id: 'i4', producto: 'Mejillones Ahumados en Aceite', categoria: 'Mariscos', cantidad: 60, unidad: 'frasco' },
];

const COMISIONES_SEED = [
  { id: 'c1', vendedor: 'Ricardo Battistini', mes: monthKey(-1), monto: 187500 },
  { id: 'c2', vendedor: 'Ricardo Battistini', mes: monthKey(0), monto: 92400 },
];

const CLIENTES_SEED = [
  { id: 'cl1', nombre: 'Sin especificar', contacto: '', telefono: '', email: '', direccion: '', rubro: '' },
];

const COMPRAS_MMPP_SEED = [
  { id: 'm1', notaFiscal: 'FC-5521', proveedor: 'Pesquera Los Fiordos', producto: 'Salmón entero fresco', fechaEmision: addDays(-15), cantidadKg: 2200, valorNota: 9680000, boletos: [
    { fechaVencimiento: addDays(5), valor: 3226667, estado: 'Pendiente' },
  ] },
];

const PAGOS_SEED = [
  { id: 'p1', mes: monthKey(-1), responsable: 'Roberto Alvarez', detalle: 'Compra de insumos de embalaje', monto: 1250000 },
];

const MESES_LABEL = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const FLUJO_SEED = MESES_LABEL.map((m, idx) => ({
  mes: m,
  ingresos: 8000000 + Math.round(Math.sin(idx / 2) * 1500000) + idx * 120000,
  egresos: 6200000 + Math.round(Math.cos(idx / 3) * 900000) + idx * 80000,
}));

const MENU_GENERAL = [
  { id: 'ventas', label: 'Ventas', icon: ShoppingCart },
  { id: 'comisiones', label: 'Comisiones', icon: TrendingUp },
  { id: 'inventario', label: 'Inventario', icon: Package },
  { id: 'clientes', label: 'Cartera de clientes', icon: Users },
];
const MENU_ADMIN = [
  { id: 'mmpp', label: 'Compras MMPP', icon: Truck },
  { id: 'pagos', label: 'Pagos', icon: Wallet },
  { id: 'flujo', label: 'Flujo de caja', icon: FileText },
  { id: 'estadisticas', label: 'Estadísticas', icon: BarChart3 },
];
const RESPONSABLE_COLOR = {
  'Roberto Alvarez': C.navy,
  'Diether Reuck': C.teal,
  'Patagonia Natural': C.salmon,
};

/* ------------------------------- caché local -------------------------------- */

const STORAGE_KEYS = {
  ventas: 'panel:ventas', comisiones: 'panel:comisiones', inventario: 'panel:inventario',
  clientes: 'panel:clientes', mmpp: 'panel:compras-mmpp', pagos: 'panel:pagos', flujo: 'panel:flujo-caja',
};

function saveData(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* ignorar */ }
}

function readCache(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

async function loadModule(storageKey, sheetParamKey, mapFn, seed) {
  try {
    const raw = await fetchSheet(SHEET_PARAMS[sheetParamKey]);
    const mapped = raw.map(mapFn);
    saveData(STORAGE_KEYS[storageKey], mapped);
    return { data: mapped, source: 'live' };
  } catch (e) {
    const cached = readCache(STORAGE_KEYS[storageKey]);
    if (cached) return { data: cached, source: 'cache' };
    return { data: seed, source: 'seed' };
  }
}

async function loadMmpp(seed) {
  try {
    const raw = await fetchSheet(SHEET_PARAMS.mmpp);
    const mapped = raw.map((r, idx) => mapMmppRow(r, 'm-' + idx));
    saveData(STORAGE_KEYS.mmpp, mapped);
    return { data: mapped, source: 'live' };
  } catch (e) {
    const cached = readCache(STORAGE_KEYS.mmpp);
    if (cached) return { data: cached, source: 'cache' };
    return { data: seed, source: 'seed' };
  }
}

/* ----------------------------- subcomponentes ------------------------------ */

function PinModal({ targetRole, onClose, onSuccess }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (targetRole === 'gerencia' && pin === '4367') {
      onSuccess('gerencia');
    } else if (targetRole === 'trabajador' && pin === '0000') {
      onSuccess('trabajador');
    } else {
      setError(true);
      setPin('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div style={{ background: C.surface, border: `1px solid ${C.border}` }} className="w-80 rounded-lg p-5 shadow-xl relative">
        <button onClick={onClose} className="absolute top-3 right-3 text-gray-400 hover:text-gray-600">
          <X size={18} />
        </button>
        <div className="flex items-center gap-2 mb-3">
          <Lock size={18} style={{ color: C.navy }} />
          <h3 className="font-semibold text-base" style={{ color: C.text }}>Acceso a {targetRole === 'gerencia' ? 'Gerencia' : 'Trabajador'}</h3>
        </div>
        <p className="text-xs text-gray-500 mb-4">Ingresa el PIN de 4 dígitos para autorizar el cambio de perfil.</p>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            maxLength={4}
            value={pin}
            onChange={(e) => { setPin(e.target.value); setError(false); }}
            placeholder="****"
            autoFocus
            className="w-full text-center text-xl tracking-widest py-2 border rounded-md outline-none mb-3"
            style={{ borderColor: error ? C.danger : C.border }}
          />
          {error && <p className="text-xs mb-3 text-center" style={{ color: C.danger }}>PIN incorrecto. Intenta nuevamente.</p>}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="flex-1 py-1.5 rounded text-xs border" style={{ borderColor: C.border, color: C.textMuted }}>
              Cancelar
            </button>
            <button type="submit" className="flex-1 py-1.5 rounded text-xs text-white font-medium" style={{ background: C.navy }}>
              Ingresar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ModuleHeader({ title, subtitle, children }) {
  return (
    <div className="flex items-start justify-between mb-4 gap-4 flex-wrap">
      <div>
        <h2 className="text-lg font-medium" style={{ color: C.text }}>{title}</h2>
        {subtitle && <p className="text-xs mt-0.5" style={{ color: C.textMuted }}>{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2 flex-wrap">{children}</div>
    </div>
  );
}

function ColorLegend({ items }) {
  return (
    <div className="flex items-center gap-4 mt-3 text-xs flex-wrap" style={{ color: C.textMuted }}>
      {items.map(([label, bg, fg]) => (
        <span key={label} className="flex items-center gap-1.5">
          <span style={{ background: bg, border: `1px solid ${fg}` }} className="w-3 h-3 rounded-sm inline-block" />
          {label}
        </span>
      ))}
    </div>
  );
}

function ChartCard({ title, children }) {
  return (
    <div style={{ border: `1px solid ${C.border}`, background: C.surface }} className="rounded-md p-4">
      <div className="text-sm font-medium mb-2" style={{ color: C.text }}>{title}</div>
      {children}
    </div>
  );
}

function NavItem({ item, active, onClick }) {
  const Icon = item.icon;
  const isActive = active === item.id;
  return (
    <button
      onClick={() => onClick(item.id)}
      style={{
        background: isActive ? 'rgba(255,255,255,0.12)' : 'transparent',
        color: isActive ? '#FFFFFF' : 'rgba(255,255,255,0.7)',
        borderLeft: isActive ? `3px solid ${C.salmon}` : '3px solid transparent',
      }}
      className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:text-white"
    >
      <Icon size={16} />
      <span>{item.label}</span>
    </button>
  );
}

function Sidebar({ active, setActive, role }) {
  return (
    <aside style={{ background: C.navy, width: 232, flexShrink: 0 }} className="flex flex-col py-5">
      <div className="px-4 pb-5 mb-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <div className="flex items-center gap-2">
          <div style={{ background: C.salmon, width: 28, height: 28, borderRadius: 6 }} className="flex items-center justify-center text-white font-semibold text-sm">P</div>
          <div>
            <div className="text-white text-sm font-medium leading-tight">Patagonia Natural</div>
            <div style={{ color: 'rgba(255,255,255,0.5)' }} className="text-xs leading-tight">Ahumados del mar</div>
          </div>
        </div>
      </div>
      <div style={{ color: 'rgba(255,255,255,0.4)' }} className="px-4 text-xs mb-1 mt-2">General</div>
      {MENU_GENERAL.map((item) => (
        <NavItem key={item.id} item={item} active={active} onClick={setActive} />
      ))}
      {role === 'gerencia' && (
        <>
          <div style={{ color: 'rgba(255,255,255,0.4)' }} className="px-4 text-xs mb-1 mt-5">Gerencia y administración</div>
          {MENU_ADMIN.map((item) => (
            <NavItem key={item.id} item={item} active={active} onClick={setActive} />
          ))}
        </>
      )}
    </aside>
  );
}

const STATUS_LABEL = {
  live: ['Conectado a Google Sheets', C.success],
  partial: ['Conexión parcial con Google Sheets', C.warning],
  offline: ['Sin conexión — mostrando datos guardados', C.danger],
  checking: ['Conectando…', C.textMuted],
};

function TopBar({ role, onRequestRoleChange, alerts, notifOpen, setNotifOpen, lastSync, connectionStatus }) {
  const elapsed = lastSync ? Math.max(0, Math.round((Date.now() - lastSync.getTime()) / 1000)) : null;
  const [label, color] = STATUS_LABEL[connectionStatus] || STATUS_LABEL.checking;
  const StatusIcon = connectionStatus === 'offline' ? WifiOff : Wifi;
  return (
    <header style={{ borderBottom: `1px solid ${C.border}`, background: C.surface }} className="flex items-center justify-between px-6 py-3">
      <div>
        <div className="text-sm font-medium" style={{ color: C.text }}>Ventas, inventario y gestión</div>
        <div className="text-xs flex items-center gap-1.5" style={{ color: C.textMuted }}>
          <StatusIcon size={12} style={{ color }} />
          <span style={{ color }}>{label}</span>
          {elapsed !== null && <span>· hace {elapsed}s</span>}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div
          style={{ border: `1px solid ${C.border}` }}
          className="flex rounded-md overflow-hidden text-xs"
        >
          <button onClick={() => role !== 'trabajador' && onRequestRoleChange('trabajador')} style={{ background: role === 'trabajador' ? C.navy : C.surface, color: role === 'trabajador' ? '#fff' : C.textMuted }} className="px-3 py-1.5 flex items-center gap-1">
            <Lock size={12} /> Trabajador
          </button>
          <button onClick={() => role !== 'gerencia' && onRequestRoleChange('gerencia')} style={{ background: role === 'gerencia' ? C.navy : C.surface, color: role === 'gerencia' ? '#fff' : C.textMuted }} className="px-3 py-1.5 flex items-center gap-1">
            <Lock size={12} /> Gerencia
          </button>
        </div>
        <div className="relative">
          <button onClick={() => setNotifOpen((o) => !o)} style={{ border: `1px solid ${C.border}` }} className="relative p-2 rounded-md">
            <Bell size={16} color={C.text} />
            {alerts.length > 0 && (
              <span style={{ background: C.danger }} className="absolute -top-1 -right-1 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">{alerts.length}</span>
            )}
          </button>
          {notifOpen && (
            <div style={{ border: `1px solid ${C.border}`, background: C.surface }} className="absolute right-0 mt-2 w-80 rounded-md shadow-lg z-20 max-h-96 overflow-auto">
              <div className="px-3 py-2 text-xs font-medium" style={{ borderBottom: `1px solid ${C.border}`, color: C.text }}>Notificaciones ({alerts.length})</div>
              {alerts.length === 0 ? (
                <div className="px-3 py-4 text-xs" style={{ color: C.textMuted }}>Sin alertas por ahora.</div>
              ) : (
                alerts.map((a) => (
                  <div key={a.id} className="px-3 py-2 text-xs flex gap-2" style={{ borderBottom: `1px solid ${C.border}` }}>
                    <AlertTriangle size={14} style={{ color: a.tipo === 'danger' ? C.danger : a.tipo === 'warning' ? C.warning : C.teal, flexShrink: 0, marginTop: 2 }} />
                    <div>
                      <div style={{ color: C.textMuted }}>{a.area}</div>
                      <div style={{ color: C.text }}>{a.texto}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center h-64" style={{ color: C.textMuted }}>
      <RefreshCw size={18} className="animate-spin mr-2" /> Cargando datos…
    </div>
  );
}

/* --------------------------------- Ventas ---------------------------------- */

function VentasView({ ventas }) {
  const [vendedorF, setVendedorF] = useState('Todos');
  const [clienteF, setClienteF] = useState('Todos');
  const [mesF, setMesF] = useState('Todos');

  const vendedores = ['Todos', ...new Set(ventas.map((v) => v.vendedor))];
  const clientesList = ['Todos', ...new Set(ventas.map((v) => v.cliente))];
  const meses = ['Todos', ...new Set(ventas.map((v) => (v.fecha || '').slice(0, 7)))].filter(Boolean).sort();

  const filtered = ventas.filter((v) =>
    (vendedorF === 'Todos' || v.vendedor === vendedorF) &&
    (clienteF === 'Todos' || v.cliente === clienteF) &&
    (mesF === 'Todos' || (v.fecha || '').startsWith(mesF))
  );

  const total = filtered.reduce((s, v) => s + (Number(v.total) || 0), 0);

  const rowStyle = (estado) => {
    if (estado === 'Pagada') return { background: C.successBg, color: '#1F5C3B' };
    if (estado === 'No pagada') return { background: C.dangerBg, color: '#8B2E24' };
    return { background: C.neutralBg, color: C.textMuted };
  };

  return (
    <div>
      <ModuleHeader title="Ventas" subtitle="Una fila por producto vendido — filtra por vendedor, cliente o mes (histórico desde noviembre de 2025)">
        <select value={vendedorF} onChange={(e) => setVendedorF(e.target.value)} className={inputCls} style={{ ...inputStyle, width: 170 }}>
          {vendedores.map((v) => <option key={v}>{v}</option>)}
        </select>
        <select value={clienteF} onChange={(e) => setClienteF(e.target.value)} className={inputCls} style={{ ...inputStyle, width: 180 }}>
          {clientesList.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select value={mesF} onChange={(e) => setMesF(e.target.value)} className={inputCls} style={{ ...inputStyle, width: 130 }}>
          {meses.map((m) => <option key={m}>{m}</option>)}
        </select>
      </ModuleHeader>

      <div style={{ border: `1px solid ${C.border}`, background: C.surface }} className="rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: C.bg, color: C.textMuted }} className="text-left">
              {['Fecha', 'Vendedor', 'Cliente', 'Producto', 'Kilos', 'Valor venta', 'Tipo', 'Pago', 'Entrega'].map((h) => (
                <th key={h} className="px-3 py-2 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((v) => (
              <tr key={v.id} style={rowStyle(v.estado)}>
                <td className="px-3 py-2">{v.fecha}</td>
                <td className="px-3 py-2">{v.vendedor}</td>
                <td className="px-3 py-2">{v.cliente}</td>
                <td className="px-3 py-2">{v.producto}</td>
                <td className="px-3 py-2 text-right">{v.kilos}</td>
                <td className="px-3 py-2 text-right">{formatCurrency(v.total)}</td>
                <td className="px-3 py-2">{v.tipo}</td>
                <td className="px-3 py-2 font-medium">{v.estado}</td>
                <td className="px-3 py-2">{v.fechaEntrega || '—'}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={9} className="px-3 py-6 text-center" style={{ color: C.textMuted }}>Sin ventas para este filtro.</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr style={{ background: C.navy, color: '#fff' }} className="font-medium">
              <td className="px-3 py-2" colSpan={5}>Total del filtro</td>
              <td className="px-3 py-2 text-right">{formatCurrency(total)}</td>
              <td className="px-3 py-2" colSpan={3}></td>
            </tr>
          </tfoot>
        </table>
      </div>
      <ColorLegend items={[['Pagada', C.successBg, '#1F5C3B'], ['No pagada', C.dangerBg, '#8B2E24'], ['Sin definir', C.neutralBg, C.textMuted]]} />
    </div>
  );
}

/* ------------------------------- Comisiones --------------------------------- */

function ComisionesView({ comisiones }) {
  const [vendedorF, setVendedorF] = useState('Todos');
  const [mesF, setMesF] = useState('Todos');
  const vendedores = ['Todos', ...new Set(comisiones.map((c) => c.vendedor))];
  const meses = ['Todos', ...new Set(comisiones.map((c) => c.mes))].sort();
  const filtered = comisiones.filter((c) => (vendedorF === 'Todos' || c.vendedor === vendedorF) && (mesF === 'Todos' || c.mes === mesF));
  const total = filtered.reduce((s, c) => s + (Number(c.monto) || 0), 0);

  return (
    <div>
      <ModuleHeader title="Comisiones por vendedor" subtitle="Filtra por vendedor y/o por mes">
        <select value={vendedorF} onChange={(e) => setVendedorF(e.target.value)} className={inputCls} style={{ ...inputStyle, width: 180 }}>
          {vendedores.map((v) => <option key={v}>{v}</option>)}
        </select>
        <select value={mesF} onChange={(e) => setMesF(e.target.value)} className={inputCls} style={{ ...inputStyle, width: 140 }}>
          {meses.map((m) => <option key={m}>{m}</option>)}
        </select>
      </ModuleHeader>
      <div style={{ border: `1px solid ${C.border}`, background: C.surface }} className="rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: C.bg, color: C.textMuted }} className="text-left">
              <th className="px-3 py-2 font-medium">Vendedor</th>
              <th className="px-3 py-2 font-medium">Mes</th>
              <th className="px-3 py-2 font-medium text-right">Comisión</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} style={{ borderTop: `1px solid ${C.border}` }}>
                <td className="px-3 py-2">{c.vendedor}</td>
                <td className="px-3 py-2">{c.mes}</td>
                <td className="px-3 py-2 text-right">{formatCurrency(c.monto)}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={3} className="px-3 py-6 text-center" style={{ color: C.textMuted }}>Sin resultados para este filtro.</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr style={{ background: C.navy, color: '#fff' }} className="font-medium">
              <td className="px-3 py-2" colSpan={2}>Total</td>
              <td className="px-3 py-2 text-right">{formatCurrency(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

/* -------------------------------- Inventario --------------------------------- */

function InventarioView({ inventario }) {
  const rowStyle = (item) => (item.cantidad > 0 ? { background: C.successBg } : { background: '#FFFFFF' });

  return (
    <div>
      <ModuleHeader title="Inventario de productos" subtitle="Disponibilidad actual por producto" />
      <div style={{ border: `1px solid ${C.border}`, background: C.surface }} className="rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: C.bg, color: C.textMuted }} className="text-left">
              <th className="px-3 py-2 font-medium">Producto</th>
              <th className="px-3 py-2 font-medium">Categoría</th>
              <th className="px-3 py-2 font-medium text-right">Cantidad</th>
              <th className="px-3 py-2 font-medium">Unidad</th>
              <th className="px-3 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {inventario.map((p) => (
              <tr key={p.id} style={{ ...rowStyle(p), borderTop: `1px solid ${C.border}` }}>
                <td className="px-3 py-2">{p.producto}</td>
                <td className="px-3 py-2">{p.categoria}</td>
                <td className="px-3 py-2 text-right font-medium">{p.cantidad}</td>
                <td className="px-3 py-2">{p.unidad}</td>
                <td className="px-3 py-2">
                  {p.cantidad === 0 && <span style={{ color: C.danger }} className="text-xs font-medium">Sin stock</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ColorLegend items={[['Con disponibilidad', C.successBg, '#1F5C3B'], ['Sin disponibilidad', '#FFFFFF', C.border]]} />
    </div>
  );
}

/* --------------------------- Cartera de clientes ----------------------------- */

function ClientesView({ clientes }) {
  const [q, setQ] = useState('');
  const filtered = clientes.filter((c) => {
    const hay = `${c.nombre} ${c.contacto} ${c.telefono} ${c.email} ${c.direccion} ${c.rubro}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  return (
    <div>
      <ModuleHeader title="Cartera de clientes" subtitle={`${clientes.length} clientes registrados`} />
      <div className="relative mb-4" style={{ maxWidth: 340 }}>
        <Search size={15} style={{ position: 'absolute', left: 10, top: 10, color: C.textMuted }} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, contacto, rubro…" className={inputCls} style={{ ...inputStyle, paddingLeft: 32 }} />
      </div>
      <div style={{ border: `1px solid ${C.border}`, background: C.surface }} className="rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: C.bg, color: C.textMuted }} className="text-left">
              {['Cliente', 'Contacto', 'Teléfono', 'Email', 'Dirección', 'Rubro'].map((h) => (
                <th key={h} className="px-3 py-2 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} style={{ borderTop: `1px solid ${C.border}` }}>
                <td className="px-3 py-2 font-medium">{c.nombre}</td>
                <td className="px-3 py-2">{c.contacto}</td>
                <td className="px-3 py-2">{c.telefono}</td>
                <td className="px-3 py-2">{c.email}</td>
                <td className="px-3 py-2">{c.direccion}</td>
                <td className="px-3 py-2">{c.rubro}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-6 text-center" style={{ color: C.textMuted }}>Ningún cliente coincide con "{q}".</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------ Compras MMPP --------------------------------- */

function boletoBadge(estado, fechaVencimiento) {
  let bg = C.warningBg, fg = '#7A5210', txt = estado;
  if (estado === 'Pagado') { bg = C.successBg; fg = '#1F5C3B'; }
  else {
    const d = daysUntil(fechaVencimiento);
    if (d !== null && d < 0) { bg = C.dangerBg; fg = '#8B2E24'; txt = 'Vencido'; }
  }
  return <span style={{ background: bg, color: fg }} className="text-xs px-1.5 py-0.5 rounded">{txt}</span>;
}

function MmppView({ mmpp }) {
  const sorted = [...mmpp].sort((a, b) => new Date(b.fechaEmision) - new Date(a.fechaEmision));
  return (
    <div>
      <ModuleHeader title="Compras de materia prima (MMPP)" subtitle="Notas más recientes arriba, las más antiguas abajo" />
      <div className="space-y-3">
        {sorted.map((n) => (
          <div key={n.id} style={{ border: `1px solid ${C.border}`, background: C.surface }} className="rounded-md p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
              <div>
                <span className="font-medium" style={{ color: C.text }}>{n.notaFiscal}</span>
                <span style={{ color: C.textMuted }} className="ml-2 text-xs">{n.proveedor} · {n.producto} · {n.cantidadKg} kg · emitida {n.fechaEmision}</span>
              </div>
              <div className="font-medium" style={{ color: C.text }}>{formatCurrency(n.valorNota)}</div>
            </div>
            {n.boletos.length > 0 && (
              <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${n.boletos.length}, 1fr)` }}>
                {n.boletos.map((b, idx) => (
                  <div key={idx} style={{ background: C.bg }} className="rounded px-3 py-2 text-xs flex items-center justify-between">
                    <div>
                      <div style={{ color: C.textMuted }}>Boleto {idx + 1} · vence {b.fechaVencimiento}</div>
                      <div style={{ color: C.text }} className="font-medium">{formatCurrency(b.valor)}</div>
                    </div>
                    {boletoBadge(b.estado, b.fechaVencimiento)}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------- Pagos ------------------------------------ */

function PagosView({ pagos }) {
  const [mesF, setMesF] = useState('Todos');
  const meses = ['Todos', ...new Set(pagos.map((p) => p.mes))].sort();
  const filtered = pagos.filter((p) => mesF === 'Todos' || p.mes === mesF);
  const total = filtered.reduce((s, p) => s + (Number(p.monto) || 0), 0);
  const porResponsable = {};
  filtered.forEach((p) => { porResponsable[p.responsable] = (porResponsable[p.responsable] || 0) + (Number(p.monto) || 0); });

  return (
    <div>
      <ModuleHeader title="Pagos y gastos" subtitle="Gastos mensuales y responsable">
        <select value={mesF} onChange={(e) => setMesF(e.target.value)} className={inputCls} style={{ ...inputStyle, width: 140 }}>
          {meses.map((m) => <option key={m}>{m}</option>)}
        </select>
      </ModuleHeader>
      <div className="flex gap-3 mb-4 flex-wrap">
        {Object.entries(porResponsable).map(([r, v]) => (
          <div key={r} style={{ border: `1px solid ${C.border}`, background: C.surface }} className="rounded-md px-3 py-2 text-xs">
            <div className="flex items-center gap-1.5">
              <span style={{ background: RESPONSABLE_COLOR[r] || C.textMuted }} className="w-2 h-2 rounded-full inline-block" />
              <span style={{ color: C.textMuted }}>{r}</span>
            </div>
            <div style={{ color: C.text }} className="font-medium mt-0.5">{formatCurrency(v)}</div>
          </div>
        ))}
      </div>
      <div style={{ border: `1px solid ${C.border}`, background: C.surface }} className="rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: C.bg, color: C.textMuted }} className="text-left">
              <th className="px-3 py-2 font-medium">Mes</th>
              <th className="px-3 py-2 font-medium">Responsable</th>
              <th className="px-3 py-2 font-medium">Detalle</th>
              <th className="px-3 py-2 font-medium text-right">Monto</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id} style={{ borderTop: `1px solid ${C.border}` }}>
                <td className="px-3 py-2">{p.mes}</td>
                <td className="px-3 py-2">{p.responsable}</td>
                <td className="px-3 py-2">{p.detalle}</td>
                <td className="px-3 py-2 text-right">{formatCurrency(p.monto)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: C.navy, color: '#fff' }} className="font-medium">
              <td className="px-3 py-2" colSpan={3}>Total</td>
              <td className="px-3 py-2 text-right">{formatCurrency(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------- Flujo de caja -------------------------------- */

function FlujoCajaView({ flujo }) {
  let acumulado = 0;
  const rows = flujo.map((f) => {
    const saldo = f.ingresos - f.egresos;
    acumulado += saldo;
    return { ...f, saldo, acumulado };
  });

  return (
    <div>
      <ModuleHeader title="Flujo de caja anual" subtitle="Ingresos, egresos y saldo acumulado por mes — desde la pestaña Flujo" />
      <div style={{ border: `1px solid ${C.border}`, background: C.surface, height: 260 }} className="rounded-md p-4 mb-4">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
            <XAxis dataKey="mes" tick={{ fontSize: 11, fill: C.textMuted }} />
            <YAxis tick={{ fontSize: 11, fill: C.textMuted }} tickFormatter={(v) => `${Math.round(v / 1e6)}M`} />
            <Tooltip formatter={(v) => formatCurrency(v)} />
            <Legend />
            <Line type="monotone" dataKey="ingresos" stroke={C.success} strokeWidth={2} dot={false} name="Ingresos" />
            <Line type="monotone" dataKey="egresos" stroke={C.danger} strokeWidth={2} dot={false} name="Egresos" />
            <Line type="monotone" dataKey="acumulado" stroke={C.navy} strokeWidth={2} dot={false} name="Saldo acumulado" />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div style={{ border: `1px solid ${C.border}`, background: C.surface }} className="rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: C.bg, color: C.textMuted }} className="text-left">
              <th className="px-3 py-2 font-medium">Mes</th>
              <th className="px-3 py-2 font-medium text-right">Ingresos</th>
              <th className="px-3 py-2 font-medium text-right">Egresos</th>
              <th className="px-3 py-2 font-medium text-right">Saldo</th>
              <th className="px-3 py-2 font-medium text-right">Acumulado</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.mes} style={{ borderTop: `1px solid ${C.border}` }}>
                <td className="px-3 py-2">{r.mes}</td>
                <td className="px-3 py-2 text-right">{formatCurrency(r.ingresos)}</td>
                <td className="px-3 py-2 text-right">{formatCurrency(r.egresos)}</td>
                <td className="px-3 py-2 text-right" style={{ color: r.saldo >= 0 ? C.success : C.danger }}>{formatCurrency(r.saldo)}</td>
                <td className="px-3 py-2 text-right font-medium">{formatCurrency(r.acumulado)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* -------------------------------- Estadísticas -------------------------------- */

function InventarioMiniChart({ inventario }) {
  const porCategoria = {};
  inventario.forEach((p) => { porCategoria[p.categoria] = (porCategoria[p.categoria] || 0) + (Number(p.cantidad) || 0); });
  const data = Object.entries(porCategoria).map(([name, value]) => ({ name, value }));
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
        <XAxis dataKey="name" tick={{ fontSize: 10, fill: C.textMuted }} />
        <YAxis tick={{ fontSize: 10, fill: C.textMuted }} />
        <Tooltip />
        <Bar dataKey="value" fill={C.navy} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function EstadisticasView({ ventas, inventario, pagos }) {
  const porVendedor = {};
  ventas.forEach((v) => { porVendedor[v.vendedor] = (porVendedor[v.vendedor] || 0) + (Number(v.total) || 0); });
  const dataVendedor = Object.entries(porVendedor).map(([name, value]) => ({ name, value }));

  const estadoCount = { Pagada: 0, 'No pagada': 0, 'Sin definir': 0 };
  ventas.forEach((v) => { estadoCount[v.estado] = (estadoCount[v.estado] || 0) + 1; });
  const dataEstado = Object.entries(estadoCount).map(([name, value]) => ({ name, value }));
  const PIE_COLORS = { Pagada: C.success, 'No pagada': C.danger, 'Sin definir': C.textMuted };

  const gastoPorResponsable = {};
  pagos.forEach((p) => { gastoPorResponsable[p.responsable] = (gastoPorResponsable[p.responsable] || 0) + (Number(p.monto) || 0); });
  const dataGasto = Object.entries(gastoPorResponsable).map(([name, value]) => ({ name, value }));

  return (
    <div>
      <ModuleHeader title="Estadísticas" subtitle="Se calculan solas a partir de Ventas, Inventario y Pagos — no hay nada que cargar aquí" />
      <div className="grid grid-cols-2 gap-4">
        <ChartCard title="Ventas por vendedor">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={dataVendedor}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: C.textMuted }} />
              <YAxis tick={{ fontSize: 10, fill: C.textMuted }} tickFormatter={(v) => `${Math.round(v / 1e6)}M`} />
              <Tooltip formatter={(v) => formatCurrency(v)} />
              <Bar dataKey="value" fill={C.teal} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Estado de pago de las ventas">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={dataEstado} dataKey="value" nameKey="name" outerRadius={80} label={(e) => e.name}>
                {dataEstado.map((d, i) => <Cell key={i} fill={PIE_COLORS[d.name] || C.textMuted} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Gasto por responsable">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={dataGasto}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: C.textMuted }} />
              <YAxis tick={{ fontSize: 10, fill: C.textMuted }} tickFormatter={(v) => `${Math.round(v / 1e6)}M`} />
              <Tooltip formatter={(v) => formatCurrency(v)} />
              <Bar dataKey="value" fill={C.salmon} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Inventario por categoría">
          <InventarioMiniChart inventario={inventario} />
        </ChartCard>
      </div>
    </div>
  );
}

/* ----------------------------------- App -------------------------------------- */

export default function App() {
  const [role, setRole] = useState('trabajador');
  const [pendingRole, setPendingRole] = useState(null);
  const [active, setActive] = useState('ventas');
  const [loading, setLoading] = useState(true);
  const [lastSync, setLastSync] = useState(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('checking');
  const [, forceTick] = useState(0);

  const [ventas, setVentas] = useState([]);
  const [comisiones, setComisiones] = useState([]);
  const [inventario, setInventario] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [mmpp, setMmpp] = useState([]);
  const [pagos, setPagos] = useState([]);
  const [flujo, setFlujo] = useState([]);
  const [inventoryEvents, setInventoryEvents] = useState([]);
  const prevInventarioRef = useRef(null);

  const refreshAll = useCallback(async (isInitial) => {
    const [vR, cR, iR, clR, mR, pR, fR] = await Promise.all([
      loadModule('ventas', 'ventas', mapVenta, VENTAS_SEED),
      loadModule('comisiones', 'comisiones', mapComision, COMISIONES_SEED),
      loadModule('inventario', 'inventario', mapInventario, INVENTARIO_SEED),
      loadModule('clientes', 'clientes', mapCliente, CLIENTES_SEED),
      loadMmpp(COMPRAS_MMPP_SEED),
      loadModule('pagos', 'pagos', mapPago, PAGOS_SEED),
      loadModule('flujo', 'flujo', mapFlujoRow, FLUJO_SEED),
    ]);

    const i = iR.data;
    if (prevInventarioRef.current) {
      const prevById = {};
      prevInventarioRef.current.forEach((item) => { prevById[item.id] = item; });
      const newEvents = [];
      i.forEach((item) => {
        const prev = prevById[item.id];
        if (!prev) {
          newEvents.push({ id: 'evt-new-' + item.id + '-' + Date.now(), tipo: 'info', area: 'Inventario', texto: `Nuevo producto agregado: ${item.producto}` });
        } else if (prev.cantidad === 0 && Number(item.cantidad) > 0) {
          newEvents.push({ id: 'evt-restock-' + item.id + '-' + Date.now(), tipo: 'info', area: 'Inventario', texto: `Se repuso stock de ${item.producto} (${item.cantidad} ${item.unidad})` });
        }
      });
      if (newEvents.length) setInventoryEvents((old) => [...newEvents, ...old].slice(0, 8));
    }
    prevInventarioRef.current = i;

    setVentas(vR.data); setComisiones(cR.data); setInventario(i); setClientes(clR.data);
    setMmpp(mR.data); setPagos(pR.data); setFlujo(fR.data);

    const sources = [vR.source, cR.source, iR.source, clR.source, mR.source, pR.source, fR.source];
    if (sources.every((s) => s === 'live')) setConnectionStatus('live');
    else if (sources.some((s) => s === 'live')) setConnectionStatus('partial');
    else setConnectionStatus('offline');

    setLastSync(new Date());
    if (isInitial) setLoading(false);
  }, []);

  useEffect(() => {
    refreshAll(true);
    const poll = setInterval(() => refreshAll(false), 10000);
    const tick = setInterval(() => forceTick((x) => x + 1), 1000);
    return () => { clearInterval(poll); clearInterval(tick); };
  }, [refreshAll]);

  useEffect(() => {
    if (role === 'trabajador' && MENU_ADMIN.some((m) => m.id === active)) setActive('ventas');
  }, [role, active]);

  const alerts = useMemo(() => {
    const list = [];
    ventas.forEach((v) => {
      if (v.estado !== 'Pagada') {
        const d = daysUntil(v.fechaVencimiento);
        if (d !== null && d <= 7) {
          const ref = v.documento ? `Doc. ${v.documento} de ${v.cliente}` : `Venta a ${v.cliente}`;
          list.push({
            id: 'venta-' + v.id,
            tipo: d < 0 ? 'danger' : 'warning',
            area: 'Ventas',
            texto: d < 0 ? `${ref} vencida hace ${Math.abs(d)} día(s)` : `${ref} vence en ${d} día(s)`,
          });
        }
      }
    });
    inventario.forEach((p) => {
      if (p.cantidad === 0) {
        list.push({ id: 'stock0-' + p.id, tipo: 'danger', area: 'Inventario', texto: `${p.producto} está sin stock` });
      }
    });
    if (role === 'gerencia') {
      mmpp.forEach((nota) => {
        (nota.boletos || []).forEach((b, idx) => {
          if (b.estado !== 'Pagado') {
            const d = daysUntil(b.fechaVencimiento);
            if (d !== null && d <= 7) {
              list.push({
                id: `mmpp-${nota.id}-${idx}`,
                tipo: d < 0 ? 'danger' : 'warning',
                area: 'Compras MMPP',
                texto: d < 0
                  ? `Boleto ${idx + 1} de ${nota.proveedor} (Nota ${nota.notaFiscal}) vencido hace ${Math.abs(d)} día(s) — ${formatCurrency(b.valor)}`
                  : `Boleto ${idx + 1} de ${nota.proveedor} (Nota ${nota.notaFiscal}) vence en ${d} día(s) — ${formatCurrency(b.valor)}`,
              });
            }
          }
        });
      });
    }
    return [...list, ...inventoryEvents];
  }, [ventas, inventario, mmpp, role, inventoryEvents]);

  const handleRoleSuccess = (newRole) => {
    setRole(newRole);
    setPendingRole(null);
  };

  const renderModule = () => {
    switch (active) {
      case 'ventas': return <VentasView ventas={ventas} />;
      case 'comisiones': return <ComisionesView comisiones={comisiones} />;
      case 'inventario': return <InventarioView inventario={inventario} />;
      case 'clientes': return <ClientesView clientes={clientes} />;
      case 'mmpp': return role === 'gerencia' ? <MmppView mmpp={mmpp} /> : null;
      case 'pagos': return role === 'gerencia' ? <PagosView pagos={pagos} /> : null;
      case 'flujo': return role === 'gerencia' ? <FlujoCajaView flujo={flujo} /> : null;
      case 'estadisticas': return role === 'gerencia' ? <EstadisticasView ventas={ventas} inventario={inventario} pagos={pagos} /> : null;
      default: return null;
    }
  };

  return (
    <div style={{ background: C.bg, color: C.text, minHeight: '100vh', fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' }} className="flex text-sm">
      <Sidebar active={active} setActive={setActive} role={role} />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar role={role} onRequestRoleChange={(r) => setPendingRole(r)} alerts={alerts} notifOpen={notifOpen} setNotifOpen={setNotifOpen} lastSync={lastSync} connectionStatus={connectionStatus} />
        <main className="flex-1 overflow-auto p-6">
          {loading ? <LoadingState /> : renderModule()}
        </main>
      </div>
      {pendingRole && (
        <PinModal
          targetRole={pendingRole}
          onClose={() => setPendingRole(null)}
          onSuccess={handleRoleSuccess}
        />
      )}
    </div>
  );
}
