#!/usr/bin/env node

require('dotenv').config();
const axios = require('axios');

const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN || process.argv[2];
const HUBSPOT_BASE_URL = 'https://api.hubapi.com';

const PIPELINE_CONFIG = {
  pipelineId: '654720623',
  targetStageId: '1259550373'  // 11P Agregado en Linkedin
};

async function checkStage11P() {
  console.log('🔍 Verificando deals en stage 11P Agregado en Linkedin...\n');

  if (!HUBSPOT_TOKEN) {
    console.log('❌ Error: HUBSPOT_TOKEN no encontrado');
    console.log('Uso: node check-stage-11p.js [TU_TOKEN_DE_HUBSPOT_AQUI]');
    console.log('O crear archivo .env con: HUBSPOT_TOKEN=tu_token_aqui');
    return;
  }

  try {
    // Contar todos los deals en 11P
    const allResponse = await axios.post(
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
        properties: ['dealname'],
        limit: 1 // Solo para contar
      },
      {
        headers: {
          'Authorization': `Bearer ${HUBSPOT_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const totalDeals = allResponse.data.total || 0;
    console.log(`📊 Total de deals en 11P: ${totalDeals}\n`);

    if (totalDeals === 0) {
      console.log('✅ Stage 11P está vacío - no hay deals movidos');
      return;
    }

    // Obtener algunos ejemplos
    const examplesResponse = await axios.post(
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
        properties: ['dealname'],
        limit: 10
      },
      {
        headers: {
          'Authorization': `Bearer ${HUBSPOT_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const deals = examplesResponse.data.results || [];

    console.log('📋 Ejemplos de deals en 11P:');
    deals.forEach(deal => {
      const name = deal.properties?.dealname || 'Sin nombre';
      const hasPostPrefix = name.startsWith('Post:');
      console.log(`   ${hasPostPrefix ? '✅' : '❌'} ${name} (ID: ${deal.id})`);
    });

    // Contar deals con y sin Post:
    let withPost = 0;
    let withoutPost = 0;

    // Para contar todos, necesitamos paginar
    let allDeals = [];
    let after = null;

    do {
      const params = {
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
        properties: ['dealname'],
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

      batch.forEach(deal => {
        const name = deal.properties?.dealname || '';
        if (name.startsWith('Post:')) {
          withPost++;
        } else {
          withoutPost++;
        }
      });

      after = response.data.paging?.next?.after;

      if (after) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }

    } while (after);

    console.log(`\n📊 Resumen:`);
    console.log(`   ✅ Deals con "Post:": ${withPost}`);
    console.log(`   ❌ Deals sin "Post:": ${withoutPost}`);
    console.log(`   📊 Total: ${allDeals.length}`);

    if (withoutPost > 0) {
      console.log(`\n⚠️  HAY ${withoutPost} DEALS QUE PUEDEN SER DEVUELTOS!`);
      console.log('Ejecuta: npm run return-moved-deals -- --confirm');
    } else {
      console.log('\n✅ Todos los deals en 11P tienen "Post:" - no hay errores de movimiento');
    }

  } catch (error) {
    console.error('❌ Error:', error.response?.data?.message || error.message);
  }
}

checkStage11P();
