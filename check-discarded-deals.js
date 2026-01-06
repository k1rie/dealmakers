#!/usr/bin/env node

require('dotenv').config();
const axios = require('axios');

const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN || process.argv[2];
const HUBSPOT_BASE_URL = 'https://api.hubapi.com';

// Configuración del pipeline y stages
const PIPELINE_CONFIG = {
  pipelineId: '654720623', // Pipeline: Proyectos
  discardedStageId: '963342713' // Perdido / Descartado
};

/**
 * Verificar todos los deals en el stage de descartados
 */
async function checkDiscardedDeals() {
  console.log('🔍 Verificando TODOS los deals en el stage de Descartados (Perdido)...\n');

  if (!HUBSPOT_TOKEN) {
    console.log('❌ Error: HUBSPOT_TOKEN no encontrado');
    console.log('Uso: node check-discarded-deals.js [TU_TOKEN_DE_HUBSPOT_AQUI]');
    console.log('O crear archivo .env con: HUBSPOT_TOKEN=tu_token_aqui');
    process.exit(1);
  }

  try {
    console.log(`📊 Pipeline ID: ${PIPELINE_CONFIG.pipelineId} (Proyectos)`);
    console.log(`📊 Stage descartado: ${PIPELINE_CONFIG.discardedStageId} (Perdido / Descartado)\n`);

    // Obtener todos los deals en el stage de descartados
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
                value: PIPELINE_CONFIG.discardedStageId
              },
              {
                propertyName: 'pipeline',
                operator: 'EQ',
                value: PIPELINE_CONFIG.pipelineId
              }
            ]
          }
        ],
        properties: ['id', 'dealname', 'description', 'createdate', 'hs_lastmodifieddate', 'hs_deal_stage_probability', 'amount', 'closedate'],
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
    console.log(`Total de deals en Perdido/Descartado: ${totalDeals}\n`);

    if (totalDeals === 0) {
      console.log('✅ No hay deals en el stage de descartados.');
      return;
    }

    // Clasificar deals por tipo
    let dealsWithPostPrefix = 0;
    let dealsWithLinkedInContent = 0;
    let dealsWithoutLinkedIn = 0;
    let dealsWithContacts = 0;
    let dealsWithoutContacts = 0;
    let dealsWithAmount = 0;
    let dealsWithoutAmount = 0;

    console.log('📋 ANÁLISIS DETALLADO DE DEALS DESCARTADOS:');
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
        const amount = props?.amount ? parseFloat(props.amount) : 0;
        const closeDate = props?.closedate;
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

        // Verificar monto
        if (amount > 0) {
          dealsWithAmount++;
        } else {
          dealsWithoutAmount++;
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
        const statusIcon = hasPostPrefix ? '✅' : (hasLinkedInContent ? '🔗' : '📦');
        const contactIcon = contactCount > 0 ? `👥 ${contactCount}` : '❌';
        const amountText = amount > 0 ? `💰 $${amount.toLocaleString()}` : '💰 $0';

        console.log(`${index.toString().padStart(3, ' ')}. ${statusIcon} ${contactIcon} ${amountText} ${dealName} (ID: ${deal.id})`);

        // Mostrar fecha de cierre si existe
        if (closeDate) {
          const closeDateObj = new Date(parseInt(closeDate));
          console.log(`      📅 Cerrado: ${closeDateObj.toLocaleDateString()}`);
        }

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

        // Mostrar primeras líneas de descripción si no tiene LinkedIn
        if (!hasLinkedInContent && description.length > 0) {
          const firstLine = description.split('\n')[0];
          if (firstLine.length > 100) {
            console.log(`      📝 "${firstLine.substring(0, 100)}..."`);
          } else {
            console.log(`      📝 "${firstLine}"`);
          }
        }

        // Pequeña pausa para no sobrecargar
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // Resumen final
    console.log('\n📊 RESUMEN COMPLETO DE DEALS DESCARTADOS:');
    console.log('='.repeat(60));
    console.log(`- Total deals en Perdido/Descartado: ${totalDeals}`);
    console.log(`- Deals con prefijo "Post:": ${dealsWithPostPrefix}`);
    console.log(`- Deals con contenido de LinkedIn: ${dealsWithLinkedInContent}`);
    console.log(`- Deals sin contenido de LinkedIn: ${dealsWithoutLinkedIn}`);
    console.log(`- Deals con contactos asociados: ${dealsWithContacts}`);
    console.log(`- Deals sin contactos asociados: ${dealsWithoutContacts}`);
    console.log(`- Deals con monto > 0: ${dealsWithAmount}`);
    console.log(`- Deals con monto = 0: ${dealsWithoutAmount}`);

    // Análisis adicional
    const potentialRecovery = dealsWithPostPrefix - dealsWithContacts;
    const linkedinWithoutPost = dealsWithLinkedInContent - dealsWithPostPrefix;

    console.log('\n🎯 ANÁLISIS PARA RECUPERACIÓN:');
    console.log('-'.repeat(50));
    console.log(`- Deals "Post:" sin contactos (recuperables): ${potentialRecovery}`);
    console.log(`- Deals con LinkedIn sin prefijo "Post:": ${linkedinWithoutPost}`);
    console.log(`- Deals no relacionados con LinkedIn: ${dealsWithoutLinkedIn}`);

    if (potentialRecovery > 0) {
      console.log('\n💡 RECOMENDACIONES:');
      console.log(`🔄 ${potentialRecovery} deals con prefijo "Post:" podrían tener contactos faltantes`);
      console.log('   Ejecuta: npm run fix-missing-contacts (procesará deals en cualquier stage)');
    }

    if (linkedinWithoutPost > 0) {
      console.log(`\nℹ️  ${linkedinWithoutPost} deals tienen contenido de LinkedIn pero sin procesar por extract-dealmakers`);
    }

  } catch (error) {
    console.error('❌ Error verificando deals descartados:', error.message);

    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error(`Respuesta: ${JSON.stringify(error.response.data, null, 2)}`);
    }
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  checkDiscardedDeals();
}

module.exports = { checkDiscardedDeals };
