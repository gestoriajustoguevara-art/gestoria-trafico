// Módulo para rellenar PDFs oficiales con datos de la base de datos

async function generarPDFExpediente(expedienteId) {
    const expediente = expedientes.find(e => e.id == expedienteId);
    if (!expediente) { mostrarAlerta('No se encontró el expediente', 'error'); return; }
    if (expediente.tipo === 'canje') { await generarPDFsCanje(expediente); return; }
    if (expediente.tipo === 'vmp')   { await generarPDFsVMP(expediente); return; }
    const vehiculo = vehiculos.find(v => v.id == expediente.vehiculo);
    if (!vehiculo) { mostrarAlerta('No se encontró el vehículo asociado', 'error'); return; }
    if (expediente.tipo === 'transferencia') {
        const opcion = confirm('¿Qué documento deseas generar?\n\nOK = Contrato de Compraventa\nCANCELAR = Mandatos (Vendedor y Comprador)');
        if (opcion) await generarPDFTransferencia(expediente, vehiculo);
        else        await generarMandatos(expediente, vehiculo);
    } else if (expediente.tipo === 'baja') {
        const opcion = confirm('¿Qué documento deseas generar?\n\nOK = Mandato\nCANCELAR = Declaración de Baja');
        if (opcion) {
            const titular = clientes.find(c => c.id == expediente.titular);
            if (!titular) { mostrarAlerta('No se encontró el titular', 'error'); return; }
            await generarMandatoBaja(expediente, vehiculo, titular);
        } else { await generarDeclaracionBaja(expediente, vehiculo); }
    } else { mostrarAlerta('Generación de PDF para este tipo de expediente estará disponible pronto', 'success'); }
}

async function generarMandatos(expediente, vehiculo) {
    const opciones = confirm('¿Qué mandato deseas generar?\n\nOK = Ambos (Vendedor y Comprador)\nCANCELAR = Solo elegir uno');
    if (opciones) { await generarMandatoVendedor(expediente, vehiculo); await generarMandatoComprador(expediente, vehiculo); }
    else {
        const esVendedor = confirm('¿Generar mandato del VENDEDOR?\n\nOK = Vendedor\nCANCELAR = Comprador');
        if (esVendedor) await generarMandatoVendedor(expediente, vehiculo);
        else            await generarMandatoComprador(expediente, vehiculo);
    }
}

async function generarMandatoVendedor(expediente, vehiculo) {
    const vendedor = clientes.find(c => c.id == expediente.vendedor);
    if (!vendedor) { mostrarAlerta('No se encontró el vendedor', 'error'); return; }
    await generarMandato(vendedor, 'VENDEDOR', expediente, vehiculo);
    if (vendedor.tipoCliente === 'juridica') setTimeout(async () => { await generarDocumentoRepresentacion(vendedor, 'TRANSFERENCIA', vehiculo); }, 500);
}

async function generarMandatoComprador(expediente, vehiculo) {
    const comprador = clientes.find(c => c.id == expediente.comprador);
    if (!comprador) { mostrarAlerta('No se encontró el comprador', 'error'); return; }
    await generarMandato(comprador, 'COMPRADOR', expediente, vehiculo);
    if (comprador.tipoCliente === 'juridica') setTimeout(async () => { await generarDocumentoRepresentacion(comprador, 'TRANSFERENCIA', vehiculo); }, 500);
}

async function generarMandato(cliente, tipo, expediente, vehiculo) {
    try {
        mostrarAlerta(`Generando mandato del ${tipo}...`, 'success');
        let pdfBytes, pdfEncontrado = false;
        for (const n of ['mandato.pdf','MANDATO_PROFESIONAL_ESPECIFICO_ABRIL_2019.pdf','mandato_profesional.pdf']) {
            try { const r = await fetch(n); if (r.ok) { pdfBytes = await r.arrayBuffer(); pdfEncontrado = true; break; } } catch(e) {}
        }
        if (!pdfEncontrado) { mostrarAlerta('❌ No se encuentra el PDF del mandato. Renómbralo a "mandato.pdf"', 'error'); return; }
        const { PDFDocument, rgb } = PDFLib;
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const firstPage = pdfDoc.getPages()[0];
        const { height } = firstPage.getSize();
        const fontSize = 9, font = await pdfDoc.embedFont('Helvetica');
        const S = v => (v === null || v === undefined) ? '' : String(v);
        const esJuridica = cliente.tipoCliente === 'juridica';
        const hayRep2 = esJuridica && cliente.dniRepresentante2 && cliente.nombreRepresentante2;
        let nombreL1 = esJuridica ? `${S(cliente.nombreRepresentante)} ${S(cliente.apellido1Representante)} ${S(cliente.apellido2Representante)}`.trim() : `${S(cliente.nombre)} ${S(cliente.apellido1)} ${S(cliente.apellido2)}`.trim();
        let dniL1    = esJuridica ? S(cliente.dniRepresentante) : S(cliente.nif);
        const draw = (text, x, y, size) => firstPage.drawText(text, { x, y: height - y, size: size||fontSize, font, color: rgb(0,0,0) });
        draw(nombreL1, 85, 98);
        draw(dniL1, 421, 98);
        if (hayRep2) {
            draw(`${S(cliente.nombreRepresentante2)} ${S(cliente.apellido1Representante2)} ${S(cliente.apellido2Representante2)}`.trim(), 93, 108);
            draw(S(cliente.dniRepresentante2), 360, 108);
        }
        if (esJuridica) { draw(S(cliente.nombre), 63, 130); draw(S(cliente.nif), 63, 141); }
        draw(S(cliente.municipio || cliente.localidad || ''), 293, esJuridica ? 141 : 130);
        let domicilio = '';
        if (cliente.tipoVia && cliente.nombreVia) domicilio = `${S(cliente.tipoVia)} ${S(cliente.nombreVia)}`;
        if (cliente.numero) domicilio += ` nº ${S(cliente.numero)}`;
        draw(domicilio, 63, esJuridica ? 153 : 143);
        draw('FRANCISCO JOSE JUSTO GUEVARA', 195, 182);
        draw('27525993F', 409, 183);
        draw('493', 94, 193);
        const fechaActual = new Date();
        const dia = fechaActual.getDate(), mes = fechaActual.toLocaleDateString('es-ES',{month:'long'}), año = fechaActual.getFullYear();
        const textoAsunto = (tipo==='VENDEDOR'||tipo==='COMPRADOR') ? 'TRANSFERENCIA' : (vehiculo.matricula.startsWith('CANJE') ? '' : tipo);
        if (textoAsunto) draw(textoAsunto, 76, 280);
        draw(vehiculo.matricula||'N/A', textoAsunto ? 178 : 76, 280);
        draw(`Bastidor: ${vehiculo.bastidor||'N/A'}`, 73, 299);
        draw('Olula del Río', 178, 750); draw(String(dia), 265, 750); draw(mes, 302, 750); draw(String(año), 378, 750);
        draw('Olula del Río', 177, 647); draw(String(dia), 269, 647); draw(mes, 302, 647); draw(String(año), 375, 647);
        const pdfOut = await pdfDoc.save();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([pdfOut], {type:'application/pdf'}));
        a.download = `Mandato_${tipo}_${expediente.numero}_${cliente.nif}.pdf`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        mostrarAlerta(`✅ Mandato del ${tipo} generado`, 'success');
    } catch(e) { mostrarAlerta('❌ Error al generar el mandato: ' + e.message, 'error'); }
}

function construirCalleSimple(persona) {
    let calle = '';
    if (persona.tipoVia)   calle += persona.tipoVia;
    if (persona.nombreVia) calle += ` ${persona.nombreVia}`;
    if (persona.numero)    calle += ` nº ${persona.numero}`;
    return calle.trim();
}

function construirDireccionCompleta(persona) {
    let d = '';
    if (persona.municipio) d += persona.municipio;
    if (persona.tipoVia && persona.nombreVia) d += `, ${persona.tipoVia} ${persona.nombreVia}`;
    if (persona.numero) d += ` nº ${persona.numero}`;
    return d || 'Domicilio no especificado';
}

function construirDireccion(persona) { return construirDireccionCompleta(persona); }

async function generarPDFTransferencia(expediente, vehiculo) {
    try {
        mostrarAlerta('Generando contrato de compraventa...', 'success');
        const vendedor  = clientes.find(c => c.id == expediente.vendedor);
        const comprador = clientes.find(c => c.id == expediente.comprador);
        if (!vendedor || !comprador) { mostrarAlerta('Error: No se encontraron los datos del vendedor o comprador', 'error'); return; }
        let pdfBytes, pdfEncontrado = false;
        for (const n of ['contrato.pdf','contrato-tipo-compra-venta-vehiculos__1_.pdf','contrato tipo compra venta vehiculos 1.pdf','contratotipocompraventavehiculos1.pdf','contrato_compraventa.pdf']) {
            try { const r = await fetch(n); if (r.ok) { pdfBytes = await r.arrayBuffer(); pdfEncontrado = true; break; } } catch(e) {}
        }
        if (!pdfEncontrado) { mostrarAlerta('❌ No se encuentra el PDF del contrato', 'error'); return; }
        if (typeof PDFLib === 'undefined') { mostrarAlerta('❌ Error: La librería pdf-lib no se cargó correctamente.', 'error'); return; }
        const { PDFDocument, rgb } = PDFLib;
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const firstPage = pdfDoc.getPages()[0];
        const { height } = firstPage.getSize();
        const fontSize = 9, font = await pdfDoc.embedFont('Helvetica');
        const draw = (text, x, y, size) => firstPage.drawText(String(text||''), { x, y: height - y, size: size||fontSize, font, color: rgb(0,0,0) });
        const fecha = expediente.fechaOperacion ? new Date(expediente.fechaOperacion) : new Date();
        const dia = fecha.getDate(), mes = fecha.toLocaleDateString('es-ES',{month:'long'}), año = fecha.getFullYear(), hora = expediente.hora||'';
        draw(expediente.lugar||'Granada', 70, 89); draw(String(dia), 161, 88); draw(mes, 209, 87); draw(String(año).substring(2), 302, 89); draw(hora, 412, 88);
        draw(`${vendedor.nombre} ${vendedor.apellido1||''} ${vendedor.apellido2||''}`.trim(), 71, 128);
        draw(vendedor.nif, 420, 127);
        draw(construirCalleSimple(vendedor), 117, 143, 8);
        draw(vendedor.municipio||vendedor.localidad||'', 285, 144, 8);
        draw(`${comprador.nombre} ${comprador.apellido1||''} ${comprador.apellido2||''}`.trim(), 68, 184);
        draw(comprador.nif, 413, 184);
        draw(construirCalleSimple(comprador), 118, 199, 8);
        draw(comprador.municipio||comprador.localidad||'', 296, 200, 8);
        draw(vehiculo.marca||'', 91, 244); draw(vehiculo.matricula||'', 108, 262); draw(vehiculo.bastidor||'', 134, 279);
        draw(vehiculo.kilometros ? String(vehiculo.kilometros) : '', 117, 295);
        draw(String(expediente.precio||'0'), 116, 387);
        if (vehiculo.seguroHasta) {
            const fs = new Date(vehiculo.seguroHasta);
            draw(`${String(fs.getDate()).padStart(2,'0')}/${String(fs.getMonth()+1).padStart(2,'0')}/${fs.getFullYear()}`, 353, 593);
        }
        const pdfOut = await pdfDoc.save();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([pdfOut],{type:'application/pdf'}));
        a.download = `Contrato_Compraventa_${expediente.numero}_${vehiculo.matricula}.pdf`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        mostrarAlerta('✅ Contrato de compraventa generado', 'success');
    } catch(e) { mostrarAlerta('❌ Error al generar el PDF: ' + e.message, 'error'); }
}

async function generarDeclaracionBaja(expediente, vehiculo) {
    try {
        const titular = clientes.find(c => c.id == expediente.titular);
        if (!titular) { mostrarAlerta('No se encontró el titular', 'error'); return; }
        let pdfBytes;
        for (const n of ['declaracion-baja.pdf','DECLARACION-VEHICULO-NO-EXISTE.pdf','declaracion_baja.pdf','baja.pdf']) {
            try { const r = await fetch(n); if (r.ok) { pdfBytes = await r.arrayBuffer(); break; } } catch(e) {}
        }
        if (!pdfBytes) { mostrarAlerta('No se encontró el PDF de declaración de baja.', 'error'); return; }
        const pdfDoc = await PDFLib.PDFDocument.load(pdfBytes);
        const firstPage = pdfDoc.getPages()[0];
        const { height } = firstPage.getSize();
        const fontSize = 10, font = await pdfDoc.embedFont('Helvetica');
        const draw = (text, x, y) => firstPage.drawText(String(text||''), { x, y: height - y, size: fontSize, font, color: PDFLib.rgb(0,0,0) });
        const nombre = `${titular.nombre} ${titular.apellido1||''} ${titular.apellido2||''}`.trim();
        const fechaActual = new Date();
        draw(nombre, 120, 255); draw(titular.nif, 131, 281); draw(titular.municipio||titular.localidad||'', 291, 281);
        draw(construirCalleSimple(titular), 91, 294); draw(vehiculo.matricula, 93, 532); draw(vehiculo.bastidor||'N/A', 312, 529);
        draw('Olula del Río', 132, 627); draw(String(fechaActual.getDate()), 183, 634);
        draw(fechaActual.toLocaleDateString('es-ES',{month:'long'}), 222, 632); draw(String(fechaActual.getFullYear()), 325, 633);
        const pdfOut = await pdfDoc.save();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([pdfOut],{type:'application/pdf'}));
        a.download = `Declaracion-Baja_${expediente.numero}_${vehiculo.matricula}.pdf`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        mostrarAlerta('✓ Declaración de baja generada', 'success');
    } catch(e) { mostrarAlerta('Error al generar la declaración: ' + e.message, 'error'); }
}

async function generarMandatoBaja(expediente, vehiculo, titular) {
    try {
        let pdfBytes;
        for (const n of ['mandato.pdf','MANDATO_PROFESIONAL_ESPECIFICO_ABRIL_2019.pdf','mandato_profesional.pdf']) {
            try { const r = await fetch(n); if (r.ok) { pdfBytes = await r.arrayBuffer(); break; } } catch(e) {}
        }
        if (!pdfBytes) { mostrarAlerta('No se encontró el PDF del mandato.', 'error'); return; }
        const pdfDoc = await PDFLib.PDFDocument.load(pdfBytes);
        const firstPage = pdfDoc.getPages()[0];
        const { height } = firstPage.getSize();
        const fontSize = 9, font = await pdfDoc.embedFont('Helvetica');
        const draw = (text, x, y, size) => firstPage.drawText(String(text||''), { x, y: height - y, size: size||fontSize, font, color: PDFLib.rgb(0,0,0) });
        const nombre = `${titular.nombre} ${titular.apellido1||''} ${titular.apellido2||''}`.trim();
        let domicilio = '';
        if (titular.tipoVia && titular.nombreVia) domicilio = `${titular.tipoVia} ${titular.nombreVia}`;
        if (titular.numero) domicilio += ` nº ${titular.numero}`;
        const fechaActual = new Date();
        const dia = fechaActual.getDate(), mes = fechaActual.toLocaleDateString('es-ES',{month:'long'}), año = fechaActual.getFullYear();
        draw(nombre, 85, 98); draw(titular.nif, 421, 98);
        draw(titular.municipio||titular.localidad||'', 293, 130);
        draw(domicilio, 63, 143);
        draw('FRANCISCO JOSE JUSTO GUEVARA', 195, 182); draw('27525993F', 409, 183); draw('493', 94, 193);
        draw('BAJA DEFINITIVA', 76, 280); draw(vehiculo.matricula||'N/A', 178, 280); draw(`Bastidor: ${vehiculo.bastidor||'N/A'}`, 73, 299);
        draw('Olula del Río', 183, 645); draw(String(dia), 271, 647); draw(mes, 298, 645); draw(String(año), 371, 646);
        draw('Olula del Río', 185, 517); draw(String(dia), 280, 517); draw(mes, 315, 517); draw(String(año), 385, 517);
        const pdfOut = await pdfDoc.save();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([pdfOut],{type:'application/pdf'}));
        a.download = `Mandato_BAJA_${expediente.numero}_${titular.nif}.pdf`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        mostrarAlerta('✓ Mandato de baja generado', 'success');
        if (titular.tipoCliente === 'juridica') setTimeout(async () => { await generarDocumentoRepresentacion(titular, 'BAJA', vehiculo); }, 500);
    } catch(e) { mostrarAlerta('Error al generar el mandato: ' + e.message, 'error'); }
}

async function generarPDFsCanje(canje) {
    const cliente = clientes.find(c => c.id == canje.titular || c.id == canje.clienteId || c.id == canje.comprador);
    if (!cliente) { mostrarAlerta('No se encontró el cliente del canje', 'error'); return; }
    if (!canje.clienteId) canje.clienteId = canje.titular || canje.comprador;
    const opcion = prompt('¿Qué documento deseas generar?\n\n1 - MOD-03 (Trámites de Conductores)\n2 - Mandato para Canje\n3 - Justificante Profesional\n4 - Todos los documentos\n\nEscribe el número:');
    if (opcion==='1') await generarMOD03Canje(canje);
    else if (opcion==='2') await generarMandatoCanje(canje);
    else if (opcion==='3') await generarJustificanteProfesionalCanje(canje);
    else if (opcion==='4') { await generarMOD03Canje(canje); setTimeout(async()=>await generarMandatoCanje(canje),500); setTimeout(async()=>await generarJustificanteProfesionalCanje(canje),1000); }
    else if (opcion) mostrarAlerta('Opción no válida', 'error');
}

async function generarMOD03Canje(canje) {
    try {
        mostrarAlerta('Generando MOD-03 para canje...', 'success');
        const cliente = clientes.find(c => c.id == canje.clienteId || c.id == canje.titular || c.id == canje.comprador);
        if (!cliente) { mostrarAlerta('No se encontró el cliente', 'error'); return; }
        let pdfBytes;
        for (const n of ['CONDUCTORES.pdf','conductores.pdf','MOD-03.pdf','mod-03.pdf','tramites-conductores.pdf']) {
            try { const r = await fetch(n); if (r.ok) { pdfBytes = await r.arrayBuffer(); break; } } catch(e) {}
        }
        if (!pdfBytes) { mostrarAlerta('No se encontró el PDF CONDUCTORES.pdf.', 'error'); return; }
        const { PDFDocument, rgb } = PDFLib;
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const firstPage = pdfDoc.getPages()[0];
        const { height } = firstPage.getSize();
        const fontSize = 9, font = await pdfDoc.embedFont('Helvetica');
        const S = v => (v===null||v===undefined)?'':String(v);
        const draw = (text, x, y, size) => firstPage.drawText(S(text), { x, y: height - y, size: size||fontSize, font, color: rgb(0,0,0) });
        let fechaNac = '';
        if (cliente.fechaNacimiento) { const fn = new Date(cliente.fechaNacimiento); fechaNac = `${String(fn.getDate()).padStart(2,'0')}/${String(fn.getMonth()+1).padStart(2,'0')}/${fn.getFullYear()}`; }
        const fechaActual = new Date();
        const dia = fechaActual.getDate(), mes = fechaActual.toLocaleDateString('es-ES',{month:'long'}), año = fechaActual.getFullYear();
        const paisPermiso = (canje.pais||canje.paisOrigen||'').toUpperCase();
        const COORDS = {
            dni:{x:40,y:119}, fechaNac:{x:130,y:119}, paisNac:{x:260,y:119}, nacionalidad:{x:445,y:119},
            nombre:{x:40,y:147}, apellido1:{x:212,y:147}, apellido2:{x:400,y:147}, telefono:{x:340,y:175},
            tipoVia:{x:40,y:228}, nombreVia:{x:122,y:228}, numero:{x:530,y:228}, cp:{x:40,y:284},
            provincia:{x:122,y:284}, municipio:{x:305,y:284}, localidad:{x:460,y:284},
            xCanje:{x:32,y:408}, clasePermiso:{x:40,y:484}, numPermiso:{x:105,y:484},
            paisPermiso:{x:218,y:484}, fechaExp:{x:425,y:484}, fechaCad:{x:525,y:484},
            lugar:{x:160,y:708}, dia:{x:252,y:708}, mes:{x:295,y:708}, anio:{x:380,y:708}
        };
        draw(S(cliente.nif), COORDS.dni.x, COORDS.dni.y); draw(fechaNac, COORDS.fechaNac.x, COORDS.fechaNac.y);
        draw(paisPermiso, COORDS.paisNac.x, COORDS.paisNac.y); draw(paisPermiso, COORDS.nacionalidad.x, COORDS.nacionalidad.y);
        draw(S(cliente.nombre), COORDS.nombre.x, COORDS.nombre.y); draw(S(cliente.apellido1), COORDS.apellido1.x, COORDS.apellido1.y);
        draw(S(cliente.apellido2), COORDS.apellido2.x, COORDS.apellido2.y); draw(S(cliente.telefono), COORDS.telefono.x, COORDS.telefono.y);
        draw(S(cliente.tipoVia), COORDS.tipoVia.x, COORDS.tipoVia.y); draw(S(cliente.nombreVia), COORDS.nombreVia.x, COORDS.nombreVia.y);
        draw(S(cliente.numero), COORDS.numero.x, COORDS.numero.y); draw(S(cliente.cp), COORDS.cp.x, COORDS.cp.y);
        draw(S(cliente.codigoProvincia)||'AL', COORDS.provincia.x, COORDS.provincia.y);
        draw(S(cliente.localidad), COORDS.municipio.x, COORDS.municipio.y); draw(S(cliente.localidad), COORDS.localidad.x, COORDS.localidad.y);
        draw('X', COORDS.xCanje.x, COORDS.xCanje.y, 11);
        if (canje.origen==='ue') draw('X', 32, 435, 11);
        else if (canje.origen==='otros') draw('X', 173, 435, 11);
        else if (canje.origen==='militar') draw('X', 305, 435, 11);
        else if (canje.origen==='policia') draw('X', 439, 435, 11);
        draw(S(canje.clasePermiso), COORDS.clasePermiso.x, COORDS.clasePermiso.y); draw(S(canje.numeroPermiso), COORDS.numPermiso.x, COORDS.numPermiso.y);
        draw(paisPermiso, COORDS.paisPermiso.x, COORDS.paisPermiso.y);
        if (canje.fechaExpedicion) { const fe=new Date(canje.fechaExpedicion); draw(`${String(fe.getDate()).padStart(2,'0')}/${String(fe.getMonth()+1).padStart(2,'0')}/${fe.getFullYear()}`, COORDS.fechaExp.x, COORDS.fechaExp.y); }
        if (canje.fechaCaducidad)  { const fc=new Date(canje.fechaCaducidad);  draw(`${String(fc.getDate()).padStart(2,'0')}/${String(fc.getMonth()+1).padStart(2,'0')}/${fc.getFullYear()}`, COORDS.fechaCad.x, COORDS.fechaCad.y); }
        draw('Almería', COORDS.lugar.x, COORDS.lugar.y); draw(String(dia), COORDS.dia.x, COORDS.dia.y);
        draw(mes, COORDS.mes.x, COORDS.mes.y); draw(String(año), COORDS.anio.x, COORDS.anio.y);
        const pdfOut = await pdfDoc.save();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([pdfOut],{type:'application/pdf'}));
        a.download = `MOD03_CANJE_${canje.numero}_${cliente.nif}.pdf`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        mostrarAlerta('✓ MOD-03 generado correctamente', 'success');
    } catch(e) { mostrarAlerta('Error al generar MOD-03: ' + e.message, 'error'); }
}

async function generarMandatoCanje(canje) {
    const cliente = clientes.find(c => c.id == canje.clienteId || c.id == canje.titular || c.id == canje.comprador);
    if (!cliente) { mostrarAlerta('No se encontró el cliente', 'error'); return; }
    const vehiculoFicticio = { matricula: `CANJE ${canje.clasePermiso||''} - ${(canje.pais||canje.paisOrigen||'').toUpperCase()}`, bastidor: canje.numeroPermiso||'N/A' };
    await generarMandato(cliente, 'CANJE', {numero: canje.numero}, vehiculoFicticio);
}

async function generarJustificanteProfesionalCanje(canje) {
    try {
        mostrarAlerta('Generando Justificante Profesional...', 'success');
        const cliente = clientes.find(c => c.id === canje.titular || c.id === canje.clienteId);
        if (!cliente) { mostrarAlerta('No se encontró el cliente del canje', 'error'); return; }
        const nombreCompleto = `${cliente.nombre||''} ${cliente.apellido1||''} ${cliente.apellido2||''}`.trim().toUpperCase();
        const nieCliente = cliente.nif||'';
        const paisOrigen = (canje.pais||canje.paisOrigen||'extranjero').toLowerCase();
        const hoy = new Date();
        const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
        const fechaFormateada = `${hoy.getDate()} de ${meses[hoy.getMonth()]} de ${hoy.getFullYear()}`;
        const { PDFDocument, rgb, StandardFonts } = PDFLib;
        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage([595.32, 841.92]);
        const fontRegular = await pdfDoc.embedFont(StandardFonts.TimesRoman);
        const fontBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
        const { width, height } = page.getSize();
        const margenIzq = 82;
        let y = height - 245;
        page.drawText('DON FRANCISCO JOSE JUSTO GUEVARA,', { x: 127, y, size: 12, font: fontBold, color: rgb(0,0,0) });
        page.drawText('Gestor Administrativo', { x: 403, y, size: 12, font: fontRegular, color: rgb(0,0,0) });
        y -= 14; page.drawText('adscrito al Ilustre Colegio Oficial de Granada, Jaén y Almería, con número de', { x: margenIzq, y, size: 12, font: fontRegular, color: rgb(0,0,0) });
        y -= 14; page.drawText('Colegiado 493', { x: margenIzq, y, size: 12, font: fontBold, color: rgb(0,0,0) });
        page.drawText(', con D.N.I. 27.525.993-F, con domicilio a efectos de notificaciones', { x: 164, y, size: 12, font: fontRegular, color: rgb(0,0,0) });
        y -= 14; page.drawText('en Olula del Río (Almería), Avenida Almanzora, número 6, Edificio Almansur, Local', { x: margenIzq, y, size: 12, font: fontRegular, color: rgb(0,0,0) });
        y -= 14; page.drawText('2, y teléfono 950/44.16.15,', { x: margenIzq, y, size: 12, font: fontRegular, color: rgb(0,0,0) });
        y -= 42; page.drawText('EXPONE', { x: margenIzq, y, size: 12, font: fontBold, color: rgb(0,0,0) });
        page.drawText(' que estamos tramitando en el despacho el ', { x: 130, y, size: 12, font: fontRegular, color: rgb(0,0,0) });
        page.drawText('CANJE', { x: 377, y, size: 12, font: fontBold, color: rgb(0,0,0) });
        page.drawText(' del permiso de', { x: 417, y, size: 12, font: fontRegular, color: rgb(0,0,0) });
        y -= 14;
        page.drawText('conducir ', { x: margenIzq, y, size: 12, font: fontRegular, color: rgb(0,0,0) });
        const paisX = 130; page.drawText(paisOrigen, { x: paisX, y, size: 12, font: fontRegular, color: rgb(1,0,0) });
        const paisWidth = fontRegular.widthOfTextAtSize(paisOrigen, 12);
        page.drawLine({ start:{x:paisX, y:y-2}, end:{x:paisX+paisWidth, y:y-2}, thickness:0.5, color:rgb(1,0,0) });
        const xp = paisX + paisWidth + 5;
        page.drawText('de ', { x: xp, y, size: 12, font: fontRegular, color: rgb(0,0,0) });
        page.drawText('D./Dña. ' + nombreCompleto, { x: xp+18, y, size: 12, font: fontBold, color: rgb(0,0,0) });
        const xNIE = xp + 18 + fontBold.widthOfTextAtSize('D./Dña. ' + nombreCompleto, 12);
        page.drawText(' con NIE/DNI ', { x: xNIE, y, size: 12, font: fontRegular, color: rgb(0,0,0) });
        y -= 14; page.drawText(nieCliente, { x: margenIzq, y, size: 12, font: fontBold, color: rgb(0,0,0) });
        page.drawText(' por un permiso de conducir español.', { x: margenIzq + fontBold.widthOfTextAtSize(nieCliente, 12) + 3, y, size: 12, font: fontRegular, color: rgb(0,0,0) });
        y -= 42; page.drawText('Se expide el presente justificante profesional para que surta efectos allí donde', { x: margenIzq, y, size: 12, font: fontRegular, color: rgb(0,0,0) });
        y -= 14; page.drawText('proceda, fundamentalmente sirva de justificante sustitutivo de autorización de', { x: margenIzq, y, size: 12, font: fontRegular, color: rgb(0,0,0) });
        y -= 14; page.drawText('permiso de conducir del referido titular.', { x: margenIzq, y, size: 12, font: fontRegular, color: rgb(0,0,0) });
        y -= 42; page.drawText('El plazo de validez del presente justificante es de 30 días naturales a contar desde', { x: margenIzq, y, size: 12, font: fontRegular, color: rgb(0,0,0) });
        y -= 14; page.drawText('la fecha de su formalización.', { x: margenIzq, y, size: 12, font: fontRegular, color: rgb(0,0,0) });
        y -= 70; page.drawText(`En Olula del Río, a ${fechaFormateada}.`, { x: margenIzq, y, size: 12, font: fontRegular, color: rgb(0,0,0) });
        y -= 120; page.drawText('Fdo. Francisco José Justo Guevara.', { x: 89, y, size: 12, font: fontRegular, color: rgb(0,0,0) });
        const pdfBytes = await pdfDoc.save();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([pdfBytes],{type:'application/pdf'}));
        a.download = `Justificante_Profesional_CANJE_${canje.numero}_${cliente.nif}.pdf`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        mostrarAlerta('✓ Justificante Profesional generado', 'success');
    } catch(e) { mostrarAlerta('Error al generar justificante: ' + e.message, 'error'); }
}

function dividirTextoEnLineas(texto, font, fontSize, anchoMax) {
    const palabras = texto.split(' '), lineas = [];
    let lineaActual = '';
    for (const palabra of palabras) {
        const prueba = lineaActual ? lineaActual + ' ' + palabra : palabra;
        if (font.widthOfTextAtSize(prueba, fontSize) <= anchoMax) lineaActual = prueba;
        else { if (lineaActual) lineas.push(lineaActual); lineaActual = palabra; }
    }
    if (lineaActual) lineas.push(lineaActual);
    return lineas;
}

async function generarDocumentoRepresentacion(cliente, tipoTramite, vehiculo) {
    try {
        mostrarAlerta('Generando documento de representación...', 'success');
        let pdfBytes;
        for (const n of ['documento_representacion_juridica.pdf','representacion_juridica.pdf','documento_representacion.pdf','DOCUMENTO_REPRESENTACION_JURIDICA.pdf']) {
            try { const r = await fetch(n); if (r.ok) { pdfBytes = await r.arrayBuffer(); break; } } catch(e) {}
        }
        if (!pdfBytes) { mostrarAlerta('No se encontró documento_representacion_juridica.pdf.', 'error'); return; }
        const { PDFDocument, rgb } = PDFLib;
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const firstPage = pdfDoc.getPages()[0];
        const { height } = firstPage.getSize();
        const fontSize = 10, font = await pdfDoc.embedFont('Helvetica');
        const S = v => (v===null||v===undefined)?'':String(v);
        const draw = (text, x, y, size) => firstPage.drawText(S(text), { x, y: height - y, size: size||fontSize, font, color: rgb(0,0,0) });
        const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
        const fechaActual = new Date();
        const dia = fechaActual.getDate(), mes = meses[fechaActual.getMonth()], año = fechaActual.getFullYear().toString().slice(-2);
        const lugar = S(cliente.localidad||cliente.municipioManual||'OLULA DEL RIO').toUpperCase();
        const rep1Nombre = `${S(cliente.nombreRepresentante)} ${S(cliente.apellido1Representante)} ${S(cliente.apellido2Representante)}`.trim().toUpperCase();
        const hayRep2 = cliente.dniRepresentante2 && cliente.nombreRepresentante2;
        draw(S(cliente.nombre).toUpperCase(), 145, 314); draw(S(cliente.nif), 57, 332);
        draw(tipoTramite.toUpperCase(), 309, 332, 8);
        draw(vehiculo ? (S(vehiculo.matricula)||S(vehiculo.bastidor)) : '', 57, 351);
        draw(lugar, 180, 414); draw(String(dia), 300, 414); draw(mes, 338, 414); draw(año, 459, 414);
        draw(rep1Nombre, 57, 558); draw(S(cliente.dniRepresentante), 446, 558);
        if (hayRep2) {
            draw(`${S(cliente.nombreRepresentante2)} ${S(cliente.apellido1Representante2)} ${S(cliente.apellido2Representante2)}`.trim().toUpperCase(), 57, 576);
            draw(S(cliente.dniRepresentante2), 446, 576);
        }
        const pdfOut = await pdfDoc.save();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([pdfOut],{type:'application/pdf'}));
        a.download = `Representacion_${cliente.nif}_${tipoTramite}.pdf`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        mostrarAlerta('✓ Documento de representación generado', 'success');
    } catch(e) { mostrarAlerta('Error al generar documento de representación: ' + e.message, 'error'); }
}

function obtenerNombreProvincia(codigo) {
    const p = {'04':'ALMERÍA','11':'CÁDIZ','14':'CÓRDOBA','18':'GRANADA','21':'HUELVA','23':'JAÉN','29':'MÁLAGA','41':'SEVILLA'};
    return p[codigo]||'ALMERÍA';
}

// ══════════════════════════════════════════════════════════════════════
// MOD-30 VMP — COORDENADAS CALIBRADAS CON EL PDF REAL
// PDF: 594.96 x 842.04  |  pdf-lib: Y desde abajo  |  y = 842 - top
// ══════════════════════════════════════════════════════════════════════
async function generarPDFsVMP(expediente) {
    const comprador = clientes.find(c => c.id == expediente.comprador);
    if (!comprador) { mostrarAlerta('No se encontró el comprador/titular del VMP', 'error'); return; }
    const opcion = prompt('¿Qué documento deseas generar?\n\n1 - MOD-30 (Trámites de VMP)\n2 - Mandato\n3 - Ambos documentos\n\nEscribe el número:');
    if (opcion==='1') await generarMOD30VMP(expediente);
    else if (opcion==='2') await generarMandatoVMP(expediente);
    else if (opcion==='3') { await generarMOD30VMP(expediente); setTimeout(async()=>await generarMandatoVMP(expediente),500); }
    else if (opcion) mostrarAlerta('Opción no válida', 'error');
}

async function generarMOD30VMP(expediente) {
    try {
        mostrarAlerta('Generando MOD-30 para VMP...', 'success');
        const comprador = clientes.find(c => c.id == expediente.comprador);
        if (!comprador) { mostrarAlerta('No se encontró el comprador/titular', 'error'); return; }
        const vendedor     = expediente.vendedor     ? clientes.find(c => c.id == expediente.vendedor)     : null;
        const representante= expediente.representante? clientes.find(c => c.id == expediente.representante): null;

        let pdfBytes;
        for (const n of ['Mod_30-ES.pdf','MOD_30-ES.pdf','mod_30.pdf','MOD-30.pdf','mod30.pdf']) {
            try { const r = await fetch(n); if (r.ok) { pdfBytes = await r.arrayBuffer(); break; } } catch(e) {}
        }
        if (!pdfBytes) { mostrarAlerta('No se encontró el PDF Mod_30-ES.pdf. Colócalo en la misma carpeta.', 'error'); return; }

        const { PDFDocument, rgb } = PDFLib;
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const firstPage = pdfDoc.getPages()[0];
        const h = firstPage.getSize().height; // 842.04
        const fontSize = 9, font = await pdfDoc.embedFont('Helvetica');
        const S = v => (v===null||v===undefined)?'':String(v);

        // Helper: escribe texto. yTop = coordenada Y desde arriba (pdfplumber)
        // Colocamos el dato 2px por encima de la línea inferior del campo
        const draw = (text, x, yTop, size) => {
            if (!text || S(text).trim()==='') return;
            firstPage.drawText(S(text).trim(), { x, y: h - yTop, size: size||fontSize, font, color: rgb(0,0,0) });
        };

        const formatFecha = (f) => {
            if (!f) return '';
            const d = new Date(f);
            return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
        };

        const fechaActual = new Date();
        const dia = fechaActual.getDate();
        const mes = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'][fechaActual.getMonth()];
        const año = fechaActual.getFullYear();

        // ── DATOS DEL VEHÍCULO ─────────────────────────────────────────
        // Las etiquetas están en y=105.7 y y=134.2
        // Los datos van en la fila siguiente (~y=119-122)
        draw(S(expediente.vmpNumInscripcion),   87,  122);
        draw(formatFecha(expediente.vmpFechaInscripcion), 267, 122);
        draw(S(expediente.vmpNumSerie),         352,  122);
        draw(S(expediente.vmpNumCertificado),    87,  148);
        draw(S(expediente.vmpMarca),            213,  148);

        // ── DOMICILIO FISCAL DEL VEHÍCULO ──────────────────────────────
        // Etiquetas en y≈179.6, 207.8, 236.1
        draw(S(comprador.tipoVia),   60, 194);
        draw(S(comprador.nombreVia), 170, 194);
        draw(S(comprador.numero),    525, 194);

        draw(S(comprador.bloque),   60,  222);
        draw(S(comprador.portal),   155, 222);
        draw(S(comprador.escalera), 250, 222);
        draw(S(comprador.planta),   340, 222);
        draw(S(comprador.puerta),   430, 222);

        draw(S(comprador.cp),                          60,  250);
        draw(S(comprador.codigoProvincia)||'ALMERÍA',  155, 250);
        const municipioComp = S(comprador.localidad || comprador.municipioManual);
        draw(municipioComp, 340, 250);
        draw(municipioComp, 475, 250);

        // ── DATOS DEL INTERESADO / COMPRADOR ───────────────────────────
        // Etiquetas en y≈287.1 y y≈315.5
        draw(S(comprador.nif),              62,  301);
        draw(formatFecha(comprador.fechaNacimiento), 217, 301);
        draw(S(comprador.telefono),         252, 301);
        draw(comprador.tipoCliente==='juridica' ? S(comprador.nombre) : S(comprador.nombre), 370, 301);

        draw(S(comprador.apellido1), 68,  330);
        draw(S(comprador.apellido2), 250, 330);
        draw(S(comprador.email),     450, 330);

        // ── CHECKBOXES DE TRÁMITE ──────────────────────────────────────
        // Cabecera de checkboxes en y≈375.1
        // Las X van a la izquierda del texto de cada opción
        const subtipo = expediente.subtipoVMP;

        if (subtipo === 'inscripcion') {
            draw('X', 222, 378, 11); // INSCRIPCIÓN
            draw('X', 224, 396, 11); // Ordinaria
        } else if (subtipo === 'duplicado') {
            draw('X', 41, 378, 11);  // DUPLICADOS
            const motivo = expediente.vmpMotivoDuplicado;
            if (motivo==='extravio')        draw('X', 41, 392, 11);
            else if (motivo==='deterioro')  draw('X', 41, 406, 11);
            else if (motivo==='sustraccion')draw('X', 41, 420, 11);
            else if (motivo==='cambio-domicilio') draw('X', 41, 434, 11);
            else if (motivo==='variacion-nombre') draw('X', 123, 396, 11);
            else if (motivo==='variacion-datos')  draw('X', 123, 424, 11);
        } else if (subtipo === 'baja') {
            draw('X', 339, 378, 11); // BAJA
            const tipoBaja = expediente.vmpTipoBaja;
            if (tipoBaja==='definitiva')            draw('X', 339, 396, 11);
            else if (tipoBaja==='temporal'||tipoBaja==='sustraccion') draw('X', 339, 410, 11);
        } else if (subtipo === 'transferencia') {
            // No hay checkbox específico para cambio titularidad — los datos del vendedor lo identifican
        }

        // ── CAMBIO DE TITULARIDAD: datos del vendedor ──────────────────
        // Etiquetas en y≈478.4 y y≈506.9
        if (vendedor && subtipo === 'transferencia') {
            draw(S(vendedor.nif),              62,  492);
            draw(formatFecha(vendedor.fechaNacimiento), 217, 492);
            draw(S(vendedor.nombre),           370, 492);
            draw(S(vendedor.apellido1),         68,  521);
            draw(S(vendedor.apellido2),        300,  521);
        }

        // ── DATOS DEL REPRESENTANTE / TUTOR ───────────────────────────
        // Etiquetas en y≈558.8 y y≈587.2
        if (representante) {
            draw(S(representante.nif),     62,  573);
            draw(formatFecha(representante.fechaNacimiento), 217, 573);
            draw(S(representante.nombre),  370, 573);
            draw(S(representante.apellido1), 68, 601);
            draw(S(representante.apellido2), 300, 601);
        }

        // ── FECHA Y LUGAR FINAL ────────────────────────────────────────
        // "En ___, a ___ de ___ de ___"  — línea de texto en y≈744.5
        // Los blancos para rellenar están justo después de cada guión bajo
        draw('Almería',    136, 759);
        draw(String(dia),  243, 759);
        draw(mes,          284, 759);
        draw(String(año),  368, 759);

        // ── GUARDAR Y DESCARGAR ────────────────────────────────────────
        const pdfOut = await pdfDoc.save();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([pdfOut], {type:'application/pdf'}));
        a.download = `MOD30_VMP_${expediente.numero}_${comprador.nif}.pdf`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        mostrarAlerta('✓ MOD-30 VMP generado correctamente', 'success');

    } catch(e) {
        console.error('Error generando MOD-30 VMP:', e);
        mostrarAlerta('Error al generar MOD-30 VMP: ' + e.message, 'error');
    }
}

async function generarMandatoVMP(expediente) {
    const comprador = clientes.find(c => c.id == expediente.comprador);
    if (!comprador) { mostrarAlerta('No se encontró el comprador/titular', 'error'); return; }
    let asunto = 'INSCRIPCIÓN DE VMP';
    if (expediente.subtipoVMP==='transferencia') asunto = 'CAMBIO DE TITULARIDAD DE VMP';
    else if (expediente.subtipoVMP==='duplicado') asunto = 'DUPLICADO DE CERTIFICADO DE VMP';
    else if (expediente.subtipoVMP==='baja')      asunto = 'BAJA DE VMP';
    if (expediente.vmpMarca)   asunto += ` - ${expediente.vmpMarca}`;
    if (expediente.vmpNumSerie) asunto += ` (N/S: ${expediente.vmpNumSerie})`;
    const vehiculoVMP = { matricula: expediente.vmpNumInscripcion||expediente.vmpNumSerie||'VMP', bastidor: expediente.vmpNumSerie||'' };
    await generarMandato(comprador, 'COMPRADOR', expediente, vehiculoVMP);
}
