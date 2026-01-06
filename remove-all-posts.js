#!/usr/bin/env node

require('dotenv').config();
const axios = require('axios');

// Configuración de HubSpot
const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN;
const HUBSPOT_BASE_URL = 'https://api.hubapi.com';

/**
 * Obtener todos los deals con formato "Post: ... - Post LinkedIn"
 */
async function getAllPostDeals() {
  console.log('🔍 Buscando todos los deals creados por linkedin-posts-apify (formato: "Post: ... - Post LinkedIn")...');

  try {
    let allDeals = [];
    let after = null;
    const limit = 100;

    // Primero buscar en todo el pipeline (sin stage específica)
    const filters = [
      {
        propertyName: 'pipeline',
        operator: 'EQ',
        value: '811215668' // Pipeline "Prospección" donde linkedin-posts-apify crea deals
      }
    ];

    do {
      const params = {
        limit: limit,
        properties: ['dealname', 'dealstage', 'pipeline', 'link_original_de_la_noticia', 'description'],
        filterGroups: [
          {
            filters: filters
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

      // Filtrar solo deals con formato "Post: ... - Post LinkedIn"
      const postDeals = deals.filter(deal => {
        const dealname = deal.properties.dealname || '';
        return dealname.startsWith('Post: ') && dealname.endsWith(' - Post LinkedIn');
      });

      allDeals = allDeals.concat(postDeals);

      after = response.data.paging?.next?.after;
      console.log(`📄 Página obtenida: ${deals.length} deals totales, ${postDeals.length} con formato Post`);

      // Delay para evitar rate limiting
      if (after) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

    } while (after);

    console.log(`✅ Total de deals encontrados: ${allDeals.length}`);
    return allDeals;

  } catch (error) {
    console.error('❌ Error obteniendo deals:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Borrar deals
 */
async function deleteDeals(dealsToDelete) {
  console.log(`\n🗑️  Iniciando eliminación de ${dealsToDelete.length} deals con formato Post...`);

  let deleted = 0;
  let errors = 0;

  for (const deal of dealsToDelete) {
    try {
      console.log(`🗑️  Eliminando: ${deal.properties.dealname} (ID: ${deal.id})`);

      await axios.delete(
        `${HUBSPOT_BASE_URL}/crm/v3/objects/deals/${deal.id}`,
        {
          headers: {
            'Authorization': `Bearer ${HUBSPOT_TOKEN}`
          }
        }
      );

      deleted++;
      console.log(`   ✅ Eliminado exitosamente`);

      // Delay entre eliminaciones para evitar rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (error) {
      console.error(`   ❌ Error eliminando deal ${deal.id}:`, error.response?.data?.message || error.message);
      errors++;
    }
  }

  console.log(`\n📊 Resumen de eliminación:`);
  console.log(`   ✅ Eliminados: ${deleted}`);
  console.log(`   ❌ Errores: ${errors}`);

  return { deleted, errors };
}

/**
 * Función principal
 */
async function main() {
  try {
    console.log('🚨 ATENCIÓN: Este script eliminará TODOS los deals con formato "Post: ... - Post LinkedIn"\n');
    console.log('🔍 Buscará en el pipeline "Prospección" (811215668) usado por linkedin-posts-apify\n');

    // 1. Obtener todos los deals con formato Post
    const postDeals = await getAllPostDeals();

    if (postDeals.length === 0) {
      console.log('✨ No se encontraron deals con formato Post para eliminar');
      return;
    }

    // Mostrar algunos ejemplos
    console.log('\n📋 Ejemplos de deals a eliminar:');
    const examples = postDeals.slice(0, 5);
    examples.forEach(deal => {
      console.log(`   🗑️  ${deal.properties.dealname} (ID: ${deal.id})`);
    });

    if (postDeals.length > 5) {
      console.log(`   ... y ${postDeals.length - 5} deals más`);
    }

    console.log(`\n⚠️  Se eliminarán ${postDeals.length} deals en total`);

    // 2. Confirmar antes de eliminar
    console.log('\n🚨 ¡ATENCIÓN! Esta acción:');
    console.log('   ❌ Eliminará TODOS los deals de linkedin-posts-apify');
    console.log('   ❌ No se puede deshacer');
    console.log('   ❌ Afectará a todos los posts creados por linkedin-posts-apify');

    const confirmed = process.argv[2] === '--confirm';

    if (!confirmed) {
      console.log('\n🛑 Eliminación cancelada. Usa --confirm para proceder');
      console.log('Ejemplo: npm run remove-all-posts -- --confirm');
      console.log('\n💡 Si solo quieres eliminar duplicados, usa: npm run remove-duplicates');
      return;
    }

    // 3. Eliminar todos los deals
    await deleteDeals(postDeals);

    console.log('\n🎉 Todos los deals con formato Post han sido eliminados exitosamente');

  } catch (error) {
    console.error('\n❌ Error fatal:', error.message);
    process.exit(1);
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  main();
}

module.exports = {
  getAllPostDeals,
  deleteDeals
};
