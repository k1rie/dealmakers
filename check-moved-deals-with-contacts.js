#!/usr/bin/env node

require('dotenv').config();
const axios = require('axios');

const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN || process.argv[2];
const HUBSPOT_BASE_URL = 'https://api.hubapi.com';

const PIPELINE_CONFIG = {
  pipelineId: '654720623', // Pipeline: Proyectos
  targetStageId: '1259550373' // 11P Agregado en Linkedin (donde se mueven los deals procesados)
};

/**
 * Verificar deals que pasaron a la siguiente etapa (11P Agregado en Linkedin) y sus contactos asociados
 */
async function checkMovedDealsWithContacts() {
  console.log('🔍 Verificando deals que pasaron a 11P Agregado en Linkedin y sus contactos asociados...\n');

  if (!HUBSPOT_TOKEN) {
    console.log('❌ Error: HUBSPOT_TOKEN no encontrado');
    console.log('Uso: node check-moved-deals-with-contacts.js [TU_TOKEN_DE_HUBSPOT_AQUI]');
    console.log('O crear archivo .env con: HUBSPOT_TOKEN=tu_token_aqui');
    process.exit(1);
  }

  try {
    console.log(`📊 Pipeline ID: ${PIPELINE_CONFIG.pipelineId} (Proyectos)`);
    console.log(`📊 Stage ID destino: ${PIPELINE_CONFIG.targetStageId} (11P Agregado en Linkedin)\n`);

    // Obtener deals en el stage de destino (11P Agregado en Linkedin)
    const response = await axios.post(
      `${HUBSPOT_BASE_URL}/crm/v3/objects/deals/search`,
      {
        filterGroups: [
          {
            filters: [
              {
                propertyName: 'dealstage',
                operator: 'EQ',
                value: PIPELINE_CONFIG.targetStageId
              },
              {
                propertyName: 'pipeline',
                operator: 'EQ',
                value: PIPELINE_CONFIG.pipelineId
              }
            ]
          }
        ],
        limit: 100, // Máximo 100 para análisis completo
        properties: ['id', 'dealname', 'description', 'createdate', 'hs_lastmodifieddate', 'link_original_de_la_noticia']
      },
      {
        headers: {
          'Authorization': `Bearer ${HUBSPOT_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const deals = response.data.results || [];
    const totalDeals = deals.length;

    console.log('📋 RESULTADOS:');
    console.log(`Total de deals encontrados en 11P Agregado en Linkedin: ${totalDeals}\n`);

    if (totalDeals === 0) {
      console.log('✅ No hay deals en la etapa de destino. El pipeline está limpio.');
      return;
    }

    // Filtrar deals que parecen ser de posts procesados por extract-dealmakers
    // Solo incluir deals con prefijo "Post:" en el nombre
    const processedDeals = deals.filter(deal => {
      const dealName = deal.properties?.dealname || '';
      return dealName.startsWith('Post:');
    });

    console.log(`🔗 Deals con prefijo "Post:": ${processedDeals.length}`);
    console.log(`📝 Otros deals en el stage: ${totalDeals - processedDeals.length}\n`);

    let totalContactsAssociated = 0;
    let dealsWithContacts = 0;
    let dealsWithoutContacts = 0;
    let dealsWithPostPrefix = 0;
    let dealsWithoutPostPrefix = 0;

    if (processedDeals.length > 0) {
      console.log('📋 ANÁLISIS DETALLADO DE DEALS PROCESADOS:');
      console.log('='.repeat(100));

      for (let i = 0; i < processedDeals.length; i++) {
        const deal = processedDeals[i];
        const props = deal.properties;
        const dealName = props.dealname || 'Sin nombre';

        // Verificar si tiene prefijo "Post:"
        const hasPostPrefix = dealName.startsWith('Post:');
        if (hasPostPrefix) {
          dealsWithPostPrefix++;
        } else {
          dealsWithoutPostPrefix++;
        }

        console.log(`${i + 1}. ${hasPostPrefix ? '✅' : '❌'} ${dealName} (ID: ${deal.id})`);

        // Extraer información del post
        const description = props.description || '';
        const postUrlMatch = description.match(/URL del post: (https:\/\/[^\s\n]+)/);
        const profileUrlMatch = description.match(/URL del perfil: (https:\/\/[^\s\n]+)/);

        if (postUrlMatch) {
          console.log(`   🔗 Post: ${postUrlMatch[1]}`);
        }
        if (profileUrlMatch) {
          console.log(`   👤 Perfil: ${profileUrlMatch[1]}`);
        }

        // Verificar contactos asociados
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
          const numContacts = associatedContacts.length;

          if (numContacts > 0) {
            console.log(`   👥 Contactos asociados: ${numContacts}`);
            dealsWithContacts++;
            totalContactsAssociated += numContacts;

            // Mostrar detalles de los contactos (máximo 3 para no saturar)
            const contactsToShow = associatedContacts.slice(0, 3);
            for (const contactAssoc of contactsToShow) {
              try {
                const contactResponse = await axios.get(
                  `${HUBSPOT_BASE_URL}/crm/v3/objects/contacts/${contactAssoc.id}`,
                  {
                    headers: {
                      'Authorization': `Bearer ${HUBSPOT_TOKEN}`,
                      'Content-Type': 'application/json'
                    },
                    params: {
                      properties: 'firstname,lastname,email,linkedin'
                    }
                  }
                );

                const contactProps = contactResponse.data.properties || {};
                const contactName = `${contactProps.firstname || ''} ${contactProps.lastname || ''}`.trim() || 'Sin nombre';
                const contactEmail = contactProps.email || 'Sin email';
                const contactLinkedIn = contactProps.linkedin || '';
                console.log(`      • ${contactName} (${contactEmail})`);
                if (contactLinkedIn) {
                  console.log(`        LinkedIn: ${contactLinkedIn}`);
                }
              } catch (contactError) {
                console.log(`      • Contacto ${contactAssoc.id} (error obteniendo detalles)`);
              }
            }

            if (associatedContacts.length > 3) {
              console.log(`      ... y ${associatedContacts.length - 3} más`);
            }
          } else {
            console.log(`   ❌ Sin contactos asociados`);
            dealsWithoutContacts++;
          }
        } catch (assocError) {
          console.log(`   ⚠️ Error obteniendo asociaciones: ${assocError.message}`);
          dealsWithoutContacts++;
        }

        console.log('');
      }
    }

    // Mostrar resumen final
    console.log('📊 RESUMEN FINAL:');
    console.log('='.repeat(50));
    console.log(`- Total deals en 11P Agregado en Linkedin: ${totalDeals}`);
    console.log(`- Deals con prefijo "Post:": ${processedDeals.length}`);
    console.log(`- Otros deals en el stage: ${totalDeals - processedDeals.length}`);
    console.log(`- Deals con contactos asociados: ${dealsWithContacts}`);
    console.log(`- Deals sin contactos asociados: ${dealsWithoutContacts}`);
    console.log(`- Total contactos asociados: ${totalContactsAssociated}`);

    if (processedDeals.length > 0) {
      const successRate = ((dealsWithContacts / processedDeals.length) * 100).toFixed(1);
      console.log(`- Tasa de éxito (deals con contactos): ${successRate}%`);
    }

    // Verificaciones de integridad
    if (dealsWithPostPrefix !== processedDeals.length) {
      console.log(`\n⚠️  ERROR: Se esperaban ${processedDeals.length} deals con prefijo pero se contaron ${dealsWithPostPrefix}`);
    }
    if (dealsWithoutPostPrefix > 0) {
      console.log(`\n⚠️  ERROR: ${dealsWithoutPostPrefix} deals sin prefijo pasaron el filtro inicial`);
    }

    // Recomendaciones
    console.log('\n💡 RECOMENDACIONES:');
    if (dealsWithoutContacts > 0) {
      console.log(`⚠️  ${dealsWithoutContacts} deals con prefijo "Post:" no tienen contactos asociados`);
      console.log('   Ejecuta: npm run fix-missing-contacts (con tus tokens)');
    }

    if (dealsWithContacts > 0) {
      console.log(`✅ ${dealsWithContacts} deals fueron procesados exitosamente con contactos`);
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
  checkMovedDealsWithContacts();
}

module.exports = { checkMovedDealsWithContacts };
