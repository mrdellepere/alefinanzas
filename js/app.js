/**
 * AleFinanzas - Main Application Controller
 * Senior Frontend Architecture - Mobile-First Fintech Terminal
 * Fase 1: Bóveda de Billeteras & Motor P2P.
 * Fase 2: Módulo de Cierre Diario de Papelería (A&R Prints) & Motor de los 6 Fondos.
 */

import { criptoYaService } from './services/criptoya.js';
import { storageService } from './services/storage.js';
import { DAILY_SALES_GOAL_USDT, WEEKLY_SALES_GOAL_USDT, MONTHLY_SALES_GOAL_USDT } from './config.js';

class AppController {
  constructor() {
    this.currentTab = 'wallets';
    this.isBalancesHidden = localStorage.getItem('alefinanzas_hide_balances') === 'true';
    this.activeArqueoWalletId = null;
    this.p2pInputMode = 'origin'; // 'origin' | 'dest'

    // Estado Fase 2 (Papelería & Fondos)
    this.closureDestinationMode = 'banco_direct'; // 'banco_direct' | 'mixed'
    this.activeFundActionId = null;
    this.fundActionMode = 'discount'; // 'discount' | 'reset'
  }

  async init() {
    console.log('[AleFinanzas] Iniciando sistema Fintech Terminal (Fase 1 + Fase 2)...');
    
    this.bindDOM();
    this.setupEventListeners();
    this.setupNavigation();
    
    // Iniciar servicios
    await storageService.init();
    criptoYaService.startAutoRefresh();

    // Suscribirse a cambios en la tasa CriptoYA
    criptoYaService.subscribe(rateStatus => {
      this.renderRateWidget(rateStatus);
      this.recalculateAll();
      this.updateClosureLiveCalculations();
      this.updateIncomeLiveCalculations();
      this.updateExpenseLiveCalculations();
      this.renderPnlDashboard();
    });

    // Suscribirse a cambios en los saldos, transacciones, fondos y cierres
    storageService.subscribe(data => {
      this.renderWallets(data.wallets);
      this.renderTransactions(data.transactions);
      this.renderFunds(data.funds);
      this.renderDailyClosures(data.dailyClosures);
      this.renderUnifiedMovements(data.transactions);
      this.renderMovWalletSelectors();
      this.recalculateAll();
      this.renderStorageStatus(data.status);
      this.renderPnlDashboard();
    });

    // Inicializar valores de Fase 3 y Fase 4
    const liveRate = criptoYaService.getRate();
    if (this.movIncomeRate && !this.movIncomeRate.value) this.movIncomeRate.value = liveRate.toFixed(2);
    if (this.movExpenseRate && !this.movExpenseRate.value) this.movExpenseRate.value = liveRate.toFixed(2);
    this.renderMovWalletSelectors();
    this.renderUnifiedMovements(storageService.getTransactions());
    this.renderPnlDashboard();

    // Registrar Service Worker para PWA
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js')
        .then(reg => console.log('[SW] PWA Service Worker registrado:', reg.scope))
        .catch(err => console.warn('[SW] Error al registrar PWA SW:', err));
    }
  }

  bindDOM() {
    // Header & Rate
    this.ratePill = document.getElementById('rate-widget-pill');
    this.rateDot = document.getElementById('rate-pulse-dot');
    this.rateValueText = document.getElementById('rate-value-text');
    this.btnRefreshRate = document.getElementById('btn-refresh-rate');

    // Hero Total (Patrimonio)
    this.heroTotalUsd = document.getElementById('hero-total-usd');
    this.heroTotalVes = document.getElementById('hero-total-ves');
    this.btnToggleEye = document.getElementById('btn-toggle-eye');
    this.eyeIcon = document.getElementById('eye-icon');
    this.heroDistBinance = document.getElementById('dist-binance');
    this.heroDistUsdc = document.getElementById('dist-usdc');
    this.heroDistBanco = document.getElementById('dist-banco');
    this.heroDistUsd = document.getElementById('dist-usd');
    this.heroDistVes = document.getElementById('dist-ves');
    this.statUsdtPct = document.getElementById('stat-usdt-pct');
    this.statVesPct = document.getElementById('stat-ves-pct');

    // Wallets & List
    this.walletsContainer = document.getElementById('wallets-container');
    this.transactionsContainer = document.getElementById('transactions-container');
    this.btnOpenP2P = document.getElementById('btn-open-p2p');

    // Modal P2P Conversion
    this.modalP2P = document.getElementById('modal-p2p');
    this.formP2P = document.getElementById('form-p2p');
    this.p2pOriginSelect = document.getElementById('p2p-origin-wallet');
    this.p2pDestSelect = document.getElementById('p2p-dest-wallet');
    this.p2pOriginAmountInput = document.getElementById('p2p-origin-amount');
    this.p2pDestAmountInput = document.getElementById('p2p-dest-amount');
    this.p2pRateInput = document.getElementById('p2p-rate-input');
    this.p2pOriginAvailable = document.getElementById('p2p-origin-available');
    this.p2pRateRow = document.getElementById('p2p-rate-row');
    this.btnSyncCriptoya = document.getElementById('btn-sync-criptoya');
    this.p2pSummaryDebited = document.getElementById('p2p-summary-debited');
    this.p2pSummaryCredited = document.getElementById('p2p-summary-credited');
    this.p2pSummaryRate = document.getElementById('p2p-summary-rate');

    // Presets P2P
    this.btnPresetUsdtUsdc = document.getElementById('btn-preset-usdt-usdc');
    this.btnPresetBinanceBanco = document.getElementById('btn-preset-binance-banco');

    // Modal Arqueo / Ajuste
    this.modalArqueo = document.getElementById('modal-arqueo');
    this.formArqueo = document.getElementById('form-arqueo');
    this.arqueoWalletName = document.getElementById('arqueo-wallet-name');
    this.arqueoCurrentBalance = document.getElementById('arqueo-current-balance');
    this.arqueoNewBalanceInput = document.getElementById('arqueo-new-balance');
    this.arqueoCurrencyLabel = document.getElementById('arqueo-currency-label');
    this.arqueoDiffPreview = document.getElementById('arqueo-diff-preview');
    this.arqueoReasonInput = document.getElementById('arqueo-reason');

    // Modal Manual Rate
    this.modalManualRate = document.getElementById('modal-manual-rate');
    this.formManualRate = document.getElementById('form-manual-rate');
    this.manualRateInput = document.getElementById('manual-rate-input');
    this.btnResetCriptoya = document.getElementById('btn-reset-criptoya');

    // =======================================================================
    // ELEMENTOS FASE 2: PAPELERÍA & 6 FONDOS
    // =======================================================================
    this.fundsTotalUsdt = document.getElementById('funds-total-usdt');
    this.fundsTotalVes = document.getElementById('funds-total-ves');
    this.fundsGridContainer = document.getElementById('funds-grid-container');

    // Acción Rápida: Pase a Binance Ahorro (USDC - Earn) - Fase 2.5
    this.earnSavingsAccumVal = document.getElementById('earn-savings-accum-val');
    this.btnTriggerEarnPass = document.getElementById('btn-trigger-earn-pass');

    // Formulario de Cierre Diario
    this.formDailyClosure = document.getElementById('form-daily-closure');
    this.closureDateInput = document.getElementById('closure-date');
    this.closureSalesGrossVesInput = document.getElementById('closure-sales-gross-ves');
    this.closureNetProfitUsdtInput = document.getElementById('closure-net-profit-usdt');
    this.closureRateInput = document.getElementById('closure-rate-input');
    this.btnSyncClosureRate = document.getElementById('btn-sync-closure-rate');

    // Métricas y Meta Diaria
    this.dailyGoalStatus = document.getElementById('daily-goal-status');
    this.dailyGoalFill = document.getElementById('daily-goal-fill');
    this.posMetricGrossUsdt = document.getElementById('pos-metric-gross-usdt');
    this.posMetricGrossVes = document.getElementById('pos-metric-gross-ves');
    this.posMetricCostUsdt = document.getElementById('pos-metric-cost-usdt');
    this.posMetricCostVes = document.getElementById('pos-metric-cost-ves');
    this.posMetricMarginPct = document.getElementById('pos-metric-margin-pct');
    this.fundsDistLiveList = document.getElementById('funds-dist-live-list');

    // Asistente Cripto del Cierre (USDT vs USDC) - Fase 2.5
    this.cryptoGuideUsdcVal = document.getElementById('crypto-guide-usdc-val');
    this.cryptoSubLocal = document.getElementById('crypto-sub-local');
    this.cryptoSubVivienda = document.getElementById('crypto-sub-vivienda');
    this.cryptoSubMaquinas = document.getElementById('crypto-sub-maquinas');
    this.cryptoGuideUsdtVal = document.getElementById('crypto-guide-usdt-val');
    this.cryptoSubReposicion = document.getElementById('crypto-sub-reposicion');
    this.cryptoSubPersonal = document.getElementById('crypto-sub-personal');

    // Destino del Dinero (Banco vs Mixto)
    this.btnDestBanco = document.getElementById('btn-dest-banco');
    this.btnDestMixed = document.getElementById('btn-dest-mixed');
    this.mixedInputsContainer = document.getElementById('mixed-inputs-container');
    this.inflowBancoVes = document.getElementById('inflow-banco-ves');
    this.inflowVesCash = document.getElementById('inflow-ves-cash');
    this.inflowUsdCash = document.getElementById('inflow-usd-cash');
    this.inflowBinanceUsdt = document.getElementById('inflow-binance-usdt');
    this.inflowBinanceUsdc = document.getElementById('inflow-binance-usdc');
    this.mixedBalanceStatus = document.getElementById('mixed-balance-status');
    this.closureNotesInput = document.getElementById('closure-notes');

    // Historial Cierres
    this.closureCountBadge = document.getElementById('closure-count-badge');
    this.closureHistoryContainer = document.getElementById('closure-history-container');

    // Modal Uso / Descuento de Fondos
    this.modalFundAction = document.getElementById('modal-fund-action');
    this.formFundAction = document.getElementById('form-fund-action');
    this.fundActionTitle = document.getElementById('fund-action-title');
    this.fundActionSubtitle = document.getElementById('fund-action-subtitle');
    this.fundActionCurrentBal = document.getElementById('fund-action-current-bal');
    this.fundActionCurrentVes = document.getElementById('fund-action-current-ves');
    this.btnFundModeDiscount = document.getElementById('btn-fund-mode-discount');
    this.btnFundModeReset = document.getElementById('btn-fund-mode-reset');
    this.fundActionAmountGroup = document.getElementById('fund-action-amount-group');
    this.fundActionAmountInput = document.getElementById('fund-action-amount');
    this.fundActionReasonInput = document.getElementById('fund-action-reason');
    this.fundActionWalletGroup = document.getElementById('fund-action-wallet-group');
    this.fundActionWalletSelect = document.getElementById('fund-action-wallet-select');
    this.fundActionWalletHint = document.getElementById('fund-action-wallet-hint');
    this.btnFundActionSubmit = document.getElementById('btn-fund-action-submit');

    // Tarjeta Maestra de Balance Exclusivo de la Papelería (A&R Prints)
    this.businessVaultContainer = document.getElementById('business-vault-summary-container');

    // =======================================================================
    // ELEMENTOS FASE 3: MOVIMIENTOS (INGRESOS EXTERNOS & GASTOS)
    // =======================================================================
    this.btnMovTypeIncome = document.getElementById('btn-mov-type-income');
    this.btnMovTypeExpense = document.getElementById('btn-mov-type-expense');
    this.movFormIncomeCard = document.getElementById('mov-form-income-card');
    this.movFormExpenseCard = document.getElementById('mov-form-expense-card');

    // Formulario Ingresos
    this.formNewIncome = document.getElementById('form-new-income');
    this.movIncomeConcept = document.getElementById('mov-income-concept');
    this.movIncomeCategory = document.getElementById('mov-income-category');
    this.btnIncomeCurrUsd = document.getElementById('btn-income-curr-usd');
    this.btnIncomeCurrVes = document.getElementById('btn-income-curr-ves');
    this.movIncomeAmount = document.getElementById('mov-income-amount');
    this.movIncomeCurrAddon = document.getElementById('mov-income-curr-addon');
    this.movIncomeEquivPreview = document.getElementById('mov-income-equiv-preview');
    this.movIncomeRate = document.getElementById('mov-income-rate');
    this.movIncomeWallet = document.getElementById('mov-income-wallet');
    this.btnSubmitIncome = document.getElementById('btn-submit-income');

    // Formulario Gastos
    this.formNewExpense = document.getElementById('form-new-expense');
    this.movExpenseConcept = document.getElementById('mov-expense-concept');
    this.btnExpenseCurrUsd = document.getElementById('btn-expense-curr-usd');
    this.btnExpenseCurrVes = document.getElementById('btn-expense-curr-ves');
    this.movExpenseAmount = document.getElementById('mov-expense-amount');
    this.movExpenseCurrAddon = document.getElementById('mov-expense-curr-addon');
    this.movExpenseEquivPreview = document.getElementById('mov-expense-equiv-preview');
    this.movExpenseRate = document.getElementById('mov-expense-rate');
    this.movExpenseWallet = document.getElementById('mov-expense-wallet');
    this.movExpenseFund = document.getElementById('mov-expense-fund');
    this.movExpenseFundHint = document.getElementById('mov-expense-fund-hint');
    this.btnSubmitExpense = document.getElementById('btn-submit-expense');

    // Historial y Filtros de Movimientos
    this.movTotalCountBadge = document.getElementById('mov-total-count-badge');
    this.movFiltersBar = document.getElementById('mov-filters-bar');
    this.movUnifiedHistoryList = document.getElementById('mov-unified-history-list');

    // Estados internos de Fase 3
    this.activeMovMode = 'income'; // 'income' | 'expense'
    this.incomeCurrency = 'USD';
    this.expenseCurrency = 'USD';
    this.activeMovFilter = 'all';

    // =======================================================================
    // ELEMENTOS FASE 4: ESTADO DE RESULTADOS (P&L), KPIS & RESPALDO
    // =======================================================================
    this.btnOpenSettings = document.getElementById('btn-open-settings');
    this.modalSettings = document.getElementById('modal-settings');
    this.btnExportBackup = document.getElementById('btn-export-backup');
    this.btnTriggerImportBackup = document.getElementById('btn-trigger-import-backup');
    this.inputImportBackup = document.getElementById('input-import-backup');

    // Selector de Período Dual PnL
    this.btnPnlPeriodWeek = document.getElementById('btn-pnl-period-week');
    this.btnPnlPeriodMonth = document.getElementById('btn-pnl-period-month');
    this.btnPnlNavPrev = document.getElementById('btn-pnl-nav-prev');
    this.btnPnlNavNext = document.getElementById('btn-pnl-nav-next');
    this.pnlNavPeriodLabel = document.getElementById('pnl-nav-period-label');

    // Nivel 1 PnL
    this.pnlN1GrossSalesUsd = document.getElementById('pnl-n1-gross-sales-usd');
    this.pnlN1GrossSalesVes = document.getElementById('pnl-n1-gross-sales-ves');
    this.pnlN1CogsUsd = document.getElementById('pnl-n1-cogs-usd');
    this.pnlN1CogsVes = document.getElementById('pnl-n1-cogs-ves');
    this.pnlN1GrossMarginUsd = document.getElementById('pnl-n1-gross-margin-usd');
    this.pnlN1GrossMarginVes = document.getElementById('pnl-n1-gross-margin-ves');
    this.pnlN1MarginPct = document.getElementById('pnl-n1-margin-pct');

    // Nivel 2 PnL
    this.pnlN2FixedReservesUsd = document.getElementById('pnl-n2-fixed-reserves-usd');
    this.pnlN2FixedReservesVes = document.getElementById('pnl-n2-fixed-reserves-ves');
    this.pnlN2NetUsd = document.getElementById('pnl-n2-net-usd');
    this.pnlN2NetVes = document.getElementById('pnl-n2-net-ves');
    this.pnlN2NetPct = document.getElementById('pnl-n2-net-pct');

    // Nivel 3 PnL
    this.pnlN3PaperProfitUsd = document.getElementById('pnl-n3-paper-profit-usd');
    this.pnlN3PaperProfitVes = document.getElementById('pnl-n3-paper-profit-ves');
    this.pnlN3OtherIncomeUsd = document.getElementById('pnl-n3-other-income-usd');
    this.pnlN3OtherIncomeVes = document.getElementById('pnl-n3-other-income-ves');
    this.pnlN3OtherIncomeBreakdown = document.getElementById('pnl-n3-other-income-breakdown');
    this.pnlN3PersonalExpensesUsd = document.getElementById('pnl-n3-personal-expenses-usd');
    this.pnlN3PersonalExpensesVes = document.getElementById('pnl-n3-personal-expenses-ves');
    this.pnlN3PersonalExpenseBreakdown = document.getElementById('pnl-n3-personal-expense-breakdown');
    this.pnlCashflowTotalCard = document.getElementById('pnl-cashflow-total-card');
    this.pnlCashflowStatusPill = document.getElementById('pnl-cashflow-status-pill');
    this.pnlCashflowTotalUsd = document.getElementById('pnl-cashflow-total-usd');
    this.pnlCashflowTotalVes = document.getElementById('pnl-cashflow-total-ves');
    this.pnlCashflowDesc = document.getElementById('pnl-cashflow-desc');

    // KPIs & Metas
    this.kpiSalesGoalStatus = document.getElementById('kpi-sales-goal-status');
    this.kpiSalesGoalFill = document.getElementById('kpi-sales-goal-fill');
    this.kpiSalesGoalPct = document.getElementById('kpi-sales-goal-pct');
    this.kpiSalesWorkedDays = document.getElementById('kpi-sales-worked-days');
    this.kpiSalesAvgNote = document.getElementById('kpi-sales-avg-note');
    this.kpiRentCoverageStatus = document.getElementById('kpi-rent-coverage-status');
    this.kpiRentCoverageFill = document.getElementById('kpi-rent-coverage-fill');
    this.kpiRentCoveragePct = document.getElementById('kpi-rent-coverage-pct');
    this.kpiRentRemaining = document.getElementById('kpi-rent-remaining');
    this.kpiIncomeRatioStatus = document.getElementById('kpi-income-ratio-status');
    this.kpiRatioPaperFill = document.getElementById('kpi-ratio-paper-fill');
    this.kpiRatioOtherFill = document.getElementById('kpi-ratio-other-fill');
    this.kpiRatioPaperPct = document.getElementById('kpi-ratio-paper-pct');
    this.kpiRatioOtherPct = document.getElementById('kpi-ratio-other-pct');

    // Gráfica
    this.chartBarSales = document.getElementById('chart-bar-sales');
    this.chartBarOther = document.getElementById('chart-bar-other');
    this.chartBarExpenses = document.getElementById('chart-bar-expenses');
    this.chartValSales = document.getElementById('chart-val-sales');
    this.chartValOther = document.getElementById('chart-val-other');
    this.chartValExpenses = document.getElementById('chart-val-expenses');

    // Estados internos de Fase 4
    this.pnlPeriodType = 'week'; // 'week' | 'month'
    this.pnlCurrentAnchorDate = new Date();

    // Navigation Tabs
    this.navButtons = document.querySelectorAll('.nav-tab-btn');
    this.tabViews = {
      wallets: document.getElementById('tab-view-wallets'),
      papeleria: document.getElementById('tab-view-papeleria'),
      movimientos: document.getElementById('tab-view-movimientos'),
      pnl: document.getElementById('tab-view-pnl')
    };

    // Toasts
    this.toastContainer = document.getElementById('toast-container');

    // Inicializar fecha de hoy por defecto en el cierre
    if (this.closureDateInput) {
      this.closureDateInput.value = new Date().toISOString().split('T')[0];
    }
  }

  setupEventListeners() {
    // Tasa Widget
    this.ratePill.addEventListener('click', () => this.openManualRateModal());
    this.btnRefreshRate.addEventListener('click', (e) => {
      e.stopPropagation();
      this.refreshRateWithSpin();
    });

    // Ocultar / Mostrar Saldos
    this.btnToggleEye.addEventListener('click', () => this.toggleBalanceVisibility());

    // Botón P2P Principal
    this.btnOpenP2P.addEventListener('click', () => this.openP2PModal());

    // Cerrar Modales al tocar backdrop o botones close
    document.querySelectorAll('.modal-backdrop').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) this.closeAllModals();
      });
      const closeBtn = modal.querySelector('.modal-btn-close');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => this.closeAllModals());
      }
    });

    // P2P: Cambio en origen o destino
    this.p2pOriginSelect.addEventListener('change', () => {
      this.handleP2PWalletSelectionChange();
      this.calculateP2PFromOrigin();
    });

    this.p2pDestSelect.addEventListener('change', () => {
      this.handleP2PWalletSelectionChange();
      this.calculateP2PFromOrigin();
    });

    // P2P: Cálculo Bidireccional
    this.p2pOriginAmountInput.addEventListener('input', () => {
      this.p2pInputMode = 'origin';
      this.calculateP2PFromOrigin();
    });

    this.p2pDestAmountInput.addEventListener('input', () => {
      this.p2pInputMode = 'dest';
      this.calculateP2PFromDest();
    });

    this.p2pRateInput.addEventListener('input', () => {
      if (this.p2pInputMode === 'dest') {
        this.calculateP2PFromDest();
      } else {
        this.calculateP2PFromOrigin();
      }
    });

    // Botón Sincronizar Tasa en P2P
    this.btnSyncCriptoya.addEventListener('click', () => {
      const liveRate = criptoYaService.getRate();
      this.p2pRateInput.value = liveRate.toFixed(2);
      if (this.p2pInputMode === 'dest') {
        this.calculateP2PFromDest();
      } else {
        this.calculateP2PFromOrigin();
      }
      this.showToast(`Tasa sincronizada con CriptoYA: ${liveRate.toFixed(2)} Bs`, 'success');
    });

    // Atajos Rápidos de Presets P2P - Fase 2.5
    if (this.btnPresetUsdtUsdc) {
      this.btnPresetUsdtUsdc.addEventListener('click', () => {
        this.p2pOriginSelect.value = 'binance_usdt';
        this.p2pDestSelect.value = 'binance_usdc_earn';
        this.p2pRateInput.value = '1.00';
        this.handleP2PWalletSelectionChange();
        this.calculateP2PFromOrigin();
        this.showToast('Configurado: Conversión 1:1 Binance USDT ↔ USDC Earn', 'success');
      });
    }

    if (this.btnPresetBinanceBanco) {
      this.btnPresetBinanceBanco.addEventListener('click', () => {
        this.p2pOriginSelect.value = 'binance_usdt';
        this.p2pDestSelect.value = 'banco_ves';
        this.p2pRateInput.value = criptoYaService.getRate().toFixed(2);
        this.handleP2PWalletSelectionChange();
        this.calculateP2PFromOrigin();
        this.showToast('Configurado: Venta P2P Binance USDT → Banco (Bs)', 'success');
      });
    }

    // Píldoras de porcentaje P2P (25%, 50%, 75%, 100%)
    document.querySelectorAll('.btn-percent-pill').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const pct = parseInt(e.target.dataset.pct, 10);
        this.applyP2PPercentage(pct);
      });
    });

    // Envío del Formulario P2P
    this.formP2P.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.executeP2PTransfer();
    });

    // Modal Arqueo: Cálculo en tiempo real de diferencia
    this.arqueoNewBalanceInput.addEventListener('input', () => {
      this.calculateArqueoDiff();
    });

    // Botones rápidos de arqueo (+10, +50, +100, Reset)
    document.querySelectorAll('.btn-arqueo-quick').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const delta = parseFloat(e.currentTarget.dataset.delta);
        const currentVal = parseFloat(this.arqueoNewBalanceInput.value) || 0;
        this.arqueoNewBalanceInput.value = Math.max(0, currentVal + delta).toFixed(2);
        this.calculateArqueoDiff();
      });
    });

    // Envío del Formulario Arqueo
    this.formArqueo.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.submitArqueo();
    });

    // Envío del Formulario de Tasa Manual
    this.formManualRate.addEventListener('submit', (e) => {
      e.preventDefault();
      const val = parseFloat(this.manualRateInput.value);
      if (!isNaN(val) && val > 0) {
        criptoYaService.setManualRate(val);
        this.closeAllModals();
        this.showToast(`Tasa manual establecida en ${val.toFixed(2)} Bs/USDT`, 'warning');
      }
    });

    this.btnResetCriptoya.addEventListener('click', async () => {
      await criptoYaService.clearManualRate();
      this.closeAllModals();
      this.showToast('Restaurada tasa automática en vivo de CriptoYA', 'success');
    });

    // Delegación de eventos para botones de arqueo en las tarjetas de billetera
    this.walletsContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-arqueo-adjust');
      if (btn) {
        const walletId = btn.dataset.walletId;
        this.openArqueoModal(walletId);
      }
    });

    // =======================================================================
    // EVENT LISTENERS FASE 2: PAPELERÍA & 6 FONDOS
    // =======================================================================
    // Cálculos en vivo mientras se escribe en el cierre del POS
    this.closureSalesGrossVesInput.addEventListener('input', () => {
      this.updateClosureLiveCalculations();
    });

    this.closureNetProfitUsdtInput.addEventListener('input', () => {
      this.updateClosureLiveCalculations();
    });

    this.closureRateInput.addEventListener('input', () => {
      this.updateClosureLiveCalculations();
    });

    this.btnSyncClosureRate.addEventListener('click', () => {
      const liveRate = criptoYaService.getRate();
      this.closureRateInput.value = liveRate.toFixed(2);
      this.updateClosureLiveCalculations();
      this.showToast(`Tasa de cierre sincronizada: ${liveRate.toFixed(2)} Bs`, 'success');
    });

    // Selector de destino del dinero (Banco vs Mixto)
    this.btnDestBanco.addEventListener('click', () => {
      this.setClosureDestinationMode('banco_direct');
    });

    this.btnDestMixed.addEventListener('click', () => {
      this.setClosureDestinationMode('mixed');
    });

    // Inputs de distribución mixta
    document.querySelectorAll('.mixed-inflow-input').forEach(input => {
      input.addEventListener('input', () => {
        this.validateMixedInflows();
      });
    });

    // Envío del Formulario de Cierre Diario
    this.formDailyClosure.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleSaveDailyClosure();
    });

    // Botón de Acción Rápida: Ejecutar Pase a Binance Ahorro (USDC - Earn) - Fase 2.5
    if (this.btnTriggerEarnPass) {
      this.btnTriggerEarnPass.addEventListener('click', async () => {
        await this.handleExecuteEarnPass();
      });
    }

    // Delegación de eventos en Bóveda de los 6 Fondos (Botón Usar / Ajustar)
    this.fundsGridContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-fund-use');
      if (btn) {
        const fundId = btn.dataset.fundId;
        this.openFundActionModal(fundId);
      }
    });

    // Modal Fondos: Conmutador entre Descuento y Reinicio
    this.btnFundModeDiscount.addEventListener('click', () => {
      this.setFundActionMode('discount');
    });

    this.btnFundModeReset.addEventListener('click', () => {
      this.setFundActionMode('reset');
    });

    // Envío del Modal de Fondo
    this.formFundAction.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleSubmitFundAction();
    });

    // Actualización dinámica de preview de descuento en cuenta real
    if (this.fundActionAmountInput) {
      this.fundActionAmountInput.addEventListener('input', () => {
        this.updateFundActionWalletHint();
      });
    }

    if (this.fundActionWalletSelect) {
      this.fundActionWalletSelect.addEventListener('change', () => {
        this.updateFundActionWalletHint();
      });
    }

    // Delegación de eventos en Historial de Cierres (Botón Revertir)
    this.closureHistoryContainer.addEventListener('click', async (e) => {
      const btn = e.target.closest('.btn-revert-closure');
      if (btn) {
        const closureId = btn.dataset.closureId;
        await this.handleRevertClosure(closureId);
      }
    });

    // Eventos de Movimientos (Fase 3)
    this.setupMovEventListeners();

    // Eventos de PnL y Ajustes (Fase 4)
    this.setupPnlEventListeners();
    this.setupSettingsEventListeners();
  }

  // =========================================================================
  // FASE 3: MÓDULO DE MOVIMIENTOS (INGRESOS EXTERNOS & GASTOS)
  // =========================================================================
  setupMovEventListeners() {
    // 1. Selector tipo Segmented Control (Ingreso vs Gasto)
    if (this.btnMovTypeIncome) {
      this.btnMovTypeIncome.addEventListener('click', () => this.setMovMode('income'));
    }
    if (this.btnMovTypeExpense) {
      this.btnMovTypeExpense.addEventListener('click', () => this.setMovMode('expense'));
    }

    // 2. Conmutadores de Moneda (USD vs Bs)
    if (this.btnIncomeCurrUsd) {
      this.btnIncomeCurrUsd.addEventListener('click', () => this.setIncomeCurrency('USD'));
    }
    if (this.btnIncomeCurrVes) {
      this.btnIncomeCurrVes.addEventListener('click', () => this.setIncomeCurrency('VES'));
    }
    if (this.btnExpenseCurrUsd) {
      this.btnExpenseCurrUsd.addEventListener('click', () => this.setExpenseCurrency('USD'));
    }
    if (this.btnExpenseCurrVes) {
      this.btnExpenseCurrVes.addEventListener('click', () => this.setExpenseCurrency('VES'));
    }

    // 3. Cálculos en vivo en inputs
    if (this.movIncomeAmount) {
      this.movIncomeAmount.addEventListener('input', () => this.updateIncomeLiveCalculations());
    }
    if (this.movIncomeRate) {
      this.movIncomeRate.addEventListener('input', () => this.updateIncomeLiveCalculations());
    }
    if (this.movExpenseAmount) {
      this.movExpenseAmount.addEventListener('input', () => this.updateExpenseLiveCalculations());
    }
    if (this.movExpenseRate) {
      this.movExpenseRate.addEventListener('input', () => this.updateExpenseLiveCalculations());
    }
    if (this.movExpenseFund) {
      this.movExpenseFund.addEventListener('change', () => this.updateExpenseLiveCalculations());
    }

    // 4. Envío de Formulario: Nuevo Ingreso Externo
    if (this.formNewIncome) {
      this.formNewIncome.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.handleSaveIncome();
      });
    }

    // 5. Envío de Formulario: Nuevo Gasto / Salida
    if (this.formNewExpense) {
      this.formNewExpense.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.handleSaveExpense();
      });
    }

    // 6. Barra de Filtros de Historial
    if (this.movFiltersBar) {
      this.movFiltersBar.addEventListener('click', (e) => {
        const btn = e.target.closest('.mov-filter-pill');
        if (!btn) return;
        this.movFiltersBar.querySelectorAll('.mov-filter-pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.activeMovFilter = btn.dataset.filter;
        this.renderUnifiedMovements(storageService.getTransactions());
      });
    }

    // 7. Delegación para Revertir Transacción
    if (this.movUnifiedHistoryList) {
      this.movUnifiedHistoryList.addEventListener('click', async (e) => {
        const btn = e.target.closest('.btn-revert-tx');
        if (!btn) return;
        const txId = btn.dataset.txId;
        await this.handleRevertMovement(txId);
      });
    }
  }

  setMovMode(mode) {
    this.activeMovMode = mode;
    if (mode === 'income') {
      this.btnMovTypeIncome.classList.add('active-income');
      this.btnMovTypeExpense.classList.remove('active-expense');
      this.movFormIncomeCard.classList.remove('hidden');
      this.movFormExpenseCard.classList.add('hidden');
    } else {
      this.btnMovTypeIncome.classList.remove('active-income');
      this.btnMovTypeExpense.classList.add('active-expense');
      this.movFormIncomeCard.classList.add('hidden');
      this.movFormExpenseCard.classList.remove('hidden');
    }
  }

  setIncomeCurrency(curr) {
    this.incomeCurrency = curr;
    if (curr === 'USD') {
      this.btnIncomeCurrUsd.classList.add('active');
      this.btnIncomeCurrVes.classList.remove('active');
      this.movIncomeCurrAddon.textContent = 'USD';
    } else {
      this.btnIncomeCurrVes.classList.add('active');
      this.btnIncomeCurrUsd.classList.remove('active');
      this.movIncomeCurrAddon.textContent = 'Bs';
    }
    this.updateIncomeLiveCalculations();
  }

  setExpenseCurrency(curr) {
    this.expenseCurrency = curr;
    if (curr === 'USD') {
      this.btnExpenseCurrUsd.classList.add('active');
      this.btnExpenseCurrVes.classList.remove('active');
      this.movExpenseCurrAddon.textContent = 'USD';
    } else {
      this.btnExpenseCurrVes.classList.add('active');
      this.btnExpenseCurrUsd.classList.remove('active');
      this.movExpenseCurrAddon.textContent = 'Bs';
    }
    this.updateExpenseLiveCalculations();
  }

  updateIncomeLiveCalculations() {
    if (!this.movIncomeAmount || !this.movIncomeEquivPreview) return;
    const amount = parseFloat(this.movIncomeAmount.value) || 0;
    const rate = parseFloat(this.movIncomeRate ? this.movIncomeRate.value : 0) || criptoYaService.getRate();

    if (this.incomeCurrency === 'USD') {
      const equivVes = amount * rate;
      this.movIncomeEquivPreview.textContent = `≈ ${this.formatMoney(equivVes, 'VES')} Bs`;
    } else {
      const equivUsd = rate > 0 ? (amount / rate) : 0;
      this.movIncomeEquivPreview.textContent = `≈ $ ${this.formatMoney(equivUsd, 'USD')} USDT`;
    }
  }

  updateExpenseLiveCalculations() {
    if (!this.movExpenseAmount || !this.movExpenseEquivPreview) return;
    const amount = parseFloat(this.movExpenseAmount.value) || 0;
    const rate = parseFloat(this.movExpenseRate ? this.movExpenseRate.value : 0) || criptoYaService.getRate();

    if (this.expenseCurrency === 'USD') {
      const equivVes = amount * rate;
      this.movExpenseEquivPreview.textContent = `≈ ${this.formatMoney(equivVes, 'VES')} Bs`;
    } else {
      const equivUsd = rate > 0 ? (amount / rate) : 0;
      this.movExpenseEquivPreview.textContent = `≈ $ ${this.formatMoney(equivUsd, 'USD')} USDT`;
    }

    // Actualizar pista explicativa del sobre seleccionado
    if (this.movExpenseFund && this.movExpenseFundHint) {
      const fundVal = this.movExpenseFund.value;
      const hints = {
        'fondo_reposicion': '📦 Se descontará del Capital de Trabajo de la papelería (Reposición e Insumos).',
        'fondo_alquiler_local': '🏠 Se descontará del sobre reservado para el Alquiler del Local ($50).',
        'fondo_maquinas_emergencia': '🛠️ Se descontará del fondo técnico de Máquinas, Plotter y Emergencias.',
        'fondo_comida_hogar': '🛒 Se descontará del presupuesto familiar y de tu saldo Libre Personal ($124.20/mes ref.).',
        'fondo_alquiler_vivienda': '🏡 Se descontará de Vivienda y Servicios Fijos ($116: casa, internet, pastillas, teléfono).',
        'fondo_entretenimiento': '🎉 Se descontará del fondo de recreación y ocio personal ($28.65/mes ref.).',
        'libre_personal': '👤 Gasto personal extra. No altera ningún sobre de la papelería; solo descuenta de la cuenta real.'
      };
      this.movExpenseFundHint.textContent = hints[fundVal] || '';
    }
  }

  renderMovWalletSelectors() {
    const wallets = storageService.getWallets();
    if (this.movIncomeWallet) {
      const currentVal = this.movIncomeWallet.value || 'binance_usdt';
      this.movIncomeWallet.innerHTML = wallets.map(w => `
        <option value="${w.id}">
          ${w.name} (${this.formatMoney(w.balance, w.currency)} ${w.currency})
        </option>
      `).join('');
      if (wallets.some(w => w.id === currentVal)) this.movIncomeWallet.value = currentVal;
    }

    if (this.movExpenseWallet) {
      const currentVal = this.movExpenseWallet.value || 'banco_ves';
      this.movExpenseWallet.innerHTML = wallets.map(w => `
        <option value="${w.id}">
          ${w.name} (${this.formatMoney(w.balance, w.currency)} ${w.currency})
        </option>
      `).join('');
      if (wallets.some(w => w.id === currentVal)) this.movExpenseWallet.value = currentVal;
    }
  }

  async handleSaveIncome() {
    const concept = this.movIncomeConcept.value.trim();
    const category = this.movIncomeCategory.value;
    const amount = parseFloat(this.movIncomeAmount.value);
    const currency = this.incomeCurrency;
    const walletId = this.movIncomeWallet.value;
    const rate = parseFloat(this.movIncomeRate.value) || criptoYaService.getRate();

    if (!concept) {
      this.showToast('Por favor escribe el concepto del ingreso.', 'warning');
      return;
    }
    if (isNaN(amount) || amount <= 0) {
      this.showToast('Introduce un monto válido mayor a cero.', 'warning');
      return;
    }

    try {
      const res = await storageService.addExternalIncome({
        concept,
        category,
        amount,
        currency,
        walletId,
        rate
      });

      this.formNewIncome.reset();
      this.incomeCurrency = 'USD';
      this.setIncomeCurrency('USD');
      this.movIncomeRate.value = criptoYaService.getRate().toFixed(2);
      this.updateIncomeLiveCalculations();

      this.showToast(
        `➕ Ingreso guardado: $${res.tx.amountUsd.toFixed(2)} USD acreditados en ${res.wallet.name}`,
        'success'
      );
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  }

  async handleSaveExpense() {
    const concept = this.movExpenseConcept.value.trim();
    const amount = parseFloat(this.movExpenseAmount.value);
    const currency = this.expenseCurrency;
    const walletId = this.movExpenseWallet.value;
    const fundId = this.movExpenseFund.value;
    const rate = parseFloat(this.movExpenseRate.value) || criptoYaService.getRate();

    if (!concept) {
      this.showToast('Por favor escribe el concepto del gasto.', 'warning');
      return;
    }
    if (isNaN(amount) || amount <= 0) {
      this.showToast('Introduce un monto válido mayor a cero.', 'warning');
      return;
    }

    try {
      const res = await storageService.addExpense({
        concept,
        amount,
        currency,
        walletId,
        fundId,
        rate
      });

      this.formNewExpense.reset();
      this.expenseCurrency = 'USD';
      this.setExpenseCurrency('USD');
      this.movExpenseRate.value = criptoYaService.getRate().toFixed(2);
      this.updateExpenseLiveCalculations();

      const fundText = res.fund ? ` [${res.fund.shortName || res.fund.name}]` : ' [Libre Personal]';
      this.showToast(
        `➖ Gasto guardado: -$${res.tx.amountUsd.toFixed(2)} USD de ${res.wallet.name}${fundText}`,
        'success'
      );
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  }

  async handleRevertMovement(txId) {
    if (!confirm('¿Deseas revertir este movimiento?\n\nSe restaurarán los saldos tanto en la cuenta real como en el sobre virtual afectado.')) {
      return;
    }

    try {
      await storageService.revertTransaction(txId);
      this.showToast('Movimiento revertido y saldos restaurados con éxito.', 'success');
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  }

  renderUnifiedMovements(transactions) {
    if (!this.movUnifiedHistoryList) return;

    if (!transactions || transactions.length === 0) {
      this.movUnifiedHistoryList.innerHTML = `
        <div class="history-empty-card">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin: 0 auto; color: var(--color-text-muted);"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
          <p>No hay movimientos registrados en el sistema.</p>
          <span style="font-size: 0.72rem; color: var(--color-text-dim);">Registra tu primer ingreso o gasto con el formulario superior.</span>
        </div>
      `;
      if (this.movTotalCountBadge) this.movTotalCountBadge.textContent = '0 registros';
      return;
    }

    // Filtrar según píldora activa
    const filtered = transactions.filter(t => {
      if (this.activeMovFilter === 'all') return true;
      if (this.activeMovFilter === 'ingreso') return t.type === 'ingreso_externo';
      if (this.activeMovFilter === 'gasto_papeleria') {
        const businessFundIds = ['fondo_reposicion', 'fondo_alquiler_local', 'fondo_maquinas_emergencia'];
        return t.scope === 'gasto_papeleria' || businessFundIds.includes(t.fundId) || businessFundIds.includes(t.destId);
      }
      if (this.activeMovFilter === 'gasto_personal') {
        const personalFundIds = ['fondo_alquiler_vivienda', 'fondo_comida_hogar', 'fondo_entretenimiento', 'libre_personal'];
        return t.scope === 'gasto_personal' || personalFundIds.includes(t.fundId) || personalFundIds.includes(t.destId) || t.type === 'gasto_egreso';
      }
      if (this.activeMovFilter === 'p2p') {
        return t.type === 'transferencia_p2p' || t.type === 'conversion_interna';
      }
      return true;
    });

    if (this.movTotalCountBadge) {
      this.movTotalCountBadge.textContent = `${filtered.length} registro${filtered.length === 1 ? '' : 's'}`;
    }

    if (filtered.length === 0) {
      this.movUnifiedHistoryList.innerHTML = `
        <div class="history-empty-card">
          <p>No se encontraron movimientos con este filtro.</p>
        </div>
      `;
      return;
    }

    this.movUnifiedHistoryList.innerHTML = filtered.map(t => {
      const dateObj = new Date(t.timestamp || t.date || Date.now());
      const dateStr = dateObj.toLocaleDateString('es-VE', { day: '2-digit', month: 'short' });
      const timeStr = dateObj.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', hour12: true });

      let badgeClass = 'badge-p2p';
      let badgeText = 'Transferencia';
      let amountPrimaryClass = 'p2p';
      let primaryAmountText = '';
      let secondaryAmountText = '';
      let walletTag = t.walletName || t.originName || 'Cuenta';
      let fundTag = t.fundName || t.destName || '';

      if (t.type === 'ingreso_externo') {
        badgeClass = 'badge-income';
        badgeText = `➕ ${t.category || 'Ingreso'}`;
        amountPrimaryClass = 'inflow';
        primaryAmountText = `+$ ${this.formatMoney(t.amountUsd, 'USD', true)} USD`;
        secondaryAmountText = `≈ ${this.formatMoney(t.amountVes, 'VES', true)} Bs`;
        fundTag = '👤 Libre Personal';
      } else if (t.type === 'gasto_egreso' || t.type === 'gasto_fondo') {
        const isBiz = t.scope === 'gasto_papeleria' || ['fondo_reposicion', 'fondo_alquiler_local', 'fondo_maquinas_emergencia'].includes(t.fundId);
        badgeClass = isBiz ? 'badge-expense-business' : 'badge-expense-personal';
        badgeText = isBiz ? '🏢 Papelería' : '👤 Personal';
        amountPrimaryClass = 'outflow';
        const usdVal = t.amountUsd || t.destAmount || 0;
        const vesVal = t.amountVes || (t.realRate ? usdVal * t.realRate : 0);
        primaryAmountText = `-$ ${this.formatMoney(usdVal, 'USD', true)} USD`;
        secondaryAmountText = vesVal > 0 ? `≈ ${this.formatMoney(vesVal, 'VES', true)} Bs` : '';
      } else if (t.type === 'transferencia_p2p') {
        badgeClass = 'badge-p2p';
        badgeText = '🔄 Cambio P2P';
        primaryAmountText = `${t.originAmount} ${t.originCurrency} → ${t.destAmount} ${t.destCurrency}`;
        secondaryAmountText = t.realRate ? `Tasa: ${t.realRate.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs` : '';
      } else if (t.type === 'conversion_interna') {
        badgeClass = 'badge-p2p';
        badgeText = '⚡ Conversión 1:1';
        primaryAmountText = `$ ${t.destAmount} USDC`;
        secondaryAmountText = 'USDT → USDC Earn';
      }

      return `
        <div class="mov-item-card" data-tx-id="${t.id}">
          <div class="mov-item-top">
            <div class="mov-item-badge-wrap">
              <span class="mov-type-badge ${badgeClass} font-mono">${badgeText}</span>
              <span class="mov-item-date font-mono">${dateStr} · ${timeStr}</span>
            </div>
            <button type="button" class="btn-revert-tx font-mono" data-tx-id="${t.id}" title="Revertir este movimiento">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
              <span>Revertir</span>
            </button>
          </div>

          <div class="mov-item-main">
            <div>
              <div class="mov-item-concept">${t.concept || t.notes || t.description || 'Movimiento'}</div>
            </div>
            <div class="mov-item-amounts">
              <div class="mov-item-amount-primary ${amountPrimaryClass} font-mono">${primaryAmountText}</div>
              <div class="mov-item-amount-secondary font-mono">${secondaryAmountText}</div>
            </div>
          </div>

          <div class="mov-item-footer">
            <div class="mov-item-tags font-mono">
              <span class="mov-tag-pill">🏦 ${walletTag}</span>
              ${fundTag ? `<span class="mov-tag-pill">📂 ${fundTag}</span>` : ''}
              ${t.realRate ? `<span class="mov-tag-pill">Tasa: ${this.formatMoney(t.realRate, 'VES')} Bs</span>` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  // =========================================================================
  // FASE 4: ESTADO DE RESULTADOS (P&L DUAL), KPIS & RESPALDO
  // =========================================================================
  setupSettingsEventListeners() {
    if (this.btnOpenSettings) {
      this.btnOpenSettings.addEventListener('click', () => {
        this.openModal(this.modalSettings);
      });
    }

    if (this.btnExportBackup) {
      this.btnExportBackup.addEventListener('click', () => {
        this.handleExportBackup();
      });
    }

    if (this.btnTriggerImportBackup) {
      this.btnTriggerImportBackup.addEventListener('click', () => {
        if (this.inputImportBackup) this.inputImportBackup.click();
      });
    }

    if (this.inputImportBackup) {
      this.inputImportBackup.addEventListener('change', async (e) => {
        await this.handleImportBackup(e);
      });
    }
  }

  setupPnlEventListeners() {
    if (this.btnPnlPeriodWeek) {
      this.btnPnlPeriodWeek.addEventListener('click', () => {
        this.setPnlPeriodType('week');
      });
    }

    if (this.btnPnlPeriodMonth) {
      this.btnPnlPeriodMonth.addEventListener('click', () => {
        this.setPnlPeriodType('month');
      });
    }

    if (this.btnPnlNavPrev) {
      this.btnPnlNavPrev.addEventListener('click', () => {
        this.navigatePnlPeriod(-1);
      });
    }

    if (this.btnPnlNavNext) {
      this.btnPnlNavNext.addEventListener('click', () => {
        this.navigatePnlPeriod(1);
      });
    }
  }

  setPnlPeriodType(type) {
    this.pnlPeriodType = type;
    if (type === 'week') {
      this.btnPnlPeriodWeek.classList.add('active');
      this.btnPnlPeriodMonth.classList.remove('active');
    } else {
      this.btnPnlPeriodWeek.classList.remove('active');
      this.btnPnlPeriodMonth.classList.add('active');
    }
    this.renderPnlDashboard();
  }

  navigatePnlPeriod(direction) {
    if (this.pnlPeriodType === 'week') {
      this.pnlCurrentAnchorDate.setDate(this.pnlCurrentAnchorDate.getDate() + (direction * 7));
    } else {
      this.pnlCurrentAnchorDate.setMonth(this.pnlCurrentAnchorDate.getMonth() + direction);
    }
    this.renderPnlDashboard();
  }

  handleExportBackup() {
    try {
      const jsonStr = storageService.exportDataJson();
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const nowStr = new Date().toISOString().split('T')[0];
      a.href = url;
      a.download = `AleFinanzas_Backup_${nowStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      this.showToast('📥 Respaldo exportado exitosamente', 'success');
    } catch (err) {
      this.showToast('Error al exportar: ' + err.message, 'error');
    }
  }

  async handleImportBackup(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    if (!confirm('⚠️ ¿Estás seguro de que deseas restaurar este respaldo?\n\nSe reemplazarán todas tus billeteras, fondos, cierres diarios e historial actual con los datos del archivo.')) {
      e.target.value = '';
      return;
    }

    try {
      const text = await file.text();
      storageService.importDataJson(text);
      this.closeAllModals();
      this.showToast('📤 Respaldo restaurado con éxito al 100%', 'success');
    } catch (err) {
      this.showToast('Error al restaurar: ' + err.message, 'error');
    } finally {
      e.target.value = '';
    }
  }

  renderPnlDashboard() {
    if (!this.pnlNavPeriodLabel) return;

    const closures = storageService.getDailyClosures();
    const transactions = storageService.getTransactions();
    const funds = storageService.getFunds();

    let startDate, endDate, labelText;

    if (this.pnlPeriodType === 'week') {
      // Semana completa de Lunes a Domingo (7 días)
      const d = new Date(this.pnlCurrentAnchorDate);
      const day = d.getDay(); // 0 is Sunday, 1 Monday, ...
      const diffToMonday = (day === 0 ? -6 : 1) - day;
      const monday = new Date(d);
      monday.setDate(d.getDate() + diffToMonday);
      monday.setHours(0, 0, 0, 0);

      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      sunday.setHours(23, 59, 59, 999);

      startDate = monday;
      endDate = sunday;

      const mStartStr = monday.toLocaleDateString('es-VE', { day: '2-digit', month: 'short' });
      const mEndStr = sunday.toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' });
      labelText = `${mStartStr} - ${mEndStr}`;
    } else {
      // Mes calendario completo (1 al último día)
      const y = this.pnlCurrentAnchorDate.getFullYear();
      const m = this.pnlCurrentAnchorDate.getMonth();
      startDate = new Date(y, m, 1, 0, 0, 0);
      endDate = new Date(y, m + 1, 0, 23, 59, 59, 999);

      const monthName = startDate.toLocaleDateString('es-VE', { month: 'long', year: 'numeric' });
      labelText = monthName.charAt(0).toUpperCase() + monthName.slice(1);
    }

    this.pnlNavPeriodLabel.textContent = labelText;

    // Filtrar cierres dentro del período
    const startIso = startDate.toISOString().split('T')[0];
    const endIso = endDate.toISOString().split('T')[0];

    const periodClosures = closures.filter(c => {
      const cDate = c.date;
      return cDate >= startIso && cDate <= endIso;
    });

    // Filtrar transacciones dentro del período EXCLUYENDO estrictamente p2p y conversiones internas
    const periodTxs = transactions.filter(t => {
      if (t.type === 'transferencia_p2p' || t.type === 'conversion_interna') return false;
      const tIso = (t.date || t.timestamp || '').split('T')[0];
      return tIso >= startIso && tIso <= endIso;
    });

    // =======================================================================
    // NIVEL 1: RENDIMIENTO OPERATIVO PAPELERÍA (A&R PRINTS)
    // =======================================================================
    const grossSalesUsd = periodClosures.reduce((sum, c) => sum + (c.salesGrossUsdt || 0), 0);
    const grossSalesVes = periodClosures.reduce((sum, c) => sum + (c.salesGrossVes || 0), 0);

    const cogsUsd = periodClosures.reduce((sum, c) => sum + (c.directCostUsdt || 0), 0);
    const cogsVes = periodClosures.reduce((sum, c) => sum + (c.directCostVes || 0), 0);

    const grossMarginUsd = Math.max(0, grossSalesUsd - cogsUsd);
    const grossMarginVes = Math.max(0, grossSalesVes - cogsVes);
    const grossMarginPct = grossSalesUsd > 0 ? (grossMarginUsd / grossSalesUsd) * 100 : 0;

    if (this.pnlN1GrossSalesUsd) this.pnlN1GrossSalesUsd.textContent = `$ ${this.formatMoney(grossSalesUsd, 'USD', true)}`;
    if (this.pnlN1GrossSalesVes) this.pnlN1GrossSalesVes.textContent = `≈ ${this.formatMoney(grossSalesVes, 'VES', true)} Bs`;
    if (this.pnlN1CogsUsd) this.pnlN1CogsUsd.textContent = `-$ ${this.formatMoney(cogsUsd, 'USD', true)}`;
    if (this.pnlN1CogsVes) this.pnlN1CogsVes.textContent = `≈ ${this.formatMoney(cogsVes, 'VES', true)} Bs`;
    if (this.pnlN1GrossMarginUsd) this.pnlN1GrossMarginUsd.textContent = `$ ${this.formatMoney(grossMarginUsd, 'USD', true)}`;
    if (this.pnlN1GrossMarginVes) this.pnlN1GrossMarginVes.textContent = `≈ ${this.formatMoney(grossMarginVes, 'VES', true)} Bs`;
    if (this.pnlN1MarginPct) this.pnlN1MarginPct.textContent = `${grossMarginPct.toFixed(1)}%`;

    // =======================================================================
    // NIVEL 2: UTILIDAD NETA DEL NEGOCIO
    // =======================================================================
    // Cuota de reservas fijas (Local 8% + Máquinas 10% = 18% de las ventas brutas)
    const fixedReservesUsd = grossSalesUsd * 0.18;
    const fixedReservesVes = grossSalesVes * 0.18;

    // Utilidad Neta Libre de la Papelería = 42% de Ventas Brutas (Vivienda/Servicios 18% + Comida 19.5% + Ocio 4.5%)
    const netPaperUsd = grossSalesUsd * 0.42;
    const netPaperVes = grossSalesVes * 0.42;
    const netPaperPct = grossSalesUsd > 0 ? 42.0 : 0.0;

    if (this.pnlN2FixedReservesUsd) this.pnlN2FixedReservesUsd.textContent = `-$ ${this.formatMoney(fixedReservesUsd, 'USD', true)}`;
    if (this.pnlN2FixedReservesVes) this.pnlN2FixedReservesVes.textContent = `≈ ${this.formatMoney(fixedReservesVes, 'VES', true)} Bs`;
    if (this.pnlN2NetUsd) this.pnlN2NetUsd.textContent = `$ ${this.formatMoney(netPaperUsd, 'USD', true)}`;
    if (this.pnlN2NetVes) this.pnlN2NetVes.textContent = `≈ ${this.formatMoney(netPaperVes, 'VES', true)} Bs`;
    if (this.pnlN2NetPct) this.pnlN2NetPct.textContent = `${netPaperPct.toFixed(1)}%`;

    // =======================================================================
    // NIVEL 3: FLUJO CONSOLIDADO INTEGRAL (PAPELERÍA + OTROS INGRESOS - GASTOS)
    // =======================================================================
    if (this.pnlN3PaperProfitUsd) this.pnlN3PaperProfitUsd.textContent = `+$ ${this.formatMoney(netPaperUsd, 'USD', true)}`;
    if (this.pnlN3PaperProfitVes) this.pnlN3PaperProfitVes.textContent = `≈ ${this.formatMoney(netPaperVes, 'VES', true)} Bs`;

    // Otros Ingresos Externos (Movimientos)
    const otherIncomes = periodTxs.filter(t => t.type === 'ingreso_externo');
    const totalOtherIncomeUsd = otherIncomes.reduce((sum, t) => sum + (t.amountUsd || 0), 0);
    const totalOtherIncomeVes = otherIncomes.reduce((sum, t) => sum + (t.amountVes || 0), 0);

    if (this.pnlN3OtherIncomeUsd) this.pnlN3OtherIncomeUsd.textContent = `+$ ${this.formatMoney(totalOtherIncomeUsd, 'USD', true)}`;
    if (this.pnlN3OtherIncomeVes) this.pnlN3OtherIncomeVes.textContent = `≈ ${this.formatMoney(totalOtherIncomeVes, 'VES', true)} Bs`;

    // Desglose por categorías de otros ingresos
    if (this.pnlN3OtherIncomeBreakdown) {
      if (otherIncomes.length === 0) {
        this.pnlN3OtherIncomeBreakdown.innerHTML = `<span style="color:var(--color-text-dim);">Sin ingresos externos registrados en este período.</span>`;
      } else {
        const catMap = {};
        otherIncomes.forEach(t => {
          const cat = t.category || 'Otros Ingresos';
          catMap[cat] = (catMap[cat] || 0) + (t.amountUsd || 0);
        });
        this.pnlN3OtherIncomeBreakdown.innerHTML = Object.entries(catMap).map(([cat, val]) => `
          <div class="pnl-sub-breakdown-row">
            <span>• ${cat}</span>
            <span class="text-emerald">+$ ${val.toFixed(2)} USD</span>
          </div>
        `).join('');
      }
    }

    // Gastos Personales Ejecutados
    const personalExpenses = periodTxs.filter(t => {
      const isPersonal = t.scope === 'gasto_personal' ||
        ['fondo_alquiler_vivienda', 'fondo_comida_hogar', 'fondo_entretenimiento', 'libre_personal'].includes(t.fundId);
      return (t.type === 'gasto_egreso' || t.type === 'gasto_fondo') && isPersonal;
    });

    const totalPersonalExpUsd = personalExpenses.reduce((sum, t) => sum + (t.amountUsd || t.destAmount || 0), 0);
    const totalPersonalExpVes = personalExpenses.reduce((sum, t) => sum + (t.amountVes || 0), 0);

    if (this.pnlN3PersonalExpensesUsd) this.pnlN3PersonalExpensesUsd.textContent = `-$ ${this.formatMoney(totalPersonalExpUsd, 'USD', true)}`;
    if (this.pnlN3PersonalExpensesVes) this.pnlN3PersonalExpensesVes.textContent = `≈ ${this.formatMoney(totalPersonalExpVes, 'VES', true)} Bs`;

    if (this.pnlN3PersonalExpenseBreakdown) {
      if (personalExpenses.length === 0) {
        this.pnlN3PersonalExpenseBreakdown.innerHTML = `<span style="color:var(--color-text-dim);">Sin gastos personales ejecutados en este período.</span>`;
      } else {
        const expMap = {};
        personalExpenses.forEach(t => {
          const cat = t.fundName || 'Gasto Libre';
          expMap[cat] = (expMap[cat] || 0) + (t.amountUsd || t.destAmount || 0);
        });
        this.pnlN3PersonalExpenseBreakdown.innerHTML = Object.entries(expMap).map(([cat, val]) => `
          <div class="pnl-sub-breakdown-row">
            <span>• ${cat}</span>
            <span class="text-coral">-$ ${val.toFixed(2)} USD</span>
          </div>
        `).join('');
      }
    }

    // (=) FLUJO DE CAJA NETO / AHORRO REAL
    const netCashFlowUsd = (netPaperUsd + totalOtherIncomeUsd) - totalPersonalExpUsd;
    const netCashFlowVes = (netPaperVes + totalOtherIncomeVes) - totalPersonalExpVes;
    const isSurplus = netCashFlowUsd >= 0;

    if (this.pnlCashflowTotalCard) {
      this.pnlCashflowTotalCard.className = `pnl-cashflow-total-card ${isSurplus ? 'surplus' : 'deficit'}`;
    }
    if (this.pnlCashflowStatusPill) {
      this.pnlCashflowStatusPill.textContent = isSurplus ? 'SUPERÁVIT NETO' : 'DÉFICIT DEL PERÍODO';
    }
    if (this.pnlCashflowTotalUsd) {
      this.pnlCashflowTotalUsd.textContent = `${isSurplus ? '+' : ''}$ ${this.formatMoney(netCashFlowUsd, 'USD', true)} USD`;
    }
    if (this.pnlCashflowTotalVes) {
      this.pnlCashflowTotalVes.textContent = `≈ ${this.formatMoney(netCashFlowVes, 'VES', true)} Bs`;
    }
    if (this.pnlCashflowDesc) {
      this.pnlCashflowDesc.textContent = isSurplus
        ? `Ahorro neto consolidado generado en el período tras cubrir todos tus gastos personales.`
        : `Tus gastos personales superaron la utilidad combinada de la papelería y otros ingresos.`;
    }

    // =======================================================================
    // KPIS & RASTREADOR DE METAS
    // =======================================================================
    // KPI 1: Meta Operativa ($24.50/día hábil)
    // Semanal: $147 meta (6 días Lun-Sáb) / Mensual: $637 meta (26 días hábiles)
    const salesGoal = this.pnlPeriodType === 'week' ? WEEKLY_SALES_GOAL_USDT : MONTHLY_SALES_GOAL_USDT;
    const workedDays = periodClosures.length;
    const salesGoalPct = Math.min(100, Math.round((grossSalesUsd / salesGoal) * 100));
    const avgPerWorkedDay = workedDays > 0 ? (grossSalesUsd / workedDays) : 0;

    if (this.kpiSalesGoalStatus) this.kpiSalesGoalStatus.textContent = `$${grossSalesUsd.toFixed(2)} / $${salesGoal.toFixed(0)}`;
    if (this.kpiSalesGoalFill) this.kpiSalesGoalFill.style.width = `${salesGoalPct}%`;
    if (this.kpiSalesGoalPct) this.kpiSalesGoalPct.textContent = `${salesGoalPct}% de la meta`;
    if (this.kpiSalesWorkedDays) this.kpiSalesWorkedDays.textContent = `${workedDays} día(s) con cierre`;
    if (this.kpiSalesAvgNote) {
      this.kpiSalesAvgNote.textContent = `Promedio: $${avgPerWorkedDay.toFixed(2)}/día trabajado (domingos no bajan promedio).`;
    }

    // KPI 2: Cobertura de Alquileres y Servicios Fijos ($166.00/mes)
    const fLocal = funds.find(f => f.id === 'fondo_alquiler_local');
    const fVivienda = funds.find(f => f.id === 'fondo_alquiler_vivienda');
    const balLocal = fLocal ? fLocal.balanceUsdt || 0 : 0;
    const balVivienda = fVivienda ? fVivienda.balanceUsdt || 0 : 0;
    const rentTotalSecured = Math.min(166.00, balLocal + balVivienda);
    const rentPct = Math.min(100, Math.round((rentTotalSecured / 166.00) * 100));
    const rentRemaining = Math.max(0, 166.00 - (balLocal + balVivienda));

    if (this.kpiRentCoverageStatus) this.kpiRentCoverageStatus.textContent = `$${rentTotalSecured.toFixed(2)} / $166`;
    if (this.kpiRentCoverageFill) this.kpiRentCoverageFill.style.width = `${rentPct}%`;
    if (this.kpiRentCoveragePct) this.kpiRentCoveragePct.textContent = `${rentPct}% asegurado`;
    if (this.kpiRentRemaining) {
      this.kpiRentRemaining.textContent = rentRemaining > 0 ? `Faltan $${rentRemaining.toFixed(2)}` : '¡100% Cubierto!';
    }

    // KPI 3: Peso de Ingresos (Papelería vs Otros Negocios)
    const combinedIncome = netPaperUsd + totalOtherIncomeUsd;
    let paperRatioPct = 50;
    let otherRatioPct = 50;
    if (combinedIncome > 0) {
      paperRatioPct = Math.round((netPaperUsd / combinedIncome) * 100);
      otherRatioPct = 100 - paperRatioPct;
    }

    if (this.kpiIncomeRatioStatus) this.kpiIncomeRatioStatus.textContent = `${paperRatioPct}% / ${otherRatioPct}%`;
    if (this.kpiRatioPaperFill) this.kpiRatioPaperFill.style.width = `${paperRatioPct}%`;
    if (this.kpiRatioOtherFill) this.kpiRatioOtherFill.style.width = `${otherRatioPct}%`;
    if (this.kpiRatioPaperPct) this.kpiRatioPaperPct.textContent = `${paperRatioPct}%`;
    if (this.kpiRatioOtherPct) this.kpiRatioOtherPct.textContent = `${otherRatioPct}%`;

    // =======================================================================
    // GRÁFICA VISUAL MINIMALISTA (COMPARATIVA PILARES)
    // =======================================================================
    const totalExpenses = cogsUsd + fixedReservesUsd + totalPersonalExpUsd;
    const maxVal = Math.max(grossSalesUsd, totalOtherIncomeUsd, totalExpenses, 1);

    const heightSales = Math.max(8, Math.round((grossSalesUsd / maxVal) * 100));
    const heightOther = Math.max(8, Math.round((totalOtherIncomeUsd / maxVal) * 100));
    const heightExpenses = Math.max(8, Math.round((totalExpenses / maxVal) * 100));

    if (this.chartBarSales) this.chartBarSales.style.height = `${grossSalesUsd > 0 ? heightSales : 4}%`;
    if (this.chartBarOther) this.chartBarOther.style.height = `${totalOtherIncomeUsd > 0 ? heightOther : 4}%`;
    if (this.chartBarExpenses) this.chartBarExpenses.style.height = `${totalExpenses > 0 ? heightExpenses : 4}%`;

    if (this.chartValSales) this.chartValSales.textContent = `$${grossSalesUsd.toFixed(1)}`;
    if (this.chartValOther) this.chartValOther.textContent = `$${totalOtherIncomeUsd.toFixed(1)}`;
    if (this.chartValExpenses) this.chartValExpenses.textContent = `$${totalExpenses.toFixed(1)}`;
  }

  setupNavigation() {
    this.navButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTab = btn.dataset.tab;
        this.switchTab(targetTab);
      });
    });
  }

  switchTab(tabName) {
    this.currentTab = tabName;
    this.navButtons.forEach(b => {
      if (b.dataset.tab === tabName) {
        b.classList.add('active');
      } else {
        b.classList.remove('active');
      }
    });

    Object.keys(this.tabViews).forEach(key => {
      if (key === tabName) {
        this.tabViews[key].classList.add('active');
      } else {
        this.tabViews[key].classList.remove('active');
      }
    });

    // Al entrar a la pestaña Papelería, asegurar que la tasa esté pre-llenada
    if (tabName === 'papeleria') {
      if (!this.closureRateInput.value || parseFloat(this.closureRateInput.value) <= 0) {
        this.closureRateInput.value = criptoYaService.getRate().toFixed(2);
      }
      this.updateClosureLiveCalculations();
    }
  }

  async refreshRateWithSpin() {
    this.btnRefreshRate.classList.add('rotating');
    try {
      await criptoYaService.fetchRate();
      this.showToast('Tasa CriptoYA actualizada con éxito', 'success');
    } catch (err) {
      this.showToast('Error al refrescar tasa', 'error');
    } finally {
      setTimeout(() => {
        this.btnRefreshRate.classList.remove('rotating');
      }, 700);
    }
  }

  renderRateWidget(status) {
    const formatted = status.rate.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    this.rateValueText.textContent = `${formatted} Bs`;

    this.rateDot.className = 'rate-pulse-dot';
    if (status.status === 'live') {
      this.rateDot.classList.add('live');
    } else if (status.status === 'manual' || status.status === 'stale') {
      this.rateDot.classList.add('stale');
    } else if (status.status === 'error') {
      this.rateDot.classList.add('error');
    }
  }

  renderStorageStatus(status) {
    const badge = document.getElementById('storage-status-pill');
    if (!badge) return;
    if (status === 'firestore') {
      badge.textContent = 'Cloud Firestore';
      badge.className = 'badge-phase text-emerald';
    } else {
      badge.textContent = 'Local Vault';
      badge.className = 'badge-phase text-steel';
    }
  }

  toggleBalanceVisibility() {
    this.isBalancesHidden = !this.isBalancesHidden;
    localStorage.setItem('alefinanzas_hide_balances', this.isBalancesHidden.toString());
    this.updateEyeIcon();
    this.recalculateAll();
  }

  updateEyeIcon() {
    if (this.isBalancesHidden) {
      this.eyeIcon.innerHTML = `
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
        <line x1="1" y1="1" x2="23" y2="23"></line>
      `;
    } else {
      this.eyeIcon.innerHTML = `
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
        <circle cx="12" cy="12" r="3"></circle>
      `;
    }
  }

  formatMoney(amount, currency, isMasked = false) {
    if (isMasked && this.isBalancesHidden) {
      return '••••••';
    }
    const val = typeof amount === 'number' ? amount : parseFloat(amount) || 0;
    if (currency === 'VES' || currency === 'Bs') {
      return val.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  recalculateAll() {
    const wallets = storageService.getWallets();
    const rate = criptoYaService.getRate();

    let totalUsdEquiv = 0;
    let usdtPortion = 0;
    let vesPortionInUsd = 0;

    wallets.forEach(w => {
      const bal = w.balance || 0;
      if (w.baseType === 'USD') {
        totalUsdEquiv += bal;
        usdtPortion += bal;
      } else if (w.baseType === 'VES') {
        const inUsd = rate > 0 ? (bal / rate) : 0;
        totalUsdEquiv += inUsd;
        vesPortionInUsd += inUsd;
      }
    });

    const totalVesEquiv = totalUsdEquiv * rate;

    // Render Hero Card
    this.heroTotalUsd.textContent = this.formatMoney(totalUsdEquiv, 'USD', true);
    this.heroTotalVes.textContent = `${this.formatMoney(totalVesEquiv, 'VES', true)} Bs`;

    // Distribution Bar
    if (totalUsdEquiv > 0) {
      const binanceWallet = wallets.find(w => w.id === 'binance_usdt');
      const usdcWallet = wallets.find(w => w.id === 'binance_usdc_earn');
      const bancoWallet = wallets.find(w => w.id === 'banco_ves');
      const usdWallet = wallets.find(w => w.id === 'usd_cash');
      const vesCashWallet = wallets.find(w => w.id === 'ves_cash');

      const pctBinance = binanceWallet ? (binanceWallet.balance / totalUsdEquiv) * 100 : 0;
      const pctUsdc = usdcWallet ? (usdcWallet.balance / totalUsdEquiv) * 100 : 0;
      const pctBanco = bancoWallet ? ((bancoWallet.balance / rate) / totalUsdEquiv) * 100 : 0;
      const pctUsd = usdWallet ? (usdWallet.balance / totalUsdEquiv) * 100 : 0;
      const pctVesCash = vesCashWallet ? ((vesCashWallet.balance / rate) / totalUsdEquiv) * 100 : 0;

      this.heroDistBinance.style.width = `${pctBinance}%`;
      if (this.heroDistUsdc) this.heroDistUsdc.style.width = `${pctUsdc}%`;
      this.heroDistBanco.style.width = `${pctBanco}%`;
      this.heroDistUsd.style.width = `${pctUsd}%`;
      this.heroDistVes.style.width = `${pctVesCash}%`;

      const usdtPctTotal = Math.round((usdtPortion / totalUsdEquiv) * 100);
      const vesPctTotal = 100 - usdtPctTotal;

      this.statUsdtPct.textContent = `${usdtPctTotal}%`;
      this.statVesPct.textContent = `${vesPctTotal}%`;
    }

    // Render total de los 6 fondos en la cabecera de Papelería
    const funds = storageService.getFunds();
    let totalFundsUsdt = 0;
    funds.forEach(f => totalFundsUsdt += (f.balanceUsdt || 0));
    const totalFundsVes = totalFundsUsdt * rate;

    if (this.fundsTotalUsdt) {
      this.fundsTotalUsdt.textContent = `$ ${this.formatMoney(totalFundsUsdt, 'USD', true)}`;
      this.fundsTotalVes.textContent = `≈ ${this.formatMoney(totalFundsVes, 'VES', true)} Bs`;
    }

    // Calcular acumulado en los 3 fondos de ahorro fijo (Local 10% + Casa 12.5% + Máquinas 10%) - Fase 2.5
    const fLocal = funds.find(f => f.id === 'fondo_alquiler_local');
    const fVivienda = funds.find(f => f.id === 'fondo_alquiler_vivienda');
    const fMaquinas = funds.find(f => f.id === 'fondo_maquinas_emergencia');

    const savingsAccumUsdt = (fLocal ? fLocal.balanceUsdt || 0 : 0) +
                             (fVivienda ? fVivienda.balanceUsdt || 0 : 0) +
                             (fMaquinas ? fMaquinas.balanceUsdt || 0 : 0);

    if (this.earnSavingsAccumVal) {
      this.earnSavingsAccumVal.textContent = `$ ${this.formatMoney(savingsAccumUsdt, 'USD')}`;
    }

    // Actualizar tarjetas de billetera individuales y balance del negocio
    this.renderWallets(wallets);
    this.renderBusinessVault();
  }

  // =========================================================================
  // RENDER BILLETERAS & TRANSACCIONES (FASE 1 + FASE 2.5)
  // =========================================================================
  renderWallets(wallets) {
    if (!this.walletsContainer) return;
    const rate = criptoYaService.getRate();

    const getIconSvg = (iconName) => {
      switch (iconName) {
        case 'binance':
          return `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5L8.5 6L12 9.5L15.5 6L12 2.5ZM5.5 9L2 12.5L5.5 16L9 12.5L5.5 9ZM18.5 9L15 12.5L18.5 16L22 12.5L18.5 9ZM12 15.5L8.5 19L12 22.5L15.5 19L12 15.5ZM12 11.5L10 13.5L12 15.5L14 13.5L12 11.5Z"/></svg>`;
        case 'usdc':
          return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v12M15 9.5a2.5 2.5 0 0 0-2.5-2.5H10a2 2 0 0 0 0 4h4a2 2 0 0 1 0 4h-2.5A2.5 2.5 0 0 1 9 12.5"/></svg>`;
        case 'bank':
          return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18M3 10h18M5 10v11M19 10v11M9 10v11M14 10v11M12 2L2 7h20L12 2z"/></svg>`;
        case 'cash-usd':
          return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 12h.01M18 12h.01"/></svg>`;
        case 'cash-ves':
          return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M12 12v.01M7 9h10M7 15h10"/></svg>`;
        default:
          return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/></svg>`;
      }
    };

    this.walletsContainer.innerHTML = wallets.map(w => {
      let equivalentText = '';
      if (w.currency === 'VES') {
        const inUsdt = rate > 0 ? (w.balance / rate) : 0;
        equivalentText = `≈ ${this.formatMoney(inUsdt, 'USD', true)} USDT`;
      } else {
        const inVes = w.balance * rate;
        equivalentText = `≈ ${this.formatMoney(inVes, 'VES', true)} Bs`;
      }

      // Sub-división inteligente dentro de Binance Operativo (USDT) - Ajuste Fase 2.5
      let binanceSubdivisionHtml = '';
      if (w.id === 'binance_usdt') {
        const allFunds = storageService.getFunds();
        const repoFund = allFunds.find(f => f.id === 'fondo_reposicion');
        const repoUsdt = repoFund ? (repoFund.balanceUsdt || 0) : 0;
        const totalUsdt = w.balance || 0;
        const personalUsdt = Math.max(0, parseFloat((totalUsdt - repoUsdt).toFixed(2)));
        const isDeficit = totalUsdt < repoUsdt;
        const deficitAmount = isDeficit ? parseFloat((repoUsdt - totalUsdt).toFixed(2)) : 0;

        const baseTotal = Math.max(totalUsdt, repoUsdt);
        const repoBarWidth = baseTotal > 0 ? Math.min(100, Math.round((repoUsdt / baseTotal) * 100)) : 0;
        const personalBarWidth = baseTotal > 0 ? Math.max(0, 100 - repoBarWidth) : 0;

        binanceSubdivisionHtml = `
          <div class="binance-split-container">
            <div class="binance-split-bars" title="Distribución: ${repoBarWidth}% Papelería / ${personalBarWidth}% Libre">
              <div class="split-bar-repo" style="width: ${repoBarWidth}%;"></div>
              <div class="split-bar-personal" style="width: ${personalBarWidth}%;"></div>
            </div>

            <div class="binance-split-grid">
              <div class="binance-split-item papeleria">
                <div class="split-header-row text-steel">
                  <span>🏢 USDT Papelería</span>
                </div>
                <div class="binance-split-val steel font-mono">$ ${this.formatMoney(repoUsdt, 'USD', true)}</div>
                <div class="binance-split-desc">Fondo 40% Reposición</div>
              </div>

              <div class="binance-split-item personal">
                <div class="split-header-row text-emerald">
                  <span>👤 USDT Libre</span>
                </div>
                <div class="binance-split-val emerald font-mono">$ ${this.formatMoney(personalUsdt, 'USD', true)}</div>
                <div class="binance-split-desc">Uso personal y libre</div>
              </div>
            </div>

            ${isDeficit ? `
              <div class="binance-deficit-alert font-mono">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                <span>⚠️ Atención: El saldo en Binance ($${totalUsdt.toFixed(2)}) es menor que la reserva de la papelería ($${repoUsdt.toFixed(2)}). Hay un déficit de $${deficitAmount.toFixed(2)} USDT.</span>
              </div>
            ` : ''}
          </div>
        `;
      }

      return `
        <div class="wallet-card ${w.themeClass}" data-id="${w.id}">
          <div class="wallet-top-meta">
            <div class="brand-section">
              <div class="wallet-icon-box">
                ${getIconSvg(w.icon)}
              </div>
              <div class="wallet-title-box">
                <span class="wallet-name">${w.name}</span>
                <span class="wallet-badge-currency">${w.subtitle}</span>
              </div>
            </div>
            <button class="btn-arqueo-adjust" data-wallet-id="${w.id}" title="Arqueo / Ajuste Manual">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
              <span>Ajustar</span>
            </button>
          </div>

          <div class="wallet-balance-row">
            <div class="wallet-balance-num">
              ${this.formatMoney(w.balance, w.currency, true)}
              <span class="wallet-currency-tag">${w.currency}</span>
            </div>
          </div>

          <div class="wallet-equivalent-row">
            <span>Valuación:</span>
            <span class="approx-val font-mono">${equivalentText}</span>
          </div>

          ${binanceSubdivisionHtml}
        </div>
      `;
    }).join('');
  }
  renderTransactions(transactions) {
    if (!this.transactionsContainer) return;

    if (!transactions || transactions.length === 0) {
      this.transactionsContainer.innerHTML = `
        <div class="history-empty-card">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin: 0 auto; color: var(--color-text-muted);"><path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/></svg>
          <p>Aún no hay conversiones P2P registradas.</p>
          <span style="font-size: 0.72rem; color: var(--color-text-dim);">Usa el botón "🔄 Cambio P2P / Transferir" para registrar operaciones.</span>
        </div>
      `;
      return;
    }

    this.transactionsContainer.innerHTML = transactions.slice(0, 10).map(tx => {
      const dateObj = new Date(tx.timestamp);
      const formattedDate = dateObj.toLocaleDateString('es-VE', { day: '2-digit', month: 'short' });
      const formattedTime = dateObj.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', hour12: true });

      const rateDisplay = tx.realRate 
        ? `<span class="rate-badge font-mono">Tasa Real: ${tx.realRate.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs</span>`
        : `<span>Transferencia 1:1</span>`;

      let typeLabel = 'Transferencia';
      let typeBadgeStyle = '';
      if (tx.type === 'transferencia_p2p') {
        typeLabel = 'P2P Transfer';
      } else if (tx.type === 'gasto_fondo') {
        typeLabel = 'Gasto de Fondo';
        typeBadgeStyle = 'style="color: var(--color-coral-red); background: rgba(239, 68, 68, 0.1); border-color: rgba(239, 68, 68, 0.25);"';
      } else if (tx.type === 'conversion_interna') {
        typeLabel = 'Conversión 1:1';
        typeBadgeStyle = 'style="color: #06B6D4; background: rgba(6, 182, 212, 0.1); border-color: rgba(6, 182, 212, 0.25);"';
      }

      return `
        <div class="history-item-card">
          <div class="history-item-header">
            <span class="history-type-tag" ${typeBadgeStyle}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
              ${typeLabel}
            </span>
            <span class="history-time font-mono">${formattedDate} · ${formattedTime}</span>
          </div>

          <div class="history-flow-row">
            <div class="history-from-box">
              <span class="history-acc-name">${tx.originName}</span>
              <span class="history-acc-amount outflow font-mono">-${this.formatMoney(tx.originAmount, tx.originCurrency)} ${tx.originCurrency}</span>
            </div>

            <div class="history-swap-arrow">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </div>

            <div class="history-to-box" style="text-align: right;">
              <span class="history-acc-name">${tx.destName}</span>
              <span class="history-acc-amount inflow font-mono">+${this.formatMoney(tx.destAmount, tx.destCurrency)} ${tx.destCurrency}</span>
            </div>
          </div>

          <div class="history-meta-footer">
            ${rateDisplay}
            <span>${tx.notes ? tx.notes : 'Sin notas'}</span>
          </div>
        </div>
      `;
    }).join('');
  }
  // =========================================================================
  // RENDER BÓVEDA DE LOS 6 FONDOS (FASE 2)
  // =========================================================================
  renderFunds(funds) {
    if (!this.fundsGridContainer) return;
    const rate = criptoYaService.getRate();

    this.fundsGridContainer.innerHTML = funds.map(f => {
      const balanceUsdt = f.balanceUsdt || 0;
      const balanceVes = balanceUsdt * rate;

      // Barra de progreso si tiene meta mensual (Alquiler Local $50 / Vivienda $116)
      let progressHtml = '';
      if (f.goalUsdt && f.goalUsdt > 0) {
        const pct = Math.min(100, Math.round((balanceUsdt / f.goalUsdt) * 100));
        progressHtml = `
          <div class="fund-goal-box">
            <div class="fund-goal-label-row">
              <span>Meta: $${f.goalUsdt.toFixed(2)}</span>
              <span class="font-mono ${pct >= 100 ? 'text-emerald' : 'text-amber'}">${pct}%</span>
            </div>
            <div class="fund-progress-track">
              <div class="fund-progress-fill" style="width: ${pct}%; background-color: ${f.color || 'var(--color-steel-blue)'};"></div>
            </div>
          </div>
        `;
      }

      // Desglose visual exclusivo para Vivienda y Servicios Fijos ($116)
      let breakdownHtml = '';
      if (f.id === 'fondo_alquiler_vivienda') {
        breakdownHtml = `
          <div class="fund-commitments-breakdown font-mono" style="margin-top: 8px; font-size: 0.65rem; color: var(--color-text-dim); background: rgba(255,255,255,0.03); border-radius: 6px; padding: 6px 8px; border: 1px solid rgba(255,255,255,0.06);">
            <div style="font-weight: 600; color: #C4B5FD; margin-bottom: 3px; font-family: var(--font-sans);">Gastos Fijos Cubiertos ($116/mes):</div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2px 6px;">
              <span>🏠 Casa: $65</span>
              <span>🌐 Net: $30</span>
              <span>💊 Pastillas: $15</span>
              <span>📱 Tel: $6</span>
            </div>
          </div>
        `;
      }

      return `
        <div class="fund-card" data-fund-id="${f.id}" style="border-left: 3px solid ${f.color || 'var(--color-steel-blue)'};">
          <div class="fund-card-top">
            <div class="fund-card-icon-title">
              <span class="fund-card-name">${f.shortName || f.name}</span>
            </div>
            <span class="fund-pct-tag font-mono">${f.percentage.toFixed(1)}%</span>
          </div>

          <div class="fund-balance-display">
            <span class="fund-balance-usdt font-mono">$ ${this.formatMoney(balanceUsdt, 'USD', true)}</span>
            <span class="fund-balance-ves font-mono">≈ ${this.formatMoney(balanceVes, 'VES', true)} Bs</span>
          </div>

          ${progressHtml}
          ${breakdownHtml}

          <button type="button" class="btn-fund-use" data-fund-id="${f.id}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
            <span>Usar / Ajustar</span>
          </button>
        </div>
      `;
    }).join('');

    // Renderizar tarjeta maestra de balance exclusivo del negocio
    this.renderBusinessVault();
  }

  // =========================================================================
  // BALANCE EXCLUSIVO DE LA PAPELERÍA (A&R PRINTS) - AJUSTE FASE 2.5
  // =========================================================================
  renderBusinessVault() {
    if (!this.businessVaultContainer) return;
    const funds = storageService.getFunds();
    const rate = criptoYaService.getRate();

    const repoFund = funds.find(f => f.id === 'fondo_reposicion') || { balanceUsdt: 0 };
    const maquinasFund = funds.find(f => f.id === 'fondo_maquinas_emergencia') || { balanceUsdt: 0 };
    const localFund = funds.find(f => f.id === 'fondo_alquiler_local') || { balanceUsdt: 0 };

    const repoBal = repoFund.balanceUsdt || 0;
    const maquinasBal = maquinasFund.balanceUsdt || 0;
    const localBal = localFund.balanceUsdt || 0;

    const totalBusinessUsd = repoBal + maquinasBal + localBal;
    const totalBusinessVes = totalBusinessUsd * rate;

    const localGoal = 50.00;
    const localPct = Math.min(100, Math.round((localBal / localGoal) * 100));
    const localRemaining = Math.max(0, localGoal - localBal);

    this.businessVaultContainer.innerHTML = `
      <div class="business-vault-master">
        <div class="business-vault-header">
          <div class="business-vault-badge-tag font-mono">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg>
            <span>Balance Exclusivo de la Papelería</span>
          </div>
          <span class="business-vault-scope-tag font-mono">A&amp;R PRINTS</span>
        </div>

        <div class="business-vault-total-block">
          <div>
            <div class="business-vault-total-label">Patrimonio y Liquidez del Negocio</div>
            <div class="business-vault-total-sub">Reposición (40%) + Máquinas (10%) + Alquiler Local (8%)</div>
          </div>
          <div class="business-vault-total-amounts">
            <div class="business-vault-amount-usd font-mono text-emerald">
              $ ${this.formatMoney(totalBusinessUsd, 'USD', true)} <span style="font-size:0.8rem; font-weight:600; color:var(--color-text-muted);">USD</span>
            </div>
            <div class="business-vault-amount-ves font-mono">
              ≈ ${this.formatMoney(totalBusinessVes, 'VES', true)} Bs
            </div>
          </div>
        </div>

        <div class="business-vault-grid">
          <!-- 1. Reposición e Insumos (40%) -->
          <div class="business-vault-item repo">
            <div>
              <div class="business-vault-item-header">
                <span class="business-vault-item-name">
                  📦 Reposición &amp; Insumos
                </span>
                <span class="business-vault-item-pill pill-usdt-work font-mono">USDT (40%)</span>
              </div>
              <div class="business-vault-item-balance font-mono">
                $ ${this.formatMoney(repoBal, 'USD', true)}
              </div>
              <div class="business-vault-item-sub font-mono">
                ≈ ${this.formatMoney(repoBal * rate, 'VES', true)} Bs
              </div>
            </div>
            <div style="margin-top: 8px; font-size: 0.65rem; color: #93C5FD;">
              Listo para compra de material, tintas y papel
            </div>
          </div>

          <!-- 2. Máquinas y Emergencias (10%) -->
          <div class="business-vault-item maquinas">
            <div>
              <div class="business-vault-item-header">
                <span class="business-vault-item-name">
                  🛠️ Máquinas &amp; Imprevistos
                </span>
                <span class="business-vault-item-pill pill-usdc-earn font-mono">USDC Earn (10%)</span>
              </div>
              <div class="business-vault-item-balance font-mono">
                $ ${this.formatMoney(maquinasBal, 'USD', true)}
              </div>
              <div class="business-vault-item-sub font-mono">
                ≈ ${this.formatMoney(maquinasBal * rate, 'VES', true)} Bs
              </div>
            </div>
            <div style="margin-top: 8px; font-size: 0.65rem; color: #F472B6;">
              Plotter, impresoras y contingencias técnicas
            </div>
          </div>

          <!-- 3. Alquiler del Local (8%) -->
          <div class="business-vault-item local">
            <div>
              <div class="business-vault-item-header">
                <span class="business-vault-item-name">
                  🏠 Alquiler del Local
                </span>
                <span class="business-vault-item-pill pill-usdc-earn font-mono">USDC Earn (8%)</span>
              </div>
              <div class="business-vault-item-balance font-mono">
                $ ${this.formatMoney(localBal, 'USD', true)} <span style="font-size:0.75rem; color:var(--color-text-muted);">/ $50.00</span>
              </div>
              <div class="business-vault-item-sub font-mono">
                ≈ ${this.formatMoney(localBal * rate, 'VES', true)} Bs
              </div>
            </div>
            <div class="business-vault-mini-progress">
              <div class="mini-progress-bar-bg">
                <div class="mini-progress-bar-fill" style="width: ${localPct}%;"></div>
              </div>
              <div class="mini-progress-label font-mono">
                <span>Avance: ${localPct}%</span>
                <span>${localRemaining > 0 ? `Faltan $${localRemaining.toFixed(2)}` : '¡Meta 100% lista!'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // =========================================================================
  // CÁLCULOS EN TIEMPO REAL: FORMULARIO DE CIERRE (A&R PRINTS)
  // =========================================================================
  updateClosureLiveCalculations() {
    if (!this.closureSalesGrossVesInput || !this.closureRateInput) return;

    const salesGrossVes = parseFloat(this.closureSalesGrossVesInput.value) || 0;
    const netProfitUsdt = parseFloat(this.closureNetProfitUsdtInput.value) || 0;
    const rate = parseFloat(this.closureRateInput.value) || criptoYaService.getRate();

    const salesGrossUsdt = rate > 0 ? (salesGrossVes / rate) : 0;
    const directCostUsdt = Math.max(0, salesGrossUsdt - netProfitUsdt);
    const directCostVes = directCostUsdt * rate;
    const operatingMarginPct = salesGrossUsdt > 0 ? (netProfitUsdt / salesGrossUsdt) * 100 : 0;

    // 1. Barra de Meta Diaria de Ventas ($20.00 USDT)
    const goalPct = Math.min(100, Math.round((salesGrossUsdt / DAILY_SALES_GOAL_USDT) * 100));
    this.dailyGoalStatus.textContent = `$${salesGrossUsdt.toFixed(2)} USDT (${goalPct}%)`;
    this.dailyGoalFill.style.width = `${goalPct}%`;
    if (goalPct >= 100) {
      this.dailyGoalStatus.className = 'daily-goal-status font-mono text-emerald';
    } else {
      this.dailyGoalStatus.className = 'daily-goal-status font-mono text-amber';
    }

    // 2. Banner de Métricas del POS
    this.posMetricGrossUsdt.textContent = `$ ${this.formatMoney(salesGrossUsdt, 'USD')}`;
    this.posMetricGrossVes.textContent = `${this.formatMoney(salesGrossVes, 'VES')} Bs`;
    this.posMetricCostUsdt.textContent = `$ ${this.formatMoney(directCostUsdt, 'USD')}`;
    this.posMetricCostVes.textContent = `${this.formatMoney(directCostVes, 'VES')} Bs`;
    this.posMetricMarginPct.textContent = `${operatingMarginPct.toFixed(1)}%`;

    // 3. Grilla de la Regla de los 6 Fondos
    this.renderLiveFundsDistribution(salesGrossUsdt, salesGrossVes, directCostUsdt);

    // 4. Asistente Cripto del Cierre (USDT vs USDC) - Fase 2.5 & Recalibración
    const usdcEarnTotal = salesGrossUsdt * 0.36; // 36.0%
    const subLocal = salesGrossUsdt * 0.08; // 8.0%
    const subVivienda = salesGrossUsdt * 0.18; // 18.0%
    const subMaquinas = salesGrossUsdt * 0.10; // 10.0%

    const usdtTotal = salesGrossUsdt * 0.64; // 64.0%
    const subReposicion = salesGrossUsdt * 0.40; // 40.0%
    const subPersonal = salesGrossUsdt * 0.24; // 24.0% (Comida 19.5% + Ocio 4.5%)

    if (this.cryptoGuideUsdcVal) {
      this.cryptoGuideUsdcVal.textContent = `$ ${usdcEarnTotal.toFixed(2)} USDC`;
      this.cryptoSubLocal.textContent = `$${subLocal.toFixed(2)}`;
      this.cryptoSubVivienda.textContent = `$${subVivienda.toFixed(2)}`;
      this.cryptoSubMaquinas.textContent = `$${subMaquinas.toFixed(2)}`;

      this.cryptoGuideUsdtVal.textContent = `$ ${usdtTotal.toFixed(2)} USDT`;
      this.cryptoSubReposicion.textContent = `$${subReposicion.toFixed(2)}`;
      this.cryptoSubPersonal.textContent = `$${subPersonal.toFixed(2)}`;
    }

    // 5. Si el modo es mixto, validar balance
    if (this.closureDestinationMode === 'mixed') {
      this.validateMixedInflows();
    }
  }

  renderLiveFundsDistribution(grossUsdt, grossVes, directCostUsdt) {
    if (!this.fundsDistLiveList) return;
    const funds = storageService.getFunds();

    this.fundsDistLiveList.innerHTML = funds.map(f => {
      const amountUsdt = grossUsdt * (f.percentage / 100);
      const amountVes = grossVes * (f.percentage / 100);

      let subNote = '';
      if (f.id === 'fondo_reposicion') {
        const excessUsdt = Math.max(0, amountUsdt - directCostUsdt);
        subNote = `(Consumo POS: $${directCostUsdt.toFixed(2)} | Excedente: $${excessUsdt.toFixed(2)})`;
      } else if (f.id === 'fondo_alquiler_local') {
        subNote = `(Meta: $50.00/mes)`;
      } else if (f.id === 'fondo_alquiler_vivienda') {
        subNote = `(Meta: $116.00/mes · Casa, Net, Pills, Tel)`;
      } else if (f.id === 'fondo_comida_hogar') {
        subNote = `(Ref: $124.20/mes · Mercado y hogar)`;
      } else if (f.id === 'fondo_maquinas_emergencia') {
        subNote = `(Plotter, impresoras e imprevistos)`;
      } else if (f.id === 'fondo_entretenimiento') {
        subNote = `(Ref: $28.65/mes · Disfrute personal)`;
      }

      return `
        <div class="dist-list-item">
          <div class="dist-item-left">
            <div class="dist-item-dot" style="background-color: ${f.color || 'var(--color-steel-blue)'};"></div>
            <div>
              <span class="dist-item-name">${f.name} (${f.percentage.toFixed(1)}%)</span>
              <span class="dist-item-subnote font-mono">${subNote}</span>
            </div>
          </div>
          <div class="dist-item-right">
            <span class="dist-item-usdt font-mono">+$${amountUsdt.toFixed(2)}</span>
            <span class="dist-item-ves font-mono">+${this.formatMoney(amountVes, 'VES')} Bs</span>
          </div>
        </div>
      `;
    }).join('');
  }
  setClosureDestinationMode(mode) {
    this.closureDestinationMode = mode;
    if (mode === 'banco_direct') {
      this.btnDestBanco.classList.add('active');
      this.btnDestMixed.classList.remove('active');
      this.mixedInputsContainer.classList.add('hidden');
    } else {
      this.btnDestBanco.classList.remove('active');
      this.btnDestMixed.classList.add('active');
      this.mixedInputsContainer.classList.remove('hidden');
      
      // Auto-rellenar con el total de ventas brutas en Banco Bs como punto de partida
      const salesGrossVes = parseFloat(this.closureSalesGrossVesInput.value) || 0;
      if (parseFloat(this.inflowBancoVes.value || 0) === 0 && salesGrossVes > 0) {
        this.inflowBancoVes.value = salesGrossVes.toFixed(2);
      }
      this.validateMixedInflows();
    }
  }

  validateMixedInflows() {
    const salesGrossVes = parseFloat(this.closureSalesGrossVesInput.value) || 0;
    const rate = parseFloat(this.closureRateInput.value) || criptoYaService.getRate();

    const bancoVes = parseFloat(this.inflowBancoVes.value) || 0;
    const vesCash = parseFloat(this.inflowVesCash.value) || 0;
    const usdCash = parseFloat(this.inflowUsdCash.value) || 0;
    const binanceUsdt = parseFloat(this.inflowBinanceUsdt.value) || 0;
    const binanceUsdc = parseFloat(this.inflowBinanceUsdc ? this.inflowBinanceUsdc.value : 0) || 0;

    // Convertir todo a Bs equivalente para comparar exactamente (Paridad 1 USDC = 1 USDT)
    const totalIngresadoVes = bancoVes + vesCash + ((usdCash + binanceUsdt + binanceUsdc) * rate);
    const diff = totalIngresadoVes - salesGrossVes;

    if (Math.abs(diff) < 2.0) { // Tolerancia mínima por decimales
      this.mixedBalanceStatus.className = 'mixed-diff-alert balanced';
      this.mixedBalanceStatus.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
        <span>Cuadre exacto: ${this.formatMoney(totalIngresadoVes, 'VES')} Bs ingresados.</span>
      `;
      return true;
    } else if (diff > 0) {
      this.mixedBalanceStatus.className = 'mixed-diff-alert unbalanced';
      this.mixedBalanceStatus.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
        <span>Sobran ${this.formatMoney(diff, 'VES')} Bs respecto a las ventas del día.</span>
      `;
      return false;
    } else {
      this.mixedBalanceStatus.className = 'mixed-diff-alert unbalanced';
      this.mixedBalanceStatus.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
        <span>Faltan ${this.formatMoney(Math.abs(diff), 'VES')} Bs para completar las ventas brutas.</span>
      `;
      return false;
    }
  }

  async handleSaveDailyClosure() {
    const date = this.closureDateInput.value;
    const salesGrossVes = parseFloat(this.closureSalesGrossVesInput.value);
    const netProfitUsdt = parseFloat(this.closureNetProfitUsdtInput.value);
    const rateUsed = parseFloat(this.closureRateInput.value);
    const notes = this.closureNotesInput.value;

    if (isNaN(salesGrossVes) || salesGrossVes <= 0) {
      this.showToast('Por favor introduce las Ventas Brutas Totales en Bs.', 'error');
      return;
    }

    if (isNaN(netProfitUsdt) || netProfitUsdt < 0) {
      this.showToast('Por favor introduce la Ganancia Neta del POS.', 'error');
      return;
    }

    if (isNaN(rateUsed) || rateUsed <= 0) {
      this.showToast('Por favor introduce una Tasa de Cierre válida.', 'error');
      return;
    }

    // Cálculos
    const salesGrossUsdt = salesGrossVes / rateUsed;
    const netProfitVes = netProfitUsdt * rateUsed;
    const directCostUsdt = Math.max(0, salesGrossUsdt - netProfitUsdt);
    const directCostVes = directCostUsdt * rateUsed;
    const operatingMarginPct = salesGrossUsdt > 0 ? (netProfitUsdt / salesGrossUsdt) * 100 : 0;

    // Calcular distribución de los 6 fondos
    const funds = storageService.getFunds();
    const fundsDistribution = funds.map(f => {
      const amountUsdt = parseFloat((salesGrossUsdt * (f.percentage / 100)).toFixed(2));
      const amountVes = parseFloat((salesGrossVes * (f.percentage / 100)).toFixed(2));
      const costPortion = f.id === 'fondo_reposicion' ? directCostUsdt : 0;
      const excessUsdt = f.id === 'fondo_reposicion' ? Math.max(0, amountUsdt - costPortion) : 0;

      return {
        fundId: f.id,
        name: f.name,
        percentage: f.percentage,
        amountUsdt,
        amountVes,
        directCostUsdt: parseFloat(costPortion.toFixed(2)),
        excessUsdt: parseFloat(excessUsdt.toFixed(2))
      };
    });

    // Inflows en billeteras reales
    let walletInflows = [];
    if (this.closureDestinationMode === 'banco_direct') {
      walletInflows = [
        { walletId: 'banco_ves', amount: salesGrossVes, currency: 'VES' }
      ];
    } else {
      if (!this.validateMixedInflows()) {
        this.showToast('La distribución mixta debe cuadrar con las ventas brutas.', 'warning');
        return;
      }
      const bVes = parseFloat(this.inflowBancoVes.value) || 0;
      const vCash = parseFloat(this.inflowVesCash.value) || 0;
      const uCash = parseFloat(this.inflowUsdCash.value) || 0;
      const bUsdt = parseFloat(this.inflowBinanceUsdt.value) || 0;
      const bUsdc = parseFloat(this.inflowBinanceUsdc ? this.inflowBinanceUsdc.value : 0) || 0;

      if (bVes > 0) walletInflows.push({ walletId: 'banco_ves', amount: bVes, currency: 'VES' });
      if (vCash > 0) walletInflows.push({ walletId: 'ves_cash', amount: vCash, currency: 'VES' });
      if (uCash > 0) walletInflows.push({ walletId: 'usd_cash', amount: uCash, currency: 'USD' });
      if (bUsdt > 0) walletInflows.push({ walletId: 'binance_usdt', amount: bUsdt, currency: 'USDT' });
      if (bUsdc > 0) walletInflows.push({ walletId: 'binance_usdc_earn', amount: bUsdc, currency: 'USDC' });
    }

    try {
      await storageService.saveDailyClosure({
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
        notes
      });

      this.showToast('¡Cierre diario guardado y fondos distribuidos con éxito!', 'success');

      // Limpiar formulario
      this.closureSalesGrossVesInput.value = '';
      this.closureNetProfitUsdtInput.value = '';
      this.closureNotesInput.value = '';
      this.updateClosureLiveCalculations();
      this.setClosureDestinationMode('banco_direct');
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  }

  // =========================================================================
  // ACCIÓN RÁPIDA: PASE A BINANCE AHORRO (USDC - EARN) - FASE 2.5
  // =========================================================================
  async handleExecuteEarnPass() {
    const funds = storageService.getFunds();
    const fLocal = funds.find(f => f.id === 'fondo_alquiler_local');
    const fVivienda = funds.find(f => f.id === 'fondo_alquiler_vivienda');
    const fMaquinas = funds.find(f => f.id === 'fondo_maquinas_emergencia');

    const savingsTotalUsdt = (fLocal ? fLocal.balanceUsdt || 0 : 0) +
                             (fVivienda ? fVivienda.balanceUsdt || 0 : 0) +
                             (fMaquinas ? fMaquinas.balanceUsdt || 0 : 0);

    if (savingsTotalUsdt <= 0) {
      this.showToast('No hay saldo acumulado en los fondos de ahorro para traspasar.', 'warning');
      return;
    }

    const binanceUsdtWallet = storageService.getWallet('binance_usdt');
    const availableUsdt = binanceUsdtWallet ? binanceUsdtWallet.balance : 0;

    if (availableUsdt <= 0) {
      this.showToast('Saldo insuficiente en Binance Operativo USDT ($0.00). Primero vende por P2P o carga saldo.', 'error');
      return;
    }

    let amountToTransfer = savingsTotalUsdt;
    if (availableUsdt < savingsTotalUsdt) {
      const proceed = confirm(`El acumulado en los fondos de ahorro es $${savingsTotalUsdt.toFixed(2)} USDT, pero en Binance Operativo solo dispones de $${availableUsdt.toFixed(2)} USDT.\n\n¿Deseas transferir los $${availableUsdt.toFixed(2)} USDT disponibles a Binance Ahorro (USDC - Earn)?`);
      if (!proceed) return;
      amountToTransfer = availableUsdt;
    } else {
      const proceed = confirm(`¿Confirmas el traspaso de $${amountToTransfer.toFixed(2)} USDT a Binance Ahorro (USDC - Earn)?\n\n(Paridad 1:1, sin comisiones)`);
      if (!proceed) return;
    }

    try {
      await storageService.executeUsdcEarnPass(amountToTransfer, 'Pase de fondos de ahorro (Local, Casa, Máquinas) a USDC Earn');
      this.showToast(`¡Traspaso de $${amountToTransfer.toFixed(2)} a USDC Earn ejecutado exitosamente!`, 'success');
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  }

  // =========================================================================
  // RENDER HISTORIAL DE CIERRES & REVERSIÓN
  // =========================================================================
  renderDailyClosures(closures) {
    if (!this.closureHistoryContainer) return;

    if (!closures || closures.length === 0) {
      this.closureHistoryContainer.innerHTML = `
        <div class="history-empty-card">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin: 0 auto; color: var(--color-text-muted);"><rect x="2" y="3" width="20" height="14" rx="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>
          <p>No hay cierres diarios registrados aún.</p>
          <span style="font-size: 0.72rem; color: var(--color-text-dim);">Registra el primer cierre del día de A&amp;R Prints arriba.</span>
        </div>
      `;
      if (this.closureCountBadge) this.closureCountBadge.textContent = '0 Cierres';
      return;
    }

    if (this.closureCountBadge) {
      this.closureCountBadge.textContent = `${closures.length} Cierre${closures.length > 1 ? 's' : ''}`;
    }

    this.closureHistoryContainer.innerHTML = closures.map(c => {
      const dateParts = c.date ? c.date.split('-') : [];
      let formattedDate = c.date;
      if (dateParts.length === 3) {
        const d = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]));
        formattedDate = d.toLocaleDateString('es-VE', { weekday: 'short', day: '2-digit', month: 'short' });
      }

      return `
        <div class="closure-item-card" data-closure-id="${c.id}">
          <div class="closure-item-header">
            <div class="closure-date-tag font-mono">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
              <span>${formattedDate}</span>
            </div>

            <button type="button" class="btn-revert-closure" data-closure-id="${c.id}" title="Revertir y eliminar cierre">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              <span>Revertir</span>
            </button>
          </div>

          <div class="closure-summary-grid font-mono">
            <div class="closure-substat">
              <span class="closure-substat-label">Ventas Brutas</span>
              <span class="closure-substat-val text-emerald">$${c.salesGrossUsdt.toFixed(2)}</span>
              <span style="font-size:0.65rem; color:var(--color-amber);">${this.formatMoney(c.salesGrossVes, 'VES')} Bs</span>
            </div>

            <div class="closure-substat">
              <span class="closure-substat-label">Ganancia Neta</span>
              <span class="closure-substat-val text-emerald">+$${c.netProfitUsdt.toFixed(2)}</span>
              <span style="font-size:0.65rem; color:var(--color-text-secondary);">${c.operatingMarginPct}% mg</span>
            </div>

            <div class="closure-substat">
              <span class="closure-substat-label">Costo POS</span>
              <span class="closure-substat-val text-coral">$${c.directCostUsdt.toFixed(2)}</span>
              <span style="font-size:0.65rem; color:var(--color-text-muted);">Reposición</span>
            </div>
          </div>

          <div class="closure-footer-meta">
            <span class="font-mono">Tasa congelada: ${c.rateUsed.toFixed(2)} Bs/USDT</span>
            <span>${c.notes ? c.notes : 'Sin notas'}</span>
          </div>
        </div>
      `;
    }).join('');
  }
  async handleRevertClosure(closureId) {
    if (!confirm('¿Estás seguro de que deseas revertir este cierre diario?\n\nSe restarán los saldos que ingresaron a las billeteras reales y se descontará la asignación de los 6 fondos.')) {
      return;
    }

    try {
      await storageService.revertDailyClosure(closureId);
      this.showToast('Cierre diario revertido exitosamente', 'warning');
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  }

  // =========================================================================
  // MODAL USO / DESCUENTO DE FONDO (FASE 2 + FASE 2.5)
  // =========================================================================
  openFundActionModal(fundId) {
    const fund = storageService.getFund(fundId);
    if (!fund) return;

    this.activeFundActionId = fund.id;
    this.fundActionTitle.textContent = `Uso de Fondo: ${fund.shortName || fund.name}`;
    this.fundActionSubtitle.textContent = `${fund.percentage.toFixed(1)}% de Ventas · ${fund.description}`;

    const rate = criptoYaService.getRate();
    const balUsdt = fund.balanceUsdt || 0;
    const balVes = balUsdt * rate;

    this.fundActionCurrentBal.textContent = `$ ${this.formatMoney(balUsdt, 'USD')} USDT`;
    this.fundActionCurrentVes.textContent = `≈ ${this.formatMoney(balVes, 'VES')} Bs`;

    // Cargar billeteras en el selector de cuenta real de origen
    if (this.fundActionWalletSelect) {
      const wallets = storageService.getWallets();
      this.fundActionWalletSelect.innerHTML = [
        ...wallets.map(w => {
          let balText = `${this.formatMoney(w.balance, w.currency)} ${w.currency}`;
          return `<option value="${w.id}">${w.name} (${balText})</option>`;
        }),
        `<option value="none">⚠️ Solo sobre virtual (No descontar de cuentas reales)</option>`
      ].join('');

      // Preselección inteligente según la naturaleza del fondo
      if (fund.cryptoCategory === 'usdc_earn') {
        this.fundActionWalletSelect.value = 'binance_usdc_earn';
      } else if (fund.id === 'fondo_reposicion') {
        this.fundActionWalletSelect.value = 'binance_usdt';
      } else {
        this.fundActionWalletSelect.value = 'binance_usdt';
      }
    }

    this.fundActionAmountInput.value = '';
    this.fundActionReasonInput.value = '';
    this.setFundActionMode('discount');
    this.updateFundActionWalletHint();

    this.openModal(this.modalFundAction);
  }

  setFundActionMode(mode) {
    this.fundActionMode = mode;
    if (mode === 'discount') {
      this.btnFundModeDiscount.classList.add('active');
      this.btnFundModeReset.classList.remove('active');
      this.fundActionAmountGroup.classList.remove('hidden');
      if (this.fundActionWalletGroup) this.fundActionWalletGroup.classList.remove('hidden');
      this.fundActionAmountInput.setAttribute('required', 'required');
      this.btnFundActionSubmit.innerHTML = `<span>Confirmar Descuento</span>`;
      this.updateFundActionWalletHint();
    } else {
      this.btnFundModeDiscount.classList.remove('active');
      this.btnFundModeReset.classList.add('active');
      this.fundActionAmountGroup.classList.add('hidden');
      if (this.fundActionWalletGroup) this.fundActionWalletGroup.classList.add('hidden');
      this.fundActionAmountInput.removeAttribute('required');
      this.fundActionReasonInput.value = 'Reinicio de ciclo mensual';
      this.btnFundActionSubmit.innerHTML = `<span>Reiniciar Ciclo a $0.00</span>`;
    }
  }

  updateFundActionWalletHint() {
    if (!this.fundActionWalletHint || !this.fundActionWalletSelect) return;
    const walletId = this.fundActionWalletSelect.value;
    const amount = parseFloat(this.fundActionAmountInput.value) || 0;
    const rate = criptoYaService.getRate();

    if (walletId === 'none') {
      this.fundActionWalletHint.innerHTML = `<span style="color: var(--color-amber);">ℹ️ El saldo de tus cuentas reales no variará. Solo se descontará el número en el sobre virtual.</span>`;
      return;
    }

    const wallet = storageService.getWallets().find(w => w.id === walletId);
    if (!wallet) return;

    if (amount <= 0) {
      this.fundActionWalletHint.innerHTML = `Se descontará automáticamente del sobre virtual y de tu cuenta real: <b>${wallet.name}</b>.`;
      return;
    }

    if (wallet.currency === 'VES') {
      const vesAmount = amount * rate;
      this.fundActionWalletHint.innerHTML = `
        <span>Se descontarán <b class="font-mono text-emerald">$${amount.toFixed(2)} USDT</b> del sobre y <b class="font-mono text-amber">≈ ${this.formatMoney(vesAmount, 'VES')} Bs</b> de <b>${wallet.name}</b> (tasa: ${this.formatMoney(rate, 'VES')} Bs).</span>
      `;
    } else {
      this.fundActionWalletHint.innerHTML = `
        <span>Se descontarán <b class="font-mono text-emerald">$${amount.toFixed(2)} USDT</b> del sobre y <b class="font-mono text-emerald">$${amount.toFixed(2)} ${wallet.currency}</b> de <b>${wallet.name}</b>.</span>
      `;
    }
  }

  async handleSubmitFundAction() {
    if (!this.activeFundActionId) return;

    if (this.fundActionMode === 'reset') {
      try {
        const res = await storageService.resetFundBalance(this.activeFundActionId);
        this.closeAllModals();
        this.showToast(`Fondo ${res.fund.shortName || res.fund.name} reiniciado a $0.00`, 'success');
      } catch (err) {
        this.showToast(err.message, 'error');
      }
    } else {
      const amount = parseFloat(this.fundActionAmountInput.value);
      const reason = this.fundActionReasonInput.value.trim() || 'Gasto del fondo';
      const walletId = this.fundActionWalletSelect ? this.fundActionWalletSelect.value : null;
      const rate = criptoYaService.getRate();

      if (isNaN(amount) || amount <= 0) {
        this.showToast('Introduce un monto válido a descontar.', 'error');
        return;
      }

      try {
        // Se envía delta negativo para restar del fondo y la cuenta real seleccionada
        const res = await storageService.adjustFundBalance(
          this.activeFundActionId,
          -amount,
          reason,
          walletId,
          rate
        );
        this.closeAllModals();
        let toastMsg = `Se descontaron $${amount.toFixed(2)} USDT de ${res.fund.shortName || res.fund.name}`;
        if (res.wallet) {
          toastMsg += ` y ${this.formatMoney(res.deductLocalAmount, res.wallet.currency)} ${res.wallet.currency} de ${res.wallet.name}`;
        }
        this.showToast(toastMsg, 'success');
      } catch (err) {
        this.showToast(err.message, 'error');
      }
    }
  }

  // =========================================================================
  // MODAL P2P CONVERSION (FASE 1)
  // =========================================================================
  openP2PModal() {
    const wallets = storageService.getWallets();
    
    this.p2pOriginSelect.innerHTML = wallets.map(w => `
      <option value="${w.id}">${w.name} (${this.formatMoney(w.balance, w.currency)} ${w.currency})</option>
    `).join('');

    this.p2pDestSelect.innerHTML = wallets.map(w => `
      <option value="${w.id}">${w.name} (${this.formatMoney(w.balance, w.currency)} ${w.currency})</option>
    `).join('');

    this.p2pOriginSelect.value = 'binance_usdt';
    this.p2pDestSelect.value = 'banco_ves';

    const liveRate = criptoYaService.getRate();
    this.p2pRateInput.value = liveRate.toFixed(2);
    this.p2pOriginAmountInput.value = '20.00';
    this.handleP2PWalletSelectionChange();
    this.calculateP2PFromOrigin();

    this.openModal(this.modalP2P);
  }

  handleP2PWalletSelectionChange() {
    const originId = this.p2pOriginSelect.value;
    const destId = this.p2pDestSelect.value;
    const origin = storageService.getWallet(originId);
    const dest = storageService.getWallet(destId);

    if (!origin || !dest) return;

    this.p2pOriginAvailable.textContent = `${this.formatMoney(origin.balance, origin.currency)} ${origin.currency}`;
    document.getElementById('p2p-origin-currency-addon').textContent = origin.currency;
    document.getElementById('p2p-dest-currency-addon').textContent = dest.currency;

    const isCurrencySwap = origin.baseType !== dest.baseType;
    if (isCurrencySwap) {
      this.p2pRateRow.classList.remove('hidden');
      if (!this.p2pRateInput.value || parseFloat(this.p2pRateInput.value) <= 0) {
        this.p2pRateInput.value = criptoYaService.getRate().toFixed(2);
      }
    } else {
      this.p2pRateRow.classList.add('hidden');
    }
  }

  applyP2PPercentage(pct) {
    const originId = this.p2pOriginSelect.value;
    const origin = storageService.getWallet(originId);
    if (!origin) return;

    const available = origin.balance;
    const targetAmount = parseFloat(((available * pct) / 100).toFixed(2));
    this.p2pOriginAmountInput.value = targetAmount.toFixed(2);
    this.p2pInputMode = 'origin';
    this.calculateP2PFromOrigin();
  }

  calculateP2PFromOrigin() {
    const origin = storageService.getWallet(this.p2pOriginSelect.value);
    const dest = storageService.getWallet(this.p2pDestSelect.value);
    if (!origin || !dest) return;

    const originAmt = parseFloat(this.p2pOriginAmountInput.value) || 0;
    const rate = parseFloat(this.p2pRateInput.value) || 1;

    let destAmt = 0;
    if (origin.baseType === 'USD' && dest.baseType === 'VES') {
      destAmt = originAmt * rate;
    } else if (origin.baseType === 'VES' && dest.baseType === 'USD') {
      destAmt = rate > 0 ? (originAmt / rate) : 0;
    } else {
      destAmt = originAmt;
    }

    this.p2pDestAmountInput.value = destAmt > 0 ? destAmt.toFixed(2) : '';
    this.updateP2PSummary(originAmt, destAmt, origin.currency, dest.currency, rate);
  }

  calculateP2PFromDest() {
    const origin = storageService.getWallet(this.p2pOriginSelect.value);
    const dest = storageService.getWallet(this.p2pDestSelect.value);
    if (!origin || !dest) return;

    const destAmt = parseFloat(this.p2pDestAmountInput.value) || 0;
    const rate = parseFloat(this.p2pRateInput.value) || 1;

    let originAmt = 0;
    if (origin.baseType === 'USD' && dest.baseType === 'VES') {
      originAmt = rate > 0 ? (destAmt / rate) : 0;
    } else if (origin.baseType === 'VES' && dest.baseType === 'USD') {
      originAmt = destAmt * rate;
    } else {
      originAmt = destAmt;
    }

    this.p2pOriginAmountInput.value = originAmt > 0 ? originAmt.toFixed(2) : '';
    this.updateP2PSummary(originAmt, destAmt, origin.currency, dest.currency, rate);
  }

  updateP2PSummary(originAmt, destAmt, originCurr, destCurr, rate) {
    this.p2pSummaryDebited.textContent = `-${this.formatMoney(originAmt, originCurr)} ${originCurr}`;
    this.p2pSummaryCredited.textContent = `+${this.formatMoney(destAmt, destCurr)} ${destCurr}`;
    
    if (this.p2pOriginSelect.value === this.p2pDestSelect.value) {
      this.p2pSummaryRate.textContent = 'Misma cuenta (inválido)';
      this.p2pSummaryRate.className = 'highlight-val text-coral font-mono';
    } else if (originCurr !== destCurr) {
      this.p2pSummaryRate.textContent = `1 USDT = ${rate.toFixed(2)} Bs`;
      this.p2pSummaryRate.className = 'highlight-val text-amber font-mono';
    } else {
      this.p2pSummaryRate.textContent = 'Transferencia interna (1:1)';
      this.p2pSummaryRate.className = 'highlight-val text-steel font-mono';
    }
  }

  async executeP2PTransfer() {
    const originId = this.p2pOriginSelect.value;
    const destId = this.p2pDestSelect.value;
    const originAmt = parseFloat(this.p2pOriginAmountInput.value);
    const destAmt = parseFloat(this.p2pDestAmountInput.value);
    const rate = parseFloat(this.p2pRateInput.value);
    const notes = document.getElementById('p2p-notes-input').value;

    try {
      await storageService.executeP2PTransfer({
        originId,
        destId,
        originAmount: originAmt,
        destAmount: destAmt,
        realRate: rate,
        notes
      });

      this.closeAllModals();
      this.showToast('¡Conversión P2P ejecutada exitosamente!', 'success');
      document.getElementById('p2p-notes-input').value = '';
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  }

  // =========================================================================
  // MODAL ARQUEO / AJUSTE MANUAL (FASE 1)
  // =========================================================================
  openArqueoModal(walletId) {
    const wallet = storageService.getWallet(walletId);
    if (!wallet) return;

    this.activeArqueoWalletId = wallet.id;
    this.arqueoWalletName.textContent = wallet.name;
    this.arqueoCurrentBalance.textContent = `${this.formatMoney(wallet.balance, wallet.currency)} ${wallet.currency}`;
    this.arqueoNewBalanceInput.value = wallet.balance.toFixed(2);
    this.arqueoCurrencyLabel.textContent = wallet.currency;
    this.arqueoReasonInput.value = 'Arqueo de saldo';

    this.calculateArqueoDiff();
    this.openModal(this.modalArqueo);
  }

  calculateArqueoDiff() {
    const wallet = storageService.getWallet(this.activeArqueoWalletId);
    if (!wallet) return;

    const newBal = parseFloat(this.arqueoNewBalanceInput.value) || 0;
    const diff = newBal - wallet.balance;

    if (Math.abs(diff) < 0.001) {
      this.arqueoDiffPreview.textContent = 'Sin variación (0.00)';
      this.arqueoDiffPreview.className = 'font-mono text-steel';
    } else if (diff > 0) {
      this.arqueoDiffPreview.textContent = `+${this.formatMoney(diff, wallet.currency)} ${wallet.currency} (Aumento)`;
      this.arqueoDiffPreview.className = 'font-mono text-emerald';
    } else {
      this.arqueoDiffPreview.textContent = `${this.formatMoney(diff, wallet.currency)} ${wallet.currency} (Disminución)`;
      this.arqueoDiffPreview.className = 'font-mono text-coral';
    }
  }

  async submitArqueo() {
    if (!this.activeArqueoWalletId) return;
    const newBal = parseFloat(this.arqueoNewBalanceInput.value);
    const reason = this.arqueoReasonInput.value.trim() || 'Ajuste manual de arqueo';

    if (isNaN(newBal) || newBal < 0) {
      this.showToast('Por favor introduce un saldo válido.', 'error');
      return;
    }

    try {
      const res = await storageService.updateWalletBalance(this.activeArqueoWalletId, newBal, reason);
      this.closeAllModals();
      this.showToast(`Saldo de ${res.wallet.name} actualizado a ${this.formatMoney(res.wallet.balance, res.wallet.currency)} ${res.wallet.currency}`, 'success');
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  }

  // =========================================================================
  // MODAL MANUAL RATE (FASE 1)
  // =========================================================================
  openManualRateModal() {
    const status = criptoYaService.getStatus();
    this.manualRateInput.value = status.rate.toFixed(2);
    document.getElementById('criptoya-ask-display').textContent = `${status.ask.toFixed(2)} Bs`;
    document.getElementById('criptoya-bid-display').textContent = `${status.bid.toFixed(2)} Bs`;
    this.openModal(this.modalManualRate);
  }

  // =========================================================================
  // MODAL HELPERS & UTILITIES
  // =========================================================================
  openModal(modalElement) {
    if (!modalElement) return;
    modalElement.classList.add('active');
  }

  closeAllModals() {
    document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.remove('active'));
    this.activeArqueoWalletId = null;
    this.activeFundActionId = null;
  }

  showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast-message ${type}`;
    toast.innerHTML = `
      <div class="toast-dot"></div>
      <div style="flex: 1; font-weight: 500;">${message}</div>
    `;
    this.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 200ms ease-out';
      setTimeout(() => toast.remove(), 200);
    }, 3200);
  }
}

// Iniciar aplicación al cargar el DOM de manera segura (maneja carga diferida de ES modules)
function bootstrapAleFinanzas() {
  try {
    const app = new AppController();
    app.init().catch(err => console.error('[AleFinanzas] Init error:', err));
    window.alefinanzas = app;
  } catch (err) {
    console.error('[AleFinanzas] Bootstrap error:', err);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrapAleFinanzas);
} else {
  bootstrapAleFinanzas();
}
