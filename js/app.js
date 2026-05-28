// js/app.js

import { AuthService } from './services/authService.js';
import { store } from './state/store.js';

/**
 * Rutas centralizadas. Si cambia una ruta, se actualiza solo aquí.
 */
const ROUTES = Object.freeze({
    LOGIN:     'login.html',
    DASHBOARD: 'pages/dashboard.html',
    INDEX:     'index.html',
});

/**
 * Rutas que NO requieren autenticación.
 */
const PUBLIC_ROUTES = Object.freeze([
    ROUTES.LOGIN,
    ROUTES.INDEX,
    '/',
]);

/**
 * Controlador raíz de la aplicación.
 * Responsabilidad única: gestión del ciclo de vida de autenticación y routing de guardia.
 */
class App {
    #unsubscribeAuth = null;

    constructor() {
        // No llamar init() en el constructor: facilita testing y control externo
    }

    init() {
        // Ocultar el body hasta confirmar autenticación → elimina flash de contenido
        document.body.style.visibility = 'hidden';

        try {
            this.#unsubscribeAuth = AuthService.onAuthStateChanged(
                (user) => this.#handleAuthChange(user),
                (error) => this.#handleAuthError(error)
            );
        } catch (err) {
            console.error('[App] Error al inicializar AuthService:', err);
            this.#redirectToLogin();
        }
    }

    /**
     * Destruye los listeners activos. Llamar al desmontar la app.
     */
    destroy() {
        if (typeof this.#unsubscribeAuth === 'function') {
            this.#unsubscribeAuth();
        }
    }

    // ─── Privados ────────────────────────────────────────────────────────────

    #handleAuthChange(user) {
        if (user) {
            store.setState({ user, isAuthenticated: true });
            this.#handlePostLoginRouting();
        } else {
            store.setState({ user: null, isAuthenticated: false });
            this.#handleProtectRoutes();
        }

        // Mostrar el body solo después de resolver auth → sin flash
        document.body.style.visibility = 'visible';
    }

    #handleAuthError(error) {
        console.error('[App] Error de autenticación Firebase:', error);
        store.setState({ user: null, isAuthenticated: false, error: error.message });
        document.body.style.visibility = 'visible';
        this.#redirectToLogin();
    }

    #handlePostLoginRouting() {
        if (this.#currentPathIncludes(ROUTES.LOGIN)) {
            this.#navigateTo(ROUTES.DASHBOARD);
        }
    }

    #handleProtectRoutes() {
        const isPublic = PUBLIC_ROUTES.some(route => this.#currentPathIncludes(route));
        if (!isPublic) {
            this.#redirectToLogin();
        }
    }

    #redirectToLogin() {
        this.#navigateTo(ROUTES.LOGIN);
    }

    /**
     * Navegación segura: solo permite destinos internos conocidos (previene Open Redirect).
     * @param {string} route — debe ser un valor de ROUTES
     */
    #navigateTo(route) {
        const allowedDestinations = Object.values(ROUTES);
        if (!allowedDestinations.includes(route)) {
            console.error(`[App] Intento de navegación a ruta no autorizada: ${route}`);
            return;
        }
        window.location.replace(route);
    }

    #currentPathIncludes(segment) {
        return window.location.pathname.includes(segment);
    }
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    const app = new App();
    app.init();

    // Limpieza al salir
    window.addEventListener('beforeunload', () => app.destroy());
});