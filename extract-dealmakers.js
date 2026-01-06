require('dotenv').config();
const { ApifyClient } = require('apify-client');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

// Archivo para tracking semanal
const WEEKLY_TRACKING_FILE = path.join(__dirname, 'weekly-tracking.json');
const OpenAI = require('openai');

const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN;
const APIFY_TOKEN = process.env.APIFY_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MAX_DEALS_PER_WEEK = parseInt(process.env.MAX_DEALS_PER_WEEK) || 1000;
const HUBSPOT_BASE_URL = 'https://api.hubapi.com';

// Actor ID de Apify para LinkedIn Profile Scraper
const LINKEDIN_PROFILE_ACTOR_ID = 'LpVuK3Zozwuipa5bp';

// Configuración del pipeline y stages
const PIPELINE_CONFIG = {
  pipelineId: '654720623', // Pipeline: Proyectos
  sourceStageId: '1169433784', // 13P Posible Oportunidad (fuente de deals)
  targetStageId: '1259550373' // 11P Agregado en Linkedin (destino)
};

/**
 * Script para extraer perfiles de LinkedIn desde deals de posts y crear contactos en HubSpot
 * Utiliza Apify para obtener información detallada de perfiles de LinkedIn
 */
class ExtractDealmakers {
  constructor() {
    this.client = new ApifyClient({
      token: APIFY_TOKEN,
    });
    this.openai = new OpenAI({
      apiKey: OPENAI_API_KEY,
    });
    this.processedDeals = new Set();
    this.createdContacts = 0;
    this.updatedContacts = 0;
    this.errors = 0;
    this.personProfiles = 0;
    this.companyProfiles = 0;
    this.weeklyLimitReached = false;
  }

  /**
   * Obtener la semana actual en formato YYYY-WW
   */
  getCurrentWeek() {
    const now = new Date();
    const year = now.getFullYear();
    const startOfYear = new Date(year, 0, 1);
    const days = Math.floor((now - startOfYear) / (24 * 60 * 60 * 1000));
    const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7);
    return `${year}-W${weekNumber.toString().padStart(2, '0')}`;
  }

  /**
   * Cargar datos de tracking semanal
   */
  async loadWeeklyTracking() {
    try {
      const data = await fs.readFile(WEEKLY_TRACKING_FILE, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      // Si no existe el archivo, devolver estructura inicial
      return {
        currentWeek: this.getCurrentWeek(),
        dealsProcessed: 0,
        lastUpdate: new Date().toISOString()
      };
    }
  }

  /**
   * Guardar datos de tracking semanal
   */
  async saveWeeklyTracking(data) {
    try {
      await fs.writeFile(WEEKLY_TRACKING_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('❌ Error guardando tracking semanal:', error.message);
    }
  }

  /**
   * Verificar y actualizar límite semanal
   */
  async checkWeeklyLimit(dealsToProcess) {
    const currentWeek = this.getCurrentWeek();
    let tracking = await this.loadWeeklyTracking();

    // Resetear contador si es una semana nueva
    if (tracking.currentWeek !== currentWeek) {
      console.log(`📅 Nueva semana detectada: ${currentWeek} (anterior: ${tracking.currentWeek})`);
      console.log(`🔄 Reseteando contador semanal: ${tracking.dealsProcessed} → 0`);
      tracking = {
        currentWeek: currentWeek,
        dealsProcessed: 0,
        lastUpdate: new Date().toISOString()
      };
      await this.saveWeeklyTracking(tracking);
    }

    // Verificar límite
    if (tracking.dealsProcessed >= MAX_DEALS_PER_WEEK) {
      console.log(`⚠️  [WARN] Límite semanal alcanzado: ${tracking.dealsProcessed}/${MAX_DEALS_PER_WEEK} deals`);
      this.weeklyLimitReached = true;
      return false;
    }

    if (tracking.dealsProcessed + dealsToProcess > MAX_DEALS_PER_WEEK) {
      const available = MAX_DEALS_PER_WEEK - tracking.dealsProcessed;
      console.log(`⚠️  [WARN] Solo se pueden procesar ${available} deals más esta semana`);
      console.log(`💡 [INFO] Se procesarán solo los primeros ${available} deals`);
      return available;
    }

    return dealsToProcess;
  }

  /**
   * Actualizar contador semanal
   */
  async updateWeeklyLimit(processedCount) {
    const tracking = await this.loadWeeklyTracking();
    tracking.dealsProcessed += processedCount;
    tracking.lastUpdate = new Date().toISOString();
    await this.saveWeeklyTracking(tracking);
    console.log(`📊 [INFO] Contador semanal actualizado: ${tracking.dealsProcessed}/${MAX_DEALS_PER_WEEK} deals`);
  }

  /**
   * Buscar deals válidos en HubSpot
   * @param {number} maxDeals - Máximo número de deals a obtener (opcional)
   */
  async getDealsWithValidPosts(maxDeals = null) {
    console.log(`🔍 [DEBUG] Buscando deals en pipeline ${PIPELINE_CONFIG.pipelineId}, stage ${PIPELINE_CONFIG.sourceStageId}${maxDeals ? ` (máx. ${maxDeals})` : ''}`);

    try {
      let allDeals = [];
      let after = null;
      const limit = 100;

      // Obtener todos los deals con paginación
      do {
        const params = {
          limit: limit,
          properties: ['dealname', 'dealstage', 'pipeline', 'link_original_de_la_noticia', 'description'],
          filterGroups: [
            {
              filters: [
                {
                  propertyName: 'dealstage',
                  operator: 'EQ',
                  value: PIPELINE_CONFIG.sourceStageId
                },
                {
                  propertyName: 'pipeline',
                  operator: 'EQ',
                  value: PIPELINE_CONFIG.pipelineId
                },
                {
                  propertyName: 'dealname',
                  operator: 'CONTAINS_TOKEN',
                  value: 'Post:'
                }
              ]
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
        allDeals = allDeals.concat(deals);

        after = response.data.paging?.next?.after;
        console.log(`📄 [DEBUG] Página obtenida: ${deals.length} deals (total: ${allDeals.length})`);

        // Verificar límite máximo de deals si está especificado
        if (maxDeals && allDeals.length >= maxDeals) {
          console.log(`📊 [DEBUG] Límite máximo alcanzado (${maxDeals} deals), deteniendo descarga`);
          allDeals = allDeals.slice(0, maxDeals);
          after = null; // Detener paginación
        }

        // Agregar delay entre peticiones para evitar rate limiting de HubSpot
        if (after) {
          console.log(`⏳ [DEBUG] Esperando 3 segundos antes de la siguiente página...`);
          await new Promise(resolve => setTimeout(resolve, 3000));
        }

      } while (after);

      console.log(`✅ [SUCCESS] Total deals encontrados: ${allDeals.length}`);

      // Filtrar deals que tienen URLs válidas
      const validDeals = [];

      for (const deal of allDeals) {
        const props = deal.properties || {};
        const description = props.description || '';
        const postLink = props.link_original_de_la_noticia || '';

        // Buscar URLs de LinkedIn
        const linkedinRegex = /https?:\/\/(?:www\.)?linkedin\.com\/[^\s<>"']+/gi;
        const linkedinUrls = description.match(linkedinRegex) || [];
        if (postLink && postLink.includes('linkedin.com')) {
          linkedinUrls.push(postLink);
        }

        // También buscar formato especial "Profile URL: [URL]"
        const profileUrlMatch = description.match(/Profile URL:\s*(https?:\/\/(?:www\.)?linkedin\.com\/[^\s<>"']+)/gi);
        if (profileUrlMatch) {
          profileUrlMatch.forEach(match => {
            const urlMatch = match.match(/Profile URL:\s*(https?:\/\/(?:www\.)?linkedin\.com\/[^\s<>"']+)/i);
            if (urlMatch && urlMatch[1]) {
              linkedinUrls.push(urlMatch[1]);
            }
          });
        }

        if (linkedinUrls.length > 0) {
          validDeals.push(deal);
        }
      }

      console.log(`🎯 [INFO] Deals con URLs válidas: ${validDeals.length}/${allDeals.length}`);

      return validDeals;

    } catch (error) {
      console.error('❌ Error obteniendo deals:', error.message);
      throw error;
    }
  }

  /**
   * Extraer URLs de perfiles de las descripciones de deals
   */
  async extractProfileUrlsFromDeals(deals) {
    const profileUrls = new Map();

    console.log(`   👤 Extrayendo perfiles de ${deals.length} deals...`);

    for (const deal of deals) {
      const props = deal.properties || {};
      const description = props.description?.value || props.description || '';

        if (description) {
          // Buscar específicamente perfiles
          const profilePatterns = [
            /https?:\/\/(?:www\.)?linkedin\.com\/in\/[^\/\s<>"'\?\#]+/gi,
            /https?:\/\/(?:www\.)?linkedin\.com\/company\/[^\/\s<>"'\?\#]+/gi,
            /https?:\/\/(?:www\.)?linkedin\.com\/school\/[^\/\s<>"'\?\#]+/gi,
            /https?:\/\/(?:www\.)?linkedin\.com\/pub\/[^\/\s<>"'\?\#]+/gi,
            /https?:\/\/(?:www\.)?linkedin\.com\/people\/[^\/\s<>"'\?\#]+/gi
          ];

          let profileMatches = [];
          profilePatterns.forEach(pattern => {
            const matches = description.match(pattern);
            if (matches) {
              profileMatches = profileMatches.concat(matches);
            }
          });

          // Formato especial "Profile URL: [URL]"
          const profileUrlFromFormat = description.match(/Profile URL:\s*(https?:\/\/(?:www\.)?linkedin\.com\/[^\s<>"']+)/gi);
          if (profileUrlFromFormat) {
            profileUrlFromFormat.forEach(formattedUrl => {
              const urlMatch = formattedUrl.match(/Profile URL:\s*(https?:\/\/(?:www\.)?linkedin\.com\/[^\s<>"']+)/i);
              if (urlMatch && urlMatch[1]) {
                profileMatches.push(urlMatch[1]);
              }
            });
          }

          // Extraer perfiles desde URLs de posts
          const postLinks = description.match(/https?:\/\/(?:www\.)?linkedin\.com\/posts\/[^\s<>"']+/gi) || [];
          postLinks.forEach(postLink => {
            const username = this.extractUsernameFromPostUrl(postLink);
            if (username) {
              const profileUrl = `https://www.linkedin.com/in/${username}`;
              profileMatches.push(profileUrl);
            }
          });

          // Eliminar duplicados y limpiar URLs
          profileMatches = [...new Set(profileMatches)];

          profileMatches.forEach(url => {
            const cleanUrl = url.split('?')[0].split('#')[0];
            if (!profileUrls.has(cleanUrl)) {
              profileUrls.set(cleanUrl, {
                url: cleanUrl,
                sourceDeals: [deal.id],
                dealNames: [deal.properties?.dealname || `Deal ${deal.id}`]
              });
            } else {
              const existing = profileUrls.get(cleanUrl);
              if (!existing.sourceDeals.includes(deal.id)) {
                existing.sourceDeals.push(deal.id);
                existing.dealNames.push(deal.properties?.dealname || `Deal ${deal.id}`);
              }
            }
          });
        }
    }

    const result = Array.from(profileUrls.values());
    console.log(`   📊 URLs de perfiles únicas encontradas: ${result.length}`);

    return result;
  }

  /**
   * Extraer username de URL de post
   */
  extractUsernameFromPostUrl(postUrl) {
    try {
      const postMatch = postUrl.match(/linkedin\.com\/posts\/([^\/]+)/);
      if (postMatch) {
        return postMatch[1].split('-')[0];
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Filtrar URLs que ya existen como contactos
   */
  async filterExistingProfileUrls(profileUrlObjects) {
    console.log(`   🔍 Verificando ${profileUrlObjects.length} URLs contra HubSpot...`);

    const newUrlObjects = [];

    for (const profileInfo of profileUrlObjects) {
      try {
        const mockProfile = { linkedinUrl: profileInfo.url };
        const existingContact = await this.checkExistingContact(mockProfile);

        if (existingContact) {
          console.log(`      ⏭️  YA EXISTE como contacto ID: ${existingContact.id}`);
        } else {
          console.log(`      ✅  NUEVA - será procesada por Apify`);
          newUrlObjects.push(profileInfo);
        }
      } catch (error) {
        console.log(`      ❌ Error verificando URL: ${error.message}`);
        newUrlObjects.push(profileInfo);
      }

      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`\n📊 RESULTADO DEL FILTRADO:`);
    console.log(`   URLs analizadas: ${profileUrlObjects.length}`);
    console.log(`   URLs nuevas: ${newUrlObjects.length}`);
    console.log(`   URLs existentes: ${profileUrlObjects.length - newUrlObjects.length}`);

    return newUrlObjects;
  }

  /**
   * Verificar si un contacto ya existe
   */
  async checkExistingContact(profile) {
    try {
      const linkedinUrl = profile.linkedinUrl || profile.url;
      if (!linkedinUrl) return null;

      const response = await axios.post(
        `${HUBSPOT_BASE_URL}/crm/v3/objects/contacts/search`,
        {
          filterGroups: [
            {
              filters: [
                {
                  propertyName: 'linkedin_profile_link',
                  operator: 'EQ',
                  value: linkedinUrl
                }
              ]
            }
          ],
          properties: ['firstname', 'lastname', 'linkedin_profile_link']
        },
        {
          headers: {
            'Authorization': `Bearer ${HUBSPOT_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const contacts = response.data.results || [];
      return contacts.length > 0 ? contacts[0] : null;

    } catch (error) {
      if (error.response && error.response.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Scraping con Apify
   */
  async scrapeProfilesWithApify(profileUrlObjects) {
    const profileUrls = profileUrlObjects.map(obj => obj.url);

    console.log(`   🔍 Procesando ${profileUrls.length} perfiles con Apify...`);

    const input = {
      "profileScraperMode": "Profile details no email ($4 per 1k)",
      "queries": profileUrls
    };

    const run = await this.client.actor(LINKEDIN_PROFILE_ACTOR_ID).call(input);
    const { items } = await this.client.dataset(run.defaultDatasetId).listItems();

    console.log(`✅ Apify procesó ${items.length} perfiles`);
    return items;
  }

  /**
   * Analizar perfil con OpenAI
   */
  async analyzeProfileWithAI(profile) {
    const profileText = `${profile.name || ''} ${profile.position || ''} ${profile.company || ''}`.trim();

    if (!profileText) return 'unknown';

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a classifier. Analyze if this LinkedIn profile belongs to a person or a company. Respond with only "person" or "company".'
          },
          {
            role: 'user',
            content: `Profile info: ${profileText}`
          }
        ],
        max_tokens: 10
      });

      const result = response.choices[0].message.content.toLowerCase().trim();
      return result === 'person' ? 'person' : 'company';

    } catch (error) {
      console.log(`❌ Error analizando perfil con OpenAI: ${error.message}`);
      return 'unknown';
    }
  }

  /**
   * Normalizar datos del perfil
   */
  normalizeProfileData(profile) {
    // Intentar extraer nombre de múltiples fuentes
    let extractedName = profile.name || profile.fullName || profile.authorName;

    // Si no hay nombre básico, intentar extraer de otros campos comunes en Apify
    if (!extractedName) {
      if (profile.userName) extractedName = profile.userName;
      if (profile.displayName) extractedName = profile.displayName;
      if (profile.fullname) extractedName = profile.fullname;
      if (profile.username) extractedName = profile.username;
      // Algunos perfiles pueden tener el nombre en el título de la página
      if (profile.title && profile.title.includes(' - ')) {
        extractedName = profile.title.split(' - ')[0];
      }
    }

    return {
      name: this.normalizeString(extractedName),
      firstName: this.normalizeString(profile.firstName || extractedName?.split(' ')[0]),
      lastName: this.normalizeString(profile.lastName || extractedName?.split(' ').slice(1).join(' ')),
      position: this.normalizeString(profile.position || profile.currentPosition || profile.title),
      company: this.normalizeString(profile.company || profile.currentCompany),
      location: this.normalizeString(profile.location),
      linkedinUrl: profile.linkedinUrl || profile.url || profile.profileUrl,
      about: this.normalizeString(profile.about || profile.bio || profile.description)
    };
  }

  /**
   * Normalizar string
   */
  normalizeString(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value.trim();
    return String(value).trim();
  }

  /**
   * Preparar datos del contacto
   */
  prepareContactData(profile) {
    const firstname = profile.firstName || 'Sin nombre';
    const lastname = profile.lastName || '';

    console.log(`   📝 Preparando datos del contacto:`);
    console.log(`      • Nombre: "${firstname}"`);
    console.log(`      • Apellido: "${lastname}"`);
    console.log(`      • Posición: "${profile.position || 'No especificado'}"`);
    console.log(`      • Compañía: "${profile.company || 'No especificado'}"`);

    return {
      properties: {
        firstname: firstname,
        lastname: lastname,
        linkedin_profile_link: profile.linkedinUrl,
        jobtitle: profile.position,
        company: profile.company,
        city: profile.location,
        hs_bio: profile.about
      }
    };
  }

  /**
   * Crear asociación entre deal y contacto
   */
  async createAssociation(dealId, contactId, associationTypeId = 3) {
    try {
      console.log(`   🔗 Creando asociación: Deal ${dealId} ↔ Contacto ${contactId}`);

      await axios.put(
        `${HUBSPOT_BASE_URL}/crm/v3/objects/deals/${dealId}/associations/contacts/${contactId}/${associationTypeId}`,
        {},
        {
          headers: {
            'Authorization': `Bearer ${HUBSPOT_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log(`   ✅ Asociación creada exitosamente`);
      return true;

    } catch (error) {
      console.error(`   ❌ Error creando asociación: ${error.message}`);
      return false;
    }
  }

  /**
   * Crear contacto en HubSpot
   */
  async createContact(contactData) {
    const response = await axios.post(
      `${HUBSPOT_BASE_URL}/crm/v3/objects/contacts`,
      contactData,
      {
        headers: {
          'Authorization': `Bearer ${HUBSPOT_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data;
  }

  /**
   * Actualizar contacto existente
   */
  async updateExistingContact(existingContact, contactData) {
    try {
      await axios.patch(
        `${HUBSPOT_BASE_URL}/crm/v3/objects/contacts/${existingContact.id}`,
        contactData,
        {
          headers: {
            'Authorization': `Bearer ${HUBSPOT_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log(`   ✅ Contacto actualizado exitosamente (ID: ${existingContact.id})`);

    } catch (error) {
      console.error(`   ❌ Error actualizando contacto ${existingContact.id}:`, error.message);
      throw error;
    }
  }

  /**
   * Crear contactos en HubSpot
   */
  async createContactsInHubSpot(profileData, profileUrlObjects) {
    let created = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (const profile of profileData) {
      try {
        const normalizedProfile = this.normalizeProfileData(profile);
        const profileName = normalizedProfile.name || 'Sin nombre';
        const linkedinUrl = normalizedProfile.linkedinUrl;

        console.log(`   👤 Procesando perfil: ${profileName}`);
        console.log(`   🔗 URL: ${linkedinUrl}`);

        // Mostrar diagnóstico detallado de datos disponibles
        console.log(`   📊 Datos disponibles:`);
        console.log(`      • Nombre completo: "${normalizedProfile.name || 'VACÍO'}"`);
        console.log(`      • Posición: "${normalizedProfile.position || 'VACÍO'}"`);
        console.log(`      • Compañía: "${normalizedProfile.company || 'VACÍO'}"`);
        console.log(`      • Experiencia laboral: ${profile.experience ? profile.experience.length + ' entradas' : 'VACÍO'}`);
        console.log(`      • Educación: ${profile.education ? profile.education.length + ' entradas' : 'VACÍO'}`);

        // Si no tiene nombre pero sí tiene otros datos, mostrar warning
        if (!normalizedProfile.name && (profile.experience?.length > 0 || profile.education?.length > 0)) {
          console.log(`   ⚠️  PERFIL CON DATOS PERO SIN NOMBRE - Posible error de scraping Apify`);
          console.log(`   📋 Campos disponibles en Apify:`, Object.keys(profile).join(', '));
        }

        if (!linkedinUrl) {
          console.log(`   ⏭️  Saltando perfil sin URL`);
          skipped++;
          continue;
        }

        const existingContact = await this.checkExistingContact(normalizedProfile);

        if (existingContact) {
          console.log(`   🔄 Contacto existente encontrado (ID: ${existingContact.id})`);
          await this.updateExistingContact(existingContact, this.prepareContactData(normalizedProfile));
          updated++;

          // Crear asociaciones para contacto existente
          if (profileUrlObjects) {
            const matchingProfileInfo = profileUrlObjects.find(obj => obj.url === linkedinUrl);
            if (matchingProfileInfo) {
              for (const dealId of matchingProfileInfo.sourceDeals) {
                await this.createAssociation(dealId, existingContact.id);
              }
            }
          }

          continue;
        }

        // Analizar con OpenAI
        const profileType = await this.analyzeProfileWithAI(normalizedProfile);

        if (profileType === 'company') {
          console.log(`   🏢 Saltando perfil de empresa: ${profileName}`);
          skipped++;
          continue;
        }

        console.log(`   👤 Perfil de persona confirmado: ${profileName}`);

        const contactData = this.prepareContactData(normalizedProfile);
        if (!contactData.properties.firstname ||
            contactData.properties.firstname === 'Sin nombre' ||
            !contactData.properties.firstname.trim()) {
          console.log(`   ❌ SALTANDO: Perfil sin nombre válido (Apify no pudo extraer el nombre)`);
          console.log(`   📋 Datos que SÍ tiene el perfil:`, {
            experiencia: profile.experience?.length || 0,
            educacion: profile.education?.length || 0,
            posicion: normalizedProfile.position || 'ninguna',
            compania: normalizedProfile.company || 'ninguna',
            ubicacion: normalizedProfile.location || 'ninguna'
          });
          skipped++;
          continue;
        }

        console.log(`   🔄 Creando contacto para: ${profileName}`);
        const contactResponse = await this.createContact(contactData);

        created++;
        console.log(`   ✅ Contacto creado: ${profileName} (ID: ${contactResponse.id})`);

        // Crear asociaciones
        if (profileUrlObjects) {
          const matchingProfileInfo = profileUrlObjects.find(obj => obj.url === linkedinUrl);
          if (matchingProfileInfo) {
            for (const dealId of matchingProfileInfo.sourceDeals) {
              await this.createAssociation(dealId, contactResponse.id);
            }
          }
        }

        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (error) {
        const profileName = profile.name || 'Sin nombre';
        console.error(`   ❌ Error creando contacto para ${profileName}: ${error.message}`);
        errors++;
      }
    }

    return { created, updated, skipped, errors };
  }

  /**
   * Mover deals al stage de destino
   */
  async moveDealsTo11PDM(deals) {
    const targetStageId = PIPELINE_CONFIG.targetStageId;

    let moved = 0;
    let errors = 0;

    console.log(`   🎯 Moviendo ${deals.length} deals al stage ID: ${targetStageId}`);

    for (const deal of deals) {
      try {
        const dealName = deal.properties?.dealname || `Deal ${deal.id}`;
        console.log(`      📤 Moviendo: ${dealName} (ID: ${deal.id})`);

        await axios.patch(
          `${HUBSPOT_BASE_URL}/crm/v3/objects/deals/${deal.id}`,
          {
            properties: {
              dealstage: targetStageId
            }
          },
          {
            headers: {
              'Authorization': `Bearer ${HUBSPOT_TOKEN}`,
              'Content-Type': 'application/json'
            }
          }
        );

        moved++;
        console.log(`      ✅ Movido exitosamente`);

      } catch (error) {
        console.error(`      ❌ Error moviendo deal ${deal.id}:`, error.message);
        errors++;
      }
    }

    return { moved, errors };
  }

  /**
   * Ejecutar el proceso completo
   */
  async run() {
    const executionStartTime = Date.now();
    console.log('🚀 Iniciando ejecución del script extract-dealmakers');
    console.log(`Timestamp inicio: ${new Date(executionStartTime).toISOString()}`);
    console.log(`Configuración: Pipeline=${PIPELINE_CONFIG.pipelineId}, Stage Origen=${PIPELINE_CONFIG.sourceStageId}, Stage Destino=${PIPELINE_CONFIG.targetStageId}`);
    console.log(`Límite semanal: ${MAX_DEALS_PER_WEEK} deals`);
    console.log('='.repeat(100));

    try {
      // 1. Verificar límite semanal ANTES de descargar deals
      console.log('📊 Paso 1: Verificando límite semanal...');
      console.log(`📊 Configuración: MAX_DEALS_PER_WEEK=${MAX_DEALS_PER_WEEK}`);

      // Verificar si el límite semanal está configurado correctamente
      if (MAX_DEALS_PER_WEEK <= 0) {
        console.log('❌ ERROR: MAX_DEALS_PER_WEEK debe ser mayor a 0');
        console.log('💡 Configure la variable de entorno MAX_DEALS_PER_WEEK=1000 en Railway');
        return { contactResults: { created: 0, updated: 0, errors: 0 } };
      }

      const weeklyLimitCheck = await this.checkWeeklyLimit(0);
      if (weeklyLimitCheck === false) {
        console.log('❌ Límite semanal alcanzado completamente');
        return { contactResults: { created: 0, updated: 0, errors: 0 } };
      }

      const maxDealsToDownload = weeklyLimitCheck === true ? MAX_DEALS_PER_WEEK : weeklyLimitCheck;
      console.log(`📊 Límite semanal OK: ${maxDealsToDownload} deals disponibles\n`);

      // 2. Obtener deals con posts válidos (limitado)
      console.log('📋 Paso 2: Buscando deals con links de posts válidos...');
      const dealsWithPosts = await this.getDealsWithValidPosts(maxDealsToDownload);

      if (dealsWithPosts.length === 0) {
        console.log('❌ No se encontraron deals con links de posts válidos');
        return { contactResults: { created: 0, updated: 0, errors: 0 } };
      }

      console.log(`✅ Encontrados ${dealsWithPosts.length} deals con posts válidos\n`);

      // 3. Verificar límite semanal final
      const allowedDeals = await this.checkWeeklyLimit(dealsWithPosts.length);
      if (!allowedDeals || allowedDeals === 0) {
        console.log('❌ Límite semanal alcanzado');
        return { contactResults: { created: 0, updated: 0, errors: 0 } };
      }

      const dealsToProcess = allowedDeals === true ? dealsWithPosts : dealsWithPosts.slice(0, allowedDeals);
      console.log(`📊 Procesando ${dealsToProcess.length} deals (límite semanal)\n`);

      // 4. Extraer URLs de perfiles
      console.log('👤 Paso 4: Extrayendo URLs de perfiles...');
      const profileUrls = await this.extractProfileUrlsFromDeals(dealsToProcess);

      if (profileUrls.length === 0) {
        console.log('❌ No se encontraron URLs de perfiles válidas');
        return { contactResults: { created: 0, updated: 0, errors: 0 } };
      }

      console.log(`✅ Extraídas ${profileUrls.length} URLs de perfiles únicas\n`);

      // 4. Filtrar URLs existentes
      console.log('🔍 Paso 5: Filtrando URLs que ya existen...');
      const filteredProfileUrls = await this.filterExistingProfileUrls(profileUrls);

      if (filteredProfileUrls.length === 0) {
        console.log('ℹ️  Todos los perfiles ya existen como contactos');
        return { contactResults: { created: 0, updated: 0, errors: 0 } };
      }

      console.log(`✅ ${filteredProfileUrls.length} URLs nuevas para procesar\n`);

      // 5. Scraping con Apify
      console.log('🔍 Paso 6: Procesando URLs con Apify...');
      const profileData = await this.scrapeProfilesWithApify(filteredProfileUrls);

      if (profileData.length === 0) {
        console.log('❌ Apify no devolvió ningún perfil');
        return { contactResults: { created: 0, updated: 0, errors: 0 } };
      }

      console.log(`✅ Apify procesó ${profileData.length} perfiles\n`);

      // 6. Crear contactos
      console.log('💾 Paso 7: Creando contactos en HubSpot...');
      const contactResults = await this.createContactsInHubSpot(profileData, filteredProfileUrls);

      console.log(`✅ Creados ${contactResults.created} contactos`);
      console.log(`🔄 Actualizados: ${contactResults.updated}`);
      console.log(`⏭️  Saltados: ${contactResults.skipped}`);
      console.log(`⚠️  Errores: ${contactResults.errors}\n`);

      // 7. Actualizar tracking semanal
      await this.updateWeeklyLimit(contactResults.created + contactResults.updated);

      // 8. Mover deals procesados
      const successfullyProcessedDeals = dealsToProcess; // Simplificado
      if (successfullyProcessedDeals.length > 0) {
        console.log('📊 Paso 8: Moviendo deals procesados...');
        await this.moveDealsTo11PDM(successfullyProcessedDeals);
      }

      const executionEndTime = Date.now();
      const totalDuration = (executionEndTime - executionStartTime) / 1000;

      console.log('='.repeat(100));
      console.log('✅ EJECUCIÓN COMPLETADA');
      console.log(`⏱️  Duración total: ${totalDuration.toFixed(1)} segundos`);
      console.log(`📊 Contactos creados: ${contactResults.created}`);
      console.log(`📊 Contactos actualizados: ${contactResults.updated}`);
      console.log(`📊 Deals procesados: ${successfullyProcessedDeals.length}`);
      console.log('='.repeat(100));

      return {
        contactResults,
        dealsProcessed: successfullyProcessedDeals.length,
        executionTime: totalDuration
      };

    } catch (error) {
      console.error('❌ Error fatal en la ejecución:', error.message);
      throw error;
    }
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  const extractor = new ExtractDealmakers();
  extractor.run().catch(console.error);
}

module.exports = ExtractDealmakers;
