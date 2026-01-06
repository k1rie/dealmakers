require('dotenv').config();
const axios = require('axios');

const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN;
const HUBSPOT_BASE_URL = 'https://api.hubapi.com';

// Deal que se movió incorrectamente a descartados pero se actualizó un contacto
const DEAL_TO_FIX = '53271289364'; // Post: María Fernanda - Post LinkedIn

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
  console.log('🔧 Corrigiendo deal movido incorrectamente por actualización de contacto...\n');

  if (!HUBSPOT_TOKEN) {
    console.error('❌ HUBSPOT_TOKEN no configurado en .env');
    console.log('\n📝 Para configurar el token:');
    console.log('   1. Crear archivo .env en el directorio extract-dealmakers/');
    console.log('   2. Agregar: HUBSPOT_TOKEN=tu_token_real_de_hubspot');
    console.log('   3. Ejecutar: npm run fix-updated-contact-deal');
    process.exit(1);
  }

  console.log('📋 Deal que se movió incorrectamente a descartados:');
  console.log(`   • Deal ID: ${DEAL_TO_FIX}`);
  console.log('   • Nombre: Post: María Fernanda - Post LinkedIn');
  console.log('   • Motivo: Se actualizó un contacto existente (ID: 190672155576)');
  console.log('   • Esto debería considerarse ÉXITO, no fracaso');

  console.log(`\n🎯 Stage correcto: ${CORRECT_STAGE_ID} (11P Agregado en Linkedin)`);
  console.log('\n🔄 Moviendo deal al stage correcto...\n');

  const success = await moveDealToStage(DEAL_TO_FIX, CORRECT_STAGE_ID);

  if (success) {
    console.log('\n🎉 ¡Corrección exitosa!');
    console.log('   El deal ahora está en el stage correcto.');
    console.log('   En futuras ejecuciones, los deals con contactos actualizados');
    console.log('   irán automáticamente al stage correcto.');
  } else {
    console.log('\n❌ Error en la corrección. Revisa los logs de arriba.');
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
