#!/usr/bin/env node

/**
 * Script para listar pipelines y stages de HubSpot
 */

require('dotenv').config();
const axios = require('axios');

const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN;
const HUBSPOT_BASE_URL = 'https://api.hubapi.com';

/**
 * Listar pipelines y stages
 */
async function listPipelines() {
  console.log('📋 PIPELINES Y STAGES DE HUBSPOT');
  console.log('='.repeat(80));

  const objectTypes = ['deals', 'contacts', 'companies'];

  for (const objectType of objectTypes) {
    try {
      console.log(`\n🏢 PIPELINES PARA ${objectType.toUpperCase()}:`);
      console.log('-'.repeat(50));

      const response = await axios.get(
        `${HUBSPOT_BASE_URL}/crm/v3/pipelines/${objectType}`,
        {
          headers: {
            'Authorization': `Bearer ${HUBSPOT_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const pipelines = response.data.results || [];

      if (pipelines.length === 0) {
        console.log(`No hay pipelines para ${objectType}`);
        continue;
      }

      pipelines.forEach((pipeline, i) => {
        console.log(`${i + 1}. ${pipeline.label} (ID: ${pipeline.id})`);

        if (pipeline.stages && pipeline.stages.length > 0) {
          console.log('   Stages:');
          pipeline.stages.forEach((stage, j) => {
            console.log(`      ${j + 1}. ${stage.label} (ID: ${stage.id})`);
          });
        }
        console.log('');
      });

    } catch (error) {
      if (error.response && error.response.status === 404) {
        console.log(`❌ ${objectType} no tiene pipelines configuradas`);
      } else {
        console.log(`❌ Error obteniendo pipelines para ${objectType}: ${error.message}`);
      }
    }
  }

  // Información específica sobre la configuración actual
  console.log('\n🎯 CONFIGURACIÓN ACTUAL DEL SCRIPT:');
  console.log('-'.repeat(50));
  console.log('Pipeline ID: 654720623 (Proyectos)');
  console.log('Stage Origen: 1169433784 (13P Posible Oportunidad)');
  console.log('Stage Destino: 1259550373 (11P Agregado en Linkedin)');
  console.log('Stage Rechazado: 963342713 (Perdido / Descartado)');
}

// Ejecutar si se llama directamente
if (require.main === module) {
  listPipelines().catch(console.error);
}

module.exports = { listPipelines };
