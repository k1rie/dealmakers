#!/usr/bin/env node

const fs = require('fs');

function analyzeLogNames(logPath) {
  console.log('🔍 Analizando log para entender el problema de nombres...\n');

  if (!fs.existsSync(logPath)) {
    console.log('❌ Archivo no encontrado:', logPath);
    return;
  }

  const logContent = fs.readFileSync(logPath, 'utf-8');
  const lines = logContent.split('\n');

  let sinNombreCount = 0;
  let withDataCount = 0;
  let empresaCount = 0;
  let sinUrlCount = 0;

  console.log('📊 Resumen del procesamiento:\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Contar "Sin nombre"
    if (line.includes('Procesando perfil: Sin nombre')) {
      sinNombreCount++;

      // Ver líneas siguientes para ver qué pasa con este perfil
      for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
        const nextLine = lines[j];
        if (nextLine.includes('Saltando perfil de empresa')) {
          empresaCount++;
          break;
        }
        if (nextLine.includes('Saltando perfil sin URL')) {
          sinUrlCount++;
          break;
        }
        if (nextLine.includes('Perfil con datos pero sin nombre')) {
          withDataCount++;
          break;
        }
        if (nextLine.includes('SALTANDO: Perfil sin nombre válido')) {
          withDataCount++;
          break;
        }
      }
    }
  }

  console.log(`👤 Perfiles marcados como "Sin nombre": ${sinNombreCount}`);
  console.log(`🏢 De los "Sin nombre", detectados como empresa: ${empresaCount}`);
  console.log(`⏭️  De los "Sin nombre", saltados por no tener URL: ${sinUrlCount}`);
  console.log(`⚠️  De los "Sin nombre", con datos pero sin nombre extraído: ${withDataCount}`);

  const unexplained = sinNombreCount - empresaCount - sinUrlCount - withDataCount;
  if (unexplained > 0) {
    console.log(`❓ Sin clasificar: ${unexplained}`);
  }

  console.log('\n💡 Conclusión:');
  console.log(`Los perfiles marcados como "Sin nombre" tienen datos completos`);
  console.log(`de Apify, pero Apify no pudo extraer el campo 'name' del perfil.`);
  console.log(`Esto sugiere que algunos perfiles de LinkedIn tienen restricciones`);
  console.log(`de scraping que impiden extraer el nombre básico.`);

  // Buscar ejemplos de perfiles con datos pero sin nombre
  console.log('\n🔍 Buscando ejemplos de perfiles con experiencia pero sin nombre...');

  let inProfileData = false;
  let profileData = '';
  let exampleCount = 0;

  for (const line of lines) {
    if (line.includes('"experience": [')) {
      inProfileData = true;
      profileData = line;
    } else if (inProfileData) {
      profileData += '\n' + line;
      if (line.includes(']') && !line.includes('[')) {
        inProfileData = false;

        // Verificar si este perfil tiene experiencia pero probablemente no tiene nombre
        if (profileData.includes('"position":') && profileData.length > 500) {
          console.log(`\n📋 Ejemplo ${++exampleCount} - Perfil con datos completos:`);
          console.log('Tiene experiencia laboral, educación, pero Apify no extrajo el nombre');
          console.log('Tamaño de datos:', profileData.length, 'caracteres');

          if (exampleCount >= 2) break;
        }
      }
    }
  }
}

const logPath = process.argv[2] || '/Users/diegoguerrero/Downloads/logs.1767674890783.log';
analyzeLogNames(logPath);
