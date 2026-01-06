require('dotenv').config();
const axios = require('axios');

const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN;
const HUBSPOT_BASE_URL = 'https://api.hubapi.com';

// Deals que se movieron incorrectamente a descartados en la última ejecución
const DEALS_TO_FIX = [
  '53179084044', // Post: Eduardo González García - Post LinkedIn
  '53312920088', // Post: Isidro - Post LinkedIn
  '53304057610', // Post: Fernando - Post LinkedIn
  '53304575526', // Post: Martha - Post LinkedIn
  '53304744475'  // Post: Karla - Post LinkedIn
];

// Stage correcto (11P Agregado en Linkedin)
const CORRECT_STAGE_ID = '1259550373';

/**
 * Mover un deal a un stage específico
 */
async function moveDealToStage(dealId, stageId) {
  try {
    console.log(`📤 Moviendo deal ${dealId} al stage correcto ${stageId}...`);

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

    console.log(`✅ Deal ${dealId} movido correctamente`);
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
  console.log('🔧 Corrigiendo deals movidos incorrectamente a descartados...\n');

  if (!HUBSPOT_TOKEN) {
    console.error('❌ HUBSPOT_TOKEN no configurado en .env');
    console.log('\n📝 Para configurar el token:');
    console.log('   1. Crear archivo .env en el directorio extract-dealmakers/');
    console.log('   2. Agregar: HUBSPOT_TOKEN=tu_token_real_de_hubspot');
    console.log('   3. Ejecutar: npm run fix-recent-discarded');
    process.exit(1);
  }

  console.log('📋 Deals que se movieron incorrectamente a descartados:');
  DEALS_TO_FIX.forEach((dealId, index) => {
    const names = [
      'Post: Eduardo González García - Post LinkedIn',
      'Post: Isidro - Post LinkedIn',
      'Post: Fernando - Post LinkedIn',
      'Post: Martha - Post LinkedIn',
      'Post: Karla - Post LinkedIn'
    ];
    console.log(`   ${index + 1}. Deal ID: ${dealId} - ${names[index]}`);
  });

  console.log(`\n🎯 Stage correcto: ${CORRECT_STAGE_ID} (11P Agregado en Linkedin)`);
  console.log(`📊 Total de deals a corregir: ${DEALS_TO_FIX.length}\n`);

  let successCount = 0;
  let errorCount = 0;

  for (const dealId of DEALS_TO_FIX) {
    const success = await moveDealToStage(dealId, CORRECT_STAGE_ID);

    if (success) {
      successCount++;
    } else {
      errorCount++;
    }

    // Pequeña pausa para evitar rate limits
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n📊 RESULTADO DE LA CORRECCIÓN:');
  console.log(`✅ Exitosos: ${successCount}`);
  console.log(`❌ Errores: ${errorCount}`);
  console.log(`📋 Total procesados: ${DEALS_TO_FIX.length}`);

  if (successCount === DEALS_TO_FIX.length) {
    console.log('\n🎉 Todos los deals han sido movidos al stage correcto!');
    console.log('   Ahora están en "11P Agregado en Linkedin" donde debían estar.');
  } else {
    console.log(`\n⚠️  Se completó el proceso, pero ${errorCount} deals tuvieron errores.`);
  }

  console.log('\n💡 NOTA: La lógica del script principal también fue corregida.');
  console.log('   En futuras ejecuciones, los deals irán automáticamente al stage correcto.');
}

// Ejecutar si se llama directamente
if (require.main === module) {
  main().catch(error => {
    console.error('Error fatal:', error);
    process.exit(1);
  });
}

module.exports = { main, moveDealToStage };
