require('dotenv').config();
const axios = require('axios');

const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN;
const HUBSPOT_BASE_URL = 'https://api.hubapi.com';

// IDs de los deals que se movieron a descartados según el último log
const DEALS_TO_RETURN = [
  '53297214122', // Post: Pablo Lazzeri - Post LinkedIn
  '53298969980', // Post: Alejandro Campos - Post LinkedIn
  '53309151493'  // Post: Leonardo Abranches - Post LinkedIn
];

// Stage de destino (volver al stage de origen)
const TARGET_STAGE_ID = '1169433784'; // 13P Posible Oportunidad

/**
 * Mover un deal a un stage específico
 */
async function moveDealToStage(dealId, stageId) {
  try {
    console.log(`📤 Moviendo deal ${dealId} al stage ${stageId}...`);

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
  console.log('🚀 Iniciando retorno de deals descartados...\n');

  if (!HUBSPOT_TOKEN) {
    console.error('❌ HUBSPOT_TOKEN no configurado en .env');
    console.log('\n📝 Para configurar el token:');
    console.log('   1. Crear archivo .env en el directorio extract-dealmakers/');
    console.log('   2. Agregar: HUBSPOT_TOKEN=tu_token_real_de_hubspot');
    console.log('   3. Ejecutar: npm run return-discarded-deals');
    process.exit(1);
  }

  console.log('📋 DEALS QUE SE VAN A RETORNAR (del último log):');
  DEALS_TO_RETURN.forEach((dealId, index) => {
    const names = [
      'Post: Pablo Lazzeri - Post LinkedIn',
      'Post: Alejandro Campos - Post LinkedIn',
      'Post: Leonardo Abranches - Post LinkedIn'
    ];
    console.log(`   ${index + 1}. Deal ID: ${dealId} - ${names[index]}`);
  });

  console.log(`\n🎯 Stage de destino: ${TARGET_STAGE_ID} (13P Posible Oportunidad)`);
  console.log(`📊 Total de deals a retornar: ${DEALS_TO_RETURN.length}\n`);

  let successCount = 0;
  let errorCount = 0;

  for (const dealId of DEALS_TO_RETURN) {
    const success = await moveDealToStage(dealId, TARGET_STAGE_ID);

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
  console.log(`📋 Total procesados: ${DEALS_TO_RETURN.length}`);

  if (successCount === DEALS_TO_RETURN.length) {
    console.log('\n🎉 Todos los deals descartados han sido retornados exitosamente!');
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
