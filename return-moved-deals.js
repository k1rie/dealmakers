#!/usr/bin/env node

/**
 * Script para devolver deals que NO TIENEN "Post:" al stage original (13P Posible Oportunidad)
 * Solo devuelve deals que fueron movidos por error (medicamentos, etc.)
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
 * Obtener deals que fueron movidos por error (sin prefijo "Post:")
 */
async function getDealsToReturn() {
  console.log('🔍 Buscando deals que fueron movidos por error...');
  console.log('   (Deals en 11P Agregado en Linkedin que NO tienen "Post:" en el nombre)');
  console.log('='.repeat(80));

  try {
    let allDeals = [];
    let after = null;
    const limit = 100;

    do {
      const params = {
        limit: limit,
        properties: ['dealname', 'dealstage', 'pipeline'],
        filterGroups: [
          {
            filters: [
              {
                propertyName: 'dealstage',
                operator: 'EQ',
                value: PIPELINE_CONFIG.targetStageId // 11P Agregado en Linkedin
              },
              {
                propertyName: 'pipeline',
                operator: 'EQ',
                value: PIPELINE_CONFIG.pipelineId
              },
              {
                propertyName: 'dealname',
                operator: 'NOT_CONTAINS_TOKEN',
                value: 'Post:'
              }
            ]
          }
        ]
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

      const deals = response.data.results || [];
      allDeals = allDeals.concat(deals);

      after = response.data.paging?.next?.after;

      if (after) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

    } while (after);

    return allDeals;

  } catch (error) {
    console.error('❌ Error obteniendo deals:', error.response?.data?.message || error.message);
    return [];
  }
}

/**
 * Devolver deals al stage original
 */
async function returnMovedDeals() {
  console.log('🔄 DEVOLVIENDO DEALS AL STAGE 13P POSIBLE OPORTUNIDAD');
  console.log('   Solo deals que NO tienen "Post:" en el nombre');
  console.log('='.repeat(80));

  try {
    // Obtener deals que deben ser devueltos
    const deals = await getDealsToReturn();

    if (deals.length === 0) {
      console.log('✅ No hay deals que devolver - todos los deals en 11P tienen "Post:"');
      console.log('   Esto significa que no hubo movimientos por error.');
      return;
    }

    console.log(`📦 Deals a devolver: ${deals.length}`);
    console.log(`🎯 Origen actual: 11P Agregado en Linkedin (${PIPELINE_CONFIG.targetStageId})`);
    console.log(`📍 Destino: 13P Posible Oportunidad (${PIPELINE_CONFIG.sourceStageId})`);
    console.log('');

    console.log('📋 Lista de deals que serán devueltos:');
    deals.forEach(deal => {
      console.log(`   • ${deal.properties?.dealname || `Deal ${deal.id}`}`);
    });
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
