const fs = require('fs').promises;
const path = require('path');

// Directorio donde buscar logs
const LOGS_DIR = path.join(__dirname, 'logs');

/**
 * Buscar archivos de log
 */
async function findLogFiles() {
  try {
    const files = await fs.readdir(LOGS_DIR);
    return files
      .filter(file => file.endsWith('.log'))
      .sort((a, b) => b.localeCompare(a)); // Más recientes primero
  } catch (error) {
    console.error('Error leyendo directorio de logs:', error.message);
    return [];
  }
}

/**
 * Analizar un archivo de log para contar deals movidos a descartados
 */
async function analyzeLogFile(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const lines = content.split('\n');

    let discardedMoves = 0;
    const dealIds = new Set();

    for (const line of lines) {
      // Buscar líneas que indiquen movimiento a descartados
      if (line.includes('Moviendo a descartados:') && line.includes('Post LinkedIn')) {
        discardedMoves++;
        // Extraer el ID del deal
        const match = line.match(/Moviendo a descartados: (\d+)/);
        if (match) {
          dealIds.add(match[1]);
        }
      }
    }

    return {
      file: path.basename(filePath),
      discardedMoves,
      uniqueDeals: dealIds.size,
      dealIds: Array.from(dealIds)
    };

  } catch (error) {
    console.error(`Error analizando ${filePath}:`, error.message);
    return null;
  }
}

/**
 * Función principal
 */
async function main() {
  console.log('📊 Estimación de deals de posts en descartados (basado en logs)\n');

  const logFiles = await findLogFiles();

  if (logFiles.length === 0) {
    console.log('❌ No se encontraron archivos de log');
    return;
  }

  console.log(`📁 Encontrados ${logFiles.length} archivos de log\n`);

  let totalDiscardedMoves = 0;
  let totalUniqueDeals = 0;
  const allDealIds = new Set();

  for (const logFile of logFiles.slice(0, 5)) { // Analizar los 5 logs más recientes
    const filePath = path.join(LOGS_DIR, logFile);
    const analysis = await analyzeLogFile(filePath);

    if (analysis) {
      console.log(`📄 ${analysis.file}:`);
      console.log(`   📤 Movimientos a descartados: ${analysis.discardedMoves}`);
      console.log(`   🎯 Deals únicos: ${analysis.uniqueDeals}`);

      if (analysis.dealIds.length > 0) {
        console.log(`   📋 IDs: ${analysis.dealIds.join(', ')}`);
      }
      console.log('');

      totalDiscardedMoves += analysis.discardedMoves;
      totalUniqueDeals += analysis.uniqueDeals;
      analysis.dealIds.forEach(id => allDealIds.add(id));
    }
  }

  console.log('📊 RESUMEN TOTAL:');
  console.log(`📤 Total de movimientos a descartados: ${totalDiscardedMoves}`);
  console.log(`🎯 Total de deals únicos en descartados: ${Array.from(allDealIds).length}`);

  if (Array.from(allDealIds).length > 0) {
    console.log('\n📋 Lista completa de deals en descartados:');
    Array.from(allDealIds).sort().forEach(id => {
      console.log(`   • ${id}`);
    });
  }

  console.log('\n⚠️  NOTA: Esta es una estimación basada en logs.');
  console.log('   Para el conteo exacto actual, ejecutar: npm run count-discarded-posts');
  console.log('   (Requiere configurar HUBSPOT_TOKEN en .env)');
}

// Ejecutar si se llama directamente
if (require.main === module) {
  main().catch(error => {
    console.error('Error fatal:', error);
    process.exit(1);
  });
}

module.exports = { main, findLogFiles, analyzeLogFile };
