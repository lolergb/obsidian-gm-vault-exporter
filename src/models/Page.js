/**
 * @fileoverview Modelo de dominio para una Página en GM Vault.
 * Representa una página individual con su URL, nombre y metadatos.
 */

/**
 * Representa una Página individual dentro de una categoría.
 * 
 * @class Page
 */
export class Page {
	/**
	 * Crea una instancia de Page.
	 * 
	 * @param {string} name - Nombre de la página
	 * @param {string} slug - Slug único para la URL (normalmente basado en el nombre)
	 * @param {string[]} blockTypes - Tipos de bloque especiales (ej: ["table", "quote", "image"])
	 */
	constructor(name, slug, blockTypes = []) {
		/** @type {string} */
		this.name = name;
		
		/** @type {string} */
		this.slug = slug;
		
		/** @type {string[]} */
		this.blockTypes = blockTypes;
	}

	/**
	 * Verifica si la página tiene un tipo de bloque específico.
	 * 
	 * @param {string} blockType - Tipo de bloque a verificar
	 * @returns {boolean} true si tiene ese tipo de bloque
	 */
	hasBlockType(blockType) {
		return this.blockTypes.includes(blockType);
	}

	/**
	 * Añade un tipo de bloque a la página.
	 * 
	 * @param {string} blockType - Tipo de bloque a añadir
	 */
	addBlockType(blockType) {
		if (!this.blockTypes.includes(blockType)) {
			this.blockTypes.push(blockType);
		}
	}
}

