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
- `npm run remove-duplicates` - **Eliminar posts duplicados (uno por persona)**
- `npm run remove-all-posts` - **🗑️ Eliminar TODOS los posts de linkedin-posts-apify**
- `npm run return-moved-deals` - Devolver deals al stage original
- `npm run return-discarded-deals` - **🔄 Retornar deals descartados al stage original (pipeline específica)**
- `npm run move-to-success-stage` - **✅ Mover deals exitosos al stage correcto (pipeline específica)**
- `npm run count-discarded-posts` - **📊 Contar deals de posts en descartados (pipeline específica)**
- `npm run fix-recent-discarded` - **🔧 Corregir deals movidos incorrectamente a descartados**
- `npm run check-post-in-hubspot` - **🔍 Verificar si un post específico existe en HubSpot**

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
MAX_DEALS_PER_WEEK=1000
```

## 🎯 Funcionalidades

### 📊 Lógica de Procesamiento de Deals
- **Evaluación individual**: Cada deal se evalúa por separado según si creó un contacto exitosamente
- **Stage correcto**: Si alguna URL del deal creó un contacto → va a "11P Agregado en Linkedin"
- **Descartados**: Si ninguna URL del deal creó un contacto → va a "Perdido / Descartado"
- **Ejemplo**: Si procesas 5 deals y 4 crearon contactos, 4 van al stage correcto y 1 va a descartados

- ✅ Extracción automática de URLs de LinkedIn desde deals
- ✅ Filtrado de perfiles existentes
- ✅ Scraping con Apify
- ✅ **Filtrado por prefijo "Post:"** (solo deals de linkedin-posts-apify)
- ✅ Análisis con OpenAI (persona vs empresa)
- ✅ **Filtrado de perfiles sin nombre válido**
- ✅ **Logging detallado de errores de Apify**
- ✅ Creación/actualización de contactos
- ✅ **Asociaciones automáticas deal-contacto**
- ✅ Movimiento automático de deals
- ✅ Límite semanal configurable
- ✅ **Eliminación de posts duplicados**
- ✅ **Devolución de deals movidos por error**

## 🔍 Mejoras de Validación y Logging

### ✅ Filtrado de Perfiles Inválidos
- **No crea contactos** con nombre "Sin nombre"
- **Salta automáticamente** perfiles sin datos válidos de Apify
- **Intenta extraer nombre** de múltiples campos de Apify
- **Mejor logging** cuando faltan datos importantes

### 📊 Logging Detallado
Ahora muestra información completa de cada perfil procesado:
```
👤 Procesando perfil: [Nombre]
🔗 URL: https://www.linkedin.com/in/...
📊 Datos disponibles:
   • Nombre completo: "Juan Pérez"
   • Posición: "CEO"
   • Compañía: "Tech Corp"
   • Experiencia laboral: 5 entradas
   • Educación: 2 entradas
```

Cuando un perfil tiene datos pero no nombre:
```
⚠️  PERFIL CON DATOS PERO SIN NOMBRE - Posible error de scraping Apify
📋 Campos disponibles en Apify: experience, education, skills, ...
❌ SALTANDO: Perfil sin nombre válido (Apify no pudo extraer el nombre)
📋 Datos que SÍ tiene el perfil: {
  experiencia: 5,
  educacion: 2,
  posicion: "VP Business Development",
  compania: "Amaryllis Payment Solutions"
}
```

## 🔍 Verificación de Posts Específicos en HubSpot

Para verificar si un post específico de LinkedIn fue procesado y creó un deal en HubSpot:

```bash
npm run check-post-in-hubspot
```

### ✅ ¿Qué hace?
- Busca deals que contengan la URL específica del post
- Muestra detalles del deal si existe
- Lista contactos asociados al deal
- Compara con otros deals de LinkedIn para contexto

### 🎯 Ejemplo de uso:
```javascript
// Busca este post específico:
https://www.linkedin.com/posts/pamela-meneses-silva-67710136_kindergarten-box-activity-7402773489595686912-RVzb

// Resultado posible:
// ✅ ¡SÍ ENCONTRADO! Deal: "Post: Pamela Meneses Silva - Post LinkedIn"
// 👥 Contacto asociado: pamela.meneses@email.com
```

## 🔄 Devolución de Deals Movidos por Error

Si `extract-dealmakers` movió deals que NO tienen "Post:" en el nombre (medicamentos, otros productos, etc.), puedes devolverlos:

```bash
# Ver qué deals serán devueltos (sin devolver)
npm run return-moved-deals

# Devolver deals movidos por error (con confirmación)
npm run return-moved-deals -- --confirm
```

### ✅ ¿Qué hace?
- Busca deals en **11P Agregado en Linkedin** que NO tienen "Post:" en el nombre
- Los devuelve a **13P Posible Oportunidad**
- Preserva los deals legítimos de linkedin-posts-apify

### 🎯 ¿Por qué usar esto?
- `extract-dealmakers` ahora filtra solo deals con "Post:" en el nombre
- Deals anteriores sin filtro fueron movidos por error
- Este script corrige esos movimientos accidentales

## 🗑️ Eliminación de Posts Duplicados (desde log de extract-dealmakers)

Si tienes un archivo de log de `extract-dealmakers` con deals movidos que quieres eliminar, usa este script:

```bash
# Ver qué deals del log se eliminarán (sin confirmar)
npm run remove-duplicates

# Eliminar deals del log (con confirmación)
npm run remove-duplicates -- --confirm

# Usar un archivo de log diferente
npm run remove-duplicates -- --confirm /ruta/al/archivo.log
```

### Cómo funciona:
1. **Lee archivo de log**: Extrae automáticamente los IDs de deals movidos por extract-dealmakers
2. **Solo procesa deals del log**: Trabaja exclusivamente con los deals listados en el log
3. **Identifica duplicados**: Agrupa por nombre de persona
4. **Selecciona el mejor**: Mantiene el deal más reciente por persona (ID más alto)
5. **Elimina los demás**: Borra todos los duplicados
6. **Limpieza precisa**: Solo elimina exactamente lo que estaba en el log

### Ejemplo de salida:
```
📖 Leyendo archivo de log: /Users/diegoguerrero/Downloads/logs.1767664987923.log
✅ Extraídos 500 IDs únicos de deals del log

👥 Agrupando deals por persona...
🔄 Pablo Fernández de Bobadilla: 25 deals → mantener 1 (52930635833), borrar 24
🔄 Aracely Gomez Diaz Barriga: 20 deals → mantener 1 (52982070442), borrar 19

📈 Resumen:
   🗑️  Deals a eliminar: 43
```

### 🔒 Seguridad:
- ✅ **Solo elimina deals del log**: No toca otros deals
- ✅ **Confirmación requerida**: `--confirm` obligatorio
- ✅ **Vista previa completa**: Muestra exactamente qué se eliminará
- ✅ **Archivo de log configurable**: Puedes especificar cualquier archivo de log

## 🚨 Eliminación Masiva de Posts (linkedin-posts-apify)

⚠️ **¡ATENCIÓN!** Este script elimina **TODOS** los deals creados por linkedin-posts-apify, sin importar si son duplicados o no.

```bash
# Ver qué posts se eliminarán (sin confirmar)
npm run remove-all-posts

# ⚠️ PELIGRO: Eliminar TODOS los posts de linkedin-posts-apify
npm run remove-all-posts -- --confirm
```

### Cómo funciona:
1. **🔍 Busca en pipeline correcto**: Pipeline "Prospección" (811215668) donde linkedin-posts-apify crea deals
2. **🎯 Identifica formato específico**: Solo deals con `"Post: [Nombre] - Post LinkedIn"`
3. **🗑️ Elimina TODOS**: Sin excepciones, sin distinciones
4. **⚡ Eliminación masiva**: Procesa todos los encontrados

### Ejemplo de salida:
```
🔍 Buscando todos los deals creados por linkedin-posts-apify...
📄 Página obtenida: 100 deals totales, 45 con formato Post
📄 Página obtenida: 100 deals totales, 38 con formato Post
...
✅ Total de deals encontrados: 483

📋 Ejemplos de deals a eliminar:
   🗑️  Post: Pablo Fernández de Bobadilla - Post LinkedIn (ID: 52879951751)
   🗑️  Post: Aracely Gomez Diaz Barriga - Post LinkedIn (ID: 52940557640)
   ...

⚠️  Se eliminarán 483 deals en total
```

### 🚨 Riesgos:
- ❌ **Elimina TODO**: Incluyendo posts únicos y válidos
- ❌ **Sin respaldo**: Los deals se pierden permanentemente
- ❌ **No reversible**: No hay manera de recuperar los deals
- ⚠️ **Usa solo si estás seguro**: Este script es destructivo por diseño

### 💡 Recomendaciones:
- ✅ **Primero usa** `npm run remove-duplicates` si solo quieres eliminar duplicados
- ✅ **Haz backup** si tienes deals importantes
- ✅ **Revisa los ejemplos** antes de confirmar
- ✅ **Usa con precaución**: Este script no discrimina
