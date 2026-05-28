// js/state/store.js

/**
 * Estado inicial canónico de la aplicación.
 * Toda clave válida debe declararse aquí.
 */
const INITIAL_STATE = Object.freeze({
    user:            null,
    isAuthenticated: false,
    loading:         false,
    error:           null,
    pedidos:         [],
    filtros: {
        franjaHoraria: 'all',
    },
});

/** Claves de estado permitidas (whitelist). Previene contaminación accidental. */
const VALID_STATE_KEYS = new Set(Object.keys(INITIAL_STATE));

/**
 * Store reactivo centralizado.
 * 
 * Patrón: módulo ES singleton (los módulos se cachean, no hay riesgo de instancia doble).
 * No usar constructor-singleton: es confuso y no aporta nada en ES modules.
 */
class Store {
    /** @type {typeof INITIAL_STATE} */
    #state;
    #listeners = new Set();

    constructor() {
        this.#state = this.#deepClone(INITIAL_STATE);
    }

    // ─── API pública ─────────────────────────────────────────────────────────

    /**
     * Retorna una copia profunda del estado. Inmutable para los consumidores.
     * @returns {typeof INITIAL_STATE}
     */
    getState() {
        return this.#deepClone(this.#state);
    }

    /**
     * Actualiza el estado con deep merge. Preserva claves anidadas no mencionadas.
     * Solo acepta claves declaradas en INITIAL_STATE.
     * 
     * @param {Partial<typeof INITIAL_STATE>} patch
     */
    setState(patch) {
        if (typeof patch !== 'object' || patch === null) {
            console.error('[Store] setState recibió un valor inválido:', patch);
            return;
        }

        // Validar que las claves existan en el estado canónico
        for (const key of Object.keys(patch)) {
            if (!VALID_STATE_KEYS.has(key)) {
                console.warn(`[Store] Clave desconocida ignorada: "${key}"`);
            }
        }

        // Deep merge: preserva objetos anidados
        this.#state = this.#deepMerge(this.#state, patch);
        this.#notify();
    }

    /**
     * Resetea el estado al valor inicial (útil en logout).
     */
    reset() {
        this.#state = this.#deepClone(INITIAL_STATE);
        this.#notify();
    }

    /**
     * Suscribe un listener al cambio de estado.
     * @param {function(typeof INITIAL_STATE): void} listener
     * @returns {function} función de desuscripción
     */
    subscribe(listener) {
        if (typeof listener !== 'function') {
            throw new TypeError('[Store] El listener debe ser una función.');
        }
        this.#listeners.add(listener);
        return () => this.#listeners.delete(listener);
    }

    // ─── Privados ────────────────────────────────────────────────────────────

    #notify() {
        const snapshot = this.getState(); // copia profunda para cada listener
        this.#listeners.forEach(listener => {
            try {
                listener(snapshot);
            } catch (err) {
                console.error('[Store] Error en listener:', err);
            }
        });
    }

    /**
     * Deep merge: fusiona recursivamente objetos planos.
     * Los arrays se reemplazan (no se concatenan) — comportamiento intencional.
     */
    #deepMerge(target, source) {
        const output = { ...target };
        for (const key of Object.keys(source)) {
            if (!VALID_STATE_KEYS.has(key)) continue; // ignora claves inválidas
            const srcVal = source[key];
            const tgtVal = target[key];

            if (
                srcVal !== null &&
                typeof srcVal === 'object' &&
                !Array.isArray(srcVal) &&
                typeof tgtVal === 'object' &&
                tgtVal !== null
            ) {
                output[key] = { ...tgtVal, ...srcVal }; // merge un nivel más profundo
            } else {
                output[key] = srcVal;
            }
        }
        return output;
    }

    /**
     * Copia profunda simple. Para el estado de esta app es suficiente
     * (sin Dates, Maps, Sets ni funciones en el estado).
     */
    #deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    }
}

export const store = new Store();