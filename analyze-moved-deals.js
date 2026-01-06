#!/usr/bin/env node

const fs = require('fs');

function analyzeMovedDeals(logPath) {
  console.log('🔍 Analizando log para ver qué deals fueron movidos...\n');

  if (!fs.existsSync(logPath)) {
    console.log('❌ Archivo no encontrado:', logPath);
    return;
  }

  const logContent = fs.readFileSync(logPath, 'utf-8');
  const lines = logContent.split('\n');

  let movedDeals = [];
  let movedWithPost = 0;
  let movedWithoutPost = 0;

  console.log('📋 Buscando movimientos en el log...\n');

  for (const line of lines) {
    // Buscar líneas de movimiento exitoso
    const match = line.match(/📤 Moviendo: (\d+): (.+?) \(ID: (\d+)\)/);
    if (match) {
      const dealId = match[1];
      const dealName = match[2];

      movedDeals.push({
        id: dealId,
        name: dealName,
        hasPostPrefix: dealName.startsWith('Post:')
      });

      if (dealName.startsWith('Post:')) {
        movedWithPost++;
      } else {
        movedWithoutPost++;
        console.log(`❌ MOVIDO POR ERROR: ${dealName} (ID: ${dealId})`);
      }
    }
  }

  console.log('\n📊 RESULTADO DEL ANÁLISIS:');
  console.log('='.repeat(50));
  console.log(`📦 Total de deals movidos: ${movedDeals.length}`);
  console.log(`✅ Con prefijo "Post:": ${movedWithPost}`);
  console.log(`❌ SIN prefijo "Post:" (movidos por error): ${movedWithoutPost}`);

  if (movedWithoutPost > 0) {
    console.log('\n🚨 PROBLEMA DETECTADO:');
    console.log(`   Se movieron ${movedWithoutPost} deals que NO deberían haber sido movidos`);
    console.log('   Estos deals no tienen "Post:" en el nombre');
    console.log('   Deberían ser devueltos al stage original');

    console.log('\n🔧 SOLUCIÓN:');
    console.log('   Ejecutar: npm run return-moved-deals -- --confirm');

  } else {
    console.log('\n✅ TODO BIEN:');
    console.log('   Todos los deals movidos tienen "Post:" en el nombre');
    console.log('   No hay movimientos por error');
  }

  // Análisis adicional: tipos de deals movidos por error
  if (movedWithoutPost > 0) {
    console.log('\n📋 Tipos de deals movidos por error:');

    const errorDeals = movedDeals.filter(deal => !deal.hasPostPrefix);
    const categories = {};

    errorDeals.forEach(deal => {
      // Clasificar por tipo
      const name = deal.name.toLowerCase();
      let category = 'Otros';

      if (name.includes('medicamento') || name.includes('medicina') || name.includes('farmaco')) {
        category = 'Medicamentos';
      } else if (name.includes('producto') || name.includes('servicio')) {
        category = 'Productos/Servicios';
      } else if (name.includes('cliente') || name.includes('prospecto')) {
        category = 'Clientes/Prospectos';
      }

      categories[category] = (categories[category] || 0) + 1;
    });

    Object.entries(categories).forEach(([category, count]) => {
      console.log(`   • ${category}: ${count} deals`);
    });
  }

  return {
    totalMoved: movedDeals.length,
    withPost: movedWithPost,
    withoutPost: movedWithoutPost,
    errorDeals: movedDeals.filter(deal => !deal.hasPostPrefix)
  };
}

const logPath = process.argv[2] || '/Users/diegoguerrero/Downloads/logs.1767675280928.log';
const result = analyzeMovedDeals(logPath);

// Resumen final
console.log('\n🎯 CONCLUSIÓN:');
if (result.withoutPost > 0) {
  console.log(`❌ Se movieron ${result.withoutPost} deals por error que deben ser corregidos`);
} else {
  console.log('✅ No se movieron deals por error - todo está correcto');
}
