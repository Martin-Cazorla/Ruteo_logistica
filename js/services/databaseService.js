// js/services/databaseService.js
import { db } from './firebaseConfig.js';
import { 
    collection, 
    doc, 
    setDoc, 
    addDoc,
    deleteDoc,
    updateDoc,
    getDoc,
    getDocs,
    writeBatch,
    onSnapshot,
    query,
    where
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

export class DatabaseService {
    /**
     * Guarda o actualiza un cliente en la base de datos utilizando merge estructurado.
     * @param {Object} cliente Datos centralizados del cliente a persistir
     */
    static async guardarCliente(cliente) {
        if (!cliente.dni) throw new Error("El DNI del cliente es mandatorio de forma perimetral.");
        
        const clienteRef = doc(db, "clientes", String(cliente.dni).trim());
        
        await setDoc(clienteRef, {
            dni: String(cliente.dni).trim(),
            nombre: cliente.nombre.toUpperCase(),
            direccion: cliente.direccion,
            coordenadas: {
                lat: parseFloat(cliente.coordenadas?.lat || cliente.latitud || 0),
                lng: parseFloat(cliente.coordenadas?.lng || cliente.longitud || 0)
            },
            critico: cliente.critico || false,
            motivoCritico: cliente.motivoCritico || "",
            historialReclamos: cliente.historialReclamos || []
        }, { merge: true });
    }

    /**
     * Carga masiva de pedidos utilizando fragmentación dinámica (Chunks de seguridad).
     * Soporta altos volúmenes de datos aislando transacciones de un máximo de 400 registros.
     * @param {Array} listaPedidos Colección de órdenes formateadas provenientes del extractor
     */
    static async guardarPedidosMasivos(listaPedidos) {
        if (!listaPedidos || listaPedidos.length === 0) return;
        
        const LIMITE_FIRESTORE_BATCH = 400;
        let indiceLote = 0;

        while (indiceLote < listaPedidos.length) {
            const batch = writeBatch(db);
            const fragmentoPedidos = listaPedidos.slice(indiceLote, indiceLote + LIMITE_FIRESTORE_BATCH);

            fragmentoPedidos.forEach(pedido => {
                const pedidoRef = doc(collection(db, "pedidos"));
                
                // Normalización de coordenadas para evitar inconsistencias cromáticas en mapa
                const latFinal = parseFloat(pedido.coordenada?.lat || pedido.coordenadas?.lat || pedido.latitud || 0);
                const lngFinal = parseFloat(pedido.coordenada?.lng || pedido.coordenadas?.lng || pedido.longitud || 0);

                batch.set(pedidoRef, {
                    idPedido: pedido.idPedido || pedidoRef.id,
                    numeroPedido: pedido.numeroPedido,
                    clienteDni: String(pedido.clienteDni || pedido.dni_cliente).trim(),
                    clienteNombre: pedido.clienteNombre,
                    direccion: pedido.direccion_entrega || pedido.direccion,
                    fecha: pedido.fecha_creacion || pedido.fecha,
                    franjaHoraria: pedido.franjaHoraria,
                    importe: parseFloat(pedido.importe || 0),
                    estadoRuta: "unassigned",
                    coordenadas: { lat: latFinal, lng: lngFinal },
                    esCritico: pedido.esCritico || false,
                    interno_asignado: pedido.interno_asignado || null
                });
            });

            await batch.commit();
            indiceLote += LIMITE_FIRESTORE_BATCH;
        }
    }

    /**
     * Suscribe una escucha reactiva a los pedidos de una fecha operativa
     * @param {string} fecha Formato YYYY-MM-DD
     * @param {function} callback Inyección de flujo de renderizado
     * @param {function} onError Interceptor centralizado de excepciones
     * @returns {function} Token limpio de desuscripción
     */
    static subscribePedidosPorFecha(fecha, callback, onError) {
        const q = query(collection(db, "pedidos"), where("fecha_creacion", "==", fecha));
        return onSnapshot(q, callback, onError);
    }

    /**
     * Suscribe una escucha en tiempo real de las unidades activas en una jornada
     * @param {string} fecha Formato YYYY-MM-DD
     * @param {function} callback 
     * @param {function} onError 
     * @returns {function} Token limpio de desuscripción
     */
    static subscribeFlotaCompleta(fecha, callback, onError) {
        const q = query(collection(db, "unidades"), where("fecha", "==", fecha));
        return onSnapshot(q, callback, onError);
    }

    /**
     * Suscribe una escucha reactiva para los clientes catalogados como preferenciales críticos
     * @param {function} callback 
     * @param {function} onError 
     * @returns {function} Token limpio de desuscripción
     */
    static subscribeClientesCriticos(callback, onError) {
        const q = query(collection(db, "clientes"), where("critico", "==", true));
        return onSnapshot(q, callback, onError);
    }

    /**
     * Suscribe una escucha activa en tiempo real a la flota maestra homologada
     * @param {function} callback 
     * @param {function} onError 
     * @returns {function} Token limpio de desuscripción
     */
    static subscribeFlotaMaestraCentral(callback, onError) {
        return onSnapshot(collection(db, "flota_maestra"), callback, onError);
    }

    /**
     * Obtiene una captura síncrona/promesa de las órdenes críticas activas para mapeo cruzado
     * @param {string} fecha Formato YYYY-MM-DD
     */
    static async obtenerPedidosCriticosConFlota(fecha) {
        const q = query(
            collection(db, "pedidos"), 
            where("fecha_creacion", "==", fecha), 
            where("esCritico", "==", true)
        );
        return await getDocs(q);
    }

    /**
     * Elimina de forma atómica una unidad de la planilla diaria de despacho
     * @param {string} id ID único del documento en la colección de unidades
     */
    static async removerUnidadJornada(id) {
        return await deleteDoc(doc(db, "unidades", id));
    }

    /**
     * Realiza una mutación parcial controlada sobre los metadatos de una unidad (Notas, Vueltas, Campo)
     * @param {string} id 
     * @param {Object} campos Mapeo de claves NoSQL a actualizar
     */
    static async actualizarCamposUnidad(id, campos) {
        return await updateDoc(doc(db, "unidades", id), campos);
    }

    /**
     * Recupera el listado maestro de unidades homologadas de la organización
     */
    static async buscarUnidadEnFlotaMaestra() {
        return await getDocs(collection(db, "flota_maestra"));
    }

    /**
     * Da de alta de forma dinámica un vehículo para la jornada de control
     * @param {Object} datosUnidad 
     */
    static async despacharNuevaUnidad(datosUnidad) {
        return await addDoc(collection(db, "unidades"), datosUnidad);
    }

    /**
     * Elimina un pedido del panel de carga operativa
     * @param {string} id 
     */
    static async removerPedido(id) {
        return await deleteDoc(doc(db, "pedidos", id));
    }

    /**
     * Modifica los metadatos de ruteo o importe de una orden manual/Jumbo
     * @param {string} id 
     * @param {Object} datos 
     */
    static async actualizarPedido(id, datos) {
        return await updateDoc(doc(db, "pedidos", id), datos);
    }

    /**
     * Inserta un nuevo pedido de forma individual en el ecosistema Firestore
     * @param {Object} datos 
     */
    static async crearPedidoManual(datos) {
        return await addDoc(collection(db, "pedidos"), datos);
    }

    /**
     * Realiza una consulta filtrada por coincidencia exacta de DNI en la base maestra
     * @param {string} dni 
     */
    static async buscarClientePorDni(dni) {
        const q = query(collection(db, "clientes"), where("dni", "==", String(dni).trim()));
        return await getDocs(q);
    }

    /**
     * Recupera un cliente consultando de forma directa por su identificador primario de documento
     * @param {string} dni 
     */
    static async obtenerClientePorIdDocumento(dni) {
        return await getDocs(query(collection(db, "clientes"), where("dni", "==", String(dni).trim())));
    }

    /**
     * Persiste o actualiza una unidad del fichero maestro por combinación de merge atómico
     * @param {string} interno ID del documento coincidente con el número de camión
     * @param {Object} datos Base de datos estructurada de la ficha
     */
    static async actualizarUnidadMaestra(interno, datos) {
        const docRef = doc(db, "flota_maestra", String(interno).trim());
        return await setDoc(docRef, datos, { merge: true });
    }

    /**
     * Remueve una unidad permanentemente del fichero base centralizado
     * @param {string} interno 
     */
    static async eliminarUnidadMaestra(interno) {
        return await deleteDoc(doc(db, "flota_maestra", String(interno).trim()));
    }

    /**
     * Recupera una instantánea única de la hoja técnica de la unidad para aislar lecturas de modales
     * @param {string} interno 
     */
    static async obtenerUnidadMaestraPorId(interno) {
        return await getDoc(doc(db, "flota_maestra", String(interno).trim()));
    }
}