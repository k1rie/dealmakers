require('dotenv').config();
const axios = require('axios');

// Configuración del pipeline y stages (del extract-dealmakers.js)
const PIPELINE_CONFIG = {
  pipelineId: '654720623', // Pipeline: Proyectos
  targetStageId: '1259550373' // 11P Agregado en Linkedin (donde se mueven los deals procesados)
};

const HUBSPOT_BASE_URL = 'https://api.hubapi.com';

// Obtener token de .env o argumento de línea de comandos
const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN || process.argv[2];

/**
 * Verificar deals que pasaron a la siguiente etapa (11P Agregado en Linkedin)
 */
const checkMovedDeals = async () => {
  if (!HUBSPOT_TOKEN) {
    console.error('❌ Error: Proporciona el token de HubSpot como argumento');
    console.error('Uso: node check-moved-deals.js TU_TOKEN_DE_HUBSPOT_AQUI');
    process.exit(1);
  }

  try {
    console.log('🔍 Verificando deals que pasaron a la siguiente etapa (11P Agregado en Linkedin)...\n');

    console.log(`📊 Pipeline ID: ${PIPELINE_CONFIG.pipelineId} (Proyectos)`);
    console.log(`📊 Stage ID destino: ${PIPELINE_CONFIG.targetStageId} (11P Agregado en Linkedin)\n`);

    // Buscar deals en el stage de destino (11P Agregado en Linkedin)
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
        limit: 100, // Máximo 100 para ver una muestra representativa
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

    console.log('📋 RESULTADOS:');
    console.log(`Total de deals encontrados en 11P Agregado en Linkedin: ${deals.length}\n`);

    if (deals.length === 0) {
      console.log('✅ No hay deals en la etapa de destino. El pipeline está limpio.');
      return;
    }

    // Filtrar deals que parecen ser de posts de LinkedIn (procesados por extract-dealmakers)
    const linkedinDeals = deals.filter(deal => {
      const description = deal.properties?.description || '';
      return description.includes('Post de LinkedIn') ||
             description.includes('linkedin.com/feed/update') ||
             deal.properties?.dealname?.includes('Post:');
    });

    console.log(`🔗 Deals que parecen ser de posts procesados por extract-dealmakers: ${linkedinDeals.length}`);
    console.log(`📝 Otros deals en el stage: ${deals.length - linkedinDeals.length}\n`);

    let totalContactsAssociated = 0;
    let dealsWithContacts = 0;
    let dealsWithoutContacts = 0;

    if (linkedinDeals.length > 0) {
      console.log('📋 DETALLE DE DEALS PROCESADOS POR EXTRACT-DEALMAKERS:');
      console.log('=' .repeat(90));

      for (let i = 0; i < linkedinDeals.length; i++) {
        const deal = linkedinDeals[i];
        const props = deal.properties;

        console.log(`${i + 1}. ID: ${deal.id}`);
        console.log(`   Nombre: ${props.dealname || 'N/A'}`);
        console.log(`   Creado: ${props.createdate || 'N/A'}`);
        console.log(`   Modificado: ${props.hs_lastmodifieddate || 'N/A'}`);

        // Extraer información del post
        const description = props.description || '';
        const postUrlMatch = description.match(/URL del post: (https:\/\/[^\s\n]+)/);
        const profileUrlMatch = description.match(/URL del perfil: (https:\/\/[^\s\n]+)/);

        if (postUrlMatch) {
          console.log(`   Post URL: ${postUrlMatch[1]}`);
        }
        if (profileUrlMatch) {
          console.log(`   Profile URL: ${profileUrlMatch[1]}`);
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

            // Mostrar detalles de los primeros contactos
            if (numContacts <= 3) {
              for (const contactAssoc of associatedContacts) {
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
                  const contactName = `${contactProps.firstname || ''} ${contactProps.lastname || ''}`.trim();
                  const contactEmail = contactProps.email || 'Sin email';
                  console.log(`      • ${contactName} (${contactEmail})`);
                } catch (contactError) {
                  console.log(`      • Contacto ${contactAssoc.id} (error obteniendo detalles)`);
                }
              }
            } else {
              console.log(`      (Primeros 3 de ${numContacts} contactos)`);
              for (let j = 0; j < Math.min(3, associatedContacts.length); j++) {
                const contactAssoc = associatedContacts[j];
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
                  const contactName = `${contactProps.firstname || ''} ${contactProps.lastname || ''}`.trim();
                  const contactEmail = contactProps.email || 'Sin email';
                  console.log(`      • ${contactName} (${contactEmail})`);
                } catch (contactError) {
                  console.log(`      • Contacto ${contactAssoc.id} (error obteniendo detalles)`);
                }
              }
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
    console.log(`- Total deals en 11P Agregado en Linkedin: ${deals.length}`);
    console.log(`- Deals procesados por extract-dealmakers: ${linkedinDeals.length}`);
    console.log(`- Deals con contactos asociados: ${dealsWithContacts}`);
    console.log(`- Deals sin contactos asociados: ${dealsWithoutContacts}`);
    console.log(`- Total contactos asociados: ${totalContactsAssociated}`);
    console.log(`- Estado: ${linkedinDeals.length === 0 ? '✅ LIMPIO' : '⚠️ HAY DEALS PROCESADOS'}`);

    if (linkedinDeals.length > 0) {
      const successRate = ((dealsWithContacts / linkedinDeals.length) * 100).toFixed(1);
      console.log(`- Tasa de éxito (deals con contactos): ${successRate}%`);
    }

  } catch (error) {
    console.error('❌ Error verificando deals:', error.message);

    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error(`Respuesta: ${JSON.stringify(error.response.data, null, 2)}`);
    }
  }
};

// Ejecutar si se llama directamente
if (require.main === module) {
  checkMovedDeals();
}

module.exports = { checkMovedDeals };
