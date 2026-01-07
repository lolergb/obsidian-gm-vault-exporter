/**
 * @fileoverview Renderizador que convierte archivos Markdown de Obsidian a HTML.
 * Usado exclusivamente por el endpoint GET /pages/:slug.
 * 
 * Utiliza markdown-it para el parsing y renderizado.
 */

import MarkdownIt from 'markdown-it';

/**
 * Renderizador de Markdown a HTML para páginas individuales.
 * 
 * @class MarkdownRenderer
 */
export class MarkdownRenderer {
	/**
	 * Crea una instancia de MarkdownRenderer.
	 */
	constructor() {
		/** @type {MarkdownIt} */
		this.md = new MarkdownIt({
			html: true,
			linkify: true,
			typographer: true
		});
		
		// Configura el renderizador para manejar wiki links de Obsidian
		this._configureWikiLinks();
	}

	/**
	 * Renderiza contenido Markdown a HTML.
	 * 
	 * @param {string} markdown - Contenido Markdown a renderizar
	 * @returns {string} HTML renderizado
	 */
	render(markdown) {
		return this.md.render(markdown);
	}

	/**
	 * Renderiza Markdown a HTML con un wrapper completo de página.
	 * 
	 * @param {string} markdown - Contenido Markdown
	 * @param {string} title - Título de la página
	 * @returns {string} HTML completo de la página
	 */
	renderPage(markdown, title) {
		const content = this.render(markdown);
		
		// No procesar aquí - GM Vault lo hará con applyNotionStyles()
		// Esto evita problemas con regex en Node.js
		
		return `<!DOCTYPE html>
<html lang="es">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>${this._escapeHtml(title)}</title>
</head>
<body>
	<div id="notion-content">
		${content}
	</div>
</body>
</html>`;
	}

	/**
	 * Añade clases de Notion al HTML renderizado usando regex.
	 * 
	 * @private
	 * @param {string} html - HTML renderizado
	 * @returns {string} HTML con clases de Notion
	 */
	_addNotionClasses(html) {
		let processed = html;
		
		// Función helper para añadir clase solo si no existe
		const addClass = (tag, className) => {
			// Buscar tags que no tengan la clase ya
			const regex = new RegExp(`<${tag}(?![^>]*class="[^"]*${className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})([^>]*)>`, 'gi');
			return processed.replace(regex, (match, attrs) => {
				// Si ya tiene atributos, añadir la clase al final
				if (attrs && attrs.trim()) {
					return `<${tag}${attrs} class="${className}">`;
				} else {
					return `<${tag} class="${className}">`;
				}
			});
		};
		
		// Normalizar párrafos
		processed = addClass('p', 'notion-paragraph');
		
		// Normalizar listas
		processed = addClass('ul', 'notion-bulleted-list');
		processed = addClass('ol', 'notion-numbered-list');
		
		// Normalizar items de lista (más complejo porque depende del padre)
		// Primero procesar los que están dentro de ul ya procesados
		processed = processed.replace(/(<ul[^>]*class="[^"]*notion-bulleted-list[^>]*>)([\s\S]*?)(<\/ul>)/g, (match, open, content, close) => {
			const processedContent = content.replace(/<li([^>]*)>/gi, (liMatch, liAttrs) => {
				if (!liAttrs || !liAttrs.includes('class="notion-bulleted-list-item"')) {
					return liAttrs.trim() 
						? `<li${liAttrs} class="notion-bulleted-list-item">`
						: `<li class="notion-bulleted-list-item">`;
				}
				return liMatch;
			});
			return open + processedContent + close;
		});
		
		// Procesar los que están dentro de ol ya procesados
		processed = processed.replace(/(<ol[^>]*class="[^"]*notion-numbered-list[^>]*>)([\s\S]*?)(<\/ol>)/g, (match, open, content, close) => {
			const processedContent = content.replace(/<li([^>]*)>/gi, (liMatch, liAttrs) => {
				if (!liAttrs || !liAttrs.includes('class="notion-numbered-list-item"')) {
					return liAttrs.trim() 
						? `<li${liAttrs} class="notion-numbered-list-item">`
						: `<li class="notion-numbered-list-item">`;
				}
				return liMatch;
			});
			return open + processedContent + close;
		});
		
		// Normalizar código (bloques primero)
		processed = addClass('pre', 'notion-code');
		
		// Código inline (solo si no está dentro de un pre)
		processed = processed.replace(/<code(?![^>]*class="[^"]*notion-text-code)(?![^>]*<pre)([^>]*)>/gi, (match, attrs) => {
			return attrs.trim() 
				? `<code${attrs} class="notion-text-code">`
				: `<code class="notion-text-code">`;
		});
		
		// Normalizar enlaces
		processed = addClass('a', 'notion-text-link');
		
		// Normalizar texto en negrita (strong y b)
		processed = processed.replace(/<(strong)(?![^>]*class="[^"]*notion-text-bold)([^>]*)>/gi, (match, tag, attrs) => {
			return attrs.trim() 
				? `<${tag}${attrs} class="notion-text-bold">`
				: `<${tag} class="notion-text-bold">`;
		});
		processed = processed.replace(/<(b)(?![^>]*class="[^"]*notion-text-bold)([^>]*)>/gi, (match, tag, attrs) => {
			return attrs.trim() 
				? `<${tag}${attrs} class="notion-text-bold">`
				: `<${tag} class="notion-text-bold">`;
		});
		
		// Normalizar texto en cursiva (em e i)
		processed = processed.replace(/<(em)(?![^>]*class="[^"]*notion-text-italic)([^>]*)>/gi, (match, tag, attrs) => {
			return attrs.trim() 
				? `<${tag}${attrs} class="notion-text-italic">`
				: `<${tag} class="notion-text-italic">`;
		});
		processed = processed.replace(/<(i)(?![^>]*class="[^"]*notion-text-italic)([^>]*)>/gi, (match, tag, attrs) => {
			return attrs.trim() 
				? `<${tag}${attrs} class="notion-text-italic">`
				: `<${tag} class="notion-text-italic">`;
		});
		
		// Normalizar texto subrayado
		processed = addClass('u', 'notion-text-underline');
		
		// Normalizar texto tachado (s y del)
		processed = processed.replace(/<(s)(?![^>]*class="[^"]*notion-text-strikethrough)([^>]*)>/gi, (match, tag, attrs) => {
			return attrs.trim() 
				? `<${tag}${attrs} class="notion-text-strikethrough">`
				: `<${tag} class="notion-text-strikethrough">`;
		});
		processed = processed.replace(/<(del)(?![^>]*class="[^"]*notion-text-strikethrough)([^>]*)>/gi, (match, tag, attrs) => {
			return attrs.trim() 
				? `<${tag}${attrs} class="notion-text-strikethrough">`
				: `<${tag} class="notion-text-strikethrough">`;
		});
		
		// Normalizar blockquotes
		processed = addClass('blockquote', 'notion-quote');
		
		// Normalizar tablas
		processed = addClass('table', 'notion-table');
		
		// Normalizar separadores
		processed = addClass('hr', 'notion-divider');
		
		return processed;
	}

	/**
	 * Configura el renderizador para manejar wiki links de Obsidian [[link]].
	 * 
	 * @private
	 */
	_configureWikiLinks() {
		// Plugin personalizado para convertir [[wiki links]] a enlaces HTML
		this.md.use((md) => {
			// Añade regla para parsear wiki links antes del renderizado normal
			const defaultInline = md.renderer.rules.text || 
				((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
			
			md.renderer.rules.text = (tokens, idx, options, env, self) => {
				const token = tokens[idx];
				const content = token.content;
				
				// Busca wiki links en el contenido
				const wikiLinkRegex = /\[\[([^\]]+)\]\]/g;
				if (wikiLinkRegex.test(content)) {
					// Reemplaza wiki links por enlaces HTML
					const replaced = content.replace(wikiLinkRegex, (match, linkContent) => {
						const [linkPath, displayName] = linkContent.includes('|') 
							? linkContent.split('|').map(s => s.trim())
							: [linkContent.trim(), linkContent.trim()];
						
						// Convierte a slug para la URL
						const slug = this._slugify(linkPath);
						return `<a href="/pages/${slug}">${this._escapeHtml(displayName)}</a>`;
					});
					
					return replaced;
				}
				
				return defaultInline(tokens, idx, options, env, self);
			};
		});
	}

	/**
	 * Convierte un texto a slug (similar a slugify.js pero inline).
	 * 
	 * @private
	 * @param {string} text - Texto a convertir
	 * @returns {string} Slug generado
	 */
	_slugify(text) {
		return text
			.toLowerCase()
			.trim()
			.replace(/[^\w\s-]/g, '')
			.replace(/[\s_-]+/g, '-')
			.replace(/^-+|-+$/g, '');
	}

	/**
	 * Escapa HTML para prevenir XSS.
	 * 
	 * @private
	 * @param {string} text - Texto a escapar
	 * @returns {string} Texto escapado
	 */
	_escapeHtml(text) {
		const map = {
			'&': '&amp;',
			'<': '&lt;',
			'>': '&gt;',
			'"': '&quot;',
			"'": '&#039;'
		};
		return text.replace(/[&<>"']/g, m => map[m]);
	}
}

