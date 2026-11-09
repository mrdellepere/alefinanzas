/**
 * Storage Service - Capa de Persistencia Dual Inteligente
 * Soporta Firebase Firestore SDK v10 (modular) con fallback 100% transparente a localStorage.
 * Fase 1: Billeteras y Motor P2P.
 * Fase 2: Motor de Cierre Diario de Papelería (A&R Prints) y Bóveda de los 6 Fondos.
 */

import { 
  firebaseConfig, 
  isFirebaseConfigured, 
  INITIAL_WALLETS, 
  INITIAL_FUNDS, 
  STORAGE_KEYS 
} from '../config.js';

class StorageService {
  constructor() {
    this.isFirestoreActive = false;
    this.firestoreDb = null;
    this.wallets = [];
    this.transactions = [];
    this.funds = [];
    this.dailyClosures = [];
    this.listeners = new Set();
    this.initStatus = 'initializing'; // 'initializing' | 'firestore' | 'local'
  }

  async init() {
    // 1. Cargar datos locales inmediatamente para cero latencia inicial
    this.loadFromLocalStorage();

    // 2. Si Firebase está configurado, intentar inicializar Firestore SDK v10
    if (isFirebaseConfigured()) {
      try {
        await this.initFirestore();
        this.initStatus = 'firestore';
      } catch (err) {
        console.warn('[Storage] Firestore no pudo conectarse, operando en modo LocalStorage:', err);
        this.initStatus = 'local';
      }
    } else {
      this.initStatus = 'local';
      console.info('[Storage] Modo LocalStorage Activo (Firebase no configurado aún).');
    }

    this.notify();
    return this.initStatus;
  }

  loadFromLocalStorage() {
    try {
      // Billeteras (con migración garantizada a 5 cuentas canónicas)
      const rawWallets = localStorage.getItem(STORAGE_KEYS.WALLETS);
      if (rawWallets) {
        const loaded = JSON.parse(rawWallets);
        this.wallets = INITIAL_WALLETS.map(initW => {
          const found = loaded.find(w => w.id === initW.id);
          return found ? { ...initW, ...found, name: initW.name, subtitle: initW.subtitle } : { ...initW };
        });
        // Preservar cualquier billetera extra si existiese
        loaded.forEach(w => {
          if (!this.wallets.some(existing => existing.id === w.id)) {
            this.wallets.push(w);
          }
        });
        this.saveWalletsToLocalStorage();
      } else {
        this.wallets = JSON.parse(JSON.stringify(INITIAL_WALLETS));
        this.saveWalletsToLocalStorage();
      }

      // Transacciones P2P
      const rawTx = localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
      this.transactions = rawTx ? JSON.parse(rawTx) : [];

      // 6 Fondos de Papelería
      const rawFunds = localStorage.getItem(STORAGE_KEYS.FUNDS);
      if (rawFunds) {
        const loadedFunds = JSON.parse(rawFunds);
        // Asegurar que cada fondo tome las nuevas calibraciones (porcentajes, metas, nombres, descripciones)
        // preservando estrictamente el balanceUsdt acumulado y su fecha de actualización
        this.funds = INITIAL_FUNDS.map(initF => {
          const found = loadedFunds.find(f => f.id === initF.id);
          return found
            ? {
                ...initF,
                balanceUsdt: typeof found.balanceUsdt === 'number' ? found.balanceUsdt : (parseFloat(found.balanceUsdt) || 0.00),
                updatedAt: found.updatedAt || new Date().toISOString()
              }
            : { ...initF };
        });
        this.saveFundsToLocalStorage();
      } else {
        this.funds = JSON.parse(JSON.stringify(INITIAL_FUNDS));
        this.saveFundsToLocalStorage();
      }

      // Cierres Diarios
      const rawClosures = localStorage.getItem(STORAGE_KEYS.DAILY_CLOSURES);
      this.dailyClosures = rawClosures ? JSON.parse(rawClosures) : [];

    } catch (e) {
      console.error('[Storage] Error leyendo de localStorage:', e);
      this.wallets = JSON.parse(JSON.stringify(INITIAL_WALLETS));
      this.transactions = [];
      this.funds = JSON.parse(JSON.stringify(INITIAL_FUNDS));
      this.dailyClosures = [];
    }
  }

  saveWalletsToLocalStorage() {
    try {
      localStorage.setItem(STORAGE_KEYS.WALLETS, JSON.stringify(this.wallets));
    } catch (e) {
      console.error('[Storage] Error guardando billeteras en localStorage:', e);
    }
  }

  saveTransactionsToLocalStorage() {
    try {
      localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(this.transactions));
    } catch (e) {
      console.error('[Storage] Error guardando transacciones en localStorage:', e);
    }
  }

  saveFundsToLocalStorage() {
    try {
      localStorage.setItem(STORAGE_KEYS.FUNDS, JSON.stringify(this.funds));
    } catch (e) {
      console.error('[Storage] Error guardando fondos en localStorage:', e);
    }
  }

  saveDailyClosuresToLocalStorage() {
    try {
      localStorage.setItem(STORAGE_KEYS.DAILY_CLOSURES, JSON.stringify(this.dailyClosures));
    } catch (e) {
      console.error('[Storage] Error guardando cierres diarios en localStorage:', e);
    }
  }

  async initFirestore() {
    // Importación dinámica del SDK v10 modular de Firebase
    const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js');
    const { 
      getFirestore, 
      collection, 
      doc, 
      setDoc, 
      getDocs, 
      deleteDoc,
      onSnapshot, 
      addDoc,
      query, 
      orderBy, 
      limit 
    } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');

    const app = initializeApp(firebaseConfig);
    this.firestoreDb = getFirestore(app);
    this.isFirestoreActive = true;

    this.fsMethods = { collection, doc, setDoc, deleteDoc, getDocs, onSnapshot, addDoc, query, orderBy, limit };

    // 1. Sincronizar Billeteras
    const walletsCol = collection(this.firestoreDb, 'wallets');
    const snapWallets = await getDocs(walletsCol);
    if (snapWallets.empty) {
      for (const w of this.wallets) {
        await setDoc(doc(this.firestoreDb, 'wallets', w.id), w);
      }
    } else {
      const remoteWallets = [];
      snapWallets.forEach(d => remoteWallets.push({ id: d.id, ...d.data() }));
      this.wallets = this.mergeWallets(this.wallets, remoteWallets);
      this.saveWalletsToLocalStorage();
    }
    onSnapshot(walletsCol, (snap) => {
      const updated = [];
      snap.forEach(d => updated.push({ id: d.id, ...d.data() }));
      if (updated.length > 0) {
        this.wallets = this.mergeWallets(this.wallets, updated);
        this.saveWalletsToLocalStorage();
        this.notify();
      }
    });

    // 2. Sincronizar Fondos
    const fundsCol = collection(this.firestoreDb, 'funds');
    const snapFunds = await getDocs(fundsCol);
    if (snapFunds.empty) {
      for (const f of this.funds) {
        await setDoc(doc(this.firestoreDb, 'funds', f.id), f);
      }
    } else {
      const remoteFunds = [];
      snapFunds.forEach(d => remoteFunds.push({ id: d.id, ...d.data() }));
      this.funds = this.funds.map(f => {
        const found = remoteFunds.find(rf => rf.id === f.id);
        return found ? { ...f, ...found } : f;
      });
      this.saveFundsToLocalStorage();
    }
    onSnapshot(fundsCol, (snap) => {
      const updated = [];
      snap.forEach(d => updated.push({ id: d.id, ...d.data() }));
      if (updated.length > 0) {
        this.funds = this.funds.map(f => {
          const found = updated.find(uf => uf.id === f.id);
          return found ? { ...f, ...found } : f;
        });
        this.saveFundsToLocalStorage();
        this.notify();
      }
    });

    // 3. Sincronizar Transacciones P2P
    const txQuery = query(
      collection(this.firestoreDb, 'transactions'),
      orderBy('timestamp', 'desc'),
      limit(25)
    );
    onSnapshot(txQuery, (snap) => {
      const txs = [];
      snap.forEach(d => txs.push({ id: d.id, ...d.data() }));
      if (txs.length > 0) {
        this.transactions = txs;
        this.saveTransactionsToLocalStorage();
        this.notify();
      }
    });

    // 4. Sincronizar Cierres Diarios
    const closuresQuery = query(
      collection(this.firestoreDb, 'daily_closures'),
      orderBy('timestamp', 'desc'),
      limit(30)
    );
    onSnapshot(closuresQuery, (snap) => {
      const closures = [];
      snap.forEach(d => closures.push({ id: d.id, ...d.data() }));
      if (closures.length > 0) {
        this.dailyClosures = closures;
        this.saveDailyClosuresToLocalStorage();
        this.notify();
      }
    });

    console.info('[Storage] Firestore v10 sincronizado con éxito');
  }

  mergeWallets(local, remote) {
    const map = new Map();
    local.forEach(w => map.set(w.id, w));
    remote.forEach(w => map.set(w.id, { ...map.get(w.id), ...w }));
    return Array.from(map.values());
  }

  // =========================================================================
  // MÉTODOS DE BILLETERAS
  // =========================================================================
  getWallets() {
    return [...this.wallets];
  }

  getWallet(id) {
    return this.wallets.find(w => w.id === id);
  }

  getTransactions() {
    return [...this.transactions];
  }

  async updateWalletBalance(walletId, newBalance, reason = 'Ajuste manual') {
    const idx = this.wallets.findIndex(w => w.id === walletId);
    if (idx === -1) throw new Error('Billetera no encontrada');

    const previousBalance = this.wallets[idx].balance;
    const diff = newBalance - previousBalance;

    this.wallets[idx].balance = parseFloat(parseFloat(newBalance).toFixed(2));
    this.wallets[idx].updatedAt = new Date().toISOString();

    this.saveWalletsToLocalStorage();

    if (this.isFirestoreActive && this.firestoreDb) {
      try {
        const { doc, setDoc } = this.fsMethods;
        await setDoc(doc(this.firestoreDb, 'wallets', walletId), this.wallets[idx], { merge: true });
      } catch (err) {
        console.warn('[Storage] Error al actualizar Firestore:', err);
      }
    }

    this.notify();
    return {
      wallet: this.wallets[idx],
      diff,
      previousBalance
    };
  }

  // =========================================================================
  // MOTOR DE CONVERSIÓN P2P (FASE 1)
  // =========================================================================
  async executeP2PTransfer({
    originId,
    destId,
    originAmount,
    destAmount,
    realRate,
    notes = ''
  }) {
    if (originId === destId) {
      throw new Error('La cuenta origen y destino no pueden ser iguales.');
    }

    const origin = this.getWallet(originId);
    const dest = this.getWallet(destId);

    if (!origin || !dest) {
      throw new Error('Billeteras inválidas seleccionadas.');
    }

    const numOriginAmount = parseFloat(originAmount);
    const numDestAmount = parseFloat(destAmount);
    const numRate = parseFloat(realRate);

    if (isNaN(numOriginAmount) || numOriginAmount <= 0) {
      throw new Error('El monto origen debe ser mayor a 0.');
    }

    if (isNaN(numDestAmount) || numDestAmount <= 0) {
      throw new Error('El monto destino debe ser mayor a 0.');
    }

    if (origin.balance < numOriginAmount) {
      throw new Error(`Saldo insuficiente en ${origin.name}. Saldo disponible: ${origin.balance.toFixed(2)} ${origin.currency}`);
    }

    // Débito en origen y Crédito en destino
    origin.balance = parseFloat((origin.balance - numOriginAmount).toFixed(2));
    origin.updatedAt = new Date().toISOString();

    dest.balance = parseFloat((dest.balance + numDestAmount).toFixed(2));
    dest.updatedAt = new Date().toISOString();

    this.saveWalletsToLocalStorage();

    const transactionRecord = {
      id: 'p2p_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      type: 'transferencia_p2p', // Crítico para el P&L futuro: no cuenta como ingreso ni gasto
      originId: origin.id,
      originName: origin.name,
      originCurrency: origin.currency,
      originAmount: numOriginAmount,
      destId: dest.id,
      destName: dest.name,
      destCurrency: dest.currency,
      destAmount: numDestAmount,
      realRate: !isNaN(numRate) ? numRate : null,
      notes: notes.trim(),
      timestamp: new Date().toISOString()
    };

    this.transactions.unshift(transactionRecord);
    if (this.transactions.length > 100) {
      this.transactions = this.transactions.slice(0, 100);
    }
    this.saveTransactionsToLocalStorage();

    if (this.isFirestoreActive && this.firestoreDb) {
      try {
        const { doc, setDoc, addDoc, collection } = this.fsMethods;
        await setDoc(doc(this.firestoreDb, 'wallets', origin.id), origin, { merge: true });
        await setDoc(doc(this.firestoreDb, 'wallets', dest.id), dest, { merge: true });
        await addDoc(collection(this.firestoreDb, 'transactions'), transactionRecord);
      } catch (err) {
        console.warn('[Storage] Error al persistir transacción en Firestore:', err);
      }
    }

    this.notify();
    return {
      success: true,
      transaction: transactionRecord
    };
  }

  /**
   * Pase Rápido 1:1 a Binance Ahorro (USDC - Earn) - Fase 2.5
   * Transfiere saldo de Binance Operativo (USDT) a Binance Ahorro (USDC)
   */
  async executeUsdcEarnPass(amount, notes = 'Pase a Binance Earn (USDC)') {
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      throw new Error('El monto a transferir a USDC Earn debe ser mayor a 0.');
    }

    const origin = this.getWallet('binance_usdt');
    const dest = this.getWallet('binance_usdc_earn');

    if (!origin || !dest) {
      throw new Error('No se encontraron las cuentas Binance USDT o Binance USDC.');
    }

    if (origin.balance < numAmount) {
      throw new Error(`Saldo insuficiente en ${origin.name}. Saldo disponible: $${origin.balance.toFixed(2)} USDT.`);
    }

    // Débito en USDT y Crédito en USDC (Paridad 1:1)
    origin.balance = parseFloat((origin.balance - numAmount).toFixed(2));
    origin.updatedAt = new Date().toISOString();

    dest.balance = parseFloat((dest.balance + numAmount).toFixed(2));
    dest.updatedAt = new Date().toISOString();

    this.saveWalletsToLocalStorage();

    const transactionRecord = {
      id: 'earn_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      type: 'transferencia_p2p', // Neutral para P&L
      subType: 'pase_usdc_earn',
      originId: origin.id,
      originName: origin.name,
      originCurrency: 'USDT',
      originAmount: numAmount,
      destId: dest.id,
      destName: dest.name,
      destCurrency: 'USDC',
      destAmount: numAmount,
      realRate: 1.00,
      notes: notes.trim(),
      timestamp: new Date().toISOString()
    };

    this.transactions.unshift(transactionRecord);
    if (this.transactions.length > 100) {
      this.transactions = this.transactions.slice(0, 100);
    }
    this.saveTransactionsToLocalStorage();

    if (this.isFirestoreActive && this.firestoreDb) {
      try {
        const { doc, setDoc, addDoc, collection } = this.fsMethods;
        await setDoc(doc(this.firestoreDb, 'wallets', origin.id), origin, { merge: true });
        await setDoc(doc(this.firestoreDb, 'wallets', dest.id), dest, { merge: true });
        await addDoc(collection(this.firestoreDb, 'transactions'), transactionRecord);
      } catch (err) {
        console.warn('[Storage] Error al persistir pase a USDC Earn en Firestore:', err);
      }
    }

    this.notify();
    return {
      success: true,
      transaction: transactionRecord
    };
  }

  // =========================================================================
  // MOTOR DE LOS 6 FONDOS (FASE 2)
  // =========================================================================
  getFunds() {
    return [...this.funds];
  }

  getFund(id) {
    return this.funds.find(f => f.id === id);
  }

  async adjustFundBalance(fundId, deltaUsdt, reason = '', walletId = null, rate = 1) {
    const idx = this.funds.findIndex(f => f.id === fundId);
    if (idx === -1) throw new Error('Fondo no encontrado');

    const numDelta = parseFloat(deltaUsdt);
    if (isNaN(numDelta) || numDelta === 0) {
      throw new Error('El monto de ajuste debe ser un número válido diferente de cero.');
    }

    const currentBal = this.funds[idx].balanceUsdt || 0;
    const newBal = Math.max(0, parseFloat((currentBal + numDelta).toFixed(2)));

    // Si se descuenta dinero (numDelta < 0) y se seleccionó una billetera real de origen:
    let affectedWallet = null;
    let deductLocalAmount = 0;

    if (numDelta < 0 && walletId && walletId !== 'none') {
      const wIdx = this.wallets.findIndex(w => w.id === walletId);
      if (wIdx === -1) throw new Error('Billetera de origen no encontrada');

      affectedWallet = this.wallets[wIdx];
      const absUsdt = Math.abs(numDelta);

      if (affectedWallet.currency === 'VES') {
        deductLocalAmount = parseFloat((absUsdt * rate).toFixed(2));
      } else {
        deductLocalAmount = parseFloat(absUsdt.toFixed(2));
      }

      if (affectedWallet.balance < deductLocalAmount) {
        throw new Error(
          `Saldo insuficiente en ${affectedWallet.name}. Disponible: ${affectedWallet.balance.toFixed(2)} ${affectedWallet.currency}, requerido: ${deductLocalAmount.toFixed(2)} ${affectedWallet.currency}.`
        );
      }

      // Descontar saldo real de la billetera
      affectedWallet.balance = parseFloat((affectedWallet.balance - deductLocalAmount).toFixed(2));
      affectedWallet.updatedAt = new Date().toISOString();
      this.saveWalletsToLocalStorage();

      if (this.isFirestoreActive && this.firestoreDb) {
        try {
          const { doc, setDoc } = this.fsMethods;
          await setDoc(doc(this.firestoreDb, 'wallets', affectedWallet.id), affectedWallet, { merge: true });
        } catch (err) {
          console.warn('[Storage] Error al actualizar billetera en Firestore:', err);
        }
      }

      // Registrar transacción en el historial
      const fundObj = this.funds[idx];
      const tx = {
        id: 'tx_fund_' + Date.now(),
        type: 'gasto_fondo',
        originId: affectedWallet.id,
        originName: affectedWallet.name,
        originCurrency: affectedWallet.currency,
        originAmount: deductLocalAmount,
        destId: fundObj.id,
        destName: fundObj.shortName || fundObj.name,
        destCurrency: 'USDT',
        destAmount: absUsdt,
        realRate: affectedWallet.currency === 'VES' ? rate : null,
        description: `${reason || 'Gasto de sobre'} [${fundObj.shortName || fundObj.name}]`,
        notes: `${reason || 'Gasto de sobre'} [${fundObj.shortName || fundObj.name}]`,
        timestamp: new Date().toISOString()
      };

      this.transactions.unshift(tx);
      this.saveTransactionsToLocalStorage();

      if (this.isFirestoreActive && this.firestoreDb) {
        try {
          const { doc, setDoc } = this.fsMethods;
          await setDoc(doc(this.firestoreDb, 'transactions', tx.id), tx);
        } catch (err) {
          console.warn('[Storage] Error al guardar transacción en Firestore:', err);
        }
      }
    }

    this.funds[idx].balanceUsdt = newBal;
    this.funds[idx].updatedAt = new Date().toISOString();

    this.saveFundsToLocalStorage();

    if (this.isFirestoreActive && this.firestoreDb) {
      try {
        const { doc, setDoc } = this.fsMethods;
        await setDoc(doc(this.firestoreDb, 'funds', fundId), this.funds[idx], { merge: true });
      } catch (err) {
        console.warn('[Storage] Error al actualizar fondo en Firestore:', err);
      }
    }

    this.notify();
    return {
      fund: this.funds[idx],
      wallet: affectedWallet,
      deductLocalAmount,
      previousBalance: currentBal,
      newBalance: newBal,
      delta: numDelta,
      reason
    };
  }

  async resetFundBalance(fundId) {
    const idx = this.funds.findIndex(f => f.id === fundId);
    if (idx === -1) throw new Error('Fondo no encontrado');

    const prevBal = this.funds[idx].balanceUsdt || 0;
    this.funds[idx].balanceUsdt = 0.00;
    this.funds[idx].updatedAt = new Date().toISOString();

    this.saveFundsToLocalStorage();

    if (this.isFirestoreActive && this.firestoreDb) {
      try {
        const { doc, setDoc } = this.fsMethods;
        await setDoc(doc(this.firestoreDb, 'funds', fundId), this.funds[idx], { merge: true });
      } catch (err) {
        console.warn('[Storage] Error al reiniciar fondo en Firestore:', err);
      }
    }

    this.notify();
    return { fund: this.funds[idx], previousBalance: prevBal };
  }

  // =========================================================================
  // GESTIÓN DE MOVIMIENTOS: INGRESOS EXTERNOS Y GASTOS (FASE 3)
  // =========================================================================

  /**
   * Registra un ingreso externo (fuera de la papelería)
   */
  async addExternalIncome({ concept, category, amount, currency, walletId, rate, date }) {
    if (!concept || !concept.trim()) throw new Error('El concepto del ingreso es requerido.');
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) throw new Error('El monto ingresado debe ser mayor a 0.');
    const numRate = parseFloat(rate) || 1;

    const wIdx = this.wallets.findIndex(w => w.id === walletId);
    if (wIdx === -1) throw new Error('Billetera de destino no válida.');
    const targetWallet = this.wallets[wIdx];

    let amountUsd = 0;
    let amountVes = 0;
    let walletAddAmount = 0;

    if (currency === 'USD') {
      amountUsd = numAmount;
      amountVes = parseFloat((numAmount * numRate).toFixed(2));
      walletAddAmount = targetWallet.currency === 'VES' ? amountVes : amountUsd;
    } else {
      amountVes = numAmount;
      amountUsd = numRate > 0 ? parseFloat((numAmount / numRate).toFixed(2)) : 0;
      walletAddAmount = targetWallet.currency === 'VES' ? amountVes : amountUsd;
    }

    // Acreditar saldo en la billetera
    targetWallet.balance = parseFloat((targetWallet.balance + walletAddAmount).toFixed(2));
    targetWallet.updatedAt = new Date().toISOString();
    this.saveWalletsToLocalStorage();

    if (this.isFirestoreActive && this.firestoreDb) {
      try {
        const { doc, setDoc } = this.fsMethods;
        await setDoc(doc(this.firestoreDb, 'wallets', targetWallet.id), targetWallet, { merge: true });
      } catch (err) {
        console.warn('[Storage] Error al actualizar billetera en Firestore:', err);
      }
    }

    const tx = {
      id: 'tx_inc_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      type: 'ingreso_externo',
      scope: 'ingreso_externo',
      concept: concept.trim(),
      category: category || 'otros_ingresos',
      amountUsd,
      amountVes,
      inputCurrency: currency,
      inputAmount: numAmount,
      originName: category || 'Ingreso Externo',
      destName: targetWallet.name,
      originAmount: numAmount,
      originCurrency: currency,
      destAmount: walletAddAmount,
      destCurrency: targetWallet.currency,
      walletId: targetWallet.id,
      walletName: targetWallet.name,
      walletCurrency: targetWallet.currency,
      realRate: numRate,
      rate: numRate,
      date: date || new Date().toISOString().split('T')[0],
      timestamp: new Date().toISOString(),
      notes: concept.trim()
    };

    this.transactions.unshift(tx);
    if (this.transactions.length > 200) {
      this.transactions = this.transactions.slice(0, 200);
    }
    this.saveTransactionsToLocalStorage();

    if (this.isFirestoreActive && this.firestoreDb) {
      try {
        const { doc, setDoc } = this.fsMethods;
        await setDoc(doc(this.firestoreDb, 'transactions', tx.id), tx);
      } catch (err) {
        console.warn('[Storage] Error al guardar transacción en Firestore:', err);
      }
    }

    this.notify();
    return { tx, wallet: targetWallet };
  }

  /**
   * Registra un gasto o salida de dinero sincronizado con Billetera y Fondo
   */
  async addExpense({ concept, amount, currency, walletId, fundId, rate, date }) {
    if (!concept || !concept.trim()) throw new Error('El concepto del gasto es requerido.');
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) throw new Error('El monto ingresado debe ser mayor a 0.');
    const numRate = parseFloat(rate) || 1;

    const wIdx = this.wallets.findIndex(w => w.id === walletId);
    if (wIdx === -1) throw new Error('Billetera de origen no válida.');
    const sourceWallet = this.wallets[wIdx];

    let amountUsd = 0;
    let amountVes = 0;
    let walletDeductAmount = 0;

    if (currency === 'USD') {
      amountUsd = numAmount;
      amountVes = parseFloat((numAmount * numRate).toFixed(2));
      walletDeductAmount = sourceWallet.currency === 'VES' ? amountVes : amountUsd;
    } else {
      amountVes = numAmount;
      amountUsd = numRate > 0 ? parseFloat((numAmount / numRate).toFixed(2)) : 0;
      walletDeductAmount = sourceWallet.currency === 'VES' ? amountVes : amountUsd;
    }

    // Validar saldo suficiente en la billetera real
    if (sourceWallet.balance < walletDeductAmount) {
      throw new Error(
        `Saldo insuficiente en ${sourceWallet.name}. Disponible: ${sourceWallet.balance.toFixed(2)} ${sourceWallet.currency}, requerido: ${walletDeductAmount.toFixed(2)} ${sourceWallet.currency}.`
      );
    }

    // Descontar de la billetera
    sourceWallet.balance = parseFloat((sourceWallet.balance - walletDeductAmount).toFixed(2));
    sourceWallet.updatedAt = new Date().toISOString();
    this.saveWalletsToLocalStorage();

    if (this.isFirestoreActive && this.firestoreDb) {
      try {
        const { doc, setDoc } = this.fsMethods;
        await setDoc(doc(this.firestoreDb, 'wallets', sourceWallet.id), sourceWallet, { merge: true });
      } catch (err) {
        console.warn('[Storage] Error al actualizar billetera en Firestore:', err);
      }
    }

    // Descontar del fondo virtual correspondiente (si no es libre_personal)
    let affectedFund = null;
    let isBusiness = false;

    if (fundId && fundId !== 'libre_personal') {
      const fIdx = this.funds.findIndex(f => f.id === fundId);
      if (fIdx !== -1) {
        affectedFund = this.funds[fIdx];
        affectedFund.balanceUsdt = Math.max(0, parseFloat((affectedFund.balanceUsdt - amountUsd).toFixed(2)));
        affectedFund.updatedAt = new Date().toISOString();
        this.saveFundsToLocalStorage();

        if (this.isFirestoreActive && this.firestoreDb) {
          try {
            const { doc, setDoc } = this.fsMethods;
            await setDoc(doc(this.firestoreDb, 'funds', affectedFund.id), affectedFund, { merge: true });
          } catch (err) {
            console.warn('[Storage] Error al actualizar fondo en Firestore:', err);
          }
        }
      }
    }

    // Determinar ámbito para filtros
    const businessFundIds = ['fondo_reposicion', 'fondo_alquiler_local', 'fondo_maquinas_emergencia'];
    isBusiness = affectedFund && businessFundIds.includes(affectedFund.id);
    const scope = isBusiness ? 'gasto_papeleria' : 'gasto_personal';

    const tx = {
      id: 'tx_exp_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      type: 'gasto_egreso',
      scope,
      concept: concept.trim(),
      amountUsd,
      amountVes,
      inputCurrency: currency,
      inputAmount: numAmount,
      walletId: sourceWallet.id,
      walletName: sourceWallet.name,
      walletCurrency: sourceWallet.currency,
      originName: sourceWallet.name,
      originAmount: walletDeductAmount,
      originCurrency: sourceWallet.currency,
      destName: affectedFund ? (affectedFund.shortName || affectedFund.name) : 'Libre Personal',
      destAmount: amountUsd,
      destCurrency: 'USDT',
      fundId: fundId || 'libre_personal',
      fundName: affectedFund ? (affectedFund.shortName || affectedFund.name) : 'Saldo Libre Personal',
      realRate: numRate,
      rate: numRate,
      date: date || new Date().toISOString().split('T')[0],
      timestamp: new Date().toISOString(),
      notes: concept.trim()
    };

    this.transactions.unshift(tx);
    if (this.transactions.length > 200) {
      this.transactions = this.transactions.slice(0, 200);
    }
    this.saveTransactionsToLocalStorage();

    if (this.isFirestoreActive && this.firestoreDb) {
      try {
        const { doc, setDoc } = this.fsMethods;
        await setDoc(doc(this.firestoreDb, 'transactions', tx.id), tx);
      } catch (err) {
        console.warn('[Storage] Error al guardar transacción en Firestore:', err);
      }
    }

    this.notify();
    return { tx, wallet: sourceWallet, fund: affectedFund };
  }

  /**
   * Revierte o elimina cualquier movimiento en el historial
   */
  async revertTransaction(txId) {
    const idx = this.transactions.findIndex(t => t.id === txId);
    if (idx === -1) throw new Error('Movimiento no encontrado.');
    const tx = this.transactions[idx];

    // Revertir efecto contable según el tipo
    if (tx.type === 'ingreso_externo') {
      const wIdx = this.wallets.findIndex(w => w.id === tx.walletId);
      if (wIdx !== -1) {
        const w = this.wallets[wIdx];
        const deductVal = w.currency === 'VES' ? (tx.amountVes || tx.destAmount) : (tx.amountUsd || tx.destAmount);
        w.balance = parseFloat((w.balance - deductVal).toFixed(2));
        w.updatedAt = new Date().toISOString();
        this.saveWalletsToLocalStorage();
        if (this.isFirestoreActive && this.firestoreDb) {
          try {
            const { doc, setDoc } = this.fsMethods;
            await setDoc(doc(this.firestoreDb, 'wallets', w.id), w, { merge: true });
          } catch (e) { console.warn(e); }
        }
      }
    } else if (tx.type === 'gasto_egreso' || tx.type === 'gasto_fondo') {
      // 1. Restaurar dinero a la billetera real de origen
      const wId = tx.walletId || tx.originId;
      const wIdx = this.wallets.findIndex(w => w.id === wId);
      if (wIdx !== -1) {
        const w = this.wallets[wIdx];
        const restoreVal = w.currency === 'VES' ? (tx.amountVes || tx.originAmount) : (tx.amountUsd || tx.originAmount);
        w.balance = parseFloat((w.balance + restoreVal).toFixed(2));
        w.updatedAt = new Date().toISOString();
        this.saveWalletsToLocalStorage();
        if (this.isFirestoreActive && this.firestoreDb) {
          try {
            const { doc, setDoc } = this.fsMethods;
            await setDoc(doc(this.firestoreDb, 'wallets', w.id), w, { merge: true });
          } catch (e) { console.warn(e); }
        }
      }

      // 2. Restaurar dinero al sobre virtual correspondiente
      const fId = tx.fundId || tx.destId;
      if (fId && fId !== 'libre_personal') {
        const fIdx = this.funds.findIndex(f => f.id === fId);
        if (fIdx !== -1) {
          const f = this.funds[fIdx];
          const restoreFundVal = tx.amountUsd || tx.destAmount || 0;
          f.balanceUsdt = parseFloat((f.balanceUsdt + restoreFundVal).toFixed(2));
          f.updatedAt = new Date().toISOString();
          this.saveFundsToLocalStorage();
          if (this.isFirestoreActive && this.firestoreDb) {
            try {
              const { doc, setDoc } = this.fsMethods;
              await setDoc(doc(this.firestoreDb, 'funds', f.id), f, { merge: true });
            } catch (e) { console.warn(e); }
          }
        }
      }
    } else if (tx.type === 'transferencia_p2p' || tx.type === 'conversion_interna') {
      const originW = this.wallets.find(w => w.id === tx.originId);
      const destW = this.wallets.find(w => w.id === tx.destId);
      if (originW) {
        originW.balance = parseFloat((originW.balance + tx.originAmount).toFixed(2));
        originW.updatedAt = new Date().toISOString();
      }
      if (destW) {
        destW.balance = parseFloat((destW.balance - tx.destAmount).toFixed(2));
        destW.updatedAt = new Date().toISOString();
      }
      this.saveWalletsToLocalStorage();
      if (this.isFirestoreActive && this.firestoreDb) {
        try {
          const { doc, setDoc } = this.fsMethods;
          if (originW) await setDoc(doc(this.firestoreDb, 'wallets', originW.id), originW, { merge: true });
          if (destW) await setDoc(doc(this.firestoreDb, 'wallets', destW.id), destW, { merge: true });
        } catch (e) { console.warn(e); }
      }
    }

    // Eliminar la transacción de la lista local
    this.transactions.splice(idx, 1);
    this.saveTransactionsToLocalStorage();

    // Eliminar de Firestore si aplica
    if (this.isFirestoreActive && this.firestoreDb) {
      try {
        const { doc, deleteDoc } = this.fsMethods;
        await deleteDoc(doc(this.firestoreDb, 'transactions', txId));
      } catch (err) {
        console.warn('[Storage] Error al eliminar transacción en Firestore:', err);
      }
    }

    this.notify();
    return { success: true, tx };
  }

  // =========================================================================
  // CIERRES DIARIOS DE PAPELERÍA (A&R PRINTS) - FASE 2
  // =========================================================================
  getDailyClosures() {
    return [...this.dailyClosures];
  }

  /**
   * Registra un nuevo cierre diario:
   * 1. Acredita las ventas brutas en las billeteras reales seleccionadas.
   * 2. Distribuye el 100% de las ventas brutas en los 6 fondos correspondientes.
   * 3. Guarda el registro inmutable con tasa congelada.
   */
  async saveDailyClosure(closurePayload) {
    const {
      date,
      salesGrossVes,
      salesGrossUsdt,
      netProfitUsdt,
      netProfitVes,
      directCostUsdt,
      directCostVes,
      operatingMarginPct,
      rateUsed,
      fundsDistribution,
      walletInflows,
      notes = ''
    } = closurePayload;

    if (!salesGrossVes || salesGrossVes <= 0) {
      throw new Error('Las Ventas Brutas Totales deben ser mayores a 0.');
    }

    // 1. Acreditar ingresos en las billeteras reales
    for (const inflow of walletInflows) {
      const wallet = this.getWallet(inflow.walletId);
      if (wallet && inflow.amount > 0) {
        wallet.balance = parseFloat((wallet.balance + inflow.amount).toFixed(2));
        wallet.updatedAt = new Date().toISOString();
      }
    }
    this.saveWalletsToLocalStorage();

    // 2. Acumular saldos en los 6 Fondos
    for (const fundItem of fundsDistribution) {
      const fund = this.getFund(fundItem.fundId);
      if (fund && fundItem.amountUsdt > 0) {
        fund.balanceUsdt = parseFloat(((fund.balanceUsdt || 0) + fundItem.amountUsdt).toFixed(2));
        fund.updatedAt = new Date().toISOString();
      }
    }
    this.saveFundsToLocalStorage();

    // 3. Crear registro histórico de Cierre
    const closureRecord = {
      id: 'closure_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      date: date || new Date().toISOString().split('T')[0],
      salesGrossVes: parseFloat(salesGrossVes.toFixed(2)),
      salesGrossUsdt: parseFloat(salesGrossUsdt.toFixed(2)),
      netProfitUsdt: parseFloat(netProfitUsdt.toFixed(2)),
      netProfitVes: parseFloat(netProfitVes.toFixed(2)),
      directCostUsdt: parseFloat(directCostUsdt.toFixed(2)),
      directCostVes: parseFloat(directCostVes.toFixed(2)),
      operatingMarginPct: parseFloat(operatingMarginPct.toFixed(1)),
      rateUsed: parseFloat(rateUsed.toFixed(2)),
      fundsDistribution,
      walletInflows,
      notes: notes.trim(),
      timestamp: new Date().toISOString()
    };

    this.dailyClosures.unshift(closureRecord);
    if (this.dailyClosures.length > 90) {
      this.dailyClosures = this.dailyClosures.slice(0, 90);
    }
    this.saveDailyClosuresToLocalStorage();

    // 4. Si Firestore está activo, reflejar
    if (this.isFirestoreActive && this.firestoreDb) {
      try {
        const { doc, setDoc, addDoc, collection } = this.fsMethods;
        // Sincronizar billeteras
        for (const inflow of walletInflows) {
          const w = this.getWallet(inflow.walletId);
          if (w) await setDoc(doc(this.firestoreDb, 'wallets', w.id), w, { merge: true });
        }
        // Sincronizar fondos
        for (const fundItem of fundsDistribution) {
          const f = this.getFund(fundItem.fundId);
          if (f) await setDoc(doc(this.firestoreDb, 'funds', f.id), f, { merge: true });
        }
        // Guardar cierre
        await addDoc(collection(this.firestoreDb, 'daily_closures'), closureRecord);
      } catch (err) {
        console.warn('[Storage] Error al guardar cierre en Firestore:', err);
      }
    }

    this.notify();
    return {
      success: true,
      closure: closureRecord
    };
  }

  /**
   * Revierte y elimina un cierre diario:
   * 1. Descuenta los montos que habían ingresado a las billeteras reales.
   * 2. Descuenta los montos sumados a los 6 Fondos.
   * 3. Remueve el registro del historial.
   */
  async revertDailyClosure(closureId) {
    const idx = this.dailyClosures.findIndex(c => c.id === closureId);
    if (idx === -1) throw new Error('Cierre diario no encontrado');

    const closure = this.dailyClosures[idx];

    // 1. Revertir billeteras reales
    if (Array.isArray(closure.walletInflows)) {
      for (const inflow of closure.walletInflows) {
        const wallet = this.getWallet(inflow.walletId);
        if (wallet && inflow.amount > 0) {
          wallet.balance = parseFloat((wallet.balance - inflow.amount).toFixed(2));
          wallet.updatedAt = new Date().toISOString();
        }
      }
      this.saveWalletsToLocalStorage();
    }

    // 2. Revertir los 6 fondos
    if (Array.isArray(closure.fundsDistribution)) {
      for (const fundItem of closure.fundsDistribution) {
        const fund = this.getFund(fundItem.fundId);
        if (fund && fundItem.amountUsdt > 0) {
          fund.balanceUsdt = Math.max(0, parseFloat(((fund.balanceUsdt || 0) - fundItem.amountUsdt).toFixed(2)));
          fund.updatedAt = new Date().toISOString();
        }
      }
      this.saveFundsToLocalStorage();
    }

    // 3. Eliminar del array local
    this.dailyClosures.splice(idx, 1);
    this.saveDailyClosuresToLocalStorage();

    // 4. Si Firestore está activo, reflejar
    if (this.isFirestoreActive && this.firestoreDb) {
      try {
        const { doc, setDoc, deleteDoc } = this.fsMethods;
        // Actualizar billeteras
        if (Array.isArray(closure.walletInflows)) {
          for (const inflow of closure.walletInflows) {
            const w = this.getWallet(inflow.walletId);
            if (w) await setDoc(doc(this.firestoreDb, 'wallets', w.id), w, { merge: true });
          }
        }
        // Actualizar fondos
        if (Array.isArray(closure.fundsDistribution)) {
          for (const fundItem of closure.fundsDistribution) {
            const f = this.getFund(fundItem.fundId);
            if (f) await setDoc(doc(this.firestoreDb, 'funds', f.id), f, { merge: true });
          }
        }
        // Intentar eliminar documento de daily_closures en Firestore si coincide el ID
        try {
          await deleteDoc(doc(this.firestoreDb, 'daily_closures', closureId));
        } catch (_) {}
      } catch (err) {
        console.warn('[Storage] Error al revertir en Firestore:', err);
      }
    }

    this.notify();
    return { success: true, revertedClosure: closure };
  }

  // =========================================================================
  // RESPALDO Y RESTAURACIÓN INTEGRAL (JSON)
  // =========================================================================
  exportDataJson() {
    const data = {
      version: "2.0",
      exportedAt: new Date().toISOString(),
      wallets: this.wallets,
      transactions: this.transactions,
      funds: this.funds,
      dailyClosures: this.dailyClosures
    };
    return JSON.stringify(data, null, 2);
  }

  importDataJson(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      if (!data.wallets || !Array.isArray(data.wallets)) {
        throw new Error('Formato de respaldo inválido: faltan las billeteras.');
      }
      this.wallets = data.wallets;
      this.transactions = Array.isArray(data.transactions) ? data.transactions : [];
      this.funds = Array.isArray(data.funds) ? data.funds : JSON.parse(JSON.stringify(INITIAL_FUNDS));
      this.dailyClosures = Array.isArray(data.dailyClosures) ? data.dailyClosures : [];

      this.saveWalletsToLocalStorage();
      this.saveTransactionsToLocalStorage();
      this.saveFundsToLocalStorage();
      this.saveDailyClosuresToLocalStorage();

      this.notify();
      return true;
    } catch (e) {
      throw new Error('Error al importar archivo: ' + e.message);
    }
  }

  subscribe(callback) {
    this.listeners.add(callback);
    callback({
      wallets: this.getWallets(),
      transactions: this.getTransactions(),
      funds: this.getFunds(),
      dailyClosures: this.getDailyClosures(),
      status: this.initStatus
    });
    return () => this.listeners.delete(callback);
  }

  notify() {
    const state = {
      wallets: this.getWallets(),
      transactions: this.getTransactions(),
      funds: this.getFunds(),
      dailyClosures: this.getDailyClosures(),
      status: this.initStatus
    };
    this.listeners.forEach(cb => {
      try {
        cb(state);
      } catch (err) {
        console.error('[Storage] Error notificando suscriptor:', err);
      }
    });
  }
}

export const storageService = new StorageService();
