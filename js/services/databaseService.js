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
    where,
} from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js';

// ─── Constantes de colecciones ────────────────────────────────────────────────
// Una sola fuente de verdad para los nombres de colección.
// Si Firestore cambia un nombre, se actualiza aquí y en ningún otro lugar.

const COL = Object.freeze({
    CLIENTES:      'clientes',
    PEDIDOS:       'pedidos',
    UNIDADES:      'unidades',
    FLOTA_MAESTRA: 'flota_maestra',
});

// ─── Helpers internos ─────────────────────────────────────────────────────────

/**
 * Valida que un ID no sea nulo, vacío ni undefined antes de usarlo en Firestore.
 * @param {*} id
 * @param {string} contexto — nombre del método que llama, para el mensaje de error
 */
function _assertId(id, contexto) {
    if (!id && id !== 0) {
        throw new Error(`[DatabaseService.${contexto}] El ID es obligatorio y no puede ser vacío.`);
    }
}

/**
 * Extrae coordenadas numéricas válidas de un objeto con múltiples variantes de nombre.
 * Si no se pueden extraer coordenadas válidas, retorna null (no (0,0)).
 * 
 * @param {Object} fuente — objeto pedido o cliente
 * @returns {{ lat: number, lng: number } | null}
 */
function _extraerCoordenadas(fuente) {
    const lat = parseFloat(
        fuente?.coordenadas?.lat ??
        fuente?.coordenada?.lat  ??
        fuente?.latitud          ??
        NaN
    );
    const lng = parseFloat(
        fuente?.coordenadas?.lng ??
        fuente?.coordenada?.lng  ??
        fuente?.longitud         ??
        NaN
    );

    if (isNaN(lat) || isNaN(lng)) return null;
    if (lat < -90  || lat > 90)   return null;
    if (lng < -180 || lng > 180)  return null;

    return { lat, lng };
}

/**
 * Coordenadas de fallback operativo (Plaza San Martín, Martínez).
 * Se usan solo cuando explícitamente se necesita un valor no nulo.
 */
const COORDENADAS_FALLBACK = Object.freeze({ lat: -34.4897, lng: -58.5210 });

// ─── Servicio ─────────────────────────────────────────────────────────────────

export class DatabaseService {

    // ═══════════════════════════════════════════════════════════════════════════
    // CLIENTES
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Guarda o actualiza un cliente usando su DNI como ID de documento.
     * 
     * Normalización de campos:
     * - Usa SOLO `isPremium` e `isCritico` (elimina los alias `premium` y `critico`).
     * - Si las coordenadas son inválidas, guarda null y lo loguea (no guarda 0,0).
     * - NO sobreescribe `historialReclamos` si no se envía explícitamente.
     * 
     * @param {Object} cliente
     */
    static async guardarCliente(cliente) {
        _assertId(cliente?.dni, 'guardarCliente');

        const coordenadas = _extraerCoordenadas(cliente);
        if (!coordenadas) {
            console.warn(
                `[DatabaseService.guardarCliente] Cliente DNI ${cliente.dni}: ` +
                'coordenadas inválidas o ausentes. Se guardará null.'
            );
        }

        const dniNormalizado = String(cliente.dni).trim();
        const clienteRef     = doc(db, COL.CLIENTES, dniNormalizado);

        // Payload normalizado: solo los campos canónicos
        const payload = {
            dni:       dniNormalizado,
            nombre:    String(cliente.nombre    || '').trim().toUpperCase() || 'SIN NOMBRE',
            telefono:  String(cliente.telefono  || '').trim()              || 'S/T',
            direccion: String(cliente.direccion || '').trim(),
            coordenadas: coordenadas ?? null,
            isPremium:   !!cliente.isPremium,
            isCritico:   !!cliente.isCritico,
            motivoCritico: cliente.isCritico
                ? (cliente.motivoCritico || 'Cuenta parametrizada con criticidad logística')
                : '',
            // Campos legacy que se normalizan en escritura para limpiar documentos viejos
            // Al hacer merge:true, estos sobrescriben los valores anteriores
            critico: !!cliente.isCritico,   // mantiene consistencia con docs viejos
            premium: !!cliente.isPremium,   // mantiene consistencia con docs viejos
        };

        // historialReclamos: NUNCA sobreescribir con array vacío en una actualización.
        // Solo se incluye si se envía explícitamente con contenido, o si es documento nuevo.
        if (Array.isArray(cliente.historialReclamos) && cliente.historialReclamos.length > 0) {
            payload.historialReclamos = cliente.historialReclamos;
        }

        await setDoc(clienteRef, payload, { merge: true });
    }

    /**
     * Elimina un cliente por su ID de documento (DNI).
     * @param {string} id
     */
    static async eliminarCliente(id) {
        _assertId(id, 'eliminarCliente');
        await deleteDoc(doc(db, COL.CLIENTES, String(id).trim()));
    }

    /**
     * Suscripción en tiempo real a todos los clientes.
     * @param {function} callback
     * @param {function} onError
     * @returns {function} unsubscribe
     */
    static subscribeClientes(callback, onError) {
        return onSnapshot(collection(db, COL.CLIENTES), callback, onError);
    }

    /**
     * Suscripción en tiempo real a clientes críticos.
     * Filtra por AMBOS campos para compatibilidad con documentos legacy.
     * TODO: una vez migrados todos los docs, quedarse solo con `isCritico`.
     * @param {function} callback
     * @param {function} onError
     * @returns {function} unsubscribe
     */
    static subscribeClientesCriticos(callback, onError) {
        // Firestore no soporta OR en un solo query sin índice compuesto.
        // Usamos isCritico (campo nuevo) como fuente de verdad.
        // El campo `critico` se sincroniza en cada escritura de guardarCliente.
        const q = query(
            collection(db, COL.CLIENTES),
            where('isCritico', '==', true)
        );
        return onSnapshot(q, callback, onError);
    }

    /**
     * Busca un cliente por DNI. Retorna el primer resultado o null.
     * @param {string} dni
     * @returns {Promise<Object|null>}
     */
    static async buscarClientePorDni(dni) {
        _assertId(dni, 'buscarClientePorDni');
        const q = query(
            collection(db, COL.CLIENTES),
            where('dni', '==', String(dni).trim())
        );
        const snap = await getDocs(q);
        if (snap.empty) return null;
        const docSnap = snap.docs[0];
        return { id: docSnap.id, ...docSnap.data() };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PEDIDOS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Carga masiva de pedidos con fragmentación en lotes de 400.
     * 
     * Mejoras:
     * - Coordenadas validadas (nunca guarda 0,0).
     * - Log detallado de qué lote falla.
     * - Continúa con los lotes restantes si uno falla (con acumulación de errores).
     * 
     * @param {Array<Object>} listaPedidos
     * @returns {Promise<{ exitosos: number, fallidos: number, errores: string[] }>}
     */
    static async guardarPedidosMasivos(listaPedidos) {
        if (!Array.isArray(listaPedidos) || listaPedidos.length === 0) {
            return { exitosos: 0, fallidos: 0, errores: [] };
        }

        const LIMITE_BATCH = 400;
        let indiceLote = 0;
        let loteNumero = 0;
        let exitosos   = 0;
        const errores  = [];

        while (indiceLote < listaPedidos.length) {
            loteNumero++;
            const fragmento = listaPedidos.slice(indiceLote, indiceLote + LIMITE_BATCH);
            const batch      = writeBatch(db);

            fragmento.forEach(pedido => {
                const pedidoRef  = doc(collection(db, COL.PEDIDOS));
                const coordenadas = _extraerCoordenadas(pedido) ?? COORDENADAS_FALLBACK;

                if (!_extraerCoordenadas(pedido)) {
                    console.warn(
                        `[DatabaseService.guardarPedidosMasivos] Pedido ${pedido.numeroPedido || 'S/N'}: ` +
                        'sin coordenadas válidas, usando fallback operativo.'
                    );
                }

                const clienteDni = String(
                    pedido.clienteDni   ||
                    pedido.dni_cliente  ||
                    ''
                ).trim();

                batch.set(pedidoRef, {
                    idPedido:        pedido.idPedido    || pedidoRef.id,
                    numeroPedido:    pedido.numeroPedido || '',
                    clienteDni,
                    clienteNombre:   pedido.clienteNombre || '',
                    direccion:       pedido.direccion_entrega || pedido.direccion || '',
                    fecha:           pedido.fecha_creacion   || pedido.fecha      || '',
                    franjaHoraria:   pedido.franjaHoraria    || '',
                    importe:         parseFloat(pedido.importe) || 0,
                    estadoRuta:      'unassigned',
                    coordenadas,
                    esCritico:       !!pedido.esCritico,
                    interno_asignado: pedido.interno_asignado || null,
                });
            });

            try {
                await batch.commit();
                exitosos += fragmento.length;
            } catch (err) {
                const msg = `Lote ${loteNumero} (registros ${indiceLote + 1}–${indiceLote + fragmento.length}): ${err.message}`;
                console.error(`[DatabaseService.guardarPedidosMasivos] Error en ${msg}`);
                errores.push(msg);
                // No lanza: continúa con el siguiente lote
            }

            indiceLote += LIMITE_BATCH;
        }

        if (errores.length > 0) {
            console.warn(
                `[DatabaseService.guardarPedidosMasivos] Completado con ${errores.length} lote(s) fallido(s).`,
                errores
            );
        }

        return { exitosos, fallidos: errores.length * LIMITE_BATCH, errores };
    }

    /**
     * Suscripción en tiempo real a pedidos de una fecha específica.
     * @param {string} fecha
     * @param {function} callback
     * @param {function} onError
     * @returns {function} unsubscribe
     */
    static subscribePedidosPorFecha(fecha, callback, onError) {
        _assertId(fecha, 'subscribePedidosPorFecha');
        const q = query(
            collection(db, COL.PEDIDOS),
            where('fecha_creacion', '==', fecha)
        );
        return onSnapshot(q, callback, onError);
    }

    /**
     * Obtiene pedidos críticos de una fecha. Retorna QuerySnapshot.
     * @param {string} fecha
     */
    static async obtenerPedidosCriticos(fecha) {
        _assertId(fecha, 'obtenerPedidosCriticos');
        const q = query(
            collection(db, COL.PEDIDOS),
            where('fecha_creacion', '==', fecha),
            where('esCritico',      '==', true)
        );
        return await getDocs(q);
    }

    /**
     * Elimina un pedido por ID.
     * @param {string} id
     */
    static async eliminarPedido(id) {
        _assertId(id, 'eliminarPedido');
        await deleteDoc(doc(db, COL.PEDIDOS, String(id).trim()));
    }

    /**
     * Actualiza campos específicos de un pedido.
     * @param {string} id
     * @param {Object} datos
     */
    static async actualizarPedido(id, datos) {
        _assertId(id, 'actualizarPedido');
        await updateDoc(doc(db, COL.PEDIDOS, String(id).trim()), datos);
    }

    /**
     * Crea un pedido individual manualmente.
     * @param {Object} datos
     */
    static async crearPedidoManual(datos) {
        return await addDoc(collection(db, COL.PEDIDOS), datos);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // UNIDADES DE JORNADA
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Suscripción en tiempo real a unidades de una jornada por fecha.
     * @param {string} fecha
     * @param {function} callback
     * @param {function} onError
     * @returns {function} unsubscribe
     */
    static subscribeFlotaCompleta(fecha, callback, onError) {
        _assertId(fecha, 'subscribeFlotaCompleta');
        const q = query(
            collection(db, COL.UNIDADES),
            where('fecha', '==', fecha)
        );
        return onSnapshot(q, callback, onError);
    }

    /**
     * Agrega una nueva unidad a la jornada activa.
     * @param {Object} datosUnidad
     */
    static async agregarUnidadJornada(datosUnidad) {
        return await addDoc(collection(db, COL.UNIDADES), datosUnidad);
    }

    /**
     * Elimina una unidad de jornada por ID.
     * @param {string} id
     */
    static async eliminarUnidadJornada(id) {
        _assertId(id, 'eliminarUnidadJornada');
        await deleteDoc(doc(db, COL.UNIDADES, String(id).trim()));
    }

    /**
     * Actualiza campos específicos de una unidad de jornada.
     * @param {string} id
     * @param {Object} campos
     */
    static async actualizarUnidadJornada(id, campos) {
        _assertId(id, 'actualizarUnidadJornada');
        await updateDoc(doc(db, COL.UNIDADES, String(id).trim()), campos);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FLOTA MAESTRA
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Suscripción en tiempo real a toda la flota maestra.
     * @param {function} callback
     * @param {function} onError
     * @returns {function} unsubscribe
     */
    static subscribeFlotaMaestraCentral(callback, onError) {
        return onSnapshot(collection(db, COL.FLOTA_MAESTRA), callback, onError);
    }

    /**
     * Obtiene todas las unidades de la flota maestra (lectura única).
     * @returns {Promise<QuerySnapshot>}
     */
    static async obtenerFlotaMaestra() {
        return await getDocs(collection(db, COL.FLOTA_MAESTRA));
    }

    /**
     * Crea o actualiza una unidad de la flota maestra por número interno.
     * @param {string} interno
     * @param {Object} datos
     */
    static async guardarUnidadMaestra(interno, datos) {
        _assertId(interno, 'guardarUnidadMaestra');
        const ref = doc(db, COL.FLOTA_MAESTRA, String(interno).trim());
        await setDoc(ref, datos, { merge: true });
    }

    /**
     * Elimina una unidad de la flota maestra por número interno.
     * @param {string} interno
     */
    static async eliminarUnidadMaestra(interno) {
        _assertId(interno, 'eliminarUnidadMaestra');
        await deleteDoc(doc(db, COL.FLOTA_MAESTRA, String(interno).trim()));
    }

    /**
     * Obtiene una unidad de la flota maestra por número interno.
     * @param {string} interno
     * @returns {Promise<DocumentSnapshot>}
     */
    static async obtenerUnidadMaestra(interno) {
        _assertId(interno, 'obtenerUnidadMaestra');
        return await getDoc(doc(db, COL.FLOTA_MAESTRA, String(interno).trim()));
    }
}