#!/usr/bin/env node

/**
 * Script para devolver deals al stage original (13P Posible Oportunidad)
 */

require('dotenv').config();
const axios = require('axios');

const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN;
const HUBSPOT_BASE_URL = 'https://api.hubapi.com';

const PIPELINE_CONFIG = {
  pipelineId: '654720623',
  sourceStageId: '1169433784', // 13P Posible Oportunidad
  targetStageId: '1259550373'  // 11P Agregado en Linkedin
};

/**
 * Devolver deals al stage original
 */
async function returnMovedDeals() {
  console.log('🔄 DEVOLVIENDO DEALS AL STAGE 13P POSIBLE OPORTUNIDAD');
  console.log('='.repeat(80));

  try {
    // Obtener deals en el stage destino (11P)
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

    const deals = response.data.results || [];

    if (deals.length === 0) {
      console.log('ℹ️  No hay deals en el stage 11P para devolver');
      return;
    }

    console.log(`📦 Deals a devolver: ${deals.length}`);
    console.log(`🎯 Origen actual: 11P Agregado en Linkedin (${PIPELINE_CONFIG.targetStageId})`);
    console.log(`📍 Destino: 13P Posible Oportunidad (${PIPELINE_CONFIG.sourceStageId})`);
    console.log('');

    let returned = 0;
    let errors = 0;

    // Procesar en lotes de 10 para evitar rate limits
    const batchSize = 10;
    for (let i = 0; i < deals.length; i += batchSize) {
      const batch = deals.slice(i, i + batchSize);
      console.log(`📦 Procesando lote ${Math.floor(i/batchSize) + 1}/${Math.ceil(deals.length/batchSize)} (${batch.length} deals)`);

      for (const deal of batch) {
        try {
          console.log(`   🔄 Devolviendo deal: ${deal.properties?.dealname || `Deal ${deal.id}`}`);

          await axios.patch(
            `${HUBSPOT_BASE_URL}/crm/v3/objects/deals/${deal.id}`,
            {
              properties: {
                dealstage: PIPELINE_CONFIG.sourceStageId
              }
            },
            {
              headers: {
                'Authorization': `Bearer ${HUBSPOT_TOKEN}`,
                'Content-Type': 'application/json'
              }
            }
          );

          returned++;
          console.log(`      ✅ Devuelto a 13P Posible Oportunidad`);

        } catch (error) {
          console.error(`      ❌ Error devolviendo deal ${deal.id}: ${error.message}`);
          errors++;
        }
      }

      // Pequeña pausa entre lotes
      if (i + batchSize < deals.length) {
        console.log('   ⏳ Esperando 2 segundos antes del siguiente lote...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    console.log('\n📊 RESULTADO FINAL');
    console.log('='.repeat(50));
    console.log(`✅ Deals devueltos: ${returned}`);
    console.log(`❌ Errores: ${errors}`);
    console.log(`📍 Todos los deals están ahora en 13P Posible Oportunidad`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  returnMovedDeals().catch(console.error);
}

module.exports = { returnMovedDeals };
