// js/modules/excelParser.js

export const ExcelParser = {
    /**
     * Procesa el archivo File de la planilla Jumbo y extrae los datos limpios requeridos.
     * @param {File} file Archivo binario obtenido del input HTML
     * @returns {Promise<Array>} Promesa con la lista de pedidos homologados
     */
    importarPedidoJumbo(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    // LECTURA DE SCRIPT INTERNO DE SHEETJS (Cargado en el HTML)
                    const workbook = XLSX.read(data, { type: 'array' });
                    
                    // Tomamos la primera hoja del libro de Excel de Jumbo
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    
                    // Convertimos la matriz en formato JSON estructurado por filas
                    const rows = XLSX.utils.sheet_to_json(worksheet);
                    
                    // Mapeo selectivo e higienización de los datos de la planilla
                    const pedidosFormateados = rows.map(row => {
                        // Limpieza del importe removiendo signos monetarios extraños si existieran
                        const importeLimpio = String(row.originalAmount || row.totalAmount)
                                                .replace(/[^0-9.-]+/g, "");

                        return {
                            idPedido: String(row.id).trim(),
                            numeroPedido: String(row.commerceOrder || row.commerceId).trim(),
                            clienteDni: String(row.customerIdentification).trim(),
                            clienteNombre: String(row.customerName).trim(),
                            direccion: String(row.shippingStreet).trim(),
                            // Establecemos por defecto la fecha del día de procesamiento
                            fecha: new Date().toISOString().split('T')[0],
                            // Algoritmo de asignación de franja horaria por defecto (o extraída de las notas)
                            franjaHoraria: "10:00-14:00", 
                            importe: parseFloat(importeLimpio) || 0,
                            // Coordenadas base por defecto para ser reprocesadas por el geocodificador pasivo
                            coordenadas: { lat: -34.6037, lng: -58.3816 } 
                        };
                    });

                    resolve(pedidosFormateados);
                } catch (error) {
                    reject(new Error("Error al procesar la estructura interna del Excel: " + error.message));
                }
            };

            reader.onerror = () => reject(new Error("Error en la lectura física del archivo binario."));
            reader.readAsArrayBuffer(file);
        });
    }
};