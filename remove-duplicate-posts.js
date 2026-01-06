#!/usr/bin/env node

require('dotenv').config();
const axios = require('axios');
const fs = require('fs').promises;

// Configuración de HubSpot
const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN;
const HUBSPOT_BASE_URL = 'https://api.hubapi.com';

// Archivo de log que contiene los deals movidos por extract-dealmakers
const LOG_FILE_PATH = process.argv[3] || '/Users/diegoguerrero/Downloads/logs.1767664987923.log';

/**
 * Leer archivo de log y extraer IDs de deals movidos
 */
async function extractDealIdsFromLog(logPath) {
  console.log(`📖 Leyendo archivo de log: ${logPath}`);

  try {
    const logContent = await fs.readFile(logPath, 'utf8');
    const lines = logContent.split('\n');

    const dealIds = [];
    const dealNames = new Map();

    for (const line of lines) {
      // Buscar líneas como: "📤 Moviendo: 52879951751: Post: Pablo Fernández de Bobadilla - Post LinkedIn (ID: 52879951751)"
      const match = line.match(/📤 Moviendo: (\d+): (.+?) \(ID: (\d+)\)/);
      if (match) {
        const dealId = match[1];
        const dealName = match[2];

        if (!dealIds.includes(dealId)) {
          dealIds.push(dealId);
          dealNames.set(dealId, dealName);
        }
      }
    }

    console.log(`✅ Extraídos ${dealIds.length} IDs únicos de deals del log`);
    return { dealIds, dealNames };

  } catch (error) {
    console.error('❌ Error leyendo archivo de log:', error.message);
    throw error;
  }
}

/**
 * Obtener todos los deals del pipeline actual
 */
/**
 * Obtener deals de un pipeline con configuración específica
 */
async function getDealsFromPipeline(config) {
  const stageInfo = config.sourceStageId ? `stage ${config.sourceStageId}` : 'todo el pipeline';

  try {
    let allDeals = [];
    let after = null;
    const limit = 100;

    do {
      const filters = [
        {
          propertyName: 'pipeline',
          operator: 'EQ',
          value: config.pipelineId
        }
      ];

      // Solo agregar filtro de stage si está configurado
      if (config.sourceStageId) {
        filters.push({
          propertyName: 'dealstage',
          operator: 'EQ',
          value: config.sourceStageId
        });
      }

      const params = {
        limit: limit,
        properties: ['dealname', 'dealstage', 'pipeline', 'link_original_de_la_noticia', 'description', 'createdate'],
        filterGroups: [
          {
            filters: filters
          }
        ]
      };

      if (after) {
        params.after = after;
      }

      const response = await axios.post(
        `${HUBSPOT_BASE_URL}/crm/v3/objects/deals/search`,
        params,
        {
          headers: {
            'Authorization': `Bearer ${HUBSPOT_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const deals = response.data.results || [];
      allDeals = allDeals.concat(deals);

      after = response.data.paging?.next?.after;
      console.log(`📄 Página obtenida: ${deals.length} deals (total: ${allDeals.length})`);

      // Delay para evitar rate limiting
      if (after) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

    } while (after);

    return allDeals;

  } catch (error) {
    console.error('❌ Error obteniendo deals:', error.response?.data || error.message);
    return [];
  }
}

async function getAllDeals() {
  const stageInfo = PIPELINE_CONFIG.sourceStageId ? `stage ${PIPELINE_CONFIG.sourceStageId}` : 'todo el pipeline';
  console.log(`🔍 Obteniendo deals procesados por extract-dealmakers (pipeline ${PIPELINE_CONFIG.pipelineId}, ${stageInfo})...`);

  const deals = await getDealsFromPipeline(PIPELINE_CONFIG);
  console.log(`✅ Total de deals obtenidos: ${deals.length}`);
  return deals;
}

/**
 * Extraer nombre de persona del dealname
 * Solo procesa deals creados por linkedin-posts-apify (formato: "Post: Nombre - Post LinkedIn")
 */
function extractPersonName(dealname) {
  if (!dealname) return null;

  // Solo procesar deals que siguen el formato exacto de linkedin-posts-apify
  // Formato esperado: "Post: Nombre Persona - Post LinkedIn"
  const match = dealname.match(/^Post:\s*(.+?)\s*-\s*Post LinkedIn$/);
  return match ? match[1].trim() : null;
}

/**
 * Verificar si un deal fue creado por linkedin-posts-apify
 */
function isLinkedInPostsDeal(dealname) {
  return dealname && dealname.startsWith('Post: ') && dealname.endsWith(' - Post LinkedIn');
}

/**
 * Agrupar deals por nombre de persona (solo deals de linkedin-posts-apify)
 */
async function groupDealsByPerson(deals) {
  const groups = {};
  let processed = 0;
  let skipped = 0;

  // Mostrar ejemplos de los primeros deals para debugging
  if (deals.length > 0) {
    console.log('\n🔍 Ejemplos de deals encontrados:');
    for (let i = 0; i < Math.min(5, deals.length); i++) {
      const deal = deals[i];
      const dealname = deal.properties.dealname;
      const isValidFormat = isLinkedInPostsDeal(dealname);
      console.log(`   ${isValidFormat ? '✅' : '❌'} ${dealname} (ID: ${deal.id})`);
    }
    console.log('');
  }

  for (const deal of deals) {
    const dealname = deal.properties.dealname;

    // Solo procesar deals creados por linkedin-posts-apify
    if (!isLinkedInPostsDeal(dealname)) {
      skipped++;
      continue;
    }

    const personName = extractPersonName(dealname);

    if (!personName) {
      console.log(`⚠️  Deal con formato inválido: ${dealname} (ID: ${deal.id})`);
      skipped++;
      continue;
    }

    if (!groups[personName]) {
      groups[personName] = [];
    }

    groups[personName].push({
      id: deal.id,
      name: deal.properties.dealname,
      createdate: deal.properties.createdate,
      personName: personName
    });

    processed++;
  }

    console.log(`📊 Deals analizados: ${processed} de linkedin-posts-apify, ${skipped} otros deals ignorados`);

    // Si no encontró deals de linkedin-posts-apify, intentar búsqueda alternativa
    if (processed === 0 && PIPELINE_CONFIG.sourceStageId) {
      console.log('\n🔄 Intentando búsqueda alternativa en todo el pipeline...');

      // Crear configuración sin stage filter
      const altConfig = { ...PIPELINE_CONFIG, sourceStageId: null };

      // Buscar en todo el pipeline
      const altDeals = await getDealsFromPipeline(altConfig);
      if (altDeals.length > 0) {
        console.log(`✅ Encontrados ${altDeals.length} deals en todo el pipeline`);

        // Reprocesar con los deals encontrados
        const altGroups = groupDealsByPerson(altDeals);
        if (Object.keys(altGroups).length > 0) {
          console.log('\n🎯 Usando resultados de búsqueda alternativa:');
          return altGroups;
        }
      }
    }

  return groups;
}

/**
 * Seleccionar qué deals mantener (uno por persona)
 * Estrategia: mantener el más reciente
 */
function selectDealsToKeep(groups) {
  const toKeep = [];
  const toDelete = [];

  for (const [personName, deals] of Object.entries(groups)) {
    if (deals.length === 1) {
      console.log(`✅ ${personName}: 1 deal (mantener)`);
      toKeep.push(deals[0]);
      continue;
    }

    // Múltiples deals - ordenar por fecha de creación (más reciente primero)
    const sortedDeals = deals.sort((a, b) => {
      const dateA = new Date(a.createdate || 0);
      const dateB = new Date(b.createdate || 0);
      return dateB - dateA; // Más reciente primero
    });

    const keep = sortedDeals[0];
    const deleteList = sortedDeals.slice(1);

    console.log(`🔄 ${personName}: ${deals.length} deals → mantener 1, borrar ${deleteList.length}`);
    console.log(`   📌 Mantener: ${keep.name} (ID: ${keep.id})`);

    toKeep.push(keep);
    toDelete.push(...deleteList);
  }

  return { toKeep, toDelete };
}

/**
 * Borrar deals marcados para eliminación
 */
async function deleteDeals(dealsToDelete) {
  console.log(`\n🗑️  Iniciando eliminación de ${dealsToDelete.length} deals duplicados...`);

  let deleted = 0;
  let errors = 0;

  for (const deal of dealsToDelete) {
    try {
      console.log(`🗑️  Eliminando: ${deal.name} (ID: ${deal.id})`);

      await axios.delete(
        `${HUBSPOT_BASE_URL}/crm/v3/objects/deals/${deal.id}`,
        {
          headers: {
            'Authorization': `Bearer ${HUBSPOT_TOKEN}`
          }
        }
      );

      deleted++;
      console.log(`   ✅ Eliminado exitosamente`);

      // Delay entre eliminaciones
      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (error) {
      console.error(`   ❌ Error eliminando deal ${deal.id}:`, error.response?.data?.message || error.message);
      errors++;
    }
  }

  console.log(`\n📊 Resumen de eliminación:`);
  console.log(`   ✅ Eliminados: ${deleted}`);
  console.log(`   ❌ Errores: ${errors}`);

  return { deleted, errors };
}

/**
 * Función principal
 */
async function main() {
  try {
    console.log('🚀 Iniciando proceso de eliminación de deals desde log de extract-dealmakers\n');

    // 1. Extraer IDs de deals del archivo de log
    console.log('📖 Paso 1: Extrayendo IDs de deals del archivo de log...');
    const { dealIds, dealNames } = await extractDealIdsFromLog(LOG_FILE_PATH);

    if (dealIds.length === 0) {
      console.log('❌ No se encontraron IDs de deals en el archivo de log');
      return;
    }

    // 2. Agrupar por persona para identificar duplicados
    console.log('\n👥 Paso 2: Agrupando deals por persona...');
    const personGroups = {};

    for (const dealId of dealIds) {
      const dealName = dealNames.get(dealId);
      const personName = extractPersonName(dealName);

      if (!personName) {
        console.log(`⚠️  Deal sin nombre válido: ${dealName} (ID: ${dealId})`);
        continue;
      }

      if (!personGroups[personName]) {
        personGroups[personName] = [];
      }

      personGroups[personName].push({
        id: dealId,
        name: dealName,
        personName: personName
      });
    }

    console.log(`📊 Encontradas ${Object.keys(personGroups).length} personas con deals`);

    // 3. Seleccionar qué mantener y qué borrar
    console.log('\n🎯 Paso 3: Seleccionando deals a mantener (uno por persona)...');
    const toDelete = [];

    for (const [personName, deals] of Object.entries(personGroups)) {
      if (deals.length === 1) {
        console.log(`✅ ${personName}: 1 deal (mantener)`);
        continue;
      }

      // Ordenar por ID (más reciente primero, asumiendo IDs secuenciales)
      const sortedDeals = deals.sort((a, b) => parseInt(b.id) - parseInt(a.id));
      const keep = sortedDeals[0];
      const deleteList = sortedDeals.slice(1);

      console.log(`🔄 ${personName}: ${deals.length} deals → mantener 1 (${keep.id}), borrar ${deleteList.length}`);
      toDelete.push(...deleteList);
    }

    console.log(`\n📈 Resumen:`);
    console.log(`   🗑️  Deals a eliminar: ${toDelete.length}`);

    if (toDelete.length === 0) {
      console.log('\n✨ No hay deals duplicados para eliminar');
      return;
    }

    // 4. Confirmar antes de eliminar
    console.log('\n⚠️  ATENCIÓN: Esta acción eliminará EXCLUSIVAMENTE los deals listados en el log');
    console.log(`⚠️  Archivo de log: ${LOG_FILE_PATH}`);
    console.log(`⚠️  Se eliminarán ${toDelete.length} deals duplicados`);
    console.log('⚠️  Esta acción NO se puede deshacer');

    // En un script interactivo, aquí pediríamos confirmación
    const confirmed = process.argv[2] === '--confirm';

    if (!confirmed) {
      console.log('\n🛑 Eliminación cancelada. Usa --confirm para proceder');
      console.log('Ejemplo: npm run remove-duplicates -- --confirm');
      console.log(`O especifica un archivo de log diferente: npm run remove-duplicates -- --confirm /ruta/al/log.json`);
      return;
    }

    // 5. Eliminar deals
    await deleteDeals(toDelete);

    console.log('\n🎉 Proceso completado exitosamente');

  } catch (error) {
    console.error('\n❌ Error fatal:', error.message);
    process.exit(1);
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  main();
}

module.exports = {
  getAllDeals,
  extractPersonName,
  isLinkedInPostsDeal,
  groupDealsByPerson,
  selectDealsToKeep,
  deleteDeals
};
