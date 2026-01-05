# Extract Dealmakers

Script para extraer perfiles de LinkedIn desde deals y crear contactos en HubSpot con asociaciones automáticas.

## 🚀 Inicio Rápido

```bash
# Instalar dependencias
npm install

# Ejecutar el script principal
npm run extract-dealmakers

# Ver estado de deals
npm run diagnose

# Gestionar límite semanal
npm run manage-weekly-limit
```

## 📋 Scripts Disponibles

- `npm run extract-dealmakers` - Ejecutar el proceso completo
- `npm run diagnose` - Diagnosticar estado de deals
- `npm run list-pipelines` - Listar pipelines de HubSpot
- `npm run manage-weekly-limit` - Gestionar límite semanal
- `npm run return-moved-deals` - Devolver deals al stage original

## ⚙️ Configuración

Crear archivo `.env` con:

```env
# HubSpot
HUBSPOT_TOKEN=tu_token_de_hubspot

# Apify
APIFY_TOKEN=tu_token_de_apify

# OpenAI
OPENAI_API_KEY=tu_api_key

# Límites
MAX_DEALS_PER_WEEK=100
```

## 🎯 Funcionalidades

- ✅ Extracción automática de URLs de LinkedIn desde deals
- ✅ Filtrado de perfiles existentes
- ✅ Scraping con Apify
- ✅ Análisis con OpenAI (persona vs empresa)
- ✅ Creación/actualización de contactos
- ✅ **Asociaciones automáticas deal-contacto**
- ✅ Movimiento automático de deals
- ✅ Límite semanal configurable
