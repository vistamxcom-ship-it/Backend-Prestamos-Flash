/**
 * PRESTAMOSFLASH - BACKEND NOTIFICACIONES + ALMACENAMIENTO
 * Recibe solicitudes, guarda en Supabase, almacena documentos
 * 
 * npm install express cors multer supabase dotenv
 * node server.js
 */

import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 2000;

// ═══════════════════════════════════════════════════════════
// VARIABLES DE ENTORNO (.env)
// ═══════════════════════════════════════════════════════════
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

// Inicializar Supabase - desactiva Realtime para Node 20
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false }
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

// Multer para archivos
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB
});

// ═══════════════════════════════════════════════════════════
// KEEP-ALIVE: Auto-ping para mantener el servidor despierto
// ═══════════════════════════════════════════════════════════
setInterval(() => {
  fetch(`http://localhost:${PORT}/health`).catch(() => {});
}, 5 * 60 * 1000); // Cada 5 minutos

// ═══════════════════════════════════════════════════════════
// ENDPOINT PRINCIPAL
// ═══════════════════════════════════════════════════════════

app.post('/api/solicitudes', upload.any(), async (req, res) => {
  try {
    console.log(`\n📥 Solicitud recibida en /api/solicitudes`);
    console.log(`   Files: ${req.files ? req.files.length : 0}`);
    console.log(`   Body keys: ${Object.keys(req.body).join(', ')}`);
    console.log(`   Body completo:`, JSON.stringify(req.body, null, 2));
    
    if (req.files && req.files.length > 0) {
      req.files.forEach(f => {
        console.log(`   📄 ${f.fieldname}: ${f.originalname} (${f.size} bytes)`);
      });
    }

    const folio = req.body.folio || 'PF-' + Date.now();
    let solicitudData = {};

    // Parsear datos
    if (req.body.data) {
      try {
        solicitudData = JSON.parse(req.body.data);
        console.log(`✅ JSON parseado correctamente`);
      } catch (e) {
        console.error(`❌ Error parseando JSON:`, e.message);
        solicitudData = req.body;
      }
    } else {
      console.warn(`⚠️ No hay campo 'data' en req.body`);
      solicitudData = req.body;
    }

    console.log(`   📋 Folio: ${folio}`);
    console.log(`   👤 Nombre: ${solicitudData.solicitante?.nombre || 'N/A'}`);
    console.log(`   📧 Email: ${solicitudData.solicitante?.email || 'N/A'}`);
    console.log(`   💰 Monto: ${solicitudData.credito?.monto_solicitado || 'N/A'}`);

    // URLs de documentos que se suban
    const documentosUrls = {};

    // Procesar y subir documentos a Supabase Storage
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        try {
          const ext = file.originalname.substring(file.originalname.lastIndexOf('.'));
          const fileName = `${folio}/${file.fieldname}-${Date.now()}${ext}`;
          
          console.log(`   ⬆️ Subiendo: ${fileName}`);
          
          // Subir a Supabase Storage con el bucket correcto
          const { data, error } = await supabase.storage
            .from('Prestamos Flash')
            .upload(fileName, file.buffer, {
              contentType: file.mimetype
            });

          if (error) {
            console.error(`   ❌ Error subiendo ${file.fieldname}:`, error.message);
          } else {
            console.log(`   ✅ Subido: ${file.fieldname}`);
            
            // Obtener URL pública
            const { data: publicUrlData } = supabase.storage
              .from('Prestamos Flash')
              .getPublicUrl(fileName);

            documentosUrls[file.fieldname] = {
              filename: file.originalname,
              url: publicUrlData.publicUrl,
              size: file.size,
              type: file.mimetype
            };
          }
        } catch (e) {
          console.error(`   ❌ Error procesando ${file.fieldname}:`, e.message);
        }
      }
    }

    // Estructura para insertar en solicitudes_credito
    const dataToInsert = {
      folio: folio,
      timestamp: solicitudData.timestamp || new Date().toISOString(),
      nombre: solicitudData.solicitante?.nombre,
      telefono: solicitudData.solicitante?.telefono,
      whatsapp: solicitudData.solicitante?.whatsapp,
      email: solicitudData.solicitante?.email,
      curp: solicitudData.solicitante?.curp,
      direccion: solicitudData.ubicacion?.direccion,
      gps_lat: solicitudData.ubicacion?.gps?.lat,
      gps_lng: solicitudData.ubicacion?.gps?.lng,
      gps_precision: solicitudData.ubicacion?.gps?.precision,
      monto_solicitado: solicitudData.credito?.monto_solicitado,
      destino_credito: solicitudData.credito?.destino,
      ocupacion: solicitudData.credito?.ocupacion,
      ingresos_mensuales: solicitudData.credito?.ingresos_mensuales,
      ref1_nombre: solicitudData.referencias?.ref1?.nombre,
      ref1_telefono: solicitudData.referencias?.ref1?.telefono,
      ref2_nombre: solicitudData.referencias?.ref2?.nombre,
      ref2_telefono: solicitudData.referencias?.ref2?.telefono,
      
      // URLs de documentos
      documentos_ine_frente: documentosUrls.ineF?.url,
      documentos_ine_reverso: documentosUrls.ineR?.url,
      documentos_comprobante: documentosUrls.recServ?.url,
      documentos_foto_domicilio: documentosUrls.casa?.url,
      documentos_foto_garantia: documentosUrls.garantia?.url,
      documentos_video: documentosUrls.video?.url,
      documentos_social: documentosUrls.social?.url,
      
      acepta_terminos: solicitudData.aceptaciones?.terminos,
      acepta_contacto: solicitudData.aceptaciones?.contacto,
      acepta_verifiedad: solicitudData.aceptaciones?.verifiedad_datos,
      acepta_gps: solicitudData.aceptaciones?.gps,
      estado: solicitudData.estado || 'pendiente',
      fecha_solicitud: solicitudData.fecha_solicitud,
      datos_json: solicitudData
    };

    console.log(`\n💾 Guardando en Supabase (tabla: solicitudes_credito)`);
    console.log(`   Folio: ${dataToInsert.folio}`);
    console.log(`   Nombre: ${dataToInsert.nombre}`);
    console.log(`   Email: ${dataToInsert.email}`);
    console.log(`   Documentos subidos: ${Object.keys(documentosUrls).length}`);
    console.log(`   Data a insertar:`, JSON.stringify(dataToInsert, null, 2));

    // Guardar en tabla de Supabase
    const { data, error } = await supabase
      .from('solicitudes_credito')
      .insert([dataToInsert])
      .select();

    if (error) {
      console.error('❌ Error Supabase:', error);
      console.error('   Código:', error.code);
      console.error('   Mensaje:', error.message);
      console.error('   Details:', error.details);
      return res.status(500).json({ 
        success: false,
        error: error.message,
        code: error.code,
        details: error.details
      });
    }

    console.log(`✅ Solicitud ${folio} guardada en Supabase`);
    console.log(`📁 Documentos almacenados: ${Object.keys(documentosUrls).length}`);

    res.json({
      success: true,
      mensaje: 'Solicitud guardada en Supabase correctamente',
      folio: folio,
      id: folio,
      documentosSubidos: Object.keys(documentosUrls).length,
      timestamp: new Date().toISOString(),
      datos: {
        nombre: dataToInsert.nombre,
        email: dataToInsert.email,
        monto: dataToInsert.monto_solicitado,
        documentos: documentosUrls
      }
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('   Stack:', error.stack);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Health check (IMPORTANTE: Render lo usa para saber si está vivo)
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    supabase: SUPABASE_URL ? '✅' : '❌'
  });
});

// ═══════════════════════════════════════════════════════════
// INICIAR
// ═══════════════════════════════════════════════════════════

app.listen(PORT, () => {
  console.log('════════════════════════════════════════════════════════════');
  console.log(`🌐 Backend PrestamosFlash en http://localhost:${PORT}`);
  console.log('════════════════════════════════════════════════════════════');
  console.log(`✅ Supabase: ${SUPABASE_URL ? 'Conectado' : '❌ NO CONFIGURADO'}`);
  console.log('════════════════════════════════════════════════════════════');
  console.log(`📝 ENDPOINTS:`);
  console.log(`   POST /api/solicitudes → Recibir solicitud + documentos`);
  console.log(`   GET  /health          → Estado`);
  console.log('════════════════════════════════════════════════════════════');
});
