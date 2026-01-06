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
		
		return `<!DOCTYPE html>
<html lang="es">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>${this._escapeHtml(title)}</title>
	<style>
		body {
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
			line-height: 1.6;
			max-width: 800px;
			margin: 0 auto;
			padding: 20px;
			background: #1e1e1e;
			color: #d4d4d4;
		}
		h1, h2, h3, h4, h5, h6 {
			color: #4ec9b0;
			margin-top: 1.5em;
		}
		a {
			color: #569cd6;
		}
		code {
			background: #252526;
			padding: 2px 6px;
			border-radius: 3px;
		}
		pre {
			background: #252526;
			padding: 15px;
			border-radius: 5px;
			overflow-x: auto;
		}
		blockquote {
			border-left: 4px solid #569cd6;
			padding-left: 15px;
			margin-left: 0;
			color: #858585;
		}
		table {
			border-collapse: collapse;
			width: 100%;
			margin: 1em 0;
		}
		th, td {
			border: 1px solid #3e3e3e;
			padding: 8px;
			text-align: left;
		}
		th {
			background: #2d2d30;
			color: #4ec9b0;
		}
	</style>
</head>
<body>
	${content}
</body>
</html>`;
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

