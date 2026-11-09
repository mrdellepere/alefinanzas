/**
 * CriptoYA Service
 * Maneja la integración con la API de CriptoYA para Binance P2P (USDT/VES).
 * Provee cálculo de tasa promedio (ask/bid), respaldo en localStorage y eventos de actualización.
 */

import { CRIPTOYA_CONFIG, STORAGE_KEYS } from '../config.js';

class CriptoYaService {
  constructor() {
    this.currentRate = this.loadCachedRate() || CRIPTOYA_CONFIG.defaultFallbackRate;
    this.askRate = this.currentRate;
    this.bidRate = this.currentRate;
    this.lastUpdated = null;
    this.status = 'idle'; // 'idle' | 'loading' | 'live' | 'stale' | 'manual'
    this.isManualOverride = false;
    this.listeners = new Set();
    this.timer = null;

    // Verificar si el usuario tenía configurada una tasa manual previamente
    const savedManual = localStorage.getItem(STORAGE_KEYS.CUSTOM_RATE);
    if (savedManual) {
      const parsed = parseFloat(savedManual);
      if (!isNaN(parsed) && parsed > 0) {
        this.currentRate = parsed;
        this.isManualOverride = true;
        this.status = 'manual';
      }
    }
  }

  loadCachedRate() {
    try {
      const cached = localStorage.getItem(STORAGE_KEYS.RATE_CACHE);
      if (cached) {
        const data = JSON.parse(cached);
        if (data && typeof data.rate === 'number' && data.rate > 0) {
          this.lastUpdated = data.time ? new Date(data.time * 1000) : new Date(data.cachedAt || Date.now());
          return data.rate;
        }
      }
    } catch (e) {
      console.warn('[CriptoYA] Error al leer caché:', e);
    }
    return null;
  }

  saveRateToCache(rate, ask, bid, apiTime) {
    try {
      const payload = {
        rate,
        ask,
        bid,
        time: apiTime,
        cachedAt: Date.now()
      };
      localStorage.setItem(STORAGE_KEYS.RATE_CACHE, JSON.stringify(payload));
    } catch (e) {
      console.warn('[CriptoYA] Error guardando caché:', e);
    }
  }

  async fetchRate() {
    if (this.isManualOverride) {
      this.status = 'manual';
      this.notify();
      return this.currentRate;
    }

    this.status = 'loading';
    this.notify();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const response = await fetch(CRIPTOYA_CONFIG.endpoint, {
        signal: controller.signal,
        cache: 'no-cache'
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      // Validación de payload CriptoYA: { ask, bid, time }
      const ask = parseFloat(data.ask);
      const bid = parseFloat(data.bid);

      if (!isNaN(ask) && !isNaN(bid) && ask > 0 && bid > 0) {
        // Tasa promedio calculada entre ask y bid
        const avg = parseFloat(((ask + bid) / 2).toFixed(2));
        this.askRate = ask;
        this.bidRate = bid;
        this.currentRate = avg;
        this.lastUpdated = data.time ? new Date(data.time * 1000) : new Date();
        this.status = 'live';
        
        this.saveRateToCache(avg, ask, bid, data.time || Math.floor(Date.now() / 1000));
        this.notify();
        return avg;
      } else {
        throw new Error('Respuesta inválida de CriptoYA');
      }
    } catch (error) {
      console.warn('[CriptoYA] Fallo al consultar API:', error.message);
      // Usar respaldo en caché si está disponible
      const cached = this.loadCachedRate();
      if (cached) {
        this.currentRate = cached;
        this.status = 'stale'; // Tasa offline
      } else {
        this.status = 'error';
      }
      this.notify();
      return this.currentRate;
    }
  }

  setManualRate(rate) {
    const num = parseFloat(rate);
    if (!isNaN(num) && num > 0) {
      this.currentRate = parseFloat(num.toFixed(2));
      this.isManualOverride = true;
      this.status = 'manual';
      this.lastUpdated = new Date();
      localStorage.setItem(STORAGE_KEYS.CUSTOM_RATE, this.currentRate.toString());
      this.notify();
      return true;
    }
    return false;
  }

  clearManualRate() {
    this.isManualOverride = false;
    localStorage.removeItem(STORAGE_KEYS.CUSTOM_RATE);
    return this.fetchRate();
  }

  getRate() {
    return this.currentRate;
  }

  getStatus() {
    return {
      rate: this.currentRate,
      ask: this.askRate,
      bid: this.bidRate,
      status: this.status,
      isManual: this.isManualOverride,
      lastUpdated: this.lastUpdated
    };
  }

  subscribe(callback) {
    this.listeners.add(callback);
    callback(this.getStatus());
    return () => this.listeners.delete(callback);
  }

  notify() {
    const status = this.getStatus();
    this.listeners.forEach(cb => {
      try {
        cb(status);
      } catch (err) {
        console.error('[CriptoYA] Error en suscriptor:', err);
      }
    });
  }

  startAutoRefresh() {
    if (this.timer) clearInterval(this.timer);
    this.fetchRate();
    this.timer = setInterval(() => {
      this.fetchRate();
    }, CRIPTOYA_CONFIG.refreshIntervalMs);
  }

  stopAutoRefresh() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

export const criptoYaService = new CriptoYaService();
