#!/usr/bin/env node

require('dotenv').config();
const axios = require('axios');

const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN;
const HUBSPOT_BASE_URL = 'https://api.hubapi.com';

// URL del post a buscar
const POST_ID = '7402773489595686912';
const POST_URL = 'https://www.linkedin.com/posts/pamela-meneses-silva-67710136_kindergarten-box-activity-7402773489595686912-RVzb';

async function checkPostInHubSpot() {
  console.log('🔍 Verificando si existe deal con el post específico en HubSpot...\n');
  console.log(`Post ID: ${POST_ID}`);
  console.log(`URL completa: ${POST_URL}\n`);

  if (!HUBSPOT_TOKEN) {
    console.log('❌ Error: HUBSPOT_TOKEN no encontrado');
    console.log('Asegúrate de tener el archivo .env con HUBSPOT_TOKEN=tutoken');
    return;
  }

  try {
    console.log('1️⃣ Buscando deals que contengan el ID del post...\n');

    // Buscar por el ID del post
    const response = await axios.post(
      `${HUBSPOT_BASE_URL}/crm/v3/objects/deals/search`,
      {
        filterGroups: [
          {
            filters: [
              {
                propertyName: 'link_original_de_la_noticia',
                operator: 'CONTAINS_TOKEN',
                value: POST_ID
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
          'createdate'
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

    const deals = response.data.results || [];

    if (deals.length === 0) {
      console.log('❌ No se encontraron deals con ese post ID\n');

      // Buscar deals que contengan "linkedin.com" para ver si hay deals de posts
      console.log('2️⃣ Buscando deals que contengan URLs de LinkedIn (muestra)...\n');

      const linkedinResponse = await axios.post(
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

      const linkedinDeals = linkedinResponse.data.results || [];
      console.log(`Encontrados ${linkedinDeals.length} deals con URLs de LinkedIn:`);

      linkedinDeals.forEach(deal => {
        console.log(`   • ${deal.properties.dealname}`);
        console.log(`     URL: ${deal.properties.link_original_de_la_noticia}`);
      });

    } else {
      console.log(`✅ ¡SÍ ENCONTRADO! ${deals.length} deal(s) con el post:\n`);

      for (const deal of deals) {
        console.log('📋 DETALLES DEL DEAL:');
        console.log(`   • Nombre: ${deal.properties.dealname}`);
        console.log(`   • ID: ${deal.id}`);
        console.log(`   • Stage: ${deal.properties.dealstage}`);
        console.log(`   • URL: ${deal.properties.link_original_de_la_noticia}`);
        console.log(`   • Creado: ${new Date(parseInt(deal.properties.createdate)).toLocaleString()}`);

        // Buscar contactos asociados
        console.log('\n👥 Verificando contactos asociados...');

        try {
          const contactsResponse = await axios.get(
            `${HUBSPOT_BASE_URL}/crm/v3/objects/deals/${deal.id}/associations/contacts`,
            {
              headers: {
                'Authorization': `Bearer ${HUBSPOT_TOKEN}`
              }
            }
          );

          const contacts = contactsResponse.data.results || [];

          if (contacts.length === 0) {
            console.log('   ❌ No hay contactos asociados');
          } else {
            console.log(`   ✅ ${contacts.length} contacto(s) asociado(s):`);

            // Obtener detalles de cada contacto
            for (const contact of contacts) {
              try {
                const contactDetails = await axios.get(
                  `${HUBSPOT_BASE_URL}/crm/v3/objects/contacts/${contact.id}`,
                  {
                    headers: {
                      'Authorization': `Bearer ${HUBSPOT_TOKEN}`
                    },
                    params: {
                      properties: ['firstname', 'lastname', 'email', 'linkedin_profile_link']
                    }
                  }
                );

                const props = contactDetails.data.properties;
                console.log(`      • ${props.firstname || ''} ${props.lastname || ''}`.trim());
                console.log(`        Email: ${props.email || 'N/A'}`);
                console.log(`        LinkedIn: ${props.linkedin_profile_link || 'N/A'}`);

              } catch (contactError) {
                console.log(`      • Contacto ID: ${contact.id} (error obteniendo detalles)`);
              }
            }
          }

        } catch (assocError) {
          console.log(`   ❌ Error obteniendo asociaciones: ${assocError.message}`);
        }

        console.log('\n' + '='.repeat(60) + '\n');
      }
    }

  } catch (error) {
    console.error('❌ Error en la búsqueda:', error.response?.data?.message || error.message);
  }
}

checkPostInHubSpot();
