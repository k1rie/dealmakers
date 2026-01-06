#!/usr/bin/env node

require('dotenv').config();
const axios = require('axios');

const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN || process.argv[2];
const HUBSPOT_BASE_URL = 'https://api.hubapi.com';

// Configuración del pipeline y stages (del extract-dealmakers.js)
const PIPELINE_CONFIG = {
  pipelineId: '654720623', // Pipeline: Proyectos
  sourceStageId: '1169433784', // 13P Posible Oportunidad (donde empiezan los deals)
  targetStageId: '1259550373' // 11P Agregado en Linkedin (donde van los procesados)
};

/**
 * Verificar todos los deals en el stage fuente (13P Posible Oportunidad)
 */
async function checkSourceStageDeals() {
  console.log('🔍 Verificando TODOS los deals en el stage fuente (13P Posible Oportunidad)...\n');

  if (!HUBSPOT_TOKEN) {
    console.log('❌ Error: HUBSPOT_TOKEN no encontrado');
    console.log('Uso: node check-source-stage-deals.js [TU_TOKEN_DE_HUBSPOT_AQUI]');
    console.log('O crear archivo .env con: HUBSPOT_TOKEN=tu_token_aqui');
    process.exit(1);
  }

  try {
    console.log(`📊 Pipeline ID: ${PIPELINE_CONFIG.pipelineId} (Proyectos)`);
    console.log(`📊 Stage fuente: ${PIPELINE_CONFIG.sourceStageId} (13P Posible Oportunidad)\n`);

    // Obtener todos los deals en el stage fuente
    let allDeals = [];
    let after = null;
    let hasMore = true;
    let pageCount = 0;

    while (hasMore) {
      pageCount++;
      console.log(`📄 Obteniendo página ${pageCount}...`);

      const params = {
        filterGroups: [
          {
            filters: [
              {
                propertyName: 'dealstage',
                operator: 'EQ',
                value: PIPELINE_CONFIG.sourceStageId
              },
              {
                propertyName: 'pipeline',
                operator: 'EQ',
                value: PIPELINE_CONFIG.pipelineId
              }
            ]
          }
        ],
        properties: ['id', 'dealname', 'description', 'createdate', 'hs_lastmodifieddate', 'link_original_de_la_noticia'],
        limit: 100
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

      const batch = response.data.results || [];
      allDeals = allDeals.concat(batch);

      console.log(`   ✅ ${batch.length} deals en esta página (total acumulado: ${allDeals.length})`);

      hasMore = response.data.paging?.next?.after;
      after = response.data.paging?.next?.after;

      if (hasMore) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    const totalDeals = allDeals.length;

    console.log(`\n📋 RESULTADO FINAL:`);
    console.log(`Total de deals en 13P Posible Oportunidad: ${totalDeals}\n`);

    if (totalDeals === 0) {
      console.log('✅ No hay deals en el stage fuente. Todos han sido procesados.');
      return;
    }

    // Clasificar deals por tipo
    let dealsWithPostPrefix = 0;
    let dealsWithLinkedInContent = 0;
    let dealsWithoutLinkedIn = 0;
    let dealsWithContacts = 0;
    let dealsWithoutContacts = 0;

    console.log('📋 ANÁLISIS DETALLADO DE DEALS:');
    console.log('='.repeat(120));

    // Procesar en lotes para no sobrecargar la API
    const batchSize = 10;

    for (let i = 0; i < totalDeals; i += batchSize) {
      const batch = allDeals.slice(i, i + batchSize);
      console.log(`\n📦 Procesando lote ${Math.floor(i / batchSize) + 1}/${Math.ceil(totalDeals / batchSize)} (${batch.length} deals)`);

      for (let j = 0; j < batch.length; j++) {
        const deal = batch[j];
        const index = i + j + 1;
        const props = deal.properties;
        const dealName = props?.dealname || 'Sin nombre';
        const description = props?.description || '';

        // Verificar si tiene prefijo "Post:"
        const hasPostPrefix = dealName.startsWith('Post:');
        if (hasPostPrefix) {
          dealsWithPostPrefix++;
        }

        // Verificar si tiene contenido de LinkedIn
        const hasLinkedInContent = description.includes('linkedin.com') ||
                                   description.includes('Post de LinkedIn') ||
                                   description.includes('URL del perfil:') ||
                                   description.includes('URL del post:');

        if (hasLinkedInContent) {
          dealsWithLinkedInContent++;
        } else {
          dealsWithoutLinkedIn++;
        }

        // Verificar contactos asociados (con manejo de errores)
        let contactCount = 0;
        try {
          const associationsResponse = await axios.get(
            `${HUBSPOT_BASE_URL}/crm/v3/objects/deals/${deal.id}/associations/contacts`,
            {
              headers: {
                'Authorization': `Bearer ${HUBSPOT_TOKEN}`,
                'Content-Type': 'application/json'
              }
            }
          );

          const associatedContacts = associationsResponse.data.results || [];
          contactCount = associatedContacts.length;

          if (contactCount > 0) {
            dealsWithContacts++;
          } else {
            dealsWithoutContacts++;
          }
        } catch (error) {
          console.log(`   ⚠️ Error obteniendo asociaciones para deal ${deal.id}: ${error.message}`);
          dealsWithoutContacts++;
        }

        // Mostrar información del deal
        const statusIcon = hasPostPrefix ? '✅' : (hasLinkedInContent ? '🔗' : '📝');
        const contactIcon = contactCount > 0 ? `👥 ${contactCount}` : '❌';

        console.log(`${index.toString().padStart(3, ' ')}. ${statusIcon} ${contactIcon} ${dealName} (ID: ${deal.id})`);

        // Mostrar URLs si están disponibles
        if (hasLinkedInContent) {
          const postUrlMatch = description.match(/URL del post: (https:\/\/[^\s\n]+)/);
          const profileUrlMatch = description.match(/URL del perfil: (https:\/\/[^\s\n]+)/);

          if (postUrlMatch) {
            console.log(`      🔗 Post: ${postUrlMatch[1]}`);
          }
          if (profileUrlMatch) {
            console.log(`      👤 Perfil: ${profileUrlMatch[1]}`);
          }
        }

        // Pequeña pausa para no sobrecargar
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // Resumen final
    console.log('\n📊 RESUMEN COMPLETO:');
    console.log('='.repeat(60));
    console.log(`- Total deals en 13P Posible Oportunidad: ${totalDeals}`);
    console.log(`- Deals con prefijo "Post:": ${dealsWithPostPrefix}`);
    console.log(`- Deals con contenido de LinkedIn: ${dealsWithLinkedInContent}`);
    console.log(`- Deals sin contenido de LinkedIn: ${dealsWithoutLinkedIn}`);
    console.log(`- Deals con contactos asociados: ${dealsWithContacts}`);
    console.log(`- Deals sin contactos asociados: ${dealsWithoutContacts}`);

    // Análisis adicional
    const readyForProcessing = dealsWithLinkedInContent - dealsWithPostPrefix;
    const alreadyProcessed = dealsWithPostPrefix;
    const notLinkedInRelated = totalDeals - dealsWithLinkedInContent;

    console.log('\n🎯 ANÁLISIS PARA EXTRACT-DEALMAKERS:');
    console.log('-'.repeat(50));
    console.log(`- Listos para procesar (tienen LinkedIn pero no prefijo): ${readyForProcessing}`);
    console.log(`- Ya procesados (tienen prefijo "Post:"): ${alreadyProcessed}`);
    console.log(`- No relacionados con LinkedIn: ${notLinkedInRelated}`);

    if (readyForProcessing > 0) {
      console.log('\n💡 RECOMENDACIONES:');
      console.log(`✅ ${readyForProcessing} deals están listos para ser procesados por extract-dealmakers`);
      console.log('   Ejecuta: npm run extract-dealmakers');
    }

    if (alreadyProcessed > 0) {
      console.log('\n⚠️  NOTA:');
      console.log(`ℹ️  ${alreadyProcessed} deals ya fueron procesados por extract-dealmakers`);
      console.log('   Estos deals deberían haber sido movidos a 11P Agregado en Linkedin');
    }

  } catch (error) {
    console.error('❌ Error verificando deals:', error.message);

    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error(`Respuesta: ${JSON.stringify(error.response.data, null, 2)}`);
    }
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  checkSourceStageDeals();
}

module.exports = { checkSourceStageDeals };
