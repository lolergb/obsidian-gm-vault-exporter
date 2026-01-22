/**
 * @fileoverview Exportador de vault que genera un JSON compatible con GM Vault.
 * 
 * Este exportador es para el enfoque local-first:
 * - No requiere servidor HTTP
 * - Las imágenes locales se omiten (se recomienda usar URLs externas)
 * - El HTML viene pre-renderizado con estilos de Notion
 * - Los wiki links se convierten en mentions clickeables
 * - Compatible con GM Vault (formato items[] con htmlContent)
 */

import { TFile, TFolder } from 'obsidian';
import MarkdownIt from 'markdown-it';

/**
 * Genera un ID único para páginas (mismo formato que GM Vault)
 * @returns {string}
 */
function generatePageId() {
	const timestamp = Date.now().toString(36);
	const random = Math.random().toString(36).slice(2, 8);
	return `page_${timestamp}_${random}`;
}

/**
 * Exportador de vault a JSON con HTML embebido y mentions.
 * 
 * @class VaultExporter
 */
export class VaultExporter {
	/**
	 * Crea una instancia de VaultExporter.
	 * 
	 * @param {import('obsidian').App} app - Instancia de la app de Obsidian
	 */
	constructor(app) {
		/** @type {import('obsidian').App} */
		this.app = app;
		
		/** @type {MarkdownIt} */
		this.md = new MarkdownIt({
			html: true,
			linkify: true,
			typographer: true,
			breaks: false  // No convertir saltos de línea simples en <br>
		});
		
		/**
		 * Mapeo de nombres de archivo a información de página
		 * @type {Map<string, {id: string, name: string}>}
		 */
		this.pageMap = new Map();
	}

	/**
	 * Exporta el vault desde la carpeta de sesión seleccionada.
	 * 
	 * @param {import('obsidian').TFolder} sessionFolder - Carpeta de sesión
	 * @returns {Promise<Object>} JSON compatible con GM Vault
	 */
	async exportVault(sessionFolder) {
		// Paso 1: Escanear todos los archivos y crear el mapeo de IDs
		this.pageMap.clear();
		await this._buildPageMap(sessionFolder);
		
		// Paso 2: Obtener nombre de la categoría raíz
		const sessionFile = await this._findSessionFile(sessionFolder);
		const rootCategoryName = sessionFile 
			? await this._getRootCategoryName(sessionFile)
			: sessionFolder.name;
		
		// Paso 3: Exportar la estructura con mentions resueltos
		const rootCategory = await this._exportFolder(sessionFolder, sessionFile);
		rootCategory.name = rootCategoryName;
		
		return { 
			categories: [rootCategory]
		};
	}

	/**
	 * Construye el mapeo de nombres de archivo a IDs.
	 * Escanea recursivamente todos los archivos markdown.
	 * 
	 * @private
	 * @param {import('obsidian').TFolder} folder - Carpeta a escanear
	 */
	async _buildPageMap(folder) {
		for (const child of folder.children || []) {
			if (child instanceof TFile && child.extension === 'md') {
				const pageName = await this._getPageName(child);
				const pageId = generatePageId();
				
				// Guardar por basename (sin extensión) para resolución de wiki links
				this.pageMap.set(child.basename.toLowerCase(), { 
					id: pageId, 
					name: pageName,
					path: child.path
				});
				
				// También guardar por nombre de página si es diferente
				if (pageName.toLowerCase() !== child.basename.toLowerCase()) {
					this.pageMap.set(pageName.toLowerCase(), { 
						id: pageId, 
						name: pageName,
						path: child.path
					});
				}
			} else if (child instanceof TFolder) {
				// También registrar carpetas de imágenes como páginas
				const imageFiles = await this._getImageFiles(child);
				const hasOnlyImages = imageFiles.length > 0 && 
					child.children.filter(c => c instanceof TFile && c.extension === 'md').length === 0 &&
					child.children.filter(c => c.children !== undefined).length === 0;
				
				if (hasOnlyImages) {
					const pageId = generatePageId();
					this.pageMap.set(child.name.toLowerCase(), {
						id: pageId,
						name: child.name,
						path: child.path
					});
				}
				
				// Recursión para subcarpetas
				await this._buildPageMap(child);
			}
		}
	}

	/**
	 * Exporta una carpeta como categoría con items.
	 * 
	 * @private
	 * @param {import('obsidian').TFolder} folder - Carpeta a exportar
	 * @param {import('obsidian').TFile|null} sessionFile - Archivo de sesión a excluir
	 * @returns {Promise<Object>} Categoría en formato JSON (items[])
	 */
	async _exportFolder(folder, sessionFile = null) {
		const items = [];
		const children = folder.children || [];
		
		// Separar archivos y carpetas
		const files = [];
		const folders = [];
		
		for (const child of children) {
			if (child instanceof TFolder) {
				folders.push(child);
			} else if (child instanceof TFile && child.extension === 'md') {
				files.push(child);
			}
		}
		
		// Ordenar alfabéticamente
		files.sort((a, b) => a.name.localeCompare(b.name));
		folders.sort((a, b) => a.name.localeCompare(b.name));
		
		// Exportar archivos como páginas
		for (const file of files) {
			// Excluir el archivo de sesión
			if (sessionFile && file.path === sessionFile.path) {
				continue;
			}
			
			const pageItem = await this._exportPage(file, folder);
			items.push(pageItem);
		}
		
		// Exportar subcarpetas
		for (const subFolder of folders) {
			// Verificar si la carpeta solo contiene imágenes
			const imageFiles = await this._getImageFiles(subFolder);
			const hasOnlyImages = imageFiles.length > 0 && 
				subFolder.children.filter(c => c instanceof TFile && c.extension === 'md').length === 0 &&
				subFolder.children.filter(c => c.children !== undefined).length === 0;
			
			if (hasOnlyImages) {
				// Crear una página de galería de imágenes
				const galleryItem = await this._exportImageGallery(subFolder, imageFiles);
				items.push(galleryItem);
			} else {
				// Carpeta normal: crear subcategoría
				const subCategory = await this._exportFolder(subFolder, null);
				items.push({
					type: 'category',
					...subCategory
				});
			}
		}
		
		return {
			name: folder.name,
			items
		};
	}

	/**
	 * Exporta un archivo markdown como página con HTML embebido y mentions.
	 * 
	 * @private
	 * @param {import('obsidian').TFile} file - Archivo a exportar
	 * @param {import('obsidian').TFolder} parentFolder - Carpeta padre
	 * @returns {Promise<Object>} Página en formato JSON con htmlContent
	 */
	async _exportPage(file, parentFolder) {
		const pageName = await this._getPageName(file);
		const pageInfo = this.pageMap.get(file.basename.toLowerCase());
		const pageId = pageInfo?.id || generatePageId();
		
		const markdown = await this.app.vault.read(file);
		
		// Renderizar markdown a HTML
		let html = this._renderMarkdown(markdown);
		
		// Procesar imágenes
		html = await this._processImages(html, parentFolder);
		
		// Convertir wiki links a mentions
		html = this._convertWikiLinksToMentions(html);
		
		// Convertir tags de Obsidian a tags de Notion
		html = this._convertTagsToNotionTags(html);
		
		// Añadir clases de Notion
		html = this._addNotionClasses(html);
		
		// Envolver en estructura
		const htmlContent = this._wrapInNotionStructure(html, pageName);
		
		return {
			type: 'page',
			id: pageId,
			name: pageName,
			htmlContent
		};
	}

	/**
	 * Exporta una carpeta de imágenes como galería.
	 * 
	 * @private
	 * @param {import('obsidian').TFolder} folder - Carpeta de imágenes
	 * @param {import('obsidian').TFile[]} imageFiles - Archivos de imagen
	 * @returns {Promise<Object>} Página de galería con HTML embebido
	 */
	async _exportImageGallery(folder, imageFiles) {
		const pageInfo = this.pageMap.get(folder.name.toLowerCase());
		const pageId = pageInfo?.id || generatePageId();
		
		// Generar HTML de galería con placeholders
		let imagesHtml = '';
		for (let i = 0; i < imageFiles.length; i += 3) {
			imagesHtml += '<div class="notion-column-list">';
			
			for (let j = 0; j < 3 && (i + j) < imageFiles.length; j++) {
				const imageFile = imageFiles[i + j];
				imagesHtml += `<div class="notion-column">
	<div class="notion-image-container" style="padding: 20px; text-align: center; background: #f5f5f5; border-radius: 4px;">
		<p style="color: #666; margin: 0;">🖼️ ${this._escapeHtml(imageFile.name)}</p>
		<p style="color: #999; font-size: 12px; margin: 5px 0 0 0;">(Usa URL externa)</p>
	</div>
</div>`;
			}
			
			imagesHtml += '</div>';
		}
		
		const htmlContent = `<h1 class="notion-page-title">${this._escapeHtml(folder.name)}</h1>
<div class="notion-callout" style="background: #fef3c7; border-left: 3px solid #f59e0b; padding: 12px; margin: 16px 0; border-radius: 4px;">
	<p style="margin: 0; color: #92400e;">
		<strong>💡 Tip:</strong> Sube las imágenes a un servicio de hosting (Imgur, Cloudinary) y usa URLs externas.
	</p>
</div>
${imagesHtml}`;
		
		return {
			type: 'page',
			id: pageId,
			name: folder.name,
			blockTypes: ['image'],
			htmlContent
		};
	}

	/**
	 * Renderiza markdown a HTML (sin configuración especial de wiki links).
	 * 
	 * @private
	 * @param {string} markdown - Contenido markdown
	 * @returns {string} HTML renderizado
	 */
	_renderMarkdown(markdown) {
		let html = this.md.render(markdown);
		
		// Limpiar saltos de línea innecesarios al inicio y final
		html = html.replace(/^\s*\n+/g, '');
		html = html.replace(/\n+\s*$/g, '');
		
		// Limpiar múltiples saltos de línea consecutivos (más de 2)
		html = html.replace(/\n{3,}/g, '\n\n');
		
		// Limpiar <br> tags innecesarios dentro de párrafos (excepto si son intencionales)
		// Convertir <br><br> o múltiples <br> seguidos en un solo salto de párrafo
		html = html.replace(/(<br\s*\/?>\s*){2,}/gi, '</p><p class="notion-paragraph">');
		
		// Limpiar espacios en blanco excesivos dentro de párrafos
		html = html.replace(/(<p[^>]*>)\s+/g, '$1');
		html = html.replace(/\s+(<\/p>)/g, '$1');
		
		return html;
	}

	/**
	 * Convierte wiki links [[nombre]] a mentions de GM Vault.
	 * 
	 * @private
	 * @param {string} html - HTML con wiki links sin procesar
	 * @returns {string} HTML con mentions
	 */
	_convertWikiLinksToMentions(html) {
		// Buscar wiki links: [[nombre]] o [[nombre|display]]
		const wikiLinkRegex = /\[\[([^\]]+)\]\]/g;
		
		return html.replace(wikiLinkRegex, (match, linkContent) => {
			// Separar path y display name
			const parts = linkContent.split('|');
			const linkPath = parts[0].trim();
			const displayName = (parts[1] || parts[0]).trim();
			
			// Buscar la página en el mapeo
			const pageInfo = this.pageMap.get(linkPath.toLowerCase());
			
			if (pageInfo) {
				// Página encontrada en el vault: crear mention clickeable
				return `<span 
					class="notion-mention notion-mention--link" 
					data-mention-page-id="${pageInfo.id}"
					data-mention-page-name="${this._escapeHtml(pageInfo.name)}"
					role="button"
					tabindex="0"
					aria-label="Open ${this._escapeHtml(pageInfo.name)}"
				>${this._escapeHtml(displayName)}</span>`;
			} else {
				// Página no encontrada: renderizar como texto plano
				return `<span 
					class="notion-mention notion-mention--plain" 
					data-mention-page-name="${this._escapeHtml(linkPath)}"
				>${this._escapeHtml(displayName)}</span>`;
			}
		});
	}

	/**
	 * Convierte tags de Obsidian (#tag) a tags de Notion.
	 * 
	 * @private
	 * @param {string} html - HTML con tags de Obsidian
	 * @returns {string} HTML con tags de Notion
	 */
	_convertTagsToNotionTags(html) {
		// Colores disponibles de Notion (sin el prefijo "notion-tag--")
		const colors = ['default', 'gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'];
		
		/**
		 * Obtiene un color consistente para un tag basado en su nombre
		 * @param {string} tagName - Nombre del tag
		 * @returns {string} Color de Notion
		 */
		const getTagColor = (tagName) => {
			// Hash simple del nombre para consistencia
			let hash = 0;
			for (let i = 0; i < tagName.length; i++) {
				hash = ((hash << 5) - hash) + tagName.charCodeAt(i);
				hash = hash & hash; // Convertir a 32bit integer
			}
			return colors[Math.abs(hash) % colors.length];
		};
		
		// Patrón 1: tags: #tag1, #tag2 o tags: #tag1 #tag2 (al final de párrafos)
		// Buscar líneas que empiecen con "tags:" seguido de tags
		html = html.replace(
			/<p[^>]*>tags:\s*([^<]+)<\/p>/gi,
			(match, tagsText) => {
				// Extraer todos los tags (#tag)
				const tagMatches = tagsText.match(/#[\w-]+/g) || [];
				if (tagMatches.length === 0) return match;
				
				// Convertir cada tag a tag de Notion
				const notionTags = tagMatches.map(tag => {
					const tagName = tag.substring(1); // Quitar el #
					const color = getTagColor(tagName);
					return `<span class="notion-tag notion-tag--${color}">${this._escapeHtml(tagName)}</span>`;
				}).join(' ');
				
				return `<p class="notion-paragraph">${notionTags}</p>`;
			}
		);
		
		// Patrón 2: Tags individuales en línea (#tag)
		// Procesar solo dentro de párrafos y listas, evitando code blocks
		// Dividir el HTML en partes: dentro y fuera de code blocks
		const parts = [];
		let lastIndex = 0;
		const codeBlockRegex = /<code[^>]*>[\s\S]*?<\/code>/gi;
		let match;
		
		while ((match = codeBlockRegex.exec(html)) !== null) {
			// Procesar texto antes del code block
			if (match.index > lastIndex) {
				const beforeCode = html.substring(lastIndex, match.index);
				parts.push({ text: beforeCode, isCode: false });
			}
			// Guardar el code block sin procesar
			parts.push({ text: match[0], isCode: true });
			lastIndex = match.index + match[0].length;
		}
		
		// Procesar el resto del texto
		if (lastIndex < html.length) {
			parts.push({ text: html.substring(lastIndex), isCode: false });
		}
		
		// Procesar solo las partes que no son code blocks
		const processedParts = parts.map(part => {
			if (part.isCode) {
				return part.text;
			}
			
			// Reemplazar tags en esta parte
			return part.text.replace(
				/(?<![\w-])#([\w-]+)(?![\w-])/g,
				(match, tagName) => {
					const color = getTagColor(tagName);
					return `<span class="notion-tag notion-tag--${color}">${this._escapeHtml(tagName)}</span>`;
				}
			);
		});
		
		return processedParts.join('');
	}

	/**
	 * Procesa imágenes en el HTML.
	 * Las imágenes locales se reemplazan con placeholders.
	 * Las URLs externas se mantienen.
	 * 
	 * @private
	 * @param {string} html - HTML con imágenes
	 * @param {import('obsidian').TFolder} contextFolder - Carpeta de contexto
	 * @returns {Promise<string>} HTML procesado
	 */
	async _processImages(html, contextFolder) {
		// Buscar imágenes HTML
		const imgRegex = /<img\s+[^>]*src="([^"]+)"[^>]*>/gi;
		let matches = [...html.matchAll(imgRegex)];
		
		for (const match of matches) {
			const [fullMatch, src] = match;
			
			// Si ya es URL externa, mantenerla con clase clickeable
			if (src.startsWith('http://') || src.startsWith('https://')) {
				const newImg = fullMatch.replace('<img', '<img class="notion-image-clickable" data-image-url="' + src + '"');
				html = html.replace(fullMatch, newImg);
				continue;
			}
			
			// Si es base64, mantenerla
			if (src.startsWith('data:')) {
				continue;
			}
			
			// Imagen local: reemplazar con placeholder
			const fileName = src.split('/').pop() || 'imagen';
			const placeholder = this._createImagePlaceholder(fileName);
			html = html.replace(fullMatch, placeholder);
		}
		
		// Buscar imágenes en formato Obsidian: ![[imagen.png]]
		const obsidianImgRegex = /!\[\[([^\]]+)\]\]/g;
		matches = [...html.matchAll(obsidianImgRegex)];
		
		for (const match of matches) {
			const [fullMatch, imagePath] = match;
			
			// Si contiene http, es una URL externa embebida
			if (imagePath.includes('http://') || imagePath.includes('https://')) {
				const url = imagePath.split('|')[0].trim();
				const imgHtml = `<div class="notion-image-container">
					<img src="${url}" alt="Image" class="notion-image-clickable" data-image-url="${url}" />
				</div>`;
				html = html.replace(fullMatch, imgHtml);
				continue;
			}
			
			// Imagen local: placeholder
			const fileName = imagePath.split('|')[0].trim();
			const placeholder = this._createImagePlaceholder(fileName);
			html = html.replace(fullMatch, placeholder);
		}
		
		return html;
	}

	/**
	 * Crea un placeholder para una imagen local.
	 * 
	 * @private
	 * @param {string} fileName - Nombre del archivo
	 * @returns {string} HTML del placeholder
	 */
	_createImagePlaceholder(fileName) {
		return `<div class="notion-image-container" style="padding: 20px; text-align: center; background: #f5f5f5; border-radius: 4px;">
			<p style="color: #666; margin: 0;">🖼️ ${this._escapeHtml(fileName)}</p>
			<p style="color: #999; font-size: 12px; margin: 5px 0 0 0;">(Usa URL externa)</p>
		</div>`;
	}

	/**
	 * Añade clases de Notion al HTML renderizado.
	 * 
	 * @private
	 * @param {string} html - HTML renderizado
	 * @returns {string} HTML con clases de Notion
	 */
	_addNotionClasses(html) {
		let processed = html;
		
		// Limpiar saltos de línea dentro de párrafos antes de procesar
		// Reemplazar saltos de línea simples dentro de <p> por espacios
		processed = processed.replace(/(<p[^>]*>)([\s\S]*?)(<\/p>)/gi, (match, openTag, content, closeTag) => {
			// Limpiar saltos de línea y espacios múltiples dentro del contenido
			const cleaned = content.replace(/\n+/g, ' ').replace(/\s{2,}/g, ' ').trim();
			return openTag + cleaned + closeTag;
		});
		
		// Párrafos
		processed = processed.replace(/<p>/gi, '<p class="notion-paragraph">');
		
		// Listas
		processed = processed.replace(/<ul>/gi, '<ul class="notion-bulleted-list">');
		processed = processed.replace(/<ol>/gi, '<ol class="notion-numbered-list">');
		processed = processed.replace(/<li>/gi, '<li class="notion-list-item">');
		
		// Headings
		processed = processed.replace(/<h1>/gi, '<h1 class="notion-heading-1">');
		processed = processed.replace(/<h2>/gi, '<h2 class="notion-heading-2">');
		processed = processed.replace(/<h3>/gi, '<h3 class="notion-heading-3">');
		
		// Código
		processed = processed.replace(/<pre>/gi, '<pre class="notion-code">');
		processed = processed.replace(/<code>/gi, '<code class="notion-text-code">');
		
		// Enlaces externos (no mentions) - añadir target y rel para abrir en nueva pestaña
		processed = processed.replace(/<a\s+href="([^"]+)"([^>]*)>/gi, (match, href, rest) => {
			// Si ya tiene target, no modificar
			if (rest.includes('target=')) {
				return `<a class="notion-text-link" href="${href}"${rest}>`;
			}
			return `<a class="notion-text-link" href="${href}" target="_blank" rel="noopener noreferrer"${rest}>`;
		});
		
		// Blockquotes
		processed = processed.replace(/<blockquote>/gi, '<blockquote class="notion-quote">');
		
		// Tablas
		processed = processed.replace(/<table>/gi, '<table class="notion-table">');
		
		// Separadores
		processed = processed.replace(/<hr>/gi, '<hr class="notion-divider">');
		processed = processed.replace(/<hr\s*\/>/gi, '<hr class="notion-divider">');
		
		// Strong/Bold
		processed = processed.replace(/<strong>/gi, '<strong class="notion-text-bold">');
		processed = processed.replace(/<b>/gi, '<b class="notion-text-bold">');
		
		// Italic
		processed = processed.replace(/<em>/gi, '<em class="notion-text-italic">');
		processed = processed.replace(/<i>/gi, '<i class="notion-text-italic">');
		
		return processed;
	}

	/**
	 * Envuelve el contenido en la estructura de Notion.
	 * 
	 * @private
	 * @param {string} content - Contenido HTML
	 * @param {string} title - Título de la página (puede contener markdown)
	 * @returns {string} HTML con estructura de Notion
	 */
	_wrapInNotionStructure(content, title) {
		// Remover el primer H1 si existe (el título del markdown)
		// para evitar duplicar el título
		let cleanedContent = content;
		
		// Buscar y remover el primer H1 (puede tener clases de Notion ya aplicadas)
		cleanedContent = cleanedContent.replace(
			/^<h1[^>]*>.*?<\/h1>\s*/i,
			''
		);
		
		// También buscar H1 que pueda estar al inicio de un párrafo o bloque
		cleanedContent = cleanedContent.replace(
			/^<p[^>]*>\s*<h1[^>]*>.*?<\/h1>\s*<\/p>\s*/i,
			''
		);
		
		// Renderizar el título si contiene markdown (ej: **texto**, *texto*, etc.)
		let titleHtml = title;
		if (title.includes('**') || title.includes('*') || title.includes('`') || title.includes('[')) {
			// Renderizar el markdown del título
			titleHtml = this.md.renderInline(title);
			// Aplicar clases de Notion al HTML renderizado
			titleHtml = titleHtml.replace(/<strong>/gi, '<strong class="notion-text-bold">');
			titleHtml = titleHtml.replace(/<em>/gi, '<em class="notion-text-italic">');
			titleHtml = titleHtml.replace(/<code>/gi, '<code class="notion-text-code">');
		} else {
			// Si no tiene markdown, solo escapar HTML
			titleHtml = this._escapeHtml(title);
		}
		
		// Limpiar saltos de línea innecesarios al inicio del contenido
		cleanedContent = cleanedContent.replace(/^\s*\n+/g, '');
		
		return `<h1 class="notion-page-title">${titleHtml}</h1>${cleanedContent}`;
	}

	// ============================================
	// MÉTODOS AUXILIARES
	// ============================================

	/**
	 * Busca un archivo de sesión dentro de la carpeta.
	 * @private
	 */
	async _findSessionFile(folder) {
		for (const child of folder.children || []) {
			if (child instanceof TFile && child.extension === 'md') {
				if (child.basename === folder.name) {
					return child;
				}
			}
		}
		return null;
	}

	/**
	 * Obtiene el nombre de la categoría raíz desde el archivo de sesión.
	 * @private
	 */
	async _getRootCategoryName(sessionFile) {
		const content = await this.app.vault.read(sessionFile);
		const lines = content.split('\n');
		const h1Regex = /^#\s+(.+)$/;
		for (const line of lines) {
			const match = line.match(h1Regex);
			if (match) {
				let name = match[1].trim();
				// Limpiar markdown del nombre
				name = this._cleanMarkdownFromText(name);
				return name;
			}
		}
		return sessionFile.basename;
	}

	/**
	 * Obtiene el nombre de una página desde el archivo.
	 * @private
	 */
	async _getPageName(file) {
		try {
			const content = await this.app.vault.read(file);
			const lines = content.split('\n');
			const h1Regex = /^#\s+(.+)$/;
			for (const line of lines) {
				const match = line.match(h1Regex);
				if (match) {
					let name = match[1].trim();
					// Limpiar wiki links del título
					name = name.replace(/\[\[([^\]|]+)(\|[^\]]+)?\]\]/g, '$1');
					// Limpiar markdown del nombre (para el campo name del JSON)
					name = this._cleanMarkdownFromText(name);
					return name;
				}
			}
		} catch (e) {
			// Error leyendo archivo
		}
		return file.basename;
	}

	/**
	 * Limpia el markdown de un texto, dejando solo el texto plano.
	 * Útil para nombres de páginas en el JSON.
	 * 
	 * @private
	 * @param {string} text - Texto con markdown
	 * @returns {string} Texto sin markdown
	 */
	_cleanMarkdownFromText(text) {
		if (!text) return text;
		
		// Remover negritas: **texto** o __texto__
		text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
		text = text.replace(/__([^_]+)__/g, '$1');
		
		// Remover cursivas: *texto* o _texto_
		text = text.replace(/\*([^*]+)\*/g, '$1');
		text = text.replace(/_([^_]+)_/g, '$1');
		
		// Remover código: `texto`
		text = text.replace(/`([^`]+)`/g, '$1');
		
		// Remover enlaces: [texto](url) o [texto][ref]
		text = text.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');
		text = text.replace(/\[([^\]]+)\]\[[^\]]+\]/g, '$1');
		
		// Remover imágenes: ![alt](url)
		text = text.replace(/!\[([^\]]*)\]\([^\)]+\)/g, '$1');
		
		// Remover tachado: ~~texto~~
		text = text.replace(/~~([^~]+)~~/g, '$1');
		
		// Limpiar espacios múltiples
		text = text.replace(/\s+/g, ' ').trim();
		
		return text;
	}

	/**
	 * Obtiene los archivos de imagen de una carpeta.
	 * @private
	 */
	async _getImageFiles(folder) {
		const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'];
		const imageFiles = [];
		
		for (const child of folder.children || []) {
			if (child instanceof TFile) {
				const ext = child.extension.toLowerCase();
				if (imageExtensions.includes(ext)) {
					imageFiles.push(child);
				}
			}
		}
		
		return imageFiles.sort((a, b) => a.name.localeCompare(b.name));
	}

	/**
	 * Escapa HTML para prevenir XSS.
	 * @private
	 */
	_escapeHtml(text) {
		if (!text) return '';
		const map = {
			'&': '&amp;',
			'<': '&lt;',
			'>': '&gt;',
			'"': '&quot;',
			"'": '&#039;'
		};
		return String(text).replace(/[&<>"']/g, m => map[m]);
	}
}

