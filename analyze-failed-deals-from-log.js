#!/usr/bin/env node

require('dotenv').config();
const fs = require('fs').promises;
const axios = require('axios');

const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN;
const HUBSPOT_BASE_URL = 'https://api.hubapi.com';
const DISCARDED_STAGE_ID = '963342713'; // Perdido / Descartado

/**
 * Lee el archivo de log y extrae información sobre deals procesados y fallidos
 */
async function analyzeLogFile(logFilePath) {
  console.log(`📖 Leyendo archivo de log: ${logFilePath}\n`);

  const logContent = await fs.readFile(logFilePath, 'utf8');
  const lines = logContent.split('\n');

  // Extraer deals que se movieron exitosamente (todos se movieron a 11P)
  const movedDeals = [];
  const movedDealPattern = /📤 Moviendo: (\d+): (.+) \(ID: (\d+)\)/;

  for (const line of lines) {
    const match = line.match(movedDealPattern);
    if (match) {
      const [, dealId, dealName] = match;
      movedDeals.push({
        id: dealId,
        name: dealName.trim()
      });
    }
  }

  console.log(`📊 Deals movidos al stage final (11P): ${movedDeals.length}`);

  // Extraer URLs que tuvieron contactos creados exitosamente
  const successfulUrls = new Set();

  // Buscar todas las líneas que contienen "Contacto creado" y encontrar la URL asociada
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('✅ Contacto creado:')) {
      // Buscar hacia atrás para encontrar la URL más reciente
      for (let j = i - 1; j >= Math.max(0, i - 20); j--) {
        const prevLine = lines[j];
        if (prevLine.includes('🔗 URL:') && !prevLine.includes('undefined')) {
          const urlMatch = prevLine.match(/🔗 URL: (https:\/\/[^\s]+)/);
          if (urlMatch && urlMatch[1]) {
            successfulUrls.add(urlMatch[1]);
            console.log(`   📍 URL exitosa encontrada: ${urlMatch[1]}`);
            break;
          }
        }
      }
    }
  }

  console.log(`✅ URLs procesadas exitosamente (con contacto creado): ${successfulUrls.size}\n`);

  // Extraer todas las URLs que se intentaron procesar
  const allAttemptedUrls = new Set();
  const urlPattern = /🔗 URL: (https:\/\/[^\s]+)/;

  for (const line of lines) {
    const match = line.match(urlPattern);
    if (match && match[1] !== 'undefined') {
      allAttemptedUrls.add(match[1]);
    }
  }

  console.log(`🔍 URLs totales procesadas por Apify: ${allAttemptedUrls.size}`);

  // URLs fallidas = todas las URLs - URLs exitosas
  const failedUrls = new Set();
  for (const url of allAttemptedUrls) {
    if (!successfulUrls.has(url)) {
      failedUrls.add(url);
    }
  }

  console.log(`❌ URLs fallidas (sin contacto): ${failedUrls.size}\n`);

  return {
    movedDeals,
    successfulUrls,
    failedUrls,
    allAttemptedUrls
  };
}

/**
 * Identifica deals fallidos del lote procesado
 * Un deal es fallido si NO tiene ninguna asociación con contactos creados exitosamente
 */
async function findFailedDealsFromProcessedBatch(movedDeals, successfulUrls) {
  console.log('🔍 Identificando deals fallidos del lote procesado (sin contactos asociados)...\n');

  const failedDeals = [];

  // Para cada deal que se movió exitosamente, verificar si tiene alguna URL exitosa
  for (const deal of movedDeals) {
    try {
      // Obtener detalles completos del deal desde HubSpot
      const dealResponse = await axios.get(
        `${HUBSPOT_BASE_URL}/crm/v3/objects/deals/${deal.id}`,
        {
          params: {
            properties: ['dealname', 'description']
          },
          headers: {
            'Authorization': `Bearer ${HUBSPOT_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const dealData = dealResponse.data;
      const description = dealData.properties?.description || '';

      // Extraer URLs del deal
      const dealUrls = extractUrlsFromDescription(description);

      // Verificar si el deal tiene AL MENOS UNA URL exitosa
      let hasSuccessfulUrl = false;
      for (const url of dealUrls) {
        if (successfulUrls.has(url)) {
          hasSuccessfulUrl = true;
          break;
        }
      }

      if (!hasSuccessfulUrl) {
        // Este deal no tiene ninguna URL exitosa asociada a contacto creado
        failedDeals.push({
          id: deal.id,
          name: deal.name,
          reason: 'Sin contacto creado exitosamente'
        });
        console.log(`      ❌ Deal fallido: ${deal.name} (ID: ${deal.id}) - ${dealUrls.length} URLs, ninguna exitosa`);
      } else {
        console.log(`      ✅ Deal exitoso: ${deal.name} (ID: ${deal.id}) - Tiene contacto creado`);
      }

      // Pequeña pausa para no sobrecargar la API
      await new Promise(resolve => setTimeout(resolve, 100));

    } catch (error) {
      console.error(`      ❌ Error obteniendo detalles del deal ${deal.id}: ${error.message}`);
    }
  }

  console.log(`\n📊 Total de deals fallidos identificados: ${failedDeals.length}`);
  return failedDeals;
}

/**
 * Extrae URLs de LinkedIn de la descripción de un deal
 */
function extractUrlsFromDescription(description) {
  const urls = [];
  const linkedinRegex = /https?:\/\/(?:www\.)?linkedin\.com\/[^\s<>"']+/gi;
  const matches = description.match(linkedinRegex) || [];
  urls.push(...matches);
  return [...new Set(urls)]; // Eliminar duplicados
}

/**
 * Mueve los deals fallidos al stage de descartados
 */
async function moveFailedDealsToDiscarded(failedDeals) {
  console.log(`\n🗑️  Moviendo ${failedDeals.length} deals fallidos a descartados...\n`);

  let moved = 0;
  let errors = 0;

  for (const deal of failedDeals) {
    try {
      console.log(`   📤 Moviendo a descartados: ${deal.name} (ID: ${deal.id}) - URL: ${deal.url}`);

      await axios.patch(
        `${HUBSPOT_BASE_URL}/crm/v3/objects/deals/${deal.id}`,
        {
          properties: {
            dealstage: DISCARDED_STAGE_ID
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${HUBSPOT_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );

      moved++;
      console.log(`   ✅ Movido exitosamente`);

      // Pausa para no sobrecargar la API
      await new Promise(resolve => setTimeout(resolve, 200));

    } catch (error) {
      errors++;
      console.error(`   ❌ Error moviendo deal ${deal.id}: ${error.message}`);
    }
  }

  console.log(`\n📊 Resultado: ${moved} movidos a descartados, ${errors} errores`);
  return { moved, errors };
}

/**
 * Función principal
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('❌ Uso: node analyze-failed-deals-from-log.js <ruta_al_archivo_log>');
    console.log('📖 Ejemplo: node analyze-failed-deals-from-log.js /Users/diegoguerrero/Downloads/logs.1767680296250.log');
    process.exit(1);
  }

  const logFilePath = args[0];

  if (!HUBSPOT_TOKEN) {
    console.log('❌ Error: HUBSPOT_TOKEN no encontrado');
    console.log('💡 Configure la variable de entorno HUBSPOT_TOKEN en su archivo .env');
    process.exit(1);
  }

  try {
    // 1. Analizar el archivo de log
    const logAnalysis = await analyzeLogFile(logFilePath);

    // 2. Identificar deals fallidos del lote procesado
    const failedDeals = await findFailedDealsFromProcessedBatch(logAnalysis.movedDeals, logAnalysis.successfulUrls);

    if (failedDeals.length === 0) {
      console.log('\n✅ No se encontraron deals fallidos para mover.');
      return;
    }

    // 3. Mostrar resumen antes de mover
    console.log('\n📋 RESUMEN DE DEALS A MOVER A DESCARTADOS:');
    console.log('='.repeat(80));
    failedDeals.forEach((deal, index) => {
      console.log(`${index + 1}. ${deal.name} (ID: ${deal.id})`);
      console.log(`   URL fallida: ${deal.url}`);
    });
    console.log('='.repeat(80));

    // 4. Confirmar antes de proceder
    console.log(`\n⚠️  ¿Desea mover estos ${failedDeals.length} deals a descartados?`);
    console.log('💡 Ejecute con --confirm para proceder automáticamente');
    console.log('   node analyze-failed-deals-from-log.js <log_file> --confirm');

    if (args.includes('--confirm')) {
      console.log('\n🚀 Procediendo con el movimiento...\n');
      const result = await moveFailedDealsToDiscarded(failedDeals);

      console.log('\n🎉 PROCESO COMPLETADO');
      console.log(`📊 Deals movidos a descartados: ${result.moved}`);
      if (result.errors > 0) {
        console.log(`⚠️  Errores: ${result.errors}`);
      }
    } else {
      console.log('\n⏳ Vista previa completada. Use --confirm para ejecutar el movimiento.');
    }

  } catch (error) {
    console.error('❌ Error en la ejecución:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}
