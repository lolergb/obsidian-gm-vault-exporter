/**
 * @fileoverview Gestor de túnel público HTTPS para localhost.
 * 
 * Responsabilidades:
 * - Crear túnel HTTPS usando cloudflared
 * - Gestionar el ciclo de vida del túnel
 * - Proporcionar URL pública
 */

import { spawn } from 'child_process';
import { platform } from 'os';
import { execSync } from 'child_process';

/**
 * Gestor del túnel HTTPS público.
 * 
 * @class TunnelManager
 */
export class TunnelManager {
	/**
	 * Crea una instancia de TunnelManager.
	 * 
	 * @param {number} port - Puerto local a exponer
	 */
	constructor(port) {
		/** @type {number} */
		this.port = port;
		
		/** @type {any|null} */
		this.tunnel = null;
		
		/** @type {string|null} */
		this.publicUrl = null;
	}

	/**
	 * Inicia el túnel HTTPS usando cloudflared.
	 * 
	 * @returns {Promise<string>} URL pública del túnel
	 */
	async start() {
		if (this.tunnel) {
			throw new Error('El túnel ya está activo');
		}

		return new Promise((resolve, reject) => {
			// Determinar el comando según el sistema operativo
			const os = platform();
			let command;
			
			// Rutas comunes donde puede estar cloudflared
			const commonPaths = [];
			
			if (os === 'darwin') {
				// macOS: rutas comunes de Homebrew
				commonPaths.push('/opt/homebrew/bin/cloudflared');
				commonPaths.push('/usr/local/bin/cloudflared');
			} else if (os === 'linux') {
				// Linux: rutas comunes
				commonPaths.push('/usr/local/bin/cloudflared');
				commonPaths.push('/usr/bin/cloudflared');
			} else if (os === 'win32') {
				// Windows: rutas comunes
				commonPaths.push('C:\\Program Files\\Cloudflare\\cloudflared.exe');
				commonPaths.push('C:\\Program Files (x86)\\Cloudflare\\cloudflared.exe');
			}
			
			// Intentar encontrar cloudflared
			let found = false;
			
			// Primero intentar con 'which' o 'where' (si está en PATH)
			try {
				if (os === 'win32') {
					const whichResult = execSync('where cloudflared.exe', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
					if (whichResult) {
						command = whichResult.split('\n')[0];
						found = true;
					}
				} else {
					const whichResult = execSync('which cloudflared', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
					if (whichResult) {
						command = whichResult;
						found = true;
					}
				}
			} catch (e) {
				// 'which' falló, continuar con rutas comunes
			}
			
			// Si no se encontró, buscar en rutas comunes
			if (!found) {
				for (const path of commonPaths) {
					try {
						// Verificar si el archivo existe ejecutando --version
						execSync(`"${path}" --version`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
						command = path;
						found = true;
						break;
					} catch (e) {
						// Esta ruta no funciona, continuar
					}
				}
			}
			
			// Si aún no se encontró, usar el nombre del comando (último recurso)
			if (!found) {
				command = os === 'win32' ? 'cloudflared.exe' : 'cloudflared';
			}

			// Ejecutar cloudflared tunnel
			this.tunnel = spawn(command, [
				'tunnel',
				'--url',
				`http://localhost:${this.port}`
			], {
				stdio: ['ignore', 'pipe', 'pipe'],
				shell: false
			});

			let output = '';
			let errorOutput = '';
			let urlResolved = false;

			// Timeout de 30 segundos para obtener la URL
			let timeoutId;
			
			// Función para buscar y resolver la URL
			const tryResolveUrl = (text) => {
				if (urlResolved) return;
				
				// Buscar la URL en el texto (cloudflared puede mostrar en diferentes formatos)
				// Formatos posibles:
				// - https://random-name.trycloudflare.com
				// - +--------------------------------------------------------------------------------------------+
				//   |  Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):  |
				//   |  https://random-name.trycloudflare.com                                                    |
				//   +--------------------------------------------------------------------------------------------+
				const urlMatch = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/gi);
				if (urlMatch && urlMatch.length > 0) {
					this.publicUrl = urlMatch[0].toLowerCase();
					urlResolved = true;
					if (timeoutId) {
						clearTimeout(timeoutId);
					}
					resolve(this.publicUrl);
				}
			};

			// Capturar stdout para obtener la URL
			this.tunnel.stdout.on('data', (data) => {
				const text = data.toString();
				output += text;
				tryResolveUrl(text);
			});

			// Capturar stderr (cloudflared a veces escribe la URL aquí)
			this.tunnel.stderr.on('data', (data) => {
				const text = data.toString();
				errorOutput += text;
				tryResolveUrl(text);
			});

			// Manejar errores del proceso
			this.tunnel.on('error', (err) => {
				if (err.code === 'ENOENT') {
					reject(new Error('cloudflared no está instalado o no está en el PATH. Por favor, instálalo desde https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/ y asegúrate de que esté en tu PATH.'));
				} else {
					reject(new Error(`Error al iniciar cloudflared: ${err.message}`));
				}
			});

			// Manejar cierre del proceso
			this.tunnel.on('close', (code) => {
				// Si ya resolvimos la URL, el cierre es normal (el proceso sigue corriendo en background)
				if (urlResolved) {
					return;
				}
				
				// Si no resolvimos la URL y el proceso se cerró, es un error
				if (code !== 0 && code !== null && !urlResolved) {
					const fullOutput = output + errorOutput;
					let errorMsg = `cloudflared se cerró con código ${code}`;
					
					if (errorOutput.includes('command not found') || errorOutput.includes('not found')) {
						errorMsg = 'cloudflared no está instalado o no está en el PATH. Por favor, instálalo desde https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/';
					} else if (fullOutput) {
						errorMsg += `\nOutput: ${fullOutput.substring(0, 500)}`;
					}
					
					console.error('cloudflared error:', errorMsg);
					this.tunnel = null;
					this.publicUrl = null;
					
					// Solo rechazar si aún no resolvimos la URL
					if (!urlResolved) {
						reject(new Error(errorMsg));
					}
				}
			});

			// Timeout de 30 segundos para obtener la URL
			timeoutId = setTimeout(() => {
				if (!urlResolved) {
					this.tunnel?.kill();
					this.tunnel = null;
					reject(new Error('Timeout esperando URL de cloudflared. Verifica que cloudflared esté instalado y funcionando. Output: ' + (output + errorOutput).substring(0, 500)));
				}
			}, 30000);
		});
	}

	/**
	 * Detiene el túnel HTTPS.
	 * 
	 * @returns {Promise<void>}
	 */
	async stop() {
		if (!this.tunnel) {
			return;
		}

		try {
			this.tunnel.kill();
			this.tunnel = null;
			this.publicUrl = null;
		} catch (error) {
			console.error('Error al cerrar túnel:', error);
		}
	}

	/**
	 * Verifica si el túnel está activo.
	 * 
	 * @returns {boolean} true si está activo
	 */
	isActive() {
		return this.tunnel !== null;
	}

	/**
	 * Obtiene la URL pública del túnel.
	 * 
	 * @returns {string|null} URL pública o null si no está activo
	 */
	getPublicUrl() {
		return this.publicUrl;
	}
}

