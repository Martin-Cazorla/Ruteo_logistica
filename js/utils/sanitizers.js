// js/utils/sanitizers.js

/**
 * Utilidades preventivas de seguridad frontend corporativa.
 */
export const Sanitizer = Object.freeze({
    /**
     * Sanitiza cadenas de texto para prevenir vectores XSS en renderizados dinámicos.
     * @param {string} rawString 
     * @returns {string} cadena de texto sanitizada
     */
    escapeHTML(rawString) {
        if (!rawString) return '';
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#x27;',
            '/': '&#x2F;'
        };
        return String(rawString).replace(/[&<>"'/]/g, (match) => map[match]);
    }
});