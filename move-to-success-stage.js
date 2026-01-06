require('dotenv').config();
const axios = require('axios');

const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN;
const HUBSPOT_BASE_URL = 'https://api.hubapi.com';

// IDs de los deals que se movieron incorrectamente a descartados pero deberían estar en éxito
const DEALS_TO_MOVE = [
  '53297214122', // Post: Pablo Lazzeri - Post LinkedIn
  '53298969980', // Post: Alejandro Campos - Post LinkedIn
  '53309151493', // Post: Leonardo Abranches - Post LinkedIn
  '53272542232'  // Post: Saul - Post LinkedIn
];

// Configuración del pipeline (igual que en extract-dealmakers.js)
const PIPELINE_CONFIG = {
  pipelineId: '654720623', // Pipeline: Proyectos
  targetStageId: '1259550373', // 11P Agregado en Linkedin (destino)
  discardedStageId: '963342713' // Perdido / Descartado
};

// Stage de destino correcto (11P Agregado en Linkedin)
const SUCCESS_STAGE_ID = PIPELINE_CONFIG.targetStageId;

/**
 * Mover un deal a un stage específico
 */
async function moveDealToStage(dealId, stageId) {
  try {
    console.log(`📤 Moviendo deal ${dealId} al stage ${stageId} (11P Agregado en Linkedin)...`);

    const response = await axios.patch(
      `${HUBSPOT_BASE_URL}/crm/v3/objects/deals/${dealId}`,
      {
        properties: {
          dealstage: stageId
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${HUBSPOT_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log(`✅ Deal ${dealId} movido exitosamente al stage ${stageId}`);
    return true;

  } catch (error) {
    console.error(`❌ Error moviendo deal ${dealId}:`, error.response?.data || error.message);
    return false;
  }
}

/**
 * Función principal
 */
async function main() {
  console.log('🚀 Iniciando corrección de deals movidos incorrectamente...\n');

  if (!HUBSPOT_TOKEN) {
    console.error('❌ HUBSPOT_TOKEN no configurado en .env');
    console.log('\n📝 Para configurar el token:');
    console.log('   1. Crear archivo .env en el directorio extract-dealmakers/');
    console.log('   2. Agregar: HUBSPOT_TOKEN=tu_token_real_de_hubspot');
    console.log('   3. Ejecutar: npm run move-to-success-stage');
    process.exit(1);
  }

  console.log('📋 DEALS QUE SE MOVIERON INCORRECTAMENTE A DESCARTADOS:');
  console.log('(Estos deals sí tuvieron éxito creando contactos y asociaciones)');
  DEALS_TO_MOVE.forEach((dealId, index) => {
    const names = [
      'Post: Pablo Lazzeri - Post LinkedIn',
      'Post: Alejandro Campos - Post LinkedIn',
      'Post: Leonardo Abranches - Post LinkedIn',
      'Post: Saul - Post LinkedIn'
    ];
    console.log(`   ${index + 1}. Deal ID: ${dealId} - ${names[index]}`);
  });

  console.log(`📋 Pipeline: ${PIPELINE_CONFIG.pipelineId} (Proyectos)`);
  console.log(`🎯 Stage de destino correcto: ${SUCCESS_STAGE_ID} (11P Agregado en Linkedin)`);
  console.log(`📊 Total de deals a corregir: ${DEALS_TO_MOVE.length}\n`);

  let successCount = 0;
  let errorCount = 0;

  for (const dealId of DEALS_TO_MOVE) {
    const success = await moveDealToStage(dealId, SUCCESS_STAGE_ID);

    if (success) {
      successCount++;
    } else {
      errorCount++;
    }

    // Pequeña pausa para evitar rate limits
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n📊 RESULTADO FINAL:');
  console.log(`✅ Exitosos: ${successCount}`);
  console.log(`❌ Errores: ${errorCount}`);
  console.log(`📋 Total procesados: ${DEALS_TO_MOVE.length}`);

  if (successCount === DEALS_TO_MOVE.length) {
    console.log('\n🎉 Todos los deals han sido movidos al stage correcto!');
    console.log('   Ahora están en "11P Agregado en Linkedin" donde debían estar.');
  } else {
    console.log(`\n⚠️  Se completó el proceso, pero ${errorCount} deals tuvieron errores.`);
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  main().catch(error => {
    console.error('Error fatal:', error);
    process.exit(1);
  });
}

module.exports = { main, moveDealToStage };
