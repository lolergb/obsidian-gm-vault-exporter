# Arquitectura del Plugin GM Vault Exporter

## 📐 Decisiones de Diseño

Este plugin está diseñado con una arquitectura limpia y modular que separa claramente las responsabilidades. Las decisiones clave son:

### 1. Separación de Responsabilidades

Cada módulo tiene una única responsabilidad:

- **PluginController**: Orquestación y coordinación (no contiene lógica de negocio)
- **ServerManager**: Gestión del servidor HTTP (inicio/parada/rutas, sin lógica de dominio)
- **SessionParser**: Conversión de Obsidian → Modelos de dominio (sin conocimiento de HTTP o JSON)
- **GMVaultJSONBuilder**: Conversión de Modelos → JSON (sin conocimiento de Obsidian)
- **MarkdownRenderer**: Conversión Markdown → HTML (independiente)
- **Modelos de dominio**: Clases puras sin dependencias externas

### 2. Framework-Agnostic Domain Models

Los modelos (`Session`, `Category`, `Page`) son clases JavaScript puras que:
- No dependen de Obsidian
- No dependen de HTTP
- Pueden ser testeados fácilmente
- Pueden ser reutilizados en otros contextos

### 3. Edge Isolation

El código de Obsidian solo aparece en:
- `main.js` (punto de entrada)
- `PluginController.js` (orquestación)
- `SessionParser.js` (lectura de archivos)

El resto del código es framework-agnóstico.

### 4. Extensibilidad

La arquitectura facilita futuras extensiones:

#### Soporte para Dataview
- Añadir `DataviewParser` que extienda `SessionParser`
- Los modelos de dominio no cambian

#### Múltiples Sesiones
- `PluginController` puede gestionar múltiples `SessionParser` instances
- `ServerManager` puede exponer rutas como `/sessions/:id/gm-vault`

#### Nuevos BlockTypes
- Añadir lógica en `SessionParser._parseSpecialHeading()`
- `GMVaultJSONBuilder` ya soporta cualquier `blockTypes` array

#### Otros Formatos de Exportación
- Crear `OtherFormatBuilder` similar a `GMVaultJSONBuilder`
- Reutilizar los mismos modelos de dominio

### 5. Testabilidad

Cada módulo puede ser testeado independientemente:

```javascript
// Ejemplo: testear SessionParser sin Obsidian
const mockApp = { vault: { read: async () => '# Category\n- [[Page]]' } };
const parser = new SessionParser(mockApp);
const session = await parser.parseSession(mockFile);
// Assert session.categories.length === 1
```

### 6. Manejo de Errores Defensivo

- `SessionParser` maneja gracefully secciones faltantes
- `ServerManager` valida rutas antes de procesar
- `PluginController` muestra errores amigables al usuario

### 7. Configuración y Estado

- El estado se guarda en `plugin.loadData()` / `plugin.saveData()`
- Configuración mínima (puerto, archivo de sesión, estado del servidor)
- Fácil de extender con más opciones

## 🔄 Flujo de Datos

```
Obsidian File
    ↓
SessionParser.parseSession()
    ↓
Session (Domain Model)
    ↓
GMVaultJSONBuilder.buildJSON()
    ↓
JSON (GM Vault format)
    ↓
ServerManager.sendJSON()
    ↓
HTTP Response
```

Para páginas individuales:

```
Obsidian File
    ↓
MarkdownRenderer.renderPage()
    ↓
HTML
    ↓
ServerManager.sendHTML()
    ↓
HTTP Response
```

## 🎯 Convenciones de Parsing

### Headings como Categorías
- H1 y H2 se convierten en categorías
- Headings ignorados: "Overall Narrative Structure", "Hooks & Motivations", etc.

### Wiki Links como Páginas
- `[[nombre]]` o `[[nombre|texto]]` bajo un heading = página
- El slug se genera desde el nombre del link

### Headings Especiales
- `## Tables` → `blockTypes: ["table"]`
- `## Quotes` → `blockTypes: ["quote"]`
- `## Images` → `blockTypes: ["image"]`
- `## Enemies` → crea subcategorías

## 🔐 Seguridad

- Servidor solo en localhost (127.0.0.1)
- CORS habilitado (configurable para restringir)
- Servidor desactivado por defecto
- Solo lectura (no modifica archivos)

## 📦 Dependencias

- **markdown-it**: Renderizado de Markdown a HTML
- **Node.js built-in**: `http`, `url` (sin dependencias externas pesadas)

## 🛠️ Desarrollo - Ciclo de Trabajo

### Cada vez que haces un cambio en el código:

```bash
# 1. Compilar el plugin
cd /Users/lole/Sites/obsidian-gm-vault-plugin
npm run build

# 2. Copiar al vault de Obsidian
cp main.js vault/.obsidian/plugins/gm-vault-exporter/

# 3. Recargar Obsidian
# - Cmd+R en Obsidian, o
# - Cerrar y abrir Obsidian
```

### Comando rápido (todo en uno):

```bash
cd /Users/lole/Sites/obsidian-gm-vault-plugin && npm run build && cp main.js vault/.obsidian/plugins/gm-vault-exporter/
```

### Estructura de archivos importante:

```
obsidian-gm-vault-plugin/
├── src/                    # ← Código fuente (editar aquí)
│   ├── main.js             # Punto de entrada
│   ├── PluginController.js # Orquestador
│   ├── models/             # Modelos de dominio
│   ├── parsers/            # Parsers
│   ├── renderers/          # Builders y renderers
│   ├── server/             # Servidor HTTP
│   └── utils/              # Utilidades
├── main.js                 # ← Compilado (NO editar)
├── manifest.json           # Metadata del plugin
└── vault/                  # Vault de prueba
    └── .obsidian/
        └── plugins/
            └── gm-vault-exporter/
                ├── main.js      # ← Copiar aquí
                └── manifest.json
```

### Verificar que el plugin carga:

1. Abrir Obsidian con el vault de prueba
2. Ir a Configuración → Plugins de la comunidad
3. Activar "GM Vault Exporter"
4. `Cmd+P` → buscar "Habilitar acceso a GM Vault"

### Si hay errores:

1. Abrir consola de desarrollador: `Cmd+Option+I`
2. Revisar errores en la pestaña Console
3. Corregir el código en `src/`
4. Repetir ciclo: compilar → copiar → recargar

## 🚀 Futuras Mejoras

La arquitectura permite fácilmente:

1. **Cache de sesiones parseadas** (evitar re-parsear en cada request)
2. **WebSockets para actualizaciones en tiempo real** (opcional)
3. **Autenticación básica** (añadir middleware en ServerManager)
4. **Métricas y logging** (añadir capa de observabilidad)
5. **Plugin settings UI** (usar Obsidian's SettingTab)

---

**Esta arquitectura prioriza:**
- ✅ Mantenibilidad
- ✅ Testabilidad
- ✅ Extensibilidad
- ✅ Claridad
- ✅ Separación de concerns

