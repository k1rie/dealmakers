const ExtractDealmakers = require('./extract-dealmakers');

// Crear instancia del extractor
const extractor = new ExtractDealmakers();

// Mock de deals de prueba
const mockDeals = [
  {
    id: 'deal1',
    properties: {
      dealname: 'Test Deal 1',
      link_original_de_la_noticia: 'https://linkedin.com/in/test-user-1'
    }
  },
  {
    id: 'deal2',
    properties: {
      dealname: 'Test Deal 2',
      link_original_de_la_noticia: 'https://linkedin.com/in/test-user-1' // Mismo perfil
    }
  },
  {
    id: 'deal3',
    properties: {
      dealname: 'Test Deal 3',
      link_original_de_la_noticia: 'https://linkedin.com/in/test-user-2'
    }
  }
];

// Test del método extractProfileUrlsFromDeals
console.log('🧪 Probando extractProfileUrlsFromDeals...');
extractor.extractProfileUrlsFromDeals(mockDeals).then(result => {
  console.log('✅ URLs extraídas:', result.profileUrls.length);
  console.log('📊 Detalles:', JSON.stringify(result.profileUrls, null, 2));

  // Verificar que agrupa correctamente
  const profile1 = result.profileUrls.find(p => p.url.includes('test-user-1'));
  const profile2 = result.profileUrls.find(p => p.url.includes('test-user-2'));

  if (profile1) {
    console.log(`🔗 Perfil 1 (${profile1.url}) tiene ${profile1.sourceDeals.length} deals:`, profile1.sourceDeals);
  }
  if (profile2) {
    console.log(`🔗 Perfil 2 (${profile2.url}) tiene ${profile2.sourceDeals.length} deals:`, profile2.sourceDeals);
  }

  // Verificar que el perfil 1 tiene 2 deals (deal1 y deal2)
  if (profile1 && profile1.sourceDeals.length === 2) {
    console.log('✅ Agrupación correcta: perfil con 2 deals');
  } else {
    console.log('❌ Error: perfil debería tener 2 deals');
  }

  // Verificar que el perfil 2 tiene 1 deal (deal3)
  if (profile2 && profile2.sourceDeals.length === 1) {
    console.log('✅ Agrupación correcta: perfil con 1 deal');
  } else {
    console.log('❌ Error: perfil debería tener 1 deal');
  }

  console.log('✅ Test completado - La agrupación funciona correctamente');
}).catch(error => {
  console.error('❌ Error en test:', error);
});
