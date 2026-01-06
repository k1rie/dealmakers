#!/usr/bin/env node

/**
 * Script para gestionar el límite semanal de deals
 */

require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');

const WEEKLY_TRACKING_FILE = path.join(__dirname, 'weekly-tracking.json');
const MAX_DEALS_PER_WEEK = parseInt(process.env.MAX_DEALS_PER_WEEK) || 1000;

/**
 * Obtener la semana actual
 */
function getCurrentWeek() {
  const now = new Date();
  const year = now.getFullYear();
  const startOfYear = new Date(year, 0, 1);
  const days = Math.floor((now - startOfYear) / (24 * 60 * 60 * 1000));
  const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7);
  return `${year}-W${weekNumber.toString().padStart(2, '0')}`;
}

/**
 * Cargar datos de tracking
 */
async function loadWeeklyTracking() {
  try {
    const data = await fs.readFile(WEEKLY_TRACKING_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return {
      currentWeek: getCurrentWeek(),
      dealsProcessed: 0,
      lastUpdate: new Date().toISOString()
    };
  }
}

/**
 * Guardar datos de tracking
 */
async function saveWeeklyTracking(data) {
  try {
    await fs.writeFile(WEEKLY_TRACKING_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('❌ Error guardando tracking:', error.message);
  }
}

/**
 * Mostrar estado del límite semanal
 */
async function showWeeklyLimit() {
  console.log('📊 LÍMITE SEMANAL DE DEALS');
  console.log('='.repeat(50));

  const tracking = await loadWeeklyTracking();
  const currentWeek = getCurrentWeek();
  const remaining = MAX_DEALS_PER_WEEK - tracking.dealsProcessed;

  console.log(`Semana actual: ${currentWeek}`);
  console.log(`Deals procesados: ${tracking.dealsProcessed}/${MAX_DEALS_PER_WEEK}`);
  console.log(`Deals restantes: ${remaining}`);
  console.log(`Última actualización: ${new Date(tracking.lastUpdate).toLocaleString()}`);

  if (tracking.dealsProcessed >= MAX_DEALS_PER_WEEK) {
    console.log('⚠️  LÍMITE SEMANAL ALCANZADO');
  } else if (remaining < 10) {
    console.log('⚠️  Quedan menos de 10 deals disponibles');
  } else {
    console.log('✅ Límite disponible');
  }
}

/**
 * Resetear contador semanal
 */
async function resetWeeklyLimit() {
  console.log('🔄 RESETEANDO CONTADOR SEMANAL');
  console.log('-'.repeat(40));

  const newTracking = {
    currentWeek: getCurrentWeek(),
    dealsProcessed: 0,
    lastUpdate: new Date().toISOString()
  };

  await saveWeeklyTracking(newTracking);
  console.log('✅ Contador reseteado a 0');
  console.log(`Nueva semana: ${newTracking.currentWeek}`);
}

/**
 * Establecer contador manualmente
 */
async function setWeeklyCount(count) {
  console.log(`🔧 ESTABLECIENDO CONTADOR EN ${count}`);
  console.log('-'.repeat(40));

  const tracking = await loadWeeklyTracking();
  tracking.dealsProcessed = parseInt(count);
  tracking.lastUpdate = new Date().toISOString();

  await saveWeeklyTracking(tracking);
  console.log(`✅ Contador establecido en ${count}`);
}

// CLI interface
const command = process.argv[2];

switch (command) {
  case 'reset':
    resetWeeklyLimit();
    break;
  case 'set':
    const count = process.argv[3];
    if (!count || isNaN(count)) {
      console.log('❌ Uso: npm run manage-weekly-limit set <número>');
      process.exit(1);
    }
    setWeeklyCount(count);
    break;
  case 'show':
  default:
    showWeeklyLimit();
    break;
}
