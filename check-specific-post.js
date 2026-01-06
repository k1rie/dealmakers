#!/usr/bin/env node

require('dotenv').config();
const axios = require('axios');

const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN;
const HUBSPOT_BASE_URL = 'https://api.hubapi.com';

// URL del post a buscar
const LINKEDIN_POST_URL = 'https://www.linkedin.com/posts/activity-7364687879517683713-voWB';

async function searchDealByPostUrl() {
  console.log('🔍 Buscando deals que contengan la URL del post...\n');
  console.log(`URL a buscar: ${LINKEDIN_POST_URL}\n`);

  if (!HUBSPOT_TOKEN) {
    console.log('❌ Error: HUBSPOT_TOKEN no encontrado en variables de entorno');
    return;
  }

  try {
    // Buscar deals que contengan la URL en cualquier propiedad
    const searchResponse = await axios.post(
      `${HUBSPOT_BASE_URL}/crm/v3/objects/deals/search`,
      {
        filterGroups: [
          {
            filters: [
              {
                propertyName: 'link_original_de_la_noticia',
                operator: 'CONTAINS_TOKEN',
                value: '7364687879517683713'
              }
            ]
          }
        ],
        properties: [
          'dealname',
          'dealstage',
          'pipeline',
          'link_original_de_la_noticia',
          'description',
          'createdate',
          'hs_lastmodifieddate'
        ],
        limit: 10
      },
      {
        headers: {
          'Authorization': `Bearer ${HUBSPOT_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const deals = searchResponse.data.results || [];

    if (deals.length === 0) {
      console.log('❌ No se encontraron deals con esa URL de post');
      return;
    }

    console.log(`✅ Encontrados ${deals.length} deal(s) con la URL del post:\n`);

    for (const deal of deals) {
      console.log('📋 Información del deal:');
      console.log(`   • Nombre: ${deal.properties.dealname}`);
      console.log(`   • ID: ${deal.id}`);
      console.log(`   • Stage: ${deal.properties.dealstage}`);
      console.log(`   • Pipeline: ${deal.properties.pipeline}`);
      console.log(`   • URL del post: ${deal.properties.link_original_de_la_noticia || 'No disponible'}`);
      console.log(`   • Creado: ${new Date(parseInt(deal.properties.createdate)).toLocaleString()}`);
      console.log(`   • Modificado: ${new Date(parseInt(deal.properties.hs_lastmodifieddate)).toLocaleString()}`);

      // Buscar contactos asociados a este deal
      console.log('\n👥 Buscando contactos asociados...');

      try {
        const associationsResponse = await axios.get(
          `${HUBSPOT_BASE_URL}/crm/v3/objects/deals/${deal.id}/associations/contacts`,
          {
            headers: {
              'Authorization': `Bearer ${HUBSPOT_TOKEN}`
            }
          }
        );

        const contacts = associationsResponse.data.results || [];

        if (contacts.length === 0) {
          console.log('   ❌ No hay contactos asociados a este deal');
        } else {
          console.log(`   ✅ ${contacts.length} contacto(s) asociado(s):`);
          for (const contact of contacts) {
            console.log(`      • ID: ${contact.id}`);
            console.log(`      • Nombre: ${contact.properties?.firstname || 'N/A'} ${contact.properties?.lastname || ''}`.trim());
            console.log(`      • Email: ${contact.properties?.email || 'N/A'}`);
          }
        }

      } catch (error) {
        console.log(`   ❌ Error obteniendo asociaciones: ${error.response?.data?.message || error.message}`);
      }

      console.log('\n' + '='.repeat(50) + '\n');
    }

  } catch (error) {
    console.error('❌ Error en la búsqueda:', error.response?.data?.message || error.message);

    // Si la búsqueda específica falla, intentar búsqueda más amplia
    console.log('\n🔄 Intentando búsqueda más amplia...');

    try {
      const broadSearch = await axios.post(
        `${HUBSPOT_BASE_URL}/crm/v3/objects/deals/search`,
        {
          filterGroups: [
            {
              filters: [
                {
                  propertyName: 'link_original_de_la_noticia',
                  operator: 'CONTAINS_TOKEN',
                  value: 'linkedin.com'
                }
              ]
            }
          ],
          properties: ['dealname', 'link_original_de_la_noticia'],
          limit: 5
        },
        {
          headers: {
            'Authorization': `Bearer ${HUBSPOT_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const sampleDeals = broadSearch.data.results || [];
      console.log(`\n📊 Muestra de ${sampleDeals.length} deals con URLs de LinkedIn:`);

      sampleDeals.forEach(deal => {
        const url = deal.properties.link_original_de_la_noticia || '';
        const hasTargetId = url.includes('7364687879517683713');
        console.log(`   ${hasTargetId ? '🎯' : '📝'} ${deal.properties.dealname}`);
        console.log(`      URL: ${url}`);
      });

    } catch (broadError) {
      console.error('❌ Error en búsqueda amplia:', broadError.message);
    }
  }
}

searchDealByPostUrl();
