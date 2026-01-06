require('dotenv').config();
const axios = require('axios');

const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN;
const HUBSPOT_BASE_URL = 'https://api.hubapi.com';

// Configuración del pipeline (igual que en extract-dealmakers.js)
const PIPELINE_CONFIG = {
  pipelineId: '654720623', // Pipeline: Proyectos
  discardedStageId: '963342713' // Perdido / Descartado
};

/**
 * Obtener todos los deals en el stage descartado
 */
async function getDiscardedDeals() {
  if (!HUBSPOT_TOKEN) {
    console.error('❌ HUBSPOT_TOKEN no configurado en .env');
    return [];
  }

  try {
    console.log(`🔍 Buscando deals en pipeline ${PIPELINE_CONFIG.pipelineId}, stage descartado ${PIPELINE_CONFIG.discardedStageId}...`);

    let allDeals = [];
    let after = null;
    let hasMore = true;
    let totalProcessed = 0;

    while (hasMore) {
      const params = new URLSearchParams();
      params.append('properties', 'dealname');
      params.append('properties', 'dealstage');
      params.append('properties', 'createdate');
      params.append('limit', '100');

      if (after) {
        params.append('after', after);
      }

      // Filtrar por pipeline Y stage descartado
      params.append('filterGroups[0][filters][0][propertyName]', 'pipeline');
      params.append('filterGroups[0][filters][0][operator]', 'EQ');
      params.append('filterGroups[0][filters][0][value]', PIPELINE_CONFIG.pipelineId);

      params.append('filterGroups[0][filters][1][propertyName]', 'dealstage');
      params.append('filterGroups[0][filters][1][operator]', 'EQ');
      params.append('filterGroups[0][filters][1][value]', PIPELINE_CONFIG.discardedStageId);

      const url = `${HUBSPOT_BASE_URL}/crm/v3/objects/deals?${params.toString()}`;

      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${HUBSPOT_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });

      const deals = response.data.results || [];
      allDeals = allDeals.concat(deals);

      hasMore = response.data.paging?.next?.after;
      if (hasMore) {
        after = response.data.paging.next.after;
      }

      totalProcessed += deals.length;
      console.log(`📊 Procesados ${totalProcessed} deals descartados de pipeline ${PIPELINE_CONFIG.pipelineId}...`);

      // Pequeña pausa para evitar rate limits
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    return allDeals;

  } catch (error) {
    console.error('❌ Error obteniendo deals descartados:', error.response?.data || error.message);
    return [];
  }
}

/**
 * Filtrar deals que son posts de LinkedIn
 */
function filterPostDeals(deals) {
  return deals.filter(deal => {
    const dealName = deal.properties?.dealname || '';
    return dealName.includes('Post') && dealName.includes('LinkedIn');
  });
}

/**
 * Función principal
 */
async function main() {
  console.log('🚀 Contando deals de posts en descartados...\n');
  console.log(`📋 Pipeline: ${PIPELINE_CONFIG.pipelineId} (Proyectos)`);
  console.log(`🎯 Stage descartado: ${PIPELINE_CONFIG.discardedStageId}\n`);

  const discardedDeals = await getDiscardedDeals();

  if (discardedDeals.length === 0) {
    console.log(`📭 No se encontraron deals en el stage descartado ${PIPELINE_CONFIG.discardedStageId} de la pipeline ${PIPELINE_CONFIG.pipelineId}`);
    return;
  }

  const postDeals = filterPostDeals(discardedDeals);

  console.log('\n📊 RESULTADOS:');
  console.log(`📋 Total de deals en descartados: ${discardedDeals.length}`);
  console.log(`📋 Deals de posts de LinkedIn: ${postDeals.length}`);
  console.log(`📋 Porcentaje de posts: ${((postDeals.length / discardedDeals.length) * 100).toFixed(1)}%`);

  if (postDeals.length > 0) {
    console.log('\n📝 Lista de deals de posts (últimos 10):');
    const recentPosts = postDeals
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 10);

    recentPosts.forEach((deal, index) => {
      const createdDate = new Date(deal.createdAt).toLocaleDateString('es-ES');
      console.log(`   ${index + 1}. ${deal.properties.dealname} (ID: ${deal.id}) - ${createdDate}`);
    });

    if (postDeals.length > 10) {
      console.log(`   ... y ${postDeals.length - 10} más`);
    }
  }

  console.log('\n✅ Conteo completado exitosamente');
}

// Ejecutar si se llama directamente
if (require.main === module) {
  main().catch(error => {
    console.error('Error fatal:', error);
    process.exit(1);
  });
}

module.exports = { main, getDiscardedDeals, filterPostDeals };
