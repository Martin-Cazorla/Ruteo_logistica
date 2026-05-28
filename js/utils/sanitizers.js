// js/utils/sanitizers.js

/**
 * Utilidades de seguridad y validación frontend.
 * 
 * IMPORTANTE: Esta sanitización es una defensa en profundidad en el cliente.
 * Las reglas de seguridad de Firestore (backend) son la defensa primaria.
 */
export const Sanitizer = Object.freeze({

    /**
     * Escapa caracteres peligrosos para prevenir XSS en contextos innerHTML.
     * Usar cuando se inserta texto dinámico con innerHTML o template literals en el DOM.
     * NO usar para mostrar texto al usuario final en textContent (innecesario).
     * 
     * @param {*} value
     * @returns {string}
     */
    escapeHTML(value) {
        if (value === null || value === undefined) return '';
        const map = {
            '&':  '&amp;',
            '<':  '&lt;',
            '>':  '&gt;',
            '"':  '&quot;',
            "'":  '&#x27;',
        };
        return String(value).replace(/[&<>"']/g, (char) => map[char]);
    },

    /**
     * Escapa un valor para uso seguro dentro de atributos HTML (data-*, href, etc).
     * Más estricto que escapeHTML.
     * 
     * @param {*} value
     * @returns {string}
     */
    escapeAttr(value) {
        if (value === null || value === undefined) return '';
        return String(value)
            .replace(/&/g,  '&amp;')
            .replace(/"/g,  '&quot;')
            .replace(/'/g,  '&#x27;')
            .replace(/</g,  '&lt;')
            .replace(/>/g,  '&gt;')
            .replace(/`/g,  '&#x60;')
            .replace(/=/g,  '&#x3D;');
    },

    /**
     * Limpia y normaliza un string de texto libre.
     * Elimina espacios extremos y caracteres de control invisibles.
     * 
     * @param {string} value
     * @returns {string}
     */
    sanitizeText(value) {
        if (!value) return '';
        // Elimina caracteres de control (null bytes, etc.) excepto whitespace normal
        return String(value)
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
            .trim();
    },

    /**
     * Prepara un string para uso seguro en query de URL.
     * 
     * @param {string} value
     * @returns {string}
     */
    sanitizeForUrl(value) {
        if (!value) return '';
        return encodeURIComponent(this.sanitizeText(value));
    },

    // ─── Validadores de dominio ───────────────────────────────────────────────

    /**
     * Valida un DNI argentino (entre 6 y 9 dígitos numéricos).
     * 
     * @param {string} dni
     * @returns {{ valid: boolean, error?: string }}
     */
    validateDNI(dni) {
        const clean = String(dni).trim().replace(/\D/g, '');
        if (!clean) return { valid: false, error: 'El DNI es obligatorio.' };
        if (clean.length < 6 || clean.length > 9) {
            return { valid: false, error: 'El DNI debe tener entre 6 y 9 dígitos.' };
        }
        return { valid: true };
    },

    /**
     * Valida un número de teléfono argentino (8 a 15 dígitos, admite + inicial).
     * 
     * @param {string} telefono
     * @returns {{ valid: boolean, error?: string }}
     */
    validateTelefono(telefono) {
        const clean = String(telefono || '').trim();
        if (!clean) return { valid: false, error: 'El teléfono es obligatorio.' };
        if (!/^\+?\d{8,15}$/.test(clean.replace(/[\s\-().]/g, ''))) {
            return { valid: false, error: 'Formato de teléfono inválido.' };
        }
        return { valid: true };
    },

    /**
     * Valida que una coordenada geográfica tenga valores numéricos en rango.
     * 
     * @param {number} lat
     * @param {number} lng
     * @returns {{ valid: boolean, error?: string }}
     */
    validateCoordenadas(lat, lng) {
        const latN = parseFloat(lat);
        const lngN = parseFloat(lng);
        if (isNaN(latN) || isNaN(lngN)) {
            return { valid: false, error: 'Coordenadas no numéricas.' };
        }
        if (latN < -90 || latN > 90 || lngN < -180 || lngN > 180) {
            return { valid: false, error: 'Coordenadas fuera de rango geográfico.' };
        }
        return { valid: true };
    },

    /**
     * Valida que una dirección tenga longitud mínima operativa.
     * 
     * @param {string} direccion
     * @returns {{ valid: boolean, error?: string }}
     */
    validateDireccion(direccion) {
        const clean = String(direccion || '').trim();
        if (clean.length < 5) {
            return { valid: false, error: 'La dirección es demasiado corta.' };
        }
        return { valid: true };
    },
});