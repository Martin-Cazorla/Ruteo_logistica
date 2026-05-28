// js/modules/excelParser.js

export const ExcelParser = Object.freeze({
    /**
     * Procesa la planilla Jumbo inyectando los tipos de datos normalizados para geocodificación
     * @param {File} file Archivo binario obtenido del input HTML
     * @returns {Promise<Array>} Lista homologada de pedidos
     */
    importarPedidoJumbo(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = async (e) => {
                try {
                    // Verificación modular dinámica de SheetJS para evitar colisiones globales
                    if (typeof window.XLSX === 'undefined') {
                        throw new Error("Librería de procesamiento SheetJS (XLSX) no disponible en el contexto global.");
                    }
                    
                    const data = new Uint8Array(e.target.result);
                    const workbook = window.XLSX.read(data, { type: 'array' });
                    
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    
                    const rows = window.XLSX.utils.sheet_to_json(worksheet);
                    
                    const pedidosFormateados = rows.map((row, indice) => {
                        const rawAmount = row.originalAmount || row.totalAmount || row.Amount || 0;
                        const importeLimpio = String(rawAmount).replace(/[^0-9.-]+/g, "");
                        
                        const idPedidoCompuesto = row.id ? String(row.id).trim() : `JMB-OPT-${Date.now()}-${indice}`;
                        const numeroOrden = row.commerceOrder || row.commerceId || row.orderNumber || `N/O-${indice}`;

                        return {
                            idPedido: idPedidoCompuesto,
                            numeroPedido: String(numeroOrden).trim(),
                            clienteDni: row.customerIdentification ? String(row.customerIdentification).trim() : 'S/D',
                            clienteNombre: row.customerName ? String(row.customerName).trim() : 'Consumidor Final',
                            direccion_entrega: row.shippingStreet ? String(row.shippingStreet).trim() : '',
                            fecha_creacion: new Date().toISOString().split('T')[0],
                            franjaHoraria: "10:00-14:00", 
                            importe: parseFloat(importeLimpio) || 0,
                            coordenada: { lat: 0, lng: 0 } // Se propaga vacío para obligar al despachador a resolver vía Nominatim/Caché
                        };
                    });

                    resolve(pedidosFormateados);
                } catch (error) {
                    reject(new Error("Error estructural al parsear las celdas del Excel Jumbo: " + error.message));
                }
            };

            reader.onerror = () => reject(new Error("Error físico en la pasarela de lectura del FileReader binario."));
            reader.readAsArrayBuffer(file);
        });
    }
});