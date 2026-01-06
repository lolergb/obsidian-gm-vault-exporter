/**
 * @fileoverview Gestor del servidor HTTP local.
 * 
 * Responsabilidades:
 * - Iniciar/detener servidor HTTP en localhost
 * - Gestionar el ciclo de vida del servidor
 * - Registrar rutas
 * - No contiene lógica de dominio
 */

import http from 'http';
import { URL } from 'url';

/**
 * Gestor del servidor HTTP local.
 * 
 * @class ServerManager
 */
export class ServerManager {
	/**
	 * Crea una instancia de ServerManager.
	 * 
	 * @param {number} port - Puerto en el que escuchar (por defecto 3000)
	 */
	constructor(port = 3000) {
		/** @type {number} */
		this.port = port;
		
		/** @type {http.Server|null} */
		this.server = null;
		
		/** @type {Map<string, Function>} */
		this.routes = new Map();
	}

	/**
	 * Inicia el servidor HTTP.
	 * 
	 * @returns {Promise<void>}
	 */
	async start() {
		if (this.server) {
			throw new Error('El servidor ya está en ejecución');
		}

		return new Promise((resolve, reject) => {
			this.server = http.createServer((req, res) => {
				this._handleRequest(req, res);
			});

			this.server.listen(this.port, '127.0.0.1', () => {
				resolve();
			});

			this.server.on('error', (err) => {
				if (err.code === 'EADDRINUSE') {
					reject(new Error(`El puerto ${this.port} ya está en uso`));
				} else {
					reject(err);
				}
			});
		});
	}

	/**
	 * Detiene el servidor HTTP.
	 * 
	 * @returns {Promise<void>}
	 */
	async stop() {
		if (!this.server) {
			return;
		}

		return new Promise((resolve) => {
			this.server.close(() => {
				this.server = null;
				resolve();
			});
		});
	}

	/**
	 * Verifica si el servidor está en ejecución.
	 * 
	 * @returns {boolean} true si está en ejecución
	 */
	isRunning() {
		return this.server !== null;
	}

	/**
	 * Registra una ruta con su handler.
	 * 
	 * @param {string} method - Método HTTP (GET, POST, etc.)
	 * @param {string} path - Ruta (puede incluir parámetros como :slug)
	 * @param {Function} handler - Función handler(req, res, params)
	 */
	registerRoute(method, path, handler) {
		const key = `${method}:${path}`;
		this.routes.set(key, handler);
	}

	/**
	 * Maneja una petición HTTP entrante.
	 * 
	 * @private
	 * @param {http.IncomingMessage} req - Request
	 * @param {http.ServerResponse} res - Response
	 */
	_handleRequest(req, res) {
		// Configura CORS
		this._setCORSHeaders(res, req);

		// Maneja preflight OPTIONS
		if (req.method === 'OPTIONS') {
			res.writeHead(200);
			res.end();
			return;
		}

		const url = new URL(req.url, `http://${req.headers.host}`);
		const method = req.method;
		const pathname = url.pathname;

		// Busca la ruta que coincida
		const handler = this._findRoute(method, pathname);
		
		if (handler) {
			const params = this._extractParams(method, pathname, handler.route);
			handler.fn(req, res, params);
		} else {
			this._sendError(res, 404, 'Ruta no encontrada');
		}
	}

	/**
	 * Encuentra la ruta que coincide con el path.
	 * 
	 * @private
	 * @param {string} method - Método HTTP
	 * @param {string} pathname - Path de la URL
	 * @returns {Object|null} Handler encontrado o null
	 */
	_findRoute(method, pathname) {
		for (const [key, fn] of this.routes.entries()) {
			// Solo divide en el primer ':' para no romper parámetros como :slug
			const colonIndex = key.indexOf(':');
			const routeMethod = key.substring(0, colonIndex);
			const routePath = key.substring(colonIndex + 1);
			
			if (routeMethod !== method) {
				continue;
			}

			// Convierte la ruta a regex
			const regex = this._routeToRegex(routePath);
			const match = pathname.match(regex);
			
			if (match) {
				return { fn, route: routePath };
			}
		}
		
		return null;
	}

	/**
	 * Convierte una ruta con parámetros a regex.
	 * 
	 * @private
	 * @param {string} route - Ruta con parámetros (ej: "/pages/:slug")
	 * @returns {RegExp} Regex para matching
	 */
	_routeToRegex(route) {
		const pattern = route
			.replace(/\//g, '\\/')
			.replace(/:(\w+)/g, '([^/]+)');
		return new RegExp(`^${pattern}$`);
	}

	/**
	 * Extrae parámetros de la URL según la ruta.
	 * 
	 * @private
	 * @param {string} method - Método HTTP
	 * @param {string} pathname - Path de la URL
	 * @param {string} route - Ruta con parámetros
	 * @returns {Object} Objeto con parámetros extraídos
	 */
	_extractParams(method, pathname, route) {
		const params = {};
		const paramNames = [];
		
		// Extrae nombres de parámetros de la ruta
		const paramMatches = route.matchAll(/:(\w+)/g);
		for (const match of paramMatches) {
			paramNames.push(match[1]);
		}
		
		// Extrae valores de la URL
		const regex = this._routeToRegex(route);
		const match = pathname.match(regex);
		
		if (match) {
			for (let i = 0; i < paramNames.length; i++) {
				params[paramNames[i]] = match[i + 1];
			}
		}
		
		return params;
	}

	/**
	 * Configura headers CORS.
	 * 
	 * @private
	 * @param {http.ServerResponse} res - Response
	 * @param {http.IncomingMessage} req - Request (opcional, para detectar private network)
	 */
	_setCORSHeaders(res, req = null) {
		res.setHeader('Access-Control-Allow-Origin', '*');
		res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
		res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Access-Control-Request-Private-Network');
		res.setHeader('Access-Control-Max-Age', '86400'); // Cache preflight 24h
		
		// Private Network Access (Chrome/navegadores modernos)
		// Permite peticiones HTTPS → localhost
		// Siempre incluir este header para permitir acceso desde redes públicas
		res.setHeader('Access-Control-Allow-Private-Network', 'true');
		
		// NOTA: En producción, restringe el origen:
		// res.setHeader('Access-Control-Allow-Origin', 'https://owlbear.rodeo');
	}

	/**
	 * Envía una respuesta de error.
	 * 
	 * @private
	 * @param {http.ServerResponse} res - Response
	 * @param {number} statusCode - Código de estado HTTP
	 * @param {string} message - Mensaje de error
	 */
	_sendError(res, statusCode, message) {
		res.writeHead(statusCode, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: message }));
	}

	/**
	 * Envía una respuesta JSON.
	 * 
	 * @param {http.ServerResponse} res - Response
	 * @param {Object} data - Datos a enviar
	 * @param {number} statusCode - Código de estado (por defecto 200)
	 */
	sendJSON(res, data, statusCode = 200) {
		res.writeHead(statusCode, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify(data, null, 2));
	}

	/**
	 * Envía una respuesta HTML.
	 * 
	 * @param {http.ServerResponse} res - Response
	 * @param {string} html - HTML a enviar
	 * @param {number} statusCode - Código de estado (por defecto 200)
	 */
	sendHTML(res, html, statusCode = 200) {
		res.writeHead(statusCode, { 'Content-Type': 'text/html; charset=utf-8' });
		res.end(html);
	}
}

