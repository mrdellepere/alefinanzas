# AleFinanzas - Centro de Mando Patrimonial & Bóveda P2P (Fase 1 + Fase 2 + Fase 2.5)

Web App Progresiva (PWA) de arquitectura Fintech Mobile-First, diseñada para control patrimonial multimoneda (USDT / USDC / USD / VES), motor contable de conversión P2P, y **Módulo Operativo de Papelería A&R Prints con la Regla de los 6 Fondos y Estrategia Cripto Dual (USDT vs USDC Earn)**.

---

## 🏛️ Características de la Arquitectura

### 1. Bóveda de Saldos Reales (5 Cuentas Canónicas) — Fase 2.5
Separación estratégica entre liquidez operativa y ahorro en Binance Earn:
1. **Binance Operativo (USDT):** Capital de trabajo y gastos corrientes (verde esmeralda `#10B981`).
2. **Binance Ahorro (USDC - Earn):** Bóveda de compromisos fijos y ahorros pasivos con distintivo cian/azul `#06B6D4` (paridad 1:1 USD).
3. **Banco / Pago Móvil (Bs):** Saldo bancario en Bolívares con contravalor en USDT.
4. **Efectivo Divisas ($ USD):** Dólares físicos en mano.
5. **Efectivo Bolívares (Bs):** Billetes en Bolívares con contravalor en USDT.
- **Hero Card Consolidado:** Total general en USD/USDT (sumando las 5 cuentas a valor real) y su equivalente en Bolívares.
- **Arqueo y Ajuste Manual:** Disponible en las 5 cuentas.
- **Atajo P2P:** Preset rápido `🔒 1:1 USDT ↔ USDC (Earn)` en el motor de conversión para registrar traspasos internos sin comisiones.

---

### 2. Módulo de Cierre Diario de Papelería (A&R Prints) & 6 Fondos

#### Asistente Ejecutivo Cripto del Cierre (USDT vs. USDC) — Fase 2.5:
En el cierre diario y panel de fondos, la app calcula exactamente cómo debe dividirse el dinero:
- 🔒 **Monto a Convertir a USDC (Binance Earn) — 32.5% de Ventas Brutas:**
  - Alquiler Local ($10\%$) + Alquiler Casa ($12.5\%$) + Máquinas y Emergencias ($10\%$).
  - Muestra la cifra en grande: `"Cambiar a USDC y meter en Earn: $X.XX USDC"`.
- ⚡ **Monto a Mantener en USDT (Operativo + Personal) — 67.5% de Ventas Brutas:**
  - **USDT Capital de Trabajo (40.0%):** `"Dejar en USDT para Reposición de Papelería: $X.XX USDT"`.
  - **USDT Cuenta Personal Libre (27.5%):** Comida y Hogar ($22.5\%$) + Entretenimiento ($5.0\%$) $\rightarrow$ `"Dejar en USDT para Uso Personal: $X.XX USDT"`.

#### Botón de Acción Rápida "⚡ Ejecutar Pase a USDC Earn (1:1)":
- En el panel de fondos, monitorea en tiempo real cuánto saldo hay acumulado en los 3 fondos de ahorro fijo (Local + Casa + Máquinas).
- Permite ejecutar con un solo toque el traspaso exacto desde **Binance Operativo (USDT)** hacia **Binance Ahorro (USDC - Earn)** a paridad 1:1, registrando la operación neutralmente sin distorsionar el P&L.

#### Motor Automático de los 6 Fondos:
1. **Reposición Mercancía e Insumos (40.0%):** Subnota interactiva `(Consumo POS: $X.XX | Excedente: $X.XX)`.
2. **Alquiler del Local (10.0%):** Meta mensual $50.00 USDT con barra de progreso.
3. **Alquiler de Vivienda (12.5%):** Meta mensual $65.00 USDT con barra de progreso.
4. **Comida y Hogar (22.5%):** Presupuesto familiar operativo.
5. **Máquinas y Emergencia (10.0%):** Plotter, impresoras e imprevistos.
6. **Entretenimiento (5.0%):** Disfrute personal y recreación.

#### Destino del Dinero en Billeteras Reales & Reversión:
- **Destino Rápido:** Todo a Banco (Bs).
- **Destino Mixto:** Desglose validado entre Banco (Bs), Efectivo (Bs), Efectivo (USD), Binance USDT y Binance USDC.
- **Historial & Reversión Atómica:** Botón "Revertir" para deshacer cierres erróneos descontando saldos de billeteras y fondos de forma segura.

---

### 3. Persistencia Dual Inteligente
- **LocalStorage Autónomo:** Funciona al 100% offline sin configuraciones previas (con migración transparente de 4 a 5 billeteras).
- **Firebase Firestore v10 Modular:** Configurable en [`js/config.js`](file:///c:/Users/delle/Downloads/AleFinanzas/js/config.js) para sincronización en la nube en tiempo real de las colecciones `wallets`, `transactions`, `funds` y `daily_closures`.

---

## 🚀 Cómo Probar Localmente

```bash
# Con Node.js:
npx serve .
# O con Python:
python -m http.server 3000
```
Abre en tu navegador o móvil Android: `http://localhost:3000`.
