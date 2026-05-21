// js/utils/sanitizers.js

/**
 * Utilidades preventivas de seguridad frontend.
 */
const Sanitizer = {
    /**
     * Sanitiza strings para prevenir ataques XSS al renderizar HTML de forma dinámica.
     * @param {string} rawString 
     * @returns {string} string escapada de forma segura
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
};

// Exportación por defecto para máxima compatibilidad con ES6 nativo
export default Sanitizer;