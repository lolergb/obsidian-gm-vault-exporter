/**
 * @fileoverview Punto de entrada principal del plugin de Obsidian.
 * 
 * Este archivo es el único que interactúa directamente con la API de Obsidian.
 * El resto del código es framework-agnóstico y puede ser testeado fácilmente.
 */

import { Plugin } from 'obsidian';
import { PluginController } from './PluginController.js';

/**
 * Plugin principal de Obsidian.
 * Extiende la clase Plugin de Obsidian para integrarse correctamente.
 * 
 * @class GMVaultExporterPlugin
 * @extends Plugin
 */
export default class GMVaultExporterPlugin extends Plugin {
	/**
	 * Se ejecuta cuando el plugin se carga.
	 */
	async onload() {
		/** @type {PluginController|null} */
		this.controller = new PluginController(this.app, this);
		await this.controller.initialize();
	}

	/**
	 * Se ejecuta cuando el plugin se desactiva.
	 */
	async onunload() {
		if (this.controller) {
			await this.controller.cleanup();
			this.controller = null;
		}
	}
}

