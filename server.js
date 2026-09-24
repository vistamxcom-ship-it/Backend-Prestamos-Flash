import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';

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
// MULTER CONFIG
// ═══════════════════════════════════════
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB max
});

// ═══════════════════════════════════════
// MIDDLEWARE
// ═══════════════════════════════════════
app.use(cors({
  origin: [
    'http://localhost:2000',
    'http://localhost:3000',
    process.env.FRONTEND_URL || '*'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ═══════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════

// Convertir archivo a base64 para guardar en Supabase
async function fileToBase64(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

// ═══════════════════════════════════════
// RUTAS
// ═══════════════════════════════════════

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Crear nueva solicitud de crédito CON ARCHIVOS
app.post('/api/solicitudes', upload.fields([
  { name: 'ineF', maxCount: 1 },
  { name: 'ineR', maxCount: 1 },
  { name: 'recServ', maxCount: 1 },
  { name: 'casa', maxCount: 1 },
  { name: 'garantia', maxCount: 1 },
  { name: 'video', maxCount: 1 },
  { name: 'social', maxCount: 1 }
]), async (req, res) => {
  try {
    // Parsear JSON del formulario
    let solicitud = {};
    if (req.body.data) {
      solicitud = JSON.parse(req.body.data);
    } else {
      solicitud = req.body;
    }

    // Generar ID único
    const id = uuidv4();
    const folio = solicitud.folio || `PF-${id.substring(0, 8).toUpperCase()}`;

    // Subir todos los archivos en paralelo
    const uploadPromises = {
      ineF: uploadFile(req.files?.ineF?.[0], folio, 'ine_frente'),
      ineR: uploadFile(req.files?.ineR?.[0], folio, 'ine_reverso'),
      recServ: uploadFile(req.files?.recServ?.[0], folio, 'comprobante_domicilio'),
      casa: uploadFile(req.files?.casa?.[0], folio, 'foto_domicilio'),
      garantia: uploadFile(req.files?.garantia?.[0], folio, 'foto_garantia'),
      video: uploadFile(req.files?.video?.[0], folio, 'video_verificacion'),
      social: uploadFile(req.files?.social?.[0], folio, 'perfil_social')
    };

    const uploadResults = await Promise.all(Object.values(uploadPromises));
    const [ineF, ineR, recServ, casa, garantia, video, social] = uploadResults;

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
      
      // URLs de documentos
      documentos_ine_frente: ineF?.publicUrl,
      documentos_ine_reverso: ineR?.publicUrl,
      documentos_comprobante: recServ?.publicUrl,
      documentos_foto_domicilio: casa?.publicUrl,
      documentos_foto_garantia: garantia?.publicUrl,
      documentos_video: video?.publicUrl,
      documentos_social: social?.publicUrl,
      
      // Metadata de archivos
      documentos_ine_frente_meta: ineF ? JSON.stringify({ fileName: ineF.fileName, size: ineF.size }) : null,
      documentos_ine_reverso_meta: ineR ? JSON.stringify({ fileName: ineR.fileName, size: ineR.size }) : null,
      documentos_comprobante_meta: recServ ? JSON.stringify({ fileName: recServ.fileName, size: recServ.size }) : null,
      documentos_foto_domicilio_meta: casa ? JSON.stringify({ fileName: casa.fileName, size: casa.size }) : null,
      documentos_foto_garantia_meta: garantia ? JSON.stringify({ fileName: garantia.fileName, size: garantia.size }) : null,
      documentos_video_meta: video ? JSON.stringify({ fileName: video.fileName, size: video.size }) : null,
      documentos_social_meta: social ? JSON.stringify({ fileName: social.fileName, size: social.size }) : null,
      
      acepta_terminos: solicitud.aceptaciones?.terminos,
      acepta_contacto: solicitud.aceptaciones?.contacto,
      acepta_verifiedad: solicitud.aceptaciones?.verifiedad_datos,
      acepta_gps: solicitud.aceptaciones?.gps,
      estado: solicitud.estado || 'pendiente',
      fecha_solicitud: solicitud.fecha_solicitud,
      datos_json: solicitud
    };

    // Insertar en Supabase
    console.log('🔍 Datos que se van a insertar:', JSON.stringify(dataToInsert, null, 2));
    
    const { data, error } = await supabase
      .from('solicitudes_credito')
      .insert([dataToInsert])
      .select();

    if (error) {
      console.error('❌ Supabase error:', JSON.stringify(error, null, 2));
      console.error('❌ Código:', error.code);
      console.error('❌ Mensaje:', error.message);
      console.error('❌ Details:', error.details);
      return res.status(400).json({
        success: false,
        error: error.message,
        code: error.code,
        details: error.details
      });
    }
    
    console.log('✅ Datos insertados en Supabase:', data);

    res.status(201).json({
      success: true,
      folio: folio,
      id: id,
      timestamp: new Date().toISOString(),
      message: 'Solicitud registrada correctamente',
      documentos: {
        ineF: !!ineF,
        ineR: !!ineR,
        recServ: !!recServ,
        casa: !!casa,
        garantia: !!garantia,
        video: !!video,
        social: !!social
      }
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
// INICIAR SERVIDOR
// ═══════════════════════════════════════
const PORT = process.env.PORT || 2000;
app.listen(PORT, () => {
  console.log(`🚀 Backend PrestamosFlash activo en puerto ${PORT}`);
  console.log(`Ambiente: ${process.env.NODE_ENV || 'development'}`);
  console.log(`CORS origin: ${process.env.FRONTEND_URL || 'cualquiera'}`);
});
