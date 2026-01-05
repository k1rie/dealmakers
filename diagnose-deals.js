#!/usr/bin/env node

/**
 * Script de diagnóstico para deals
 */

require('dotenv').config();
const axios = require('axios');

const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN;
const HUBSPOT_BASE_URL = 'https://api.hubapi.com';

const PIPELINE_CONFIG = {
  pipelineId: '654720623',
  sourceStageId: '1169433784',
  targetStageId: '1259550373'
};

/**
 * Obtener estadísticas de deals
 */
async function diagnoseDeals() {
  console.log('🔍 DIAGNÓSTICO DE DEALS');
  console.log('='.repeat(80));

  try {
    // Obtener deals por stage
    const stages = [
      { id: PIPELINE_CONFIG.sourceStageId, name: '13P Posible Oportunidad' },
      { id: PIPELINE_CONFIG.targetStageId, name: '11P Agregado en Linkedin' }
    ];

    console.log('📊 DEALS POR STAGE:');
    console.log('-'.repeat(50));

    for (const stage of stages) {
      try {
        const response = await axios.post(
          `${HUBSPOT_BASE_URL}/crm/v3/objects/deals/search`,
          {
            filterGroups: [
              {
                filters: [
                  {
                    propertyName: 'dealstage',
                    operator: 'EQ',
                    value: stage.id
                  },
                  {
                    propertyName: 'pipeline',
                    operator: 'EQ',
                    value: PIPELINE_CONFIG.pipelineId
                  }
                ]
              }
            ],
            properties: ['dealname'],
            limit: 100
          },
          {
            headers: {
              'Authorization': `Bearer ${HUBSPOT_TOKEN}`,
              'Content-Type': 'application/json'
            }
          }
        );

        const count = response.data.total || 0;
        console.log(`${stage.name}: ${count} deals`);

      } catch (error) {
        console.log(`${stage.name}: Error - ${error.message}`);
      }
    }

    console.log('\n🎯 DEALS CON URLs DE LINKEDIN:');
    console.log('-'.repeat(50));

    // Obtener deals con URLs de LinkedIn
    const dealsResponse = await axios.post(
      `${HUBSPOT_BASE_URL}/crm/v3/objects/deals/search`,
      {
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
        properties: ['dealname', 'description', 'link_original_de_la_noticia'],
        limit: 20
      },
      {
        headers: {
          'Authorization': `Bearer ${HUBSPOT_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const deals = dealsResponse.data.results || [];
    let dealsWithLinkedIn = 0;

    deals.forEach((deal, i) => {
      const description = deal.properties?.description || '';
      const postLink = deal.properties?.link_original_de_la_noticia || '';

      const hasLinkedIn = description.toLowerCase().includes('linkedin.com') ||
                         postLink.toLowerCase().includes('linkedin.com');

      if (hasLinkedIn) {
        dealsWithLinkedIn++;
        console.log(`${dealsWithLinkedIn}. ${deal.properties?.dealname} (ID: ${deal.id})`);

        if (postLink.includes('linkedin.com')) {
          console.log(`   🔗 Link del post: ${postLink}`);
        }

        // Mostrar líneas con LinkedIn
        const lines = description.split('\n');
        const linkedinLines = lines.filter(line => line.toLowerCase().includes('linkedin'));
        if (linkedinLines.length > 0) {
          console.log('   📝 Líneas con LinkedIn:');
          linkedinLines.forEach(line => {
            console.log(`      "${line.trim()}"`);
          });
        }
        console.log('');
      }
    });

    console.log('\n📊 RESUMEN:');
    console.log('-'.repeat(30));
    console.log(`Total deals en 13P: ${deals.length}`);
    console.log(`Deals con LinkedIn: ${dealsWithLinkedIn}`);
    console.log(`Deals sin LinkedIn: ${deals.length - dealsWithLinkedIn}`);

  } catch (error) {
    console.error('❌ Error en diagnóstico:', error.message);
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  diagnoseDeals().catch(console.error);
}

module.exports = { diagnoseDeals };
