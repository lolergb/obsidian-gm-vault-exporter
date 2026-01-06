# 📦 Guía de Instalación

## Método 1: Instalación Manual (Recomendado)

### Paso 1: Localizar tu Vault de Obsidian

Abre Obsidian y ve a **Configuración → Archivos y enlaces → Ubicación del vault**.

O busca la carpeta `.obsidian` en tu vault (normalmente está oculta).

### Paso 2: Copiar el plugin

Copia toda la carpeta del plugin a la carpeta de plugins de Obsidian:

**En macOS/Linux:**
```bash
# Reemplaza /ruta/a/tu/vault con la ruta real de tu vault
cp -r /Users/lole/Sites/obsidian-gm-vault-plugin /ruta/a/tu/vault/.obsidian/plugins/gm-vault-exporter
```

**En Windows (PowerShell):**
```powershell
# Reemplaza C:\ruta\a\tu\vault con la ruta real de tu vault
Copy-Item -Recurse "C:\ruta\al\plugin\obsidian-gm-vault-plugin" "C:\ruta\a\tu\vault\.obsidian\plugins\gm-vault-exporter"
```

**O manualmente:**
1. Abre Finder (macOS) o Explorador de archivos (Windows)
2. Navega a tu vault de Obsidian
3. Abre la carpeta `.obsidian` (puede estar oculta, presiona `Cmd+Shift+.` en macOS para mostrar archivos ocultos)
4. Abre la carpeta `plugins`
5. Copia toda la carpeta `obsidian-gm-vault-plugin` aquí
6. Renómbrala a `gm-vault-exporter` (opcional, pero recomendado)

### Paso 3: Activar el plugin

1. Abre Obsidian
2. Ve a **Configuración** (⚙️) → **Plugins de la comunidad**
3. Busca **"GM Vault Exporter"** en la lista
4. Activa el toggle junto al plugin

### Paso 4: Verificar la instalación

Deberías ver los comandos del plugin disponibles:
- `Cmd+P` (macOS) o `Ctrl+P` (Windows/Linux)
- Busca "Habilitar acceso a GM Vault"

## Método 2: Usando un enlace simbólico (Desarrollo)

Si estás desarrollando el plugin y quieres que los cambios se reflejen automáticamente:

**En macOS/Linux:**
```bash
ln -s /Users/lole/Sites/obsidian-gm-vault-plugin /ruta/a/tu/vault/.obsidian/plugins/gm-vault-exporter
```

**En Windows (PowerShell como Administrador):**
```powershell
New-Item -ItemType SymbolicLink -Path "C:\ruta\a\tu\vault\.obsidian\plugins\gm-vault-exporter" -Target "C:\ruta\al\plugin\obsidian-gm-vault-plugin"
```

## Estructura de archivos requerida

El plugin debe tener esta estructura en `.obsidian/plugins/gm-vault-exporter/`:

```
gm-vault-exporter/
├── main.js          ✅ (archivo compilado)
├── manifest.json    ✅
└── src/             ✅ (código fuente, opcional)
```

## Verificar que todo está correcto

Ejecuta este comando para verificar que los archivos necesarios están presentes:

```bash
cd /ruta/a/tu/vault/.obsidian/plugins/gm-vault-exporter
ls -la main.js manifest.json
```

Ambos archivos deben existir.

## Solución de problemas

### El plugin no aparece en la lista

1. Verifica que los archivos `main.js` y `manifest.json` estén en la carpeta correcta
2. Reinicia Obsidian completamente
3. Verifica que el plugin no esté en la lista de plugins deshabilitados

### Error al cargar el plugin

1. Abre la **Consola de desarrollador** en Obsidian (`Cmd+Option+I` en macOS, `Ctrl+Shift+I` en Windows/Linux)
2. Revisa los errores en la consola
3. Verifica que `main.js` esté compilado correctamente (ejecuta `npm run build`)

### El servidor no inicia

1. Verifica que el puerto 3000 no esté en uso
2. Asegúrate de haber seleccionado una página de sesión primero
3. Revisa las notificaciones de Obsidian para ver mensajes de error

## Próximos pasos

Una vez instalado, consulta el [README.md](README.md) para aprender a usar el plugin.

