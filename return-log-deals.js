#!/usr/bin/env node

/**
 * Script para devolver deals del log al stage 13P Posible Oportunidad
 * Lee los IDs de deals que fueron movidos en el log especificado
 */

require('dotenv').config();
const axios = require('axios');
const fs = require('fs').promises;

// Obtener token del argumento de línea de comandos o del .env
const HUBSPOT_TOKEN = process.argv[3] || process.env.HUBSPOT_TOKEN;
const HUBSPOT_BASE_URL = 'https://api.hubapi.com';

// Configuración de stages
const TARGET_STAGE_ID = '1169433784'; // 13P Posible Oportunidad

/**
 * Extraer IDs de deals del log
 */
async function extractDealIdsFromLog(logFilePath) {
  try {
    const logContent = await fs.readFile(logFilePath, 'utf8');
    const lines = logContent.split('\n');

    const dealIds = [];

    for (const line of lines) {
      // Buscar líneas que indiquen movimiento de deals
      // Patrón: "📤 Moviendo: ID: DEAL_ID"
      const match = line.match(/📤 Moviendo: (\d+): (.+) \(ID: (\d+)\)/);
      if (match) {
        const dealId = match[3]; // El ID está en el grupo 3
        dealIds.push(dealId);
      }
    }

    console.log(`✅ Extraídos ${dealIds.length} IDs únicos de deals del log`);
    return [...new Set(dealIds)]; // Eliminar duplicados

  } catch (error) {
    console.error('❌ Error leyendo el log:', error.message);
    return [];
  }
}

/**
 * Devolver deals al stage 13P Posible Oportunidad
 */
async function returnDealsFromLog(logFilePath, confirm = false) {
  if (!HUBSPOT_TOKEN) {
    console.error('❌ Error: HUBSPOT_TOKEN no configurado en .env o como argumento');
    process.exit(1);
  }

  console.log('🔄 DEVOLVIENDO DEALS DEL LOG AL STAGE 13P POSIBLE OPORTUNIDAD');
  console.log(`📄 Archivo de log: ${logFilePath}`);
  console.log('='.repeat(80));

  // Extraer IDs del log
  const dealIds = await extractDealIdsFromLog(logFilePath);

  if (dealIds.length === 0) {
    console.log('❌ No se encontraron IDs de deals en el log');
    return;
  }

  console.log('\n📋 DEALS A DEVOLVER:');
  dealIds.forEach((id, index) => {
    console.log(`${index + 1}. ID: ${id}`);
  });

  if (!confirm) {
    console.log('\n⚠️  MODO VISTA PREVIA - No se devolvieron deals');
    console.log('💡 Para devolver estos deals, ejecuta el comando con --confirm:');
    console.log(`   node return-log-deals.js ${logFilePath} --confirm`);
    return;
  }

  // Modo confirmación - proceder con devolución
  console.log('\n🗄️  MODO DEVOLUCIÓN CONFIRMADA');
  console.log('⚠️  Se devolverán TODOS los deals listados arriba');
  console.log('⏳ Iniciando devolución...\n');

  let returned = 0;
  let errors = 0;

  for (const dealId of dealIds) {
    try {
      console.log(`   🔄 Devolviendo deal ID: ${dealId}`);

      await axios.patch(
        `${HUBSPOT_BASE_URL}/crm/v3/objects/deals/${dealId}`,
        {
          properties: {
            dealstage: TARGET_STAGE_ID
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${HUBSPOT_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );

      returned++;
      console.log(`   ✅ Devuelto exitosamente`);

      // Pequeña pausa para no sobrecargar la API
      await new Promise(resolve => setTimeout(resolve, 200));

    } catch (error) {
      errors++;
      console.error(`   ❌ Error devolviendo deal ${dealId}: ${error.response?.data?.message || error.message}`);
    }
  }

  console.log('\n📊 RESULTADO FINAL DE DEVOLUCIÓN:');
  console.log(`- Deals devueltos: ${returned}`);
  console.log(`- Errores: ${errors}`);
  console.log(`- Estado: ${errors === 0 ? '✅ COMPLETADO' : '⚠️  COMPLETADO CON ERRORES'}`);
}

// Ejecutar si se llama directamente
if (require.main === module) {
  const logFilePath = process.argv[2];
  const token = process.argv[3];
  const confirm = process.argv.includes('--confirm');

  if (!logFilePath) {
    console.error('❌ Error: Proporciona la ruta al archivo de log');
    console.error('Uso: node return-log-deals.js RUTA_AL_LOG [TOKEN_HUBSPOT] [--confirm]');
    console.error('');
    console.error('Ejemplos:');
    console.error('  node return-log-deals.js /path/to/log.txt');
    console.error('  node return-log-deals.js /path/to/log.txt TU_TOKEN_AQUI');
    console.error('  node return-log-deals.js /path/to/log.txt TU_TOKEN_AQUI --confirm');
    process.exit(1);
  }

  // Si se proporciona token como argumento, úsalo
  if (token && !token.startsWith('--')) {
    process.env.HUBSPOT_TOKEN = token;
  }

  returnDealsFromLog(logFilePath, confirm).catch(console.error);
}

module.exports = { returnDealsFromLog, extractDealIdsFromLog };
