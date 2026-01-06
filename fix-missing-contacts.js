#!/usr/bin/env node

require('dotenv').config();
const axios = require('axios');
const { ApifyClient } = require('apify-client');

const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN || process.argv[2];
const APIFY_TOKEN = process.env.APIFY_TOKEN || process.argv[3];
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || process.argv[4];
const HUBSPOT_BASE_URL = 'https://api.hubapi.com';

const PIPELINE_CONFIG = {
  pipelineId: '654720623', // Pipeline: Proyectos
  targetStageId: '1259550373' // 11P Agregado en Linkedin (donde se mueven los deals procesados)
};

const LINKEDIN_PROFILE_ACTOR_ID = 'LpVuK3Zozwuipa5bp';

const OpenAI = OPENAI_API_KEY ? require('openai') : null;

/**
 * Script para arreglar deals que se movieron pero no tienen contactos asociados
 */
class FixMissingContacts {
  constructor() {
    this.client = new ApifyClient({
      token: APIFY_TOKEN,
    });
    this.openai = OPENAI_API_KEY ? new OpenAI({
      apiKey: OPENAI_API_KEY,
    }) : null;
    this.createdContacts = 0;
    this.updatedContacts = 0;
    this.errors = 0;
    this.skipped = 0;
  }

  /**
   * Normalizar string
   */
  normalizeString(str) {
    if (!str) return '';
    return str.trim().replace(/\s+/g, ' ');
  }

  /**
   * Extraer URL del perfil de LinkedIn de la descripción del deal
   */
  extractLinkedInProfileFromDescription(description) {
    // Buscar patrones como "URL del perfil: https://www.linkedin.com/in/usuario"
    const profileUrlPattern = /URL del perfil:\s*(https:\/\/[^\s\n]+)/i;
    const match = description.match(profileUrlPattern);

    if (match) {
      let url = match[1].split('?')[0].split('#')[0]; // Limpiar URL
      return url;
    }

    return null;
  }

  /**
   * Verificar contacto existente por LinkedIn URL
   */
  async checkExistingContact(profile) {
    try {
      const linkedinUrl = profile.linkedinUrl;

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
  async scrapeProfilesWithApify(profileUrls) {
    console.log(`   🔍 Procesando ${profileUrls.length} perfiles con Apify...`);

    const input = {
      "profileScraperMode": "Profile details no email ($4 per 1k)",
      "queries": profileUrls
    };

    try {
      const run = await this.client.actor(LINKEDIN_PROFILE_ACTOR_ID).call(input);
      const { items } = await this.client.dataset(run.defaultDatasetId).listItems();

      console.log(`✅ Apify procesó ${items.length} perfiles`);
      return items;
    } catch (error) {
      console.error(`❌ Error con Apify: ${error.message}`);
      return [];
    }
  }

  /**
   * Analizar perfil con OpenAI o lógica de respaldo
   */
  async analyzeProfileWithAI(profile) {
    const profileText = `${profile.name || ''} ${profile.position || ''} ${profile.company || ''}`.trim();

    if (!profileText) return 'unknown';

    // Si no hay OpenAI, usar lógica simple de respaldo
    if (!this.openai) {
      console.log(`   🤖 OpenAI no disponible, usando análisis básico...`);

      // Lógica simple: si contiene palabras de empresa, considerar empresa
      const companyKeywords = ['inc', 'ltd', 'corp', 'company', 'corporation', 'llc', 'gmbh', 's.a.', 's.l.', 'co.', 'group'];
      const lowerText = profileText.toLowerCase();

      for (const keyword of companyKeywords) {
        if (lowerText.includes(keyword)) {
          return 'company';
        }
      }

      // Si tiene posición y compañía claramente separadas, es persona
      if (profile.position && profile.company && profile.position !== profile.company) {
        return 'person';
      }

      // Por defecto, asumir persona (más común en LinkedIn posts)
      return 'person';
    }

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
      position: this.normalizeString(profile.position || profile.currentPosition || profile.jobTitle),
      company: this.normalizeString(profile.company || profile.currentCompany || profile.organization),
      location: this.normalizeString(profile.location || profile.city),
      linkedinUrl: profile.url || profile.linkedinUrl,
      about: this.normalizeString(profile.about || profile.summary || profile.bio),
      experience: profile.experience || [],
      education: profile.education || []
    };
  }

  /**
   * Preparar datos del contacto para HubSpot
   */
  prepareContactData(profile) {
    return {
      properties: {
        firstname: profile.firstName || 'Sin nombre',
        lastname: profile.lastName || '',
        linkedin_profile_link: profile.linkedinUrl,
        jobtitle: profile.position,
        company: profile.company,
        city: profile.location,
        hs_persona: 'Persona',
        lifecyclestage: 'lead'
      }
    };
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
  async updateExistingContact(contact, contactData) {
    await axios.patch(
      `${HUBSPOT_BASE_URL}/crm/v3/objects/contacts/${contact.id}`,
      contactData,
      {
        headers: {
          'Authorization': `Bearer ${HUBSPOT_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
  }

  /**
   * Crear asociación deal-contacto
   */
  async createAssociation(dealId, contactId) {
    try {
      await axios.put(
        `${HUBSPOT_BASE_URL}/crm/v3/objects/deals/${dealId}/associations/contacts/${contactId}`,
        {},
        {
          headers: {
            'Authorization': `Bearer ${HUBSPOT_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );
      console.log(`   ✅ Asociación creada: Deal ${dealId} ↔ Contacto ${contactId}`);
    } catch (error) {
      console.error(`   ❌ Error creando asociación: ${error.message}`);
    }
  }

  /**
   * Procesar deals sin contactos asociados
   */
  async processDealsWithoutContacts() {
    console.log('🔍 Buscando deals con prefijo "Post:" en 11P Agregado en Linkedin sin contactos asociados...\n');

    if (!HUBSPOT_TOKEN || !APIFY_TOKEN) {
      console.error('❌ Faltan tokens requeridos. Asegúrate de tener HUBSPOT_TOKEN y APIFY_TOKEN configurados');
      console.error('Uso: node fix-missing-contacts.js [HUBSPOT_TOKEN] [APIFY_TOKEN] [OPENAI_API_KEY]');
      console.error('O crear archivo .env con las variables necesarias');
      console.error('Nota: OPENAI_API_KEY es opcional (se usa análisis básico si no está disponible)');
      return;
    }

    try {
      // Obtener todos los deals en 11P
      let allDeals = [];
      let after = null;
      let hasMore = true;

      while (hasMore) {
        const params = {
          filterGroups: [
            {
              filters: [
                {
                  propertyName: 'dealstage',
                  operator: 'EQ',
                  value: PIPELINE_CONFIG.targetStageId
                },
                {
                  propertyName: 'pipeline',
                  operator: 'EQ',
                  value: PIPELINE_CONFIG.pipelineId
                }
              ]
            }
          ],
          properties: ['id', 'dealname', 'description'],
          limit: 100
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

        const batch = response.data.results || [];
        allDeals = allDeals.concat(batch);

        hasMore = response.data.paging?.next?.after;
        after = response.data.paging?.next?.after;

        if (hasMore) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      console.log(`📊 Encontrados ${allDeals.length} deals en 11P Agregado en Linkedin`);

      // Filtrar deals sin contactos asociados Y que tengan prefijo "Post:"
      const dealsWithoutContacts = [];

      for (const deal of allDeals) {
        try {
          // Solo procesar deals con prefijo "Post:"
          const dealName = deal.properties?.dealname || '';
          if (!dealName.startsWith('Post:')) {
            continue; // Saltar deals que no tienen el prefijo correcto
          }

          const associationsResponse = await axios.get(
            `${HUBSPOT_BASE_URL}/crm/v3/objects/deals/${deal.id}/associations/contacts`,
            {
              headers: {
                'Authorization': `Bearer ${HUBSPOT_TOKEN}`,
                'Content-Type': 'application/json'
              }
            }
          );

          const associatedContacts = associationsResponse.data.results || [];

          if (associatedContacts.length === 0) {
            // Extraer URL del perfil de LinkedIn
            const profileUrl = this.extractLinkedInProfileFromDescription(deal.properties?.description || '');

            if (profileUrl) {
              dealsWithoutContacts.push({
                id: deal.id,
                name: deal.properties?.dealname || `Deal ${deal.id}`,
                profileUrl: profileUrl
              });
            }
          }

          // Pequeña pausa para no sobrecargar la API
          await new Promise(resolve => setTimeout(resolve, 200));

        } catch (error) {
          console.error(`❌ Error verificando asociaciones para deal ${deal.id}: ${error.message}`);
        }
      }

      console.log(`\n🎯 Encontrados ${dealsWithoutContacts.length} deals con prefijo "Post:" sin contactos asociados`);

      if (dealsWithoutContacts.length === 0) {
        console.log('✅ Todos los deals ya tienen contactos asociados');
        return;
      }

      // Agrupar por URL de perfil para procesar eficientemente
      const profileUrlMap = new Map();

      for (const deal of dealsWithoutContacts) {
        if (!profileUrlMap.has(deal.profileUrl)) {
          profileUrlMap.set(deal.profileUrl, []);
        }
        profileUrlMap.get(deal.profileUrl).push(deal);
      }

      console.log(`\n🔄 Procesando ${profileUrlMap.size} perfiles únicos de LinkedIn...`);

      // Procesar perfiles en lotes
      const profileUrls = Array.from(profileUrlMap.keys());
      const batchSize = 10; // Procesar de 10 en 10 para no sobrecargar Apify

      for (let i = 0; i < profileUrls.length; i += batchSize) {
        const batch = profileUrls.slice(i, i + batchSize);
        console.log(`\n📦 Procesando lote ${Math.floor(i / batchSize) + 1}/${Math.ceil(profileUrls.length / batchSize)} (${batch.length} perfiles)`);

        // Scrapear con Apify
        const scrapedProfiles = await this.scrapeProfilesWithApify(batch);

        // Procesar cada perfil scrapeado
        for (const profile of scrapedProfiles) {
          try {
            const profileUrl = profile.url || profile.linkedinUrl;
            if (!profileUrl) continue;

            const relatedDeals = profileUrlMap.get(profileUrl);
            if (!relatedDeals) continue;

            console.log(`\n👤 Procesando perfil: ${profile.name || 'Sin nombre'} (${relatedDeals.length} deals)`);

            const normalizedProfile = this.normalizeProfileData(profile);
            const profileName = normalizedProfile.name || 'Sin nombre';

            // Verificar si ya existe el contacto
            const existingContact = await this.checkExistingContact({ linkedinUrl: profileUrl });

            if (existingContact) {
              console.log(`   🔄 Contacto existente encontrado (ID: ${existingContact.id})`);
              await this.updateExistingContact(existingContact, this.prepareContactData(normalizedProfile));
              this.updatedContacts++;

              // Crear asociaciones
              for (const deal of relatedDeals) {
                await this.createAssociation(deal.id, existingContact.id);
              }

              continue;
            }

            // Analizar con OpenAI si es persona o empresa
            const profileType = await this.analyzeProfileWithAI(normalizedProfile);

            if (profileType === 'company') {
              console.log(`   🏢 Saltando perfil de empresa: ${profileName}`);
              this.skipped++;
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
              this.skipped++;
              continue;
            }

            console.log(`   🔄 Creando contacto para: ${profileName}`);
            const contactResponse = await this.createContact(contactData);

            this.createdContacts++;
            console.log(`   ✅ Contacto creado: ${profileName} (ID: ${contactResponse.id})`);

            // Crear asociaciones para todos los deals relacionados
            for (const deal of relatedDeals) {
              await this.createAssociation(deal.id, contactResponse.id);
            }

            // Pequeña pausa entre contactos
            await new Promise(resolve => setTimeout(resolve, 500));

          } catch (error) {
            console.error(`   ❌ Error procesando perfil: ${error.message}`);
            this.errors++;
          }
        }

        // Pausa entre lotes
        if (i + batchSize < profileUrls.length) {
          console.log('   ⏳ Esperando 5 segundos entre lotes...');
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }

      // Resumen final
      console.log('\n📊 RESUMEN FINAL:');
      console.log('='.repeat(50));
      console.log(`✅ Contactos creados: ${this.createdContacts}`);
      console.log(`🔄 Contactos actualizados: ${this.updatedContacts}`);
      console.log(`⏭️  Perfiles saltados: ${this.skipped}`);
      console.log(`❌ Errores: ${this.errors}`);
      console.log(`📊 Total procesado: ${this.createdContacts + this.updatedContacts + this.skipped + this.errors}`);

    } catch (error) {
      console.error('❌ Error en el proceso:', error.message);
    }
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  const fixer = new FixMissingContacts();
  fixer.processDealsWithoutContacts().catch(console.error);
}

module.exports = { FixMissingContacts };
