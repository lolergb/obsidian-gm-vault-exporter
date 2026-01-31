/**
 * @fileoverview Utilidades para generar slugs a partir de nombres.
 */

/**
 * Convierte un nombre en un slug válido para URLs.
 * 
 * @param {string} name - Nombre a convertir
 * @returns {string} Slug generado
 */
export function slugify(name) {
	return name
		.toLowerCase()
		.trim()
		.replace(/[^\w\s-]/g, '') // Elimina caracteres especiales
		.replace(/[\s_-]+/g, '-')  // Reemplaza espacios/guiones por un solo guion
		.replace(/^-+|-+$/g, '');  // Elimina guiones al inicio y final
}

