import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const app = express();

// ═══════════════════════════════════════
// SUPABASE CONFIG
// ═══════════════════════════════════════
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// ═══════════════════════════════════════
// MIDDLEWARE
// ═══════════════════════════════════════
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ═══════════════════════════════════════
// RUTAS
// ═══════════════════════════════════════

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Crear nueva solicitud de crédito
app.post('/api/solicitudes', async (req, res) => {
  try {
    const solicitud = req.body;

    // Generar ID único si no existe folio
    const id = uuidv4();
    const folio = solicitud.folio || `PF-${id.substring(0, 8).toUpperCase()}`;

    // Preparar datos para insertar
    const dataToInsert = {
      id: id,
      folio: folio,
      timestamp: solicitud.timestamp || new Date().toISOString(),
      nombre: solicitud.solicitante?.nombre,
      telefono: solicitud.solicitante?.telefono,
      whatsapp: solicitud.solicitante?.whatsapp,
      email: solicitud.solicitante?.email,
      curp: solicitud.solicitante?.curp,
      direccion: solicitud.ubicacion?.direccion,
      gps_lat: solicitud.ubicacion?.gps?.lat,
      gps_lng: solicitud.ubicacion?.gps?.lng,
      gps_precision: solicitud.ubicacion?.gps?.precision,
      monto_solicitado: solicitud.credito?.monto_solicitado,
      destino_credito: solicitud.credito?.destino,
      ocupacion: solicitud.credito?.ocupacion,
      ingresos_mensuales: solicitud.credito?.ingresos_mensuales,
      ref1_nombre: solicitud.referencias?.ref1?.nombre,
      ref1_telefono: solicitud.referencias?.ref1?.telefono,
      ref2_nombre: solicitud.referencias?.ref2?.nombre,
      ref2_telefono: solicitud.referencias?.ref2?.telefono,
      documentos_ine_frente: solicitud.documentos?.ine_frente,
      documentos_ine_reverso: solicitud.documentos?.ine_reverso,
      documentos_comprobante: solicitud.documentos?.comprobante_domicilio,
      documentos_foto_domicilio: solicitud.documentos?.foto_domicilio,
      documentos_foto_garantia: solicitud.documentos?.foto_garantia,
      documentos_video: solicitud.documentos?.video_verificacion,
      documentos_social: solicitud.documentos?.perfil_social,
      acepta_terminos: solicitud.aceptaciones?.terminos,
      acepta_contacto: solicitud.aceptaciones?.contacto,
      acepta_verifiedad: solicitud.aceptaciones?.verifiedad_datos,
      acepta_gps: solicitud.aceptaciones?.gps,
      estado: solicitud.estado || 'pendiente',
      fecha_solicitud: solicitud.fecha_solicitud,
      datos_json: solicitud
    };

    // Insertar en Supabase
    const { data, error } = await supabase
      .from('solicitudes_credito')
      .insert([dataToInsert])
      .select();

    if (error) {
      console.error('Supabase error:', error);
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }

    res.status(201).json({
      success: true,
      folio: folio,
      id: id,
      timestamp: new Date().toISOString(),
      message: 'Solicitud registrada correctamente'
    });

  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// Obtener solicitud por folio
app.get('/api/solicitudes/:folio', async (req, res) => {
  try {
    const { folio } = req.params;

    const { data, error } = await supabase
      .from('solicitudes_credito')
      .select('*')
      .eq('folio', folio)
      .single();

    if (error) {
      return res.status(404).json({
        success: false,
        error: 'Solicitud no encontrada'
      });
    }

    res.json({
      success: true,
      data: data
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// Listar todas las solicitudes (con paginación)
app.get('/api/solicitudes', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const { data, count, error } = await supabase
      .from('solicitudes_credito')
      .select('*', { count: 'exact' })
      .order('timestamp', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }

    res.json({
      success: true,
      data: data,
      pagination: {
        page: page,
        limit: limit,
        total: count,
        pages: Math.ceil(count / limit)
      }
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// Actualizar estado de solicitud
app.put('/api/solicitudes/:folio', async (req, res) => {
  try {
    const { folio } = req.params;
    const { estado, notas } = req.body;

    const updateData = {
      estado: estado,
      updated_at: new Date().toISOString()
    };

    if (notas) {
      updateData.notas = notas;
    }

    const { data, error } = await supabase
      .from('solicitudes_credito')
      .update(updateData)
      .eq('folio', folio)
      .select();

    if (error) {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }

    res.json({
      success: true,
      data: data[0],
      message: 'Solicitud actualizada'
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// ═══════════════════════════════════════
// INICIAR SERVIDOR EN PUERTO 2000
// ═══════════════════════════════════════
const PORT = 2000;
app.listen(PORT, () => {
  console.log(`🚀 Backend PrestamosFlash activo en puerto ${PORT}`);
  console.log(`Ambiente: ${process.env.NODE_ENV || 'development'}`);
});
