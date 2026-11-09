/**
 * AleFinanzas - Configuration Module
 * Contiene la configuración de Firebase Firestore y parámetros base de la arquitectura.
 */

// ============================================================================
// CONFIGURACIÓN DE FIREBASE FIRESTORE (SDK Modular v10)
// ============================================================================
// Coloca aquí las credenciales de tu proyecto de Firebase.
// Si dejas estos campos vacíos o con valores de prueba, la app funcionará
// automáticamente y al 100% en modo "Local Storage Autónomo".
export const firebaseConfig = {
  apiKey: "AIzaSyB4DjnzOz_FHpnRZheDmaTxlFHlEHkBTNI",
  authDomain: "alefinanzas.firebaseapp.com",
  projectId: "alefinanzas",
  storageBucket: "alefinanzas.firebasestorage.app",
  messagingSenderId: "664194402763",
  appId: "1:664194402763:web:28346ccf945422e1a88e4e"
};

// Verifica si la configuración proporcionada es real
export function isFirebaseConfigured() {
  return (
    firebaseConfig.apiKey &&
    !firebaseConfig.apiKey.includes("TU_API_KEY") &&
    firebaseConfig.projectId &&
    !firebaseConfig.projectId.includes("tu-proyecto")
  );
}

// ============================================================================
// DEFINICIÓN DE BÓVEDA: 5 BILLETERAS PRINCIPALES (FASE 2.5)
// ============================================================================
export const INITIAL_WALLETS = [
  {
    id: "binance_usdt",
    name: "Binance Operativo (USDT)",
    subtitle: "Capital de trabajo y gasto corriente",
    currency: "USDT",
    baseType: "USD", // Paridad 1:1 USD para consolidación de patrimonio
    balance: 150.00,
    themeClass: "binance-theme",
    icon: "binance",
    updatedAt: new Date().toISOString()
  },
  {
    id: "binance_usdc_earn",
    name: "Binance Ahorro (USDC - Earn)",
    subtitle: "Compromisos fijos y ahorros pasivos",
    currency: "USDC",
    baseType: "USD", // Paridad 1:1 USD
    balance: 0.00,
    themeClass: "usdc-earn-theme",
    icon: "usdc",
    updatedAt: new Date().toISOString()
  },
  {
    id: "banco_ves",
    name: "Banco / Pago Móvil (Bs)",
    subtitle: "Cuentas bancarias en Bolívares",
    currency: "VES",
    baseType: "VES",
    balance: 2850.00,
    themeClass: "banco-theme",
    icon: "bank",
    updatedAt: new Date().toISOString()
  },
  {
    id: "usd_cash",
    name: "Efectivo Divisas ($ USD)",
    subtitle: "Dólares físicos en mano",
    currency: "USD",
    baseType: "USD",
    balance: 40.00,
    themeClass: "usd-cash-theme",
    icon: "cash-usd",
    updatedAt: new Date().toISOString()
  },
  {
    id: "ves_cash",
    name: "Efectivo Bolívares (Bs)",
    subtitle: "Billetes y sencillo en Bolívares",
    currency: "VES",
    baseType: "VES",
    balance: 320.00,
    themeClass: "ves-cash-theme",
    icon: "cash-ves",
    updatedAt: new Date().toISOString()
  }
];

export const STORAGE_KEYS = {
  WALLETS: "alefinanzas_wallets_v1",
  TRANSACTIONS: "alefinanzas_tx_p2p_v1",
  RATE_CACHE: "alefinanzas_criptoya_rate_v1",
  CUSTOM_RATE: "alefinanzas_manual_rate_v1",
  SETTINGS: "alefinanzas_settings_v1",
  FUNDS: "alefinanzas_funds_v1",
  DAILY_CLOSURES: "alefinanzas_daily_closures_v1"
};

// ============================================================================
// REGLA DE LOS 6 FONDOS (A&R PRINTS) - FASE 2 & CALIBRACIÓN ROTATIVA / MENSUAL
// ============================================================================
export const DAILY_SALES_GOAL_USDT = 24.50; // Meta diaria de ventas brutas ($24.50 USD / día)
export const WEEKLY_SALES_GOAL_USDT = 147.00; // Meta semanal (6 días hábiles: 6 * 24.50 = 147.00)
export const MONTHLY_SALES_GOAL_USDT = 637.00; // Meta mensual (26 días hábiles: 26 * 24.50 = 637.00)

export const INITIAL_FUNDS = [
  // --------------------------------------------------------------------------
  // SECCIÓN A: Liquidez Operativa y Semanal (64.0% — Uso Diario/Semanal en USDT o Bs)
  // Presupuestos rotativos de saldo continuo (sin meta de ahorro mensual)
  // --------------------------------------------------------------------------
  {
    id: "fondo_reposicion",
    name: "Caja de Reposición",
    shortName: "Caja de Reposición",
    categoryGroup: "rotary_liquidity",
    percentage: 40.0,
    cryptoCategory: "usdt_work", // USDT Operativo / Capital de Trabajo o Bs en Banco
    balanceUsdt: 0.00,
    goalUsdt: null,
    isMonthlyGoal: false,
    weeklyBudgetUsdt: 58.80, // ~$58.80/sem (40.0% de $147.00)
    headlinePrefix: "Disponible hoy para comprar insumos:",
    description: "Mercancía, papel, tinta y reposición POS",
    note: "Mantener líquido en Banco (Bs) o Binance (USDT) para gastos de la semana",
    color: "#3B82F6", // Azul Acero
    icon: "package"
  },
  {
    id: "fondo_comida_hogar",
    name: "Presupuesto Comida y Hogar",
    shortName: "Comida & Hogar",
    categoryGroup: "rotary_liquidity",
    percentage: 19.5,
    cryptoCategory: "usdt_personal", // ⚡ USDT Personal o Bs en Banco
    balanceUsdt: 0.00,
    goalUsdt: null, // Presupuesto rotativo semanal, no ahorro mensual
    isMonthlyGoal: false,
    weeklyBudgetUsdt: 28.65, // ~$28.65/sem (19.5% de $147.00)
    headlinePrefix: "Disponible hoy para mercado:",
    description: "Presupuesto familiar y mercado diario",
    note: "Mantener líquido en Banco (Bs) o Binance (USDT) para gastos de la semana",
    color: "#10B981", // Esmeralda
    icon: "shopping-bag"
  },
  {
    id: "fondo_entretenimiento",
    name: "Disponible Entretenimiento",
    shortName: "Entretenimiento",
    categoryGroup: "rotary_liquidity",
    percentage: 4.5,
    cryptoCategory: "usdt_personal", // ⚡ USDT Personal o Bs en Banco
    balanceUsdt: 0.00,
    goalUsdt: null, // Presupuesto rotativo semanal, no ahorro mensual
    isMonthlyGoal: false,
    weeklyBudgetUsdt: 6.60, // ~$6.60/sem (4.5% de $147.00)
    headlinePrefix: "Disponible hoy:",
    description: "Disfrute personal y recreación",
    note: "Mantener líquido en Banco (Bs) o Binance (USDT) para gastos de la semana",
    color: "#F59E0B", // Ámbar
    icon: "smile"
  },

  // --------------------------------------------------------------------------
  // SECCIÓN B: Bóvedas de Compromisos Mensuales (36.0% — Convertir a USDC Earn)
  // Ahorros fijos con meta mensual acumulativa para fechas fijas de pago
  // --------------------------------------------------------------------------
  {
    id: "fondo_alquiler_local",
    name: "Alquiler del Local",
    shortName: "Alquiler Local",
    categoryGroup: "monthly_vault",
    percentage: 8.0,
    cryptoCategory: "usdc_earn", // 🔒 Binance Earn USDC
    balanceUsdt: 0.00,
    goalUsdt: 50.00,
    isMonthlyGoal: true,
    weeklyQuotaUsdt: 12.50, // $50.00 / 4 semanas
    description: "Canon mensual de papelería A&R Prints ($50 meta)",
    color: "#06B6D4", // Cian USDC
    icon: "store"
  },
  {
    id: "fondo_alquiler_vivienda",
    name: "Vivienda y Servicios Fijos",
    shortName: "Vivienda & Servicios",
    categoryGroup: "monthly_vault",
    percentage: 18.0,
    cryptoCategory: "usdc_earn", // 🔒 Binance Earn USDC
    balanceUsdt: 0.00,
    goalUsdt: 116.00,
    isMonthlyGoal: true,
    weeklyQuotaUsdt: 29.00, // $116.00 / 4 semanas
    description: "Casa ($65) + Internet ($30) + Pastillas ($15) + Teléfono ($6)",
    breakdownText: "($65 Alquiler + $30 Net + $15 Pastillas + $6 Tel)",
    color: "#8B5CF6", // Púrpura suave
    icon: "home"
  },
  {
    id: "fondo_maquinas_emergencia",
    name: "Reserva Máquinas y Emergencias",
    shortName: "Máquinas & Emergencias",
    categoryGroup: "monthly_vault",
    percentage: 10.0,
    cryptoCategory: "usdc_earn", // 🔒 Binance Earn USDC
    balanceUsdt: 0.00,
    goalUsdt: null,
    isMonthlyGoal: false,
    description: "Plotter, impresoras, mantenimiento y emergencias",
    color: "#EC4899", // Rosa tecno
    icon: "tool"
  }
];

export const CRIPTOYA_CONFIG = {
  endpoint: "https://criptoya.com/api/binancep2p/usdt/ves/1",
  refreshIntervalMs: 60000, // 1 minuto
  defaultFallbackRate: 65.50 // Tasa inicial de seguridad si está offline sin caché
};
