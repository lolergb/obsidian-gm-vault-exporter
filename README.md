# GM Vault Exporter - Plugin de Obsidian

Plugin de Obsidian que expone un endpoint HTTP local para generar JSON compatible con GM Vault desde tus notas de sesión.

## 🎯 ¿Qué es esto?

Este plugin permite a los Game Masters (GMs) de juegos de rol usar sus notas de Obsidian directamente con **GM Vault**, una extensión de Owlbear Rodeo que organiza y muestra contenido durante las sesiones.

El plugin:
- ✅ Lee una **Página de Sesión** seleccionada en Obsidian
- ✅ Expone su estructura como JSON en `http://localhost:3000/gm-vault`
- ✅ Renderiza páginas individuales como HTML en `http://localhost:3000/pages/:slug`
- ✅ Funciona solo en localhost (seguro y privado)
- ✅ Está desactivado por defecto (debes habilitarlo explícitamente)

## 📋 ¿Qué es una Página de Sesión?

Una **Página de Sesión** es una nota de Obsidian que organiza tu contenido de juego usando una estructura específica:

- **Headings (H1/H2)** representan **categorías** (carpetas en GM Vault)
- **Wiki links** `[[nombre|texto]]` bajo un heading representan **páginas**
- **Headings especiales** aplican tipos de bloque:
  - `## Tables` → páginas con `blockTypes: ["table"]`
  - `## Quotes` → páginas con `blockTypes: ["quote"]`
  - `## Images` → páginas con `blockTypes: ["image"]`
  - `## Enemies` → crea subcategorías para enemigos

### Ejemplo de Página de Sesión

```markdown
# Mi Aventura

## Acto I

- [[Escena 1|La llegada]]
- [[Escena 2|El encuentro]]

## Tables

- [[Tabla de encuentros aleatorios]]

## Enemies

- [[Goblin]]
- [[Orco]]
```

Esto se convierte en:
- Categoría "Acto I" con dos páginas
- Categoría "Tables" con una página (tipo "table")
- Categoría "Enemies" con dos subcategorías (una por enemigo)

## 🚀 Cómo usar

### 1. Instalación

1. **Instala cloudflared** (requerido para el túnel HTTPS):
   - **macOS**: `brew install cloudflared`
   - **Linux**: Descarga desde https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/
   - **Windows**: Descarga el ejecutable desde la misma URL
   - Verifica la instalación: `cloudflared --version`

2. Copia esta carpeta a `.obsidian/plugins/gm-vault-exporter/` en tu vault
3. Recarga Obsidian
4. Activa el plugin en Configuración → Plugins

### 2. Seleccionar una Página de Sesión

1. Abre la nota que quieres usar como página de sesión
2. Ejecuta el comando: **"Seleccionar página de sesión"**
   - O usa `Cmd/Ctrl + P` y busca "Seleccionar página de sesión"

### 3. Habilitar el acceso

1. Ejecuta el comando: **"Habilitar acceso a GM Vault"**
   - El servidor se iniciará localmente
   - **Se creará automáticamente un túnel HTTPS público** (usando cloudflared)
   - Verás una notificación con la **URL HTTPS pública**: `https://random-name.trycloudflare.com`

### 4. Conectar GM Vault

En GM Vault (Owlbear Rodeo):

**Usa la URL HTTPS pública (Recomendado):**
1. Ve a Configuración en GM Vault
2. En "Importar JSON", pega la **URL HTTPS pública** que aparece en la notificación: `https://random-name.trycloudflare.com/gm-vault`
3. GM Vault cargará tu estructura de sesión

> 💡 **Nota**: 
> - La URL pública es **HTTPS** (segura) y temporal (cambia cada vez que activas el servidor)
> - Es **gratis** y **sin registro**
> - Requiere tener **cloudflared** instalado
> - Esta es la única URL que debes usar (el servidor local HTTP es solo interno)

### 5. Ver la URL pública (cuando la necesites)

Ejecuta el comando: **"Mostrar URL pública del túnel"**
- Te mostrará la URL pública actual
- La copiará automáticamente al portapapeles
- Útil si olvidaste la URL o necesitas compartirla

### 6. Deshabilitar (cuando termines)

Ejecuta el comando: **"Deshabilitar acceso a GM Vault"**
- Esto detendrá tanto el servidor local como el túnel público

## 🔒 Seguridad

- ✅ El servidor **solo escucha en localhost** (127.0.0.1)
- ✅ **Túnel HTTPS público opcional** usando cloudflared (Cloudflare)
  - La URL pública es temporal y se genera aleatoriamente (ej: `https://random-name.trycloudflare.com`)
  - Solo funciona mientras el servidor está activo
  - Gratuito y sin registro
  - Requiere tener cloudflared instalado en tu sistema
- ✅ **CORS está habilitado** para permitir conexiones desde el navegador
  - Incluye soporte para Private Network Access (Chrome)
- ✅ El servidor está **desactivado por defecto**
- ✅ Solo se activa cuando lo habilitas explícitamente

> ⚠️ **Importante**: Si usas el túnel público, cualquier persona con la URL puede acceder a tus notas mientras el servidor esté activo. Solo comparte la URL con personas de confianza.

## 📡 Endpoints HTTP

### `GET /gm-vault`

Retorna el JSON completo de la sesión en formato GM Vault.

**Respuesta:**
```json
{
  "categories": [
    {
      "name": "Acto I",
      "pages": [
        {
          "name": "La llegada",
          "url": "http://localhost:3000/pages/escena-1"
        }
      ]
    }
  ]
}
```

### `GET /pages/:slug`

Renderiza una página Markdown como HTML.

**Ejemplo:** `GET /pages/escena-1` → HTML renderizado de la nota "Escena 1"

## 🏗️ Arquitectura

El plugin está diseñado con una arquitectura limpia y modular:

- **`PluginController`**: Orquesta todos los módulos, maneja comandos
- **`ServerManager`**: Gestiona el servidor HTTP (inicio/parada/rutas)
- **`TunnelManager`**: Gestiona el túnel HTTPS público con localtunnel
- **`SessionParser`**: Lee y parsea notas de Obsidian → modelos de dominio
- **`GMVaultJSONBuilder`**: Convierte modelos → JSON de GM Vault
- **`MarkdownRenderer`**: Convierte Markdown → HTML
- **Modelos de dominio**: `Session`, `Category`, `Page` (framework-agnósticos)

Esta arquitectura facilita:
- ✅ Testing futuro
- ✅ Extensiones (Dataview, múltiples sesiones, etc.)
- ✅ Mantenimiento y debugging

## 🐛 Solución de problemas

### "El puerto 3000 ya está en uso"

Cambia el puerto editando `PluginController.js` (línea `this.port = 3000`).

### "No hay página de sesión seleccionada"

1. Abre la nota que quieres usar
2. Ejecuta "Seleccionar página de sesión"

### Las páginas no se cargan en GM Vault

1. Verifica que el servidor esté activo (deberías ver una notificación)
2. Abre `http://localhost:3000/gm-vault` en tu navegador para verificar
3. Revisa la consola del navegador en GM Vault para errores

## 📝 Notas

- El plugin **no modifica** tus notas de Obsidian
- Es **solo lectura** (no puedes editar desde GM Vault)
- Los cambios en Obsidian requieren **recargar** en GM Vault
- El servidor se detiene automáticamente al desactivar el plugin

## 🔮 Futuras mejoras

La arquitectura permite fácilmente:
- Soporte para Dataview queries
- Múltiples sesiones simultáneas
- Más tipos de bloque
- Exportación a otros formatos
- Autenticación opcional

---

**Desarrollado con ❤️ para la comunidad de GMs de juegos de rol**

