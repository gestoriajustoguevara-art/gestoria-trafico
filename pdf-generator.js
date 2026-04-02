// Módulo para rellenar PDFs oficiales con datos de la base de datos

// Función principal para generar PDF según el tipo de expediente
async function generarPDFExpediente(expedienteId) {
    const expediente = expedientes.find(e => e.id == expedienteId);
    if (!expediente) {
        mostrarAlerta('No se encontró el expediente', 'error');
        return;
    }
    
    // Para canjes no necesitamos vehículo
    if (expediente.tipo === 'canje') {
        await generarPDFsCanje(expediente);
        return;
    }
    
    // Para VMP
    if (expediente.tipo === 'vmp') {
        await generarPDFsVMP(expediente);
        return;
    }
    
    // Obtener datos relacionados
    const vehiculo = vehiculos.find(v => v.id == expediente.vehiculo);
    
    if (!vehiculo) {
        mostrarAlerta('No se encontró el vehículo asociado', 'error');
        return;
    }
    
    // Generar PDF según el tipo
    if (expediente.tipo === 'transferencia') {
        // Preguntar qué documento generar
        const opcion = confirm('¿Qué documento deseas generar?\n\nOK = Contrato de Compraventa\nCANCELAR = Mandatos (Vendedor y Comprador)');
        
        if (opcion) {
            await generarPDFTransferencia(expediente, vehiculo);
        } else {
            await generarMandatos(expediente, vehiculo);
        }
    } else if (expediente.tipo === 'baja') {
        // Preguntar qué documento generar para bajas
        const opcion = confirm('¿Qué documento deseas generar?\n\nOK = Mandato\nCANCELAR = Declaración de Baja');
        
        if (opcion) {
            // Generar mandato
            const titular = clientes.find(c => c.id == expediente.titular);
            if (!titular) {
                mostrarAlerta('No se encontró el titular', 'error');
                return;
            }
            await generarMandatoBaja(expediente, vehiculo, titular);
        } else {
            // Generar declaración de baja
            await generarDeclaracionBaja(expediente, vehiculo);
        }
    } else {
        mostrarAlerta('Generación de PDF para este tipo de expediente estará disponible pronto', 'success');
    }
}

// Generar mandatos para vendedor y comprador
async function generarMandatos(expediente, vehiculo) {
    const opciones = confirm('¿Qué mandato deseas generar?\n\nOK = Ambos (Vendedor y Comprador)\nCANCELAR = Solo elegir uno');
    
    if (opciones) {
        // Generar ambos
        await generarMandatoVendedor(expediente, vehiculo);
        await generarMandatoComprador(expediente, vehiculo);
    } else {
        const esVendedor = confirm('¿Generar mandato del VENDEDOR?\n\nOK = Vendedor\nCANCELAR = Comprador');
        if (esVendedor) {
            await generarMandatoVendedor(expediente, vehiculo);
        } else {
            await generarMandatoComprador(expediente, vehiculo);
        }
    }
}

// Generar mandato del vendedor
async function generarMandatoVendedor(expediente, vehiculo) {
    const vendedor = clientes.find(c => c.id == expediente.vendedor);
    if (!vendedor) {
        mostrarAlerta('No se encontró el vendedor', 'error');
        return;
    }
    
    await generarMandato(vendedor, 'VENDEDOR', expediente, vehiculo);
    
    // Si es persona jurídica, generar también el documento de representación
    if (vendedor.tipoCliente === 'juridica') {
        setTimeout(async () => {
            await generarDocumentoRepresentacion(vendedor, 'TRANSFERENCIA', vehiculo);
        }, 500);
    }
}

// Generar mandato del comprador
async function generarMandatoComprador(expediente, vehiculo) {
    const comprador = clientes.find(c => c.id == expediente.comprador);
    if (!comprador) {
        mostrarAlerta('No se encontró el comprador', 'error');
        return;
    }
    
    await generarMandato(comprador, 'COMPRADOR', expediente, vehiculo);
    
    // Si es persona jurídica, generar también el documento de representación
    if (comprador.tipoCliente === 'juridica') {
        setTimeout(async () => {
            await generarDocumentoRepresentacion(comprador, 'TRANSFERENCIA', vehiculo);
        }, 500);
    }
}

// Función general para generar mandato
async function generarMandato(cliente, tipo, expediente, vehiculo) {
    try {
        mostrarAlerta(`Generando mandato del ${tipo}...`, 'success');
        
        // Cargar el PDF del mandato
        let pdfBytes;
        const nombresPosibles = [
            'mandato.pdf',
            'MANDATO_PROFESIONAL_ESPECIFICO_ABRIL_2019.pdf',
            'mandato_profesional.pdf'
        ];
        
        let pdfEncontrado = false;
        
        for (const nombrePDF of nombresPosibles) {
            try {
                console.log('🔍 Buscando mandato:', nombrePDF);
                const response = await fetch(nombrePDF);
                if (response.ok) {
                    pdfBytes = await response.arrayBuffer();
                    pdfEncontrado = true;
                    console.log('✅ Mandato encontrado:', nombrePDF);
                    break;
                }
            } catch (error) {
                continue;
            }
        }
        
        if (!pdfEncontrado) {
            mostrarAlerta('❌ No se encuentra el PDF del mandato. Renómbralo a "mandato.pdf"', 'error');
            return;
        }
        
        const { PDFDocument, rgb } = PDFLib;
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const pages = pdfDoc.getPages();
        const firstPage = pages[0];
        const { width, height } = firstPage.getSize();
        
        const fontSize = 9;
        const font = await pdfDoc.embedFont('Helvetica');
        
        // Función auxiliar para asegurar que un valor sea string
        const toString = (val) => (val === null || val === undefined) ? '' : String(val);
        
        // Detectar si es persona jurídica
        const esPersonaJuridica = cliente.tipoCliente === 'juridica';
        
        // Detectar si hay segundo representante
        const haySegundoRepresentante = esPersonaJuridica && cliente.dniRepresentante2 && cliente.nombreRepresentante2;
        
        // Preparar datos según tipo de cliente
        let nombreLinea1 = '';  // D./ña. _______ con DNI _______
        let dniLinea1 = '';
        let nombreLinea2 = '';  // y D./ña. _______ con DNI _______ (segundo representante)
        let dniLinea2 = '';
        let nombreEmpresa = '';  // "en representación de _______ con DNI/CIF _______"
        let cifEmpresa = '';
        
        if (esPersonaJuridica) {
            // PERSONA JURÍDICA: 
            // Línea 1: Representante + DNI representante
            // Línea 2 (si hay): Segundo representante + DNI
            // Línea "en representación de": Empresa + CIF
            nombreLinea1 = `${toString(cliente.nombreRepresentante)} ${toString(cliente.apellido1Representante)} ${toString(cliente.apellido2Representante)}`.trim();
            dniLinea1 = toString(cliente.dniRepresentante);
            
            if (haySegundoRepresentante) {
                nombreLinea2 = `${toString(cliente.nombreRepresentante2)} ${toString(cliente.apellido1Representante2)} ${toString(cliente.apellido2Representante2)}`.trim();
                dniLinea2 = toString(cliente.dniRepresentante2);
            }
            
            nombreEmpresa = toString(cliente.nombre);  // Razón social
            cifEmpresa = toString(cliente.nif);  // CIF de la empresa
        } else {
            // PERSONA FÍSICA:
            // Línea 1: Nombre completo + DNI
            // Línea "en representación de": vacía
            nombreLinea1 = `${toString(cliente.nombre)} ${toString(cliente.apellido1)} ${toString(cliente.apellido2)}`.trim();
            dniLinea1 = toString(cliente.nif);
            nombreEmpresa = '';
            cifEmpresa = '';
        }
        
        // Construir solo la calle (sin municipio) - SIEMPRE datos de la empresa/cliente
        let domicilioSolo = '';
        if (cliente.tipoVia && cliente.nombreVia) {
            domicilioSolo = `${toString(cliente.tipoVia)} ${toString(cliente.nombreVia)}`;
        }
        if (cliente.numero) domicilioSolo += ` nº ${toString(cliente.numero)}`;
        
        // Preparar fecha actual
        const fechaActual = new Date();
        const dia = fechaActual.getDate();
        const mes = fechaActual.toLocaleDateString('es-ES', { month: 'long' });
        const año = fechaActual.getFullYear();
        
        // Datos del gestor (FRANCISCO JOSE JUSTO GUEVARA)
        const gestor = {
            nombre: 'FRANCISCO JOSE JUSTO GUEVARA',
            dni: '27525993F',
            numColegiado: '493',
            colegio: 'COLEGIO OFICIAL DE GESTORES ADMINISTRATIVOS DE GRANADA, JAEN Y ALMERIA',
            despacho: 'GESTORIA JUSTO GUEVARA',
            domicilioDespacho: 'AVDA ALMANZORA, Nº6, LC2'
        };
        
        // COORDENADAS DEL MANDATO AJUSTADAS MANUALMENTE
        
        console.log('=== DATOS DEL MANDATO ===');
        console.log('Tipo cliente:', esPersonaJuridica ? 'JURÍDICA' : 'FÍSICA');
        console.log('Línea 1 (D./ña.):', nombreLinea1, '-', dniLinea1);
        if (esPersonaJuridica) {
            console.log('En representación de:', nombreEmpresa, '-', cifEmpresa);
        }
        console.log('Población:', cliente.municipio || cliente.localidad);
        console.log('Gestor:', gestor.nombre, '-', gestor.dni);
        console.log('Vehículo:', vehiculo.matricula, '- Bastidor:', vehiculo.bastidor);
        console.log('========================');
        
        // MANDANTE - Línea 1: Nombre (representante si es jurídica, o titular si es física)
        firstPage.drawText(nombreLinea1, {
            x: 85,
            y: height - 98,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // MANDANTE - Línea 1: DNI (del representante si es jurídica)
        firstPage.drawText(dniLinea1, {
            x: 421,
            y: height - 98,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // MANDANTE - Línea 2: Segundo representante (si existe)
        if (haySegundoRepresentante) {
            firstPage.drawText(nombreLinea2, {
                x: 93,
                y: height - 108,
                size: fontSize,
                font: font,
                color: rgb(0, 0, 0)
            });
            
            firstPage.drawText(dniLinea2, {
                x: 360,
                y: height - 108,
                size: fontSize,
                font: font,
                color: rgb(0, 0, 0)
            });
        }
        
        // Si es persona jurídica: añadir nombre empresa y CIF en la línea "en representación de"
        if (esPersonaJuridica) {
            // Nombre de la empresa (después de "en representación de")
            firstPage.drawText(nombreEmpresa, {
                x: 63,
                y: height - 130,
                size: fontSize,
                font: font,
                color: rgb(0, 0, 0)
            });
            
            // CIF de la empresa (después de "con DNI/CIF nº")
            firstPage.drawText(cifEmpresa, {
                x: 63,
                y: height - 141,
                size: fontSize,
                font: font,
                color: rgb(0, 0, 0)
            });
        }
        
        // MANDANTE - Población (ajustada una línea más abajo)
        const poblacion = toString(cliente.municipio || cliente.localidad || '');
        firstPage.drawText(poblacion, {
            x: 293,
            y: height - 141,
            size: fontSize - 1,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // MANDANTE - Calle (ajustada una línea más abajo)
        firstPage.drawText(domicilioSolo, {
            x: 63,
            y: height - 153,
            size: fontSize - 1,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // MANDANTE - Número (en la línea del nº ___ C.P. ___)
        if (cliente.numero) {
            firstPage.drawText(toString(cliente.numero), {
                x: 336,
                y: height - 153,
                size: fontSize - 1,
                font: font,
                color: rgb(0, 0, 0)
            });
        }
        
        // MANDANTE - Código Postal
        if (cliente.cp) {
            firstPage.drawText(toString(cliente.cp), {
                x: 330,
                y: height - 153,
                size: fontSize - 1,
                font: font,
                color: rgb(0, 0, 0)
            });
        }
        
        // MANDATARIO - Nombre gestor
        firstPage.drawText(gestor.nombre, {
            x: 195,
            y: height - 182,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // MANDATARIO - DNI gestor
        firstPage.drawText(gestor.dni, {
            x: 409,
            y: height - 183,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // MANDATARIO - Nº Colegiado
        firstPage.drawText(gestor.numColegiado, {
            x: 94,
            y: height - 193,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // ASUNTO - Texto dinámico según el tipo
        // Si es CANJE, la matrícula ya viene con el texto completo
        const esTransferencia = tipo === 'VENDEDOR' || tipo === 'COMPRADOR';
        const textoAsunto = esTransferencia ? 'TRANSFERENCIA' : (vehiculo.matricula.startsWith('CANJE') ? '' : tipo);
        
        if (textoAsunto) {
            firstPage.drawText(textoAsunto, {
                x: 76,
                y: height - 280,
                size: fontSize,
                font: font,
                color: rgb(0, 0, 0)
            });
        }
        
        // ASUNTO - Matrícula del vehículo (o descripción del trámite para canjes)
        const xMatricula = textoAsunto ? 178 : 76;
        firstPage.drawText(vehiculo.matricula || "N/A", {
            x: xMatricula,
            y: height - 280,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // ASUNTO - Nº Bastidor (o Nº Permiso para canjes)
        const textoBastidor = vehiculo.matricula && vehiculo.matricula.startsWith('CANJE') 
            ? `Nº Permiso: ${vehiculo.bastidor || "N/A"}`
            : `Bastidor: ${vehiculo.bastidor || "N/A"}`;
        firstPage.drawText(textoBastidor, {
            x: 73,
            y: height - 299,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // FECHA MANDATARIO (abajo del todo) - Y=750 alineado
        // Lugar
        firstPage.drawText("Olula del Río", {
            x: 178,
            y: height - 750,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // Día
        firstPage.drawText(String(dia), {
            x: 265,
            y: height - 750,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // Mes
        firstPage.drawText(mes, {
            x: 302,
            y: height - 750,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // Año
        firstPage.drawText(String(año), {
            x: 378,
            y: height - 750,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // FECHA MANDANTE (antes de EL MANDANTE) - Y=647 alineado
        
        // Lugar mandante
        firstPage.drawText("Olula del Río", {
            x: 177,
            y: height - 647,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // Día mandante
        firstPage.drawText(String(dia), {
            x: 269,
            y: height - 647,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // Mes mandante
        firstPage.drawText(mes, {
            x: 302,
            y: height - 647,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // Año mandante
        firstPage.drawText(String(año), {
            x: 375,
            y: height - 647,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // Guardar PDF
        const pdfBytesModified = await pdfDoc.save();
        
        const blob = new Blob([pdfBytesModified], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Mandato_${tipo}_${expediente.numero}_${cliente.nif}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        mostrarAlerta(`✅ Mandato del ${tipo} generado y descargado`, 'success');
        
    } catch (error) {
        console.error('Error al generar mandato:', error);
        mostrarAlerta('❌ Error al generar el mandato: ' + error.message, 'error');
    }
}

// Función auxiliar para construir dirección completa
function construirDireccionCompleta(persona) {
    let direccion = '';
    
    if (persona.municipio) direccion += persona.municipio;
    if (persona.tipoVia && persona.nombreVia) {
        direccion += `, ${persona.tipoVia} ${persona.nombreVia}`;
    }
    if (persona.numero) direccion += ` nº ${persona.numero}`;
    
    return direccion || 'Domicilio no especificado';
}

// Función auxiliar para mostrar instrucciones sobre el nombre del PDF
function mostrarInstruccionesPDF() {
    const mensaje = `
📁 INSTRUCCIONES PARA EL PDF:

Por favor, coloca el archivo PDF del contrato en la misma carpeta que index.html

Puedes renombrarlo a cualquiera de estos nombres:
✅ contrato.pdf (RECOMENDADO - más simple)
✅ contrato-tipo-compra-venta-vehiculos__1_.pdf
✅ contrato tipo compra venta vehiculos 1.pdf

Estructura correcta:
📁 tu-carpeta/
├── index.html
├── app.js  
├── pdf-generator.js
└── contrato.pdf ← El PDF aquí

Después de colocarlo, recarga la página (F5) e intenta de nuevo.
    `;
    
    alert(mensaje);
}

// Generar PDF de Contrato de Compraventa
async function generarPDFTransferencia(expediente, vehiculo) {
    try {
        mostrarAlerta('Generando contrato de compraventa...', 'success');
        
        // Obtener datos del vendedor y comprador
        const vendedor = clientes.find(c => c.id == expediente.vendedor);
        const comprador = clientes.find(c => c.id == expediente.comprador);
        
        if (!vendedor || !comprador) {
            mostrarAlerta('Error: No se encontraron los datos del vendedor o comprador', 'error');
            return;
        }
        
        // Cargar el PDF original - buscar en la carpeta actual
        let pdfBytes;
        const nombresPosibles = [
            'contrato.pdf',
            'contrato-tipo-compra-venta-vehiculos__1_.pdf',
            'contrato tipo compra venta vehiculos 1.pdf',
            'contratotipocompraventavehiculos1.pdf',
            'contrato_compraventa.pdf',
            'Contrato de Compraventa.pdf'
        ];
        
        let pdfEncontrado = false;
        let nombreUsado = '';
        
        for (const nombrePDF of nombresPosibles) {
            try {
                console.log('🔍 Buscando PDF:', nombrePDF);
                // Buscar solo con el nombre del archivo, sin rutas
                const response = await fetch(nombrePDF);
                if (response.ok) {
                    pdfBytes = await response.arrayBuffer();
                    pdfEncontrado = true;
                    nombreUsado = nombrePDF;
                    console.log('✅ PDF encontrado:', nombrePDF);
                    console.log('📊 Tamaño del PDF:', pdfBytes.byteLength, 'bytes');
                    break;
                }
            } catch (error) {
                console.log('❌ No encontrado:', nombrePDF);
                // Continuar con el siguiente nombre
                continue;
            }
        }
        
        if (!pdfEncontrado) {
            console.error('❌ No se encontró el PDF con ninguno de los nombres esperados');
            console.log('📝 Nombres intentados:', nombresPosibles);
            mostrarAlerta('❌ No se encuentra el PDF del contrato', 'error');
            
            // Mostrar mensaje más detallado
            const mensaje = `
No se pudo cargar el archivo PDF.

Verifica que:
1. El archivo "contrato.pdf" esté en la MISMA carpeta que index.html
2. El servidor Python esté corriendo (python -m http.server 8000)
3. Hayas recargado la página (Ctrl+F5)

Archivos buscados:
${nombresPosibles.map(n => '- ' + n).join('\n')}
            `;
            alert(mensaje);
            return;
        }
        
        console.log('✨ Iniciando procesamiento del PDF...');
        
        // Cargar con pdf-lib
        if (typeof PDFLib === 'undefined') {
            mostrarAlerta('❌ Error: La librería pdf-lib no se cargó correctamente. Verifica tu conexión a internet.', 'error');
            return;
        }
        
        const { PDFDocument, rgb } = PDFLib;
        const pdfDoc = await PDFDocument.load(pdfBytes);
        
        // Obtener la primera página
        const pages = pdfDoc.getPages();
        const firstPage = pages[0];
        
        // Preparar los datos
        const fecha = expediente.fechaOperacion ? new Date(expediente.fechaOperacion) : new Date();
        const dia = fecha.getDate();
        const mes = fecha.toLocaleDateString('es-ES', { month: 'long' });
        const año = fecha.getFullYear();
        const hora = expediente.hora || '';
        
        const nombreVendedor = `${vendedor.nombre} ${vendedor.apellido1 || ''} ${vendedor.apellido2 || ''}`.trim();
        const nombreComprador = `${comprador.nombre} ${comprador.apellido1 || ''} ${comprador.apellido2 || ''}`.trim();
        
        // Construir direcciones de forma más limpia - solo calle con número
        const calleVendedor = construirCalleSimple(vendedor);
        const calleComprador = construirCalleSimple(comprador);
        
        // Municipio del vendedor
        const municipioVendedor = vendedor.municipio || vendedor.localidad || '';
        const municipioComprador = comprador.municipio || comprador.localidad || '';
        
        console.log('=== DATOS A RELLENAR ===');
        console.log('Vendedor:', nombreVendedor, '-', vendedor.nif);
        console.log('Municipio vendedor:', municipioVendedor);
        console.log('Calle vendedor:', calleVendedor);
        console.log('Comprador:', nombreComprador, '-', comprador.nif);
        console.log('Municipio comprador:', municipioComprador);
        console.log('Calle comprador:', calleComprador);
        console.log('Vehículo:', vehiculo.marca, vehiculo.matricula);
        console.log('Precio:', expediente.precio);
        console.log('========================');
        
        // Configurar fuente
        const fontSize = 9;
        const font = await pdfDoc.embedFont('Helvetica');
        
        // Obtener dimensiones de la página
        const { width, height } = firstPage.getSize();
        
        console.log('PDF cargado correctamente. Dimensiones:', width, 'x', height);
        
        // COORDENADAS AJUSTADAS MANUALMENTE
        
        // Lugar
        firstPage.drawText(expediente.lugar || "Granada", {
            x: 70,
            y: height - 89,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // Día
        firstPage.drawText(String(dia), {
            x: 161,
            y: height - 88,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // Mes
        firstPage.drawText(mes, {
            x: 209,
            y: height - 87,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // Año
        firstPage.drawText(String(año).substring(2), {
            x: 302,
            y: height - 89,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // Hora
        firstPage.drawText(hora, {
            x: 412,
            y: height - 88,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // Vendedor - Nombre
        firstPage.drawText(nombreVendedor, {
            x: 71,
            y: height - 128,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // Vendedor - NIF
        firstPage.drawText(vendedor.nif, {
            x: 420,
            y: height - 127,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // Vendedor - Calle (va primero que municipio en el formulario)
        firstPage.drawText(calleVendedor, {
            x: 117,
            y: height - 143,
            size: fontSize - 1,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // Vendedor - Municipio
        firstPage.drawText(municipioVendedor, {
            x: 285,
            y: height - 144,
            size: fontSize - 1,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // Comprador - Nombre
        firstPage.drawText(nombreComprador, {
            x: 68,
            y: height - 184,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // Comprador - NIF
        firstPage.drawText(comprador.nif, {
            x: 413,
            y: height - 184,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // Comprador - Calle
        firstPage.drawText(calleComprador, {
            x: 118,
            y: height - 199,
            size: fontSize - 1,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // Comprador - Municipio
        firstPage.drawText(municipioComprador, {
            x: 296,
            y: height - 200,
            size: fontSize - 1,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // Vehículo - Marca
        firstPage.drawText(vehiculo.marca || "", {
            x: 91,
            y: height - 244,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // Vehículo - Matrícula
        firstPage.drawText(vehiculo.matricula || "", {
            x: 108,
            y: height - 262,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // Vehículo - Bastidor
        firstPage.drawText(vehiculo.bastidor || "", {
            x: 134,
            y: height - 279,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // Vehículo - Kilómetros
        firstPage.drawText(vehiculo.kilometros ? String(vehiculo.kilometros) : "", {
            x: 117,
            y: height - 295,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // Precio
        const precio = expediente.precio || '0';
        firstPage.drawText(String(precio), {
            x: 116,
            y: height - 387,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // Seguro - Fecha
        if (vehiculo.seguroHasta) {
            const fechaSeguro = new Date(vehiculo.seguroHasta);
            const diaSeguro = String(fechaSeguro.getDate()).padStart(2, '0');
            const mesSeguro = String(fechaSeguro.getMonth() + 1).padStart(2, '0');
            const añoSeguro = fechaSeguro.getFullYear();
            const fechaSeguroStr = `${diaSeguro}/${mesSeguro}/${añoSeguro}`;
            
            firstPage.drawText(fechaSeguroStr, {
                x: 353,
                y: height - 593,
                size: fontSize,
                font: font,
                color: rgb(0, 0, 0)
            });
        }
        
        console.log('Todos los campos rellenados correctamente');
        
        // Guardar el PDF modificado
        const pdfBytesModified = await pdfDoc.save();
        
        console.log('PDF guardado. Tamaño:', pdfBytesModified.length, 'bytes');
        
        // Descargar el archivo
        const blob = new Blob([pdfBytesModified], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Contrato_Compraventa_${expediente.numero}_${vehiculo.matricula}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        console.log('PDF descargado exitosamente');
        mostrarAlerta('✅ Contrato de compraventa generado y descargado', 'success');
        
    } catch (error) {
        console.error('Error completo al generar PDF:', error);
        console.error('Stack trace:', error.stack);
        mostrarAlerta('❌ Error al generar el PDF: ' + error.message, 'error');
        
        // Mostrar información adicional de debug
        console.log('Datos del expediente:', expediente);
        console.log('Datos del vehículo:', vehiculo);
    }
}

// Generar MOD-02 (Formulario DGT)
async function generarMOD02(expediente, vehiculo) {
    try {
        mostrarAlerta('Generando MOD-02...', 'success');
        
        // Cargar el PDF del MOD-02
        const pdfBytes = await fetch('/mnt/user-data/uploads/Mod_02-ES.pdf')
            .then(res => res.arrayBuffer());
        
        const { PDFDocument, rgb } = window.PDFLib;
        const pdfDoc = await PDFDocument.load(pdfBytes);
        
        const form = pdfDoc.getForm();
        const fields = form.getFields();
        
        // Listar todos los campos disponibles (para debug)
        console.log('Campos disponibles en MOD-02:');
        fields.forEach(field => {
            const name = field.getName();
            const type = field.constructor.name;
            console.log(`${name} - ${type}`);
        });
        
        // Intentar rellenar campos si existen
        try {
            // Datos del vehículo
            const matriculaField = form.getTextField('Matrícula');
            if (matriculaField) matriculaField.setText(vehiculo.matricula);
        } catch (e) {
            console.log('No se pudo rellenar algún campo:', e.message);
        }
        
        // Guardar el PDF
        const pdfBytesModified = await pdfDoc.save();
        
        const blob = new Blob([pdfBytesModified], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `MOD-02_${expediente.numero}_${vehiculo.matricula}.pdf`;
        link.click();
        
        mostrarAlerta('✅ MOD-02 generado', 'success');
        
    } catch (error) {
        console.error('Error al generar MOD-02:', error);
        mostrarAlerta('Error al generar MOD-02: ' + error.message, 'error');
    }
}

// Función auxiliar para construir dirección completa
function construirDireccion(persona) {
    let direccion = '';
    
    if (persona.municipio) direccion += persona.municipio;
    if (persona.tipoVia) direccion += `, ${persona.tipoVia}`;
    if (persona.nombreVia) direccion += ` ${persona.nombreVia}`;
    if (persona.numero) direccion += ` nº ${persona.numero}`;
    if (persona.portal) direccion += `, Portal ${persona.portal}`;
    if (persona.escalera) direccion += `, Esc. ${persona.escalera}`;
    if (persona.planta) direccion += `, ${persona.planta}º`;
    if (persona.puerta) direccion += ` ${persona.puerta}`;
    
    return direccion || 'Domicilio no especificado';
}

// Función auxiliar para construir solo la calle (sin municipio)
function construirCalleSimple(persona) {
    let calle = '';
    
    if (persona.tipoVia) calle += persona.tipoVia;
    if (persona.nombreVia) calle += ` ${persona.nombreVia}`;
    if (persona.numero) calle += ` nº ${persona.numero}`;
    
    return calle.trim();
}

// ==================== GENERACIÓN DE DECLARACIÓN DE BAJA ====================

async function generarDeclaracionBaja(expediente, vehiculo) {
    try {
        console.log('Iniciando generación de Declaración de Baja...');
        
        // Obtener el titular
        const titular = clientes.find(c => c.id == expediente.titular);
        if (!titular) {
            mostrarAlerta('No se encontró el titular', 'error');
            return;
        }
        
        // Buscar el PDF de la declaración de baja
        const posiblesNombres = [
            'declaracion-baja.pdf',
            'DECLARACION-VEHICULO-NO-EXISTE.pdf',
            'declaracion_baja.pdf',
            'baja.pdf'
        ];
        
        let pdfBytes = null;
        let nombreEncontrado = '';
        
        for (const nombre of posiblesNombres) {
            try {
                console.log(`Intentando cargar: ${nombre}`);
                const response = await fetch(nombre);
                if (response.ok) {
                    pdfBytes = await response.arrayBuffer();
                    nombreEncontrado = nombre;
                    console.log(`✓ PDF encontrado: ${nombre}`);
                    break;
                }
            } catch (error) {
                console.log(`✗ No se encontró: ${nombre}`);
            }
        }
        
        if (!pdfBytes) {
            mostrarAlerta('No se encontró el PDF de declaración de baja. Asegúrate de tener el archivo "declaracion-baja.pdf" en la misma carpeta.', 'error');
            return;
        }
        
        // Cargar el PDF con pdf-lib
        const pdfDoc = await PDFLib.PDFDocument.load(pdfBytes);
        const pages = pdfDoc.getPages();
        const firstPage = pages[0];
        const { height } = firstPage.getSize();
        
        const fontSize = 10;
        const font = await pdfDoc.embedFont('Helvetica');
        
        // Preparar datos
        const nombreCompleto = `${titular.nombre} ${titular.apellido1 || ''} ${titular.apellido2 || ''}`.trim();
        const domicilio = titular.municipio || titular.localidad || '';
        const calle = construirCalleSimple(titular);
        
        // Preparar fecha
        const fechaActual = new Date();
        const dia = fechaActual.getDate();
        const mes = fechaActual.toLocaleDateString('es-ES', { month: 'long' });
        const año = fechaActual.getFullYear();
        
        console.log('=== DATOS DE LA DECLARACIÓN ===');
        console.log('Titular:', nombreCompleto, '-', titular.nif);
        console.log('Domicilio:', domicilio);
        console.log('Calle:', calle);
        console.log('Vehículo:', vehiculo.matricula, '-', vehiculo.bastidor);
        console.log('==============================');
        
        // COORDENADAS DECLARACIÓN BAJA AJUSTADAS MANUALMENTE
        
        // 👤 Nombre del declarante
        firstPage.drawText(nombreCompleto, {
            x: 120,
            y: height - 255,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // 👤 DNI del declarante
        firstPage.drawText(titular.nif, {
            x: 131,
            y: height - 281,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // 👤 Domicilio
        firstPage.drawText(domicilio, {
            x: 291,
            y: height - 281,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // 👤 Calle/Plaza
        firstPage.drawText(calle, {
            x: 91,
            y: height - 294,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // 🚗 Matrícula
        firstPage.drawText(vehiculo.matricula, {
            x: 93,
            y: height - 532,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // 🚗 Número de bastidor
        firstPage.drawText(vehiculo.bastidor || "N/A", {
            x: 312,
            y: height - 529,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // 📅 Lugar
        firstPage.drawText("Olula del Río", {
            x: 132,
            y: height - 627,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // 📅 Día
        firstPage.drawText(String(dia), {
            x: 183,
            y: height - 634,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // 📅 Mes
        firstPage.drawText(mes, {
            x: 222,
            y: height - 632,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // 📅 Año
        firstPage.drawText(String(año), {
            x: 325,
            y: height - 633,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // Guardar el PDF
        const pdfBytesModificado = await pdfDoc.save();
        
        // Descargar
        const blob = new Blob([pdfBytesModificado], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Declaracion-Baja_${expediente.numero}_${vehiculo.matricula}.pdf`;
        link.click();
        
        mostrarAlerta('✓ Declaración de baja generada correctamente', 'success');
        
    } catch (error) {
        console.error('Error generando declaración de baja:', error);
        mostrarAlerta('Error al generar la declaración: ' + error.message, 'error');
    }
}

// ==================== GENERACIÓN DE MANDATO PARA BAJA ====================

async function generarMandatoBaja(expediente, vehiculo, titular) {
    try {
        console.log('Iniciando generación de Mandato para Baja...');
        
        // Buscar el PDF del mandato
        const posiblesNombres = [
            'mandato.pdf',
            'MANDATO_PROFESIONAL_ESPECIFICO_ABRIL_2019.pdf',
            'mandato_profesional.pdf'
        ];
        
        let pdfBytes = null;
        let nombreEncontrado = '';
        
        for (const nombre of posiblesNombres) {
            try {
                console.log(`Intentando cargar: ${nombre}`);
                const response = await fetch(nombre);
                if (response.ok) {
                    pdfBytes = await response.arrayBuffer();
                    nombreEncontrado = nombre;
                    console.log(`✓ PDF encontrado: ${nombre}`);
                    break;
                }
            } catch (error) {
                console.log(`✗ No se encontró: ${nombre}`);
            }
        }
        
        if (!pdfBytes) {
            mostrarAlerta('No se encontró el PDF del mandato. Asegúrate de tener el archivo "mandato.pdf" en la misma carpeta.', 'error');
            return;
        }
        
        // Cargar el PDF
        const pdfDoc = await PDFLib.PDFDocument.load(pdfBytes);
        const pages = pdfDoc.getPages();
        const firstPage = pages[0];
        const { height } = firstPage.getSize();
        
        const fontSize = 9;
        const font = await pdfDoc.embedFont('Helvetica');
        
        // Preparar datos del mandante (titular)
        const nombreCompleto = `${titular.nombre} ${titular.apellido1 || ''} ${titular.apellido2 || ''}`.trim();
        
        // Construir solo la calle (sin municipio)
        let domicilioSolo = '';
        if (titular.tipoVia && titular.nombreVia) {
            domicilioSolo = `${titular.tipoVia} ${titular.nombreVia}`;
        }
        if (titular.numero) domicilioSolo += ` nº ${titular.numero}`;
        
        // Preparar fecha actual
        const fechaActual = new Date();
        const dia = fechaActual.getDate();
        const mes = fechaActual.toLocaleDateString('es-ES', { month: 'long' });
        const año = fechaActual.getFullYear();
        
        // Datos del gestor
        const gestor = {
            nombre: 'FRANCISCO JOSE JUSTO GUEVARA',
            dni: '27525993F',
            numColegiado: '493',
            colegio: 'COLEGIO OFICIAL DE GESTORES ADMINISTRATIVOS DE GRANADA, JAEN Y ALMERIA',
            despacho: 'GESTORIA JUSTO GUEVARA',
            domicilioDespacho: 'AVDA ALMANZORA, Nº6, LC2'
        };
        
        console.log('=== DATOS DEL MANDATO DE BAJA ===');
        console.log('Mandante:', nombreCompleto, '-', titular.nif);
        console.log('Población:', titular.municipio || titular.localidad);
        console.log('Gestor:', gestor.nombre, '-', gestor.dni);
        console.log('Vehículo:', vehiculo.matricula, '- Bastidor:', vehiculo.bastidor);
        console.log('================================');
        
        // COORDENADAS DEL MANDATO (las mismas que usamos para transferencia)
        
        // MANDANTE - Nombre completo
        firstPage.drawText(nombreCompleto, {
            x: 85,
            y: height - 98,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // MANDANTE - DNI/NIF
        firstPage.drawText(titular.nif, {
            x: 421,
            y: height - 98,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // MANDANTE - Población
        const poblacion = titular.municipio || titular.localidad || '';
        firstPage.drawText(poblacion, {
            x: 293,
            y: height - 130,
            size: fontSize - 1,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // MANDANTE - Calle
        firstPage.drawText(domicilioSolo, {
            x: 63,
            y: height - 143,
            size: fontSize - 1,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // MANDATARIO - Nombre gestor
        firstPage.drawText(gestor.nombre, {
            x: 195,
            y: height - 182,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // MANDATARIO - DNI gestor
        firstPage.drawText(gestor.dni, {
            x: 409,
            y: height - 183,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // MANDATARIO - Nº Colegiado
        firstPage.drawText(gestor.numColegiado, {
            x: 94,
            y: height - 193,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // ASUNTO - Texto (BAJA DEFINITIVA)
        firstPage.drawText("BAJA DEFINITIVA", {
            x: 76,
            y: height - 280,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // ASUNTO - Matrícula
        firstPage.drawText(vehiculo.matricula || "N/A", {
            x: 178,
            y: height - 280,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // ASUNTO - Bastidor
        const textoBastidor = `Bastidor: ${vehiculo.bastidor || "N/A"}`;
        firstPage.drawText(textoBastidor, {
            x: 73,
            y: height - 299,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // Lugar (primera fecha - mandatario)
        firstPage.drawText("Olula del Río", {
            x: 183,
            y: height - 645,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // Día
        firstPage.drawText(String(dia), {
            x: 271,
            y: height - 647,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // Mes
        firstPage.drawText(mes, {
            x: 298,
            y: height - 645,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // Año
        firstPage.drawText(String(año), {
            x: 371,
            y: height - 646,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // FECHA Y LUGAR EN LA ÚLTIMA LÍNEA (donde firma EL MANDANTE)
        
        // Lugar (última línea)
        firstPage.drawText("Olula del Río", {
            x: 185,
            y: height - 517,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // Día (última línea)
        firstPage.drawText(String(dia), {
            x: 280,
            y: height - 517,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // Mes (última línea)
        firstPage.drawText(mes, {
            x: 315,
            y: height - 517,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // Año (última línea)
        firstPage.drawText(String(año), {
            x: 385,
            y: height - 517,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // Guardar el PDF
        const pdfBytesModificado = await pdfDoc.save();
        
        // Descargar
        const blob = new Blob([pdfBytesModificado], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Mandato_BAJA_${expediente.numero}_${titular.nif}.pdf`;
        link.click();
        
        mostrarAlerta('✓ Mandato de baja generado correctamente', 'success');
        
        // Si es persona jurídica, generar también el documento de representación
        if (titular.tipoCliente === 'juridica') {
            setTimeout(async () => {
                await generarDocumentoRepresentacion(titular, 'BAJA', vehiculo);
            }, 500);
        }
        
    } catch (error) {
        console.error('Error generando mandato de baja:', error);
        mostrarAlerta('Error al generar el mandato: ' + error.message, 'error');
    }
}

// ==================== GENERACIÓN DE PDFs PARA CANJES ====================

// Función principal para generar PDFs de canje con menú de opciones
async function generarPDFsCanje(canje) {
    // Buscar cliente (puede estar en titular, clienteId o comprador)
    const cliente = clientes.find(c => c.id == canje.titular || c.id == canje.clienteId || c.id == canje.comprador);
    if (!cliente) {
        mostrarAlerta('No se encontró el cliente del canje', 'error');
        return;
    }
    
    // Convertir a clienteId para compatibilidad
    if (!canje.clienteId) {
        canje.clienteId = canje.titular || canje.comprador;
    }
    
    const opcion = prompt(
        '¿Qué documento deseas generar?\n\n' +
        '1 - MOD-03 (Trámites de Conductores)\n' +
        '2 - Mandato para Canje\n' +
        '3 - Justificante Profesional\n' +
        '4 - Todos los documentos\n\n' +
        'Escribe el número:'
    );
    
    if (opcion === '1') {
        await generarMOD03Canje(canje);
    } else if (opcion === '2') {
        await generarMandatoCanje(canje);
    } else if (opcion === '3') {
        await generarJustificanteProfesionalCanje(canje);
    } else if (opcion === '4') {
        await generarMOD03Canje(canje);
        setTimeout(async () => await generarMandatoCanje(canje), 500);
        setTimeout(async () => await generarJustificanteProfesionalCanje(canje), 1000);
    } else if (opcion) {
        mostrarAlerta('Opción no válida', 'error');
    }
}

// Generar MOD-03 (Trámites de Conductores) para Canje
async function generarMOD03Canje(canje) {
    try {
        mostrarAlerta('Generando MOD-03 para canje...', 'success');
        
        const cliente = clientes.find(c => c.id == canje.clienteId || c.id == canje.titular || c.id == canje.comprador);
        if (!cliente) {
            mostrarAlerta('No se encontró el cliente', 'error');
            return;
        }
        
        // Buscar el PDF del MOD-03
        const posiblesNombres = [
            'CONDUCTORES.pdf',
            'conductores.pdf',
            'MOD-03.pdf',
            'mod-03.pdf',
            'tramites-conductores.pdf'
        ];
        
        let pdfBytes = null;
        
        for (const nombre of posiblesNombres) {
            try {
                const response = await fetch(nombre);
                if (response.ok) {
                    pdfBytes = await response.arrayBuffer();
                    console.log('✓ PDF MOD-03 encontrado:', nombre);
                    break;
                }
            } catch (error) {
                continue;
            }
        }
        
        if (!pdfBytes) {
            mostrarAlerta('No se encontró el PDF CONDUCTORES.pdf. Colócalo en la misma carpeta.', 'error');
            return;
        }
        
        const { PDFDocument, rgb } = PDFLib;
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const pages = pdfDoc.getPages();
        const firstPage = pages[0];
        const { width, height } = firstPage.getSize();
        
        const fontSize = 9;
        const font = await pdfDoc.embedFont('Helvetica');
        
        // Función auxiliar para asegurar que un valor sea string
        const toString = (val) => (val === null || val === undefined) ? '' : String(val);
        
        // Formatear fecha de nacimiento
        let fechaNacFormateada = '';
        if (cliente.fechaNacimiento) {
            const fn = new Date(cliente.fechaNacimiento);
            fechaNacFormateada = `${String(fn.getDate()).padStart(2, '0')}/${String(fn.getMonth() + 1).padStart(2, '0')}/${fn.getFullYear()}`;
        }
        
        const fechaActual = new Date();
        const dia = fechaActual.getDate();
        const mes = fechaActual.toLocaleDateString('es-ES', { month: 'long' });
        const año = fechaActual.getFullYear();
        
        // País del permiso
        const paisPermiso = (canje.pais || canje.paisOrigen || '').toUpperCase();
        
        // =====================================================
        // COORDENADAS MOD-03 CANJE - Ajustadas con herramienta visual
        // =====================================================
        
        const COORDS = {
            // DATOS DEL INTERESADO
            dni: { x: 40, y: 119 },
            fechaNac: { x: 130, y: 119 },
            paisNac: { x: 260, y: 119 },
            nacionalidad: { x: 445, y: 119 },
            nombre: { x: 40, y: 147 },
            apellido1: { x: 212, y: 147 },
            apellido2: { x: 400, y: 147 },
            telefono: { x: 340, y: 175 },
            // DOMICILIO
            tipoVia: { x: 40, y: 228 },
            nombreVia: { x: 122, y: 228 },
            numero: { x: 530, y: 228 },
            cp: { x: 40, y: 284 },
            provincia: { x: 122, y: 284 },
            municipio: { x: 305, y: 284 },
            localidad: { x: 460, y: 284 },
            // CHECKBOXES
            xCanje: { x: 32, y: 408 },
            xOtros: { x: 173, y: 435 },
            // DATOS PERMISO
            clasePermiso: { x: 40, y: 484 },
            numPermiso: { x: 105, y: 484 },
            paisPermiso: { x: 218, y: 484 },
            fechaExp: { x: 425, y: 484 },
            fechaCad: { x: 525, y: 484 },
            // FECHA FINAL
            lugar: { x: 160, y: 708 },
            dia: { x: 252, y: 708 },
            mes: { x: 295, y: 708 },
            anio: { x: 380, y: 708 }
        };
        
        // DATOS DEL INTERESADO
        firstPage.drawText(toString(cliente.nif), {
            x: COORDS.dni.x,
            y: height - COORDS.dni.y,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        firstPage.drawText(fechaNacFormateada, {
            x: COORDS.fechaNac.x,
            y: height - COORDS.fechaNac.y,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        firstPage.drawText(paisPermiso, {
            x: COORDS.paisNac.x,
            y: height - COORDS.paisNac.y,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        firstPage.drawText(paisPermiso, {
            x: COORDS.nacionalidad.x,
            y: height - COORDS.nacionalidad.y,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        firstPage.drawText(toString(cliente.nombre), {
            x: COORDS.nombre.x,
            y: height - COORDS.nombre.y,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        firstPage.drawText(toString(cliente.apellido1), {
            x: COORDS.apellido1.x,
            y: height - COORDS.apellido1.y,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        firstPage.drawText(toString(cliente.apellido2), {
            x: COORDS.apellido2.x,
            y: height - COORDS.apellido2.y,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        firstPage.drawText(toString(cliente.telefono), {
            x: COORDS.telefono.x,
            y: height - COORDS.telefono.y,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // DOMICILIO DEL TITULAR
        firstPage.drawText(toString(cliente.tipoVia), {
            x: COORDS.tipoVia.x,
            y: height - COORDS.tipoVia.y,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        firstPage.drawText(toString(cliente.nombreVia), {
            x: COORDS.nombreVia.x,
            y: height - COORDS.nombreVia.y,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        firstPage.drawText(toString(cliente.numero), {
            x: COORDS.numero.x,
            y: height - COORDS.numero.y,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        firstPage.drawText(toString(cliente.cp), {
            x: COORDS.cp.x,
            y: height - COORDS.cp.y,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        firstPage.drawText(toString(cliente.codigoProvincia) || 'AL', {
            x: COORDS.provincia.x,
            y: height - COORDS.provincia.y,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        const municipio = toString(cliente.localidad);
        firstPage.drawText(municipio, {
            x: COORDS.municipio.x,
            y: height - COORDS.municipio.y,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        firstPage.drawText(municipio, {
            x: COORDS.localidad.x,
            y: height - COORDS.localidad.y,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // =====================================================
        // SECCIÓN DE TRÁMITES - CANJE
        // =====================================================
        
        // Checkbox CANJE
        firstPage.drawText('X', {
            x: COORDS.xCanje.x,
            y: height - COORDS.xCanje.y,
            size: 11,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // Marcar origen según tipo
        if (canje.origen === 'ue') {
            firstPage.drawText('X', { x: 32, y: height - 435, size: 11, font: font, color: rgb(0, 0, 0) });
        } else if (canje.origen === 'otros') {
            firstPage.drawText('X', { x: COORDS.xOtros.x, y: height - COORDS.xOtros.y, size: 11, font: font, color: rgb(0, 0, 0) });
        } else if (canje.origen === 'militar') {
            firstPage.drawText('X', { x: 305, y: height - 435, size: 11, font: font, color: rgb(0, 0, 0) });
        } else if (canje.origen === 'policia') {
            firstPage.drawText('X', { x: 439, y: height - 435, size: 11, font: font, color: rgb(0, 0, 0) });
        }
        
        // DATOS DEL PERMISO DE CONDUCCIÓN
        firstPage.drawText(toString(canje.clasePermiso), {
            x: COORDS.clasePermiso.x,
            y: height - COORDS.clasePermiso.y,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        firstPage.drawText(toString(canje.numeroPermiso), {
            x: COORDS.numPermiso.x,
            y: height - COORDS.numPermiso.y,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        firstPage.drawText(paisPermiso, {
            x: COORDS.paisPermiso.x,
            y: height - COORDS.paisPermiso.y,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        if (canje.fechaExpedicion) {
            const fe = new Date(canje.fechaExpedicion);
            const fechaExpStr = `${String(fe.getDate()).padStart(2, '0')}/${String(fe.getMonth() + 1).padStart(2, '0')}/${fe.getFullYear()}`;
            firstPage.drawText(fechaExpStr, {
                x: COORDS.fechaExp.x,
                y: height - COORDS.fechaExp.y,
                size: fontSize,
                font: font,
                color: rgb(0, 0, 0)
            });
        }
        
        if (canje.fechaCaducidad) {
            const fc = new Date(canje.fechaCaducidad);
            const fechaCadStr = `${String(fc.getDate()).padStart(2, '0')}/${String(fc.getMonth() + 1).padStart(2, '0')}/${fc.getFullYear()}`;
            firstPage.drawText(fechaCadStr, {
                x: COORDS.fechaCad.x,
                y: height - COORDS.fechaCad.y,
                size: fontSize,
                font: font,
                color: rgb(0, 0, 0)
            });
        }
        
        // =====================================================
        // FECHA Y LUGAR FINAL
        // =====================================================
        firstPage.drawText('Almería', {
            x: COORDS.lugar.x,
            y: height - COORDS.lugar.y,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        firstPage.drawText(String(dia), {
            x: COORDS.dia.x,
            y: height - COORDS.dia.y,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        firstPage.drawText(mes, {
            x: COORDS.mes.x,
            y: height - COORDS.mes.y,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        firstPage.drawText(String(año), {
            x: COORDS.anio.x,
            y: height - COORDS.anio.y,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // Guardar PDF
        const pdfBytesModificado = await pdfDoc.save();
        
        const blob = new Blob([pdfBytesModificado], { type: 'application/pdf' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `MOD03_CANJE_${canje.numero}_${cliente.nif}.pdf`;
        link.click();
        
        mostrarAlerta('✓ MOD-03 generado correctamente', 'success');
        
    } catch (error) {
        console.error('Error generando MOD-03:', error);
        mostrarAlerta('Error al generar MOD-03: ' + error.message, 'error');
    }
}
// Generar Declaración para Canjes
async function generarDeclaracionCanje(canje) {
    try {
        mostrarAlerta('Generando Declaración para Canje...', 'success');
        
        const cliente = clientes.find(c => c.id == canje.clienteId || c.id == canje.titular || c.id == canje.comprador);
        if (!cliente) {
            mostrarAlerta('No se encontró el cliente', 'error');
            return;
        }
        
        const nombreCompleto = `${cliente.nombre || ''} ${cliente.apellido1 || ''} ${cliente.apellido2 || ''}`.trim().toUpperCase();
        
        const fechaActual = new Date();
        const dia = fechaActual.getDate();
        const mes = fechaActual.toLocaleDateString('es-ES', { month: 'long' });
        const año = fechaActual.getFullYear();
        
        // Crear PDF
        const { PDFDocument, rgb, StandardFonts } = PDFLib;
        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage([595, 842]); // A4
        
        const fontRegular = await pdfDoc.embedFont(StandardFonts.TimesRoman);
        const fontBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
        
        const { width, height } = page.getSize();
        const margenIzq = 70;
        const margenDer = 70;
        const anchoTexto = width - margenIzq - margenDer;
        
        let y = height - 100;
        
        // Título
        page.drawText('DECLARACIÓN RESPONSABLE', {
            x: width / 2 - 100,
            y: y,
            size: 14,
            font: fontBold,
            color: rgb(0, 0, 0)
        });
        
        y -= 50;
        
        // Nombre del declarante
        page.drawText(`D./Dña. ${nombreCompleto}`, {
            x: margenIzq,
            y: y,
            size: 12,
            font: fontBold,
            color: rgb(0, 0, 0)
        });
        
        y -= 25;
        
        // NIE/DNI
        page.drawText(`con NIE/DNI: ${cliente.nif || ''}`, {
            x: margenIzq,
            y: y,
            size: 12,
            font: fontRegular,
            color: rgb(0, 0, 0)
        });
        
        y -= 40;
        
        // DECLARA
        page.drawText('DECLARA QUE:', {
            x: margenIzq,
            y: y,
            size: 12,
            font: fontBold,
            color: rgb(0, 0, 0)
        });
        
        y -= 35;
        
        // Punto 1
        const punto1 = 'No se encuentra privado/a por resolución judicial del derecho a conducir vehículos a motor y ciclomotores, ni sometido/a a intervención o suspensión del que posea, ya se haya acordado en vía judicial o administrativa.';
        
        const lineas1 = dividirTextoEnLineas(punto1, fontRegular, 11, anchoTexto);
        page.drawText('1.', { x: margenIzq, y: y, size: 11, font: fontBold, color: rgb(0, 0, 0) });
        for (let i = 0; i < lineas1.length; i++) {
            page.drawText(lineas1[i], {
                x: margenIzq + 20,
                y: y - (i * 16),
                size: 11,
                font: fontRegular,
                color: rgb(0, 0, 0)
            });
        }
        
        y -= (lineas1.length * 16) + 25;
        
        // Punto 2
        const punto2 = 'No es titular de otro permiso o licencia de conducción, ya sea expedido en España o en otro país comunitario, de igual clase al solicitado.';
        
        const lineas2 = dividirTextoEnLineas(punto2, fontRegular, 11, anchoTexto);
        page.drawText('2.', { x: margenIzq, y: y, size: 11, font: fontBold, color: rgb(0, 0, 0) });
        for (let i = 0; i < lineas2.length; i++) {
            page.drawText(lineas2[i], {
                x: margenIzq + 20,
                y: y - (i * 16),
                size: 11,
                font: fontRegular,
                color: rgb(0, 0, 0)
            });
        }
        
        y -= (lineas2.length * 16) + 25;
        
        // Punto 3
        const punto3 = 'Se responsabiliza de la autenticidad, validez y vigencia del permiso de conducir extranjero que aporta para su canje.';
        
        const lineas3 = dividirTextoEnLineas(punto3, fontRegular, 11, anchoTexto);
        page.drawText('3.', { x: margenIzq, y: y, size: 11, font: fontBold, color: rgb(0, 0, 0) });
        for (let i = 0; i < lineas3.length; i++) {
            page.drawText(lineas3[i], {
                x: margenIzq + 20,
                y: y - (i * 16),
                size: 11,
                font: fontRegular,
                color: rgb(0, 0, 0)
            });
        }
        
        y -= (lineas3.length * 16) + 60;
        
        // Fecha y lugar
        page.drawText(`En Almería, a ${dia} de ${mes} de ${año}.`, {
            x: margenIzq,
            y: y,
            size: 11,
            font: fontRegular,
            color: rgb(0, 0, 0)
        });
        
        y -= 80;
        
        // Firma
        page.drawText('Firmado:', {
            x: margenIzq,
            y: y,
            size: 11,
            font: fontRegular,
            color: rgb(0, 0, 0)
        });
        
        y -= 50;
        
        page.drawText(nombreCompleto, {
            x: margenIzq,
            y: y,
            size: 11,
            font: fontBold,
            color: rgb(0, 0, 0)
        });
        
        // Descargar PDF
        const pdfBytes = await pdfDoc.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `Declaracion_CANJE_${canje.numero}_${cliente.nif}.pdf`;
        link.click();
        
        mostrarAlerta('✓ Declaración generada correctamente', 'success');
        
    } catch (error) {
        console.error('Error generando declaración:', error);
        mostrarAlerta('Error al generar la declaración: ' + error.message, 'error');
    }
}

// Función auxiliar para dividir texto en líneas
function dividirTextoEnLineas(texto, font, fontSize, anchoMax) {
    const palabras = texto.split(' ');
    const lineas = [];
    let lineaActual = '';
    
    for (const palabra of palabras) {
        const prueba = lineaActual ? lineaActual + ' ' + palabra : palabra;
        const anchoPrueba = font.widthOfTextAtSize(prueba, fontSize);
        if (anchoPrueba <= anchoMax) {
            lineaActual = prueba;
        } else {
            if (lineaActual) lineas.push(lineaActual);
            lineaActual = palabra;
        }
    }
    if (lineaActual) lineas.push(lineaActual);
    
    return lineas;
}

// Generar Mandato para Canje
async function generarMandatoCanje(canje) {
    try {
        const cliente = clientes.find(c => c.id == canje.clienteId || c.id == canje.titular || c.id == canje.comprador);
        if (!cliente) {
            mostrarAlerta('No se encontró el cliente', 'error');
            return;
        }
        
        // Crear objeto vehículo ficticio con datos del canje para reutilizar generarMandato
        const vehiculoFicticio = {
            matricula: `CANJE ${canje.clasePermiso || ''} - ${(canje.pais || canje.paisOrigen || '').toUpperCase()}`,
            bastidor: canje.numeroPermiso || 'N/A'
        };
        
        // Crear expediente ficticio
        const expedienteFicticio = {
            numero: canje.numero
        };
        
        // Llamar a la función generarMandato existente
        await generarMandato(cliente, 'CANJE', expedienteFicticio, vehiculoFicticio);
        
    } catch (error) {
        console.error('Error generando mandato de canje:', error);
        mostrarAlerta('Error al generar el mandato: ' + error.message, 'error');
    }
}

// Generar Justificante Profesional para Canjes
async function generarJustificanteProfesionalCanje(canje) {
    try {
        mostrarAlerta('Generando Justificante Profesional...', 'success');
        
        const cliente = clientes.find(c => c.id === canje.titular || c.id === canje.clienteId);
        if (!cliente) {
            mostrarAlerta('No se encontró el cliente del canje', 'error');
            return;
        }
        
        // Datos a rellenar
        const nombreCompleto = `${cliente.nombre || ''} ${cliente.apellido1 || ''} ${cliente.apellido2 || ''}`.trim().toUpperCase();
        const nieCliente = cliente.nif || '';
        const paisOrigen = (canje.pais || canje.paisOrigen || 'extranjero').toLowerCase();
        
        // Fecha actual
        const hoy = new Date();
        const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
        const fechaFormateada = `${hoy.getDate()} de ${meses[hoy.getMonth()]} de ${hoy.getFullYear()}`;
        
        const { PDFDocument, rgb, StandardFonts } = PDFLib;
        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage([595.32, 841.92]); // A4 exacto
        
        const fontRegular = await pdfDoc.embedFont(StandardFonts.TimesRoman);
        const fontBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
        
        const { width, height } = page.getSize();
        
        // Intentar cargar el logo (puede ser PNG o JPEG)
        let logoImage = null;
        try {
            // Intentar PNG primero
            let logoResponse = await fetch('logo_gestoria.png');
            if (logoResponse.ok) {
                const logoBytes = await logoResponse.arrayBuffer();
                logoImage = await pdfDoc.embedPng(logoBytes);
            } else {
                // Intentar JPEG
                logoResponse = await fetch('logo_gestoria.jpeg');
                if (logoResponse.ok) {
                    const logoBytes = await logoResponse.arrayBuffer();
                    logoImage = await pdfDoc.embedJpg(logoBytes);
                } else {
                    // Intentar JPG
                    logoResponse = await fetch('logo_gestoria.jpg');
                    if (logoResponse.ok) {
                        const logoBytes = await logoResponse.arrayBuffer();
                        logoImage = await pdfDoc.embedJpg(logoBytes);
                    }
                }
            }
        } catch (e) {
            console.log('Logo no encontrado, continuando sin él');
        }
        
        // Si hay logo, dibujarlo
        if (logoImage) {
            page.drawImage(logoImage, {
                x: 40,
                y: height - 100,
                width: 70,
                height: 70
            });
        }
        
        // ENCABEZADO GESTORÍA (esquina superior derecha del logo)
        const encX = 122;
        let encY = height - 50;
        page.drawText('GESTORÍA JUSTO GUEVARA', { x: encX, y: encY, size: 10, font: fontBold, color: rgb(0, 0, 0) });
        encY -= 9;
        page.drawText('Avda. Almanzora nº,6, Local 2', { x: encX, y: encY, size: 9, font: fontRegular, color: rgb(0, 0, 0) });
        encY -= 9;
        page.drawText('04860 OLULA DEL RÍO(Almería)', { x: encX, y: encY, size: 9, font: fontRegular, color: rgb(0, 0, 0) });
        encY -= 9;
        page.drawText('TLF: ', { x: encX, y: encY, size: 9, font: fontRegular, color: rgb(0, 0, 0) });
        page.drawText('950 44 16 15', { x: 141, y: encY, size: 9, font: fontBold, color: rgb(0, 0, 0) });
        encY -= 9;
        page.drawText('WHATSAPP: ', { x: encX, y: encY, size: 9, font: fontRegular, color: rgb(0, 0, 0) });
        page.drawText('673 350 118', { x: 170, y: encY, size: 9, font: fontBold, color: rgb(0, 0, 0) });
        encY -= 9;
        page.drawText('trafico@gestoriajustog.es', { x: encX, y: encY, size: 9, font: fontRegular, color: rgb(0, 0, 1) }); // azul
        
        // CUERPO DEL DOCUMENTO
        let y = height - 245;
        const margenIzq = 82;
        
        // DON FRANCISCO JOSE JUSTO GUEVARA, (en negrita) Gestor Administrativo
        page.drawText('DON FRANCISCO JOSE JUSTO GUEVARA,', { x: 127, y: y, size: 12, font: fontBold, color: rgb(0, 0, 0) });
        page.drawText('Gestor Administrativo', { x: 403, y: y, size: 12, font: fontRegular, color: rgb(0, 0, 0) });
        
        y -= 14;
        page.drawText('adscrito al Ilustre Colegio Oficial de Granada, Jaén y Almería, con número de', { x: margenIzq, y: y, size: 12, font: fontRegular, color: rgb(0, 0, 0) });
        
        y -= 14;
        page.drawText('Colegiado 493', { x: margenIzq, y: y, size: 12, font: fontBold, color: rgb(0, 0, 0) });
        page.drawText(', con D.N.I. 27.525.993-F, con domicilio a efectos de notificaciones', { x: 164, y: y, size: 12, font: fontRegular, color: rgb(0, 0, 0) });
        
        y -= 14;
        page.drawText('en Olula del Río (Almería), Avenida Almanzora, número 6, Edificio Almansur, Local', { x: margenIzq, y: y, size: 12, font: fontRegular, color: rgb(0, 0, 0) });
        
        y -= 14;
        page.drawText('2, y teléfono 950/44.16.15,', { x: margenIzq, y: y, size: 12, font: fontRegular, color: rgb(0, 0, 0) });
        
        // EXPONE
        y -= 42;
        page.drawText('EXPONE', { x: margenIzq, y: y, size: 12, font: fontBold, color: rgb(0, 0, 0) });
        page.drawText(' que estamos tramitando en el despacho el ', { x: 130, y: y, size: 12, font: fontRegular, color: rgb(0, 0, 0) });
        page.drawText('CANJE', { x: 377, y: y, size: 12, font: fontBold, color: rgb(0, 0, 0) });
        page.drawText(' del permiso de', { x: 417, y: y, size: 12, font: fontRegular, color: rgb(0, 0, 0) });
        
        y -= 14;
        page.drawText('conducir ', { x: margenIzq, y: y, size: 12, font: fontRegular, color: rgb(0, 0, 0) });
        // País en rojo y subrayado
        const paisX = 130;
        page.drawText(paisOrigen, { x: paisX, y: y, size: 12, font: fontRegular, color: rgb(1, 0, 0) }); // rojo
        const paisWidth = fontRegular.widthOfTextAtSize(paisOrigen, 12);
        // Subrayado
        page.drawLine({
            start: { x: paisX, y: y - 2 },
            end: { x: paisX + paisWidth, y: y - 2 },
            thickness: 0.5,
            color: rgb(1, 0, 0)
        });
        
        const despuesPais = paisX + paisWidth + 5;
        page.drawText('de ', { x: despuesPais, y: y, size: 12, font: fontRegular, color: rgb(0, 0, 0) });
        page.drawText('D./Dña. ' + nombreCompleto, { x: despuesPais + 18, y: y, size: 12, font: fontBold, color: rgb(0, 0, 0) });
        page.drawText(' con ', { x: despuesPais + 18 + fontBold.widthOfTextAtSize('D./Dña. ' + nombreCompleto, 12), y: y, size: 12, font: fontRegular, color: rgb(0, 0, 0) });
        page.drawText('NIE/DNI', { x: 480, y: y, size: 12, font: fontBold, color: rgb(0, 0, 0) });
        
        y -= 14;
        page.drawText(nieCliente, { x: margenIzq, y: y, size: 12, font: fontBold, color: rgb(0, 0, 0) });
        page.drawText(' por un permiso de conducir español.', { x: margenIzq + fontBold.widthOfTextAtSize(nieCliente, 12) + 3, y: y, size: 12, font: fontRegular, color: rgb(0, 0, 0) });
        
        // Segundo párrafo
        y -= 42;
        page.drawText('Se expide el presente justificante profesional para que surta efectos allí donde', { x: margenIzq, y: y, size: 12, font: fontRegular, color: rgb(0, 0, 0) });
        y -= 14;
        page.drawText('proceda, fundamentalmente sirva de justificante sustitutivo de autorización de', { x: margenIzq, y: y, size: 12, font: fontRegular, color: rgb(0, 0, 0) });
        y -= 14;
        page.drawText('permiso de conducir del referido titular.', { x: margenIzq, y: y, size: 12, font: fontRegular, color: rgb(0, 0, 0) });
        
        // Tercer párrafo
        y -= 42;
        page.drawText('El plazo de validez del presente justificante es de 30 días naturales a contar desde', { x: margenIzq, y: y, size: 12, font: fontRegular, color: rgb(0, 0, 0) });
        y -= 14;
        page.drawText('la fecha de su formalización.', { x: margenIzq, y: y, size: 12, font: fontRegular, color: rgb(0, 0, 0) });
        
        // Fecha
        y -= 70;
        page.drawText(`En Olula del Río, a ${fechaFormateada}.`, { x: margenIzq, y: y, size: 12, font: fontRegular, color: rgb(0, 0, 0) });
        
        // Firma
        y -= 120;
        page.drawText('Fdo. Francisco José Justo Guevara.', { x: 89, y: y, size: 12, font: fontRegular, color: rgb(0, 0, 0) });
        
        // Guardar PDF
        const pdfBytes = await pdfDoc.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `Justificante_Profesional_CANJE_${canje.numero}_${cliente.nif}.pdf`;
        link.click();
        
        mostrarAlerta('✓ Justificante Profesional generado correctamente', 'success');
        
    } catch (error) {
        console.error('Error generando justificante:', error);
        mostrarAlerta('Error al generar justificante: ' + error.message, 'error');
    }
}

// =====================================================
// GENERACIÓN DE DOCUMENTOS WORD (.docx)
// =====================================================

// Función para generar Justificante Profesional en formato Word
async function generarJustificanteProfesionalCanjeWord(canje) {
    try {
        mostrarAlerta('Generando Justificante Word...', 'success');
        
        const cliente = clientes.find(c => c.id === canje.titular || c.id === canje.clienteId);
        if (!cliente) {
            mostrarAlerta('No se encontró el cliente del canje', 'error');
            return;
        }
        
        // Buscar plantilla Word
        const plantillasWord = [
            'JUSTIFICANTE_PROFESINAL_PARA_CANJES.doc',
            'JUSTIFICANTE_PROFESINAL_PARA_CANJES.docx',
            'justificante_canje.docx',
            'justificante_canje.doc'
        ];
        
        let plantillaBytes = null;
        let nombrePlantilla = '';
        
        for (const nombre of plantillasWord) {
            try {
                const response = await fetch(nombre);
                if (response.ok) {
                    plantillaBytes = await response.arrayBuffer();
                    nombrePlantilla = nombre;
                    console.log('✓ Plantilla Word encontrada:', nombre);
                    break;
                }
            } catch (e) {
                continue;
            }
        }
        
        if (!plantillaBytes) {
            mostrarAlerta('No se encontró la plantilla Word. Coloca JUSTIFICANTE_PROFESINAL_PARA_CANJES.doc en la carpeta.', 'error');
            return;
        }
        
        // Datos a reemplazar
        const nombreCompleto = `${cliente.nombre || ''} ${cliente.apellido1 || ''} ${cliente.apellido2 || ''}`.trim().toUpperCase();
        const nieCliente = cliente.nif || '';
        const paisOrigen = (canje.pais || canje.paisOrigen || 'extranjero').toLowerCase();
        
        // Fecha actual formateada
        const hoy = new Date();
        const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
        const fechaFormateada = `${hoy.getDate()} de ${meses[hoy.getMonth()]} de ${hoy.getFullYear()}`;
        
        // Usar JSZip para manipular el docx
        const JSZip = window.JSZip;
        if (!JSZip) {
            mostrarAlerta('Error: JSZip no está cargado. Añade la librería JSZip.', 'error');
            return;
        }
        
        const zip = await JSZip.loadAsync(plantillaBytes);
        
        // Obtener el documento XML
        let documentXml = await zip.file('word/document.xml').async('string');
        
        // Reemplazar los campos
        documentXml = documentXml.replace(/dominicano/g, paisOrigen);
        documentXml = documentXml.replace(/NOMBRE APELLIDO1 APELLIDO2/g, nombreCompleto);
        documentXml = documentXml.replace(/1234564678A/g, nieCliente);
        documentXml = documentXml.replace(/11 de junio de 2019/g, fechaFormateada);
        
        // Actualizar el archivo en el zip
        zip.file('word/document.xml', documentXml);
        
        // Generar el nuevo archivo
        const nuevoDocx = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
        
        // Descargar
        const link = document.createElement('a');
        link.href = URL.createObjectURL(nuevoDocx);
        link.download = `Justificante_Profesional_CANJE_${canje.numero}_${cliente.nif}.docx`;
        link.click();
        
        mostrarAlerta('✓ Justificante Word generado correctamente', 'success');
        
    } catch (error) {
        console.error('Error generando justificante Word:', error);
        mostrarAlerta('Error al generar justificante Word: ' + error.message, 'error');
    }
}

// ==================== DOCUMENTO DE REPRESENTACIÓN DE PERSONAS JURÍDICAS ====================

// Función para generar el documento de representación para personas jurídicas
async function generarDocumentoRepresentacion(cliente, tipoTramite, vehiculo) {
    try {
        console.log('=== GENERANDO DOCUMENTO DE REPRESENTACIÓN ===');
        console.log('Cliente:', cliente);
        console.log('Tipo trámite:', tipoTramite);
        console.log('Vehículo:', vehiculo);
        
        mostrarAlerta('Generando documento de representación...', 'success');
        
        // Buscar el PDF de representación
        const posiblesNombres = [
            'documento_representacion_juridica.pdf',
            'representacion_juridica.pdf',
            'documento_representacion.pdf',
            'DOCUMENTO_REPRESENTACION_JURIDICA.pdf'
        ];
        
        let pdfBytes = null;
        let nombreEncontrado = '';
        
        for (const nombre of posiblesNombres) {
            try {
                console.log('Buscando:', nombre);
                const response = await fetch(nombre);
                if (response.ok) {
                    pdfBytes = await response.arrayBuffer();
                    nombreEncontrado = nombre;
                    console.log('✓ PDF de representación encontrado:', nombre);
                    break;
                } else {
                    console.log('No encontrado:', nombre, '- Status:', response.status);
                }
            } catch (error) {
                console.log('Error buscando', nombre, ':', error.message);
                continue;
            }
        }
        
        if (!pdfBytes) {
            mostrarAlerta('No se encontró documento_representacion_juridica.pdf. Colócalo en la carpeta.', 'error');
            console.error('PDF de representación NO encontrado en ninguna ubicación');
            return;
        }
        
        console.log('Cargando PDF:', nombreEncontrado, '- Tamaño:', pdfBytes.byteLength, 'bytes');
        
        const { PDFDocument, rgb } = PDFLib;
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const pages = pdfDoc.getPages();
        const firstPage = pages[0];
        const { width, height } = firstPage.getSize();
        
        console.log('PDF cargado. Tamaño página:', width, 'x', height);
        
        const fontSize = 10;
        const font = await pdfDoc.embedFont('Helvetica');
        
        // Función auxiliar para convertir a string
        const toString = (val) => (val === null || val === undefined) ? '' : String(val);
        
        // Datos de la empresa
        const razonSocial = toString(cliente.nombre).toUpperCase();
        const cif = toString(cliente.nif);
        
        // Provincia (obtener nombre de la provincia)
        const provinciaNombre = obtenerNombreProvincia(cliente.codigoProvincia) || 'ALMERÍA';
        
        // Tipo de trámite
        const tipoTramiteText = tipoTramite.toUpperCase();
        
        // Matrícula o bastidor
        const matriculaOBastidor = vehiculo ? (toString(vehiculo.matricula) || toString(vehiculo.bastidor)) : '';
        
        // Fecha actual
        const fechaActual = new Date();
        const dia = fechaActual.getDate();
        const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
        const mes = meses[fechaActual.getMonth()];
        const año = fechaActual.getFullYear().toString().slice(-2); // Solo últimos 2 dígitos
        
        // Lugar (municipio de la empresa)
        const lugar = toString(cliente.localidad || cliente.municipioManual || 'OLULA DEL RIO').toUpperCase();
        
        // Datos de representantes
        const rep1Nombre = `${toString(cliente.nombreRepresentante)} ${toString(cliente.apellido1Representante)} ${toString(cliente.apellido2Representante)}`.trim().toUpperCase();
        const rep1DNI = toString(cliente.dniRepresentante);
        
        const haySegundoRep = cliente.dniRepresentante2 && cliente.nombreRepresentante2;
        const rep2Nombre = haySegundoRep ? `${toString(cliente.nombreRepresentante2)} ${toString(cliente.apellido1Representante2)} ${toString(cliente.apellido2Representante2)}`.trim().toUpperCase() : '';
        const rep2DNI = haySegundoRep ? toString(cliente.dniRepresentante2) : '';
        
        // COORDENADAS DEL DOCUMENTO (verificadas visualmente con el PDF real)
        // El PDF tiene tamaño A4: 595.32 x 841.92
        // pdf-lib usa Y desde abajo: y = height - Y_real
        // NO se imprime provincia (el PDF ya trae "ALMERIA")
        
        // Entidad (razón social) - línea "de la entidad ___ con CIF nº"
        firstPage.drawText(razonSocial, {
            x: 145,
            y: height - 314,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // CIF - al principio del siguiente renglón
        firstPage.drawText(cif, {
            x: 57,
            y: height - 332,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // Tipo de trámite - entre "expediente de" y "del vehículo"
        firstPage.drawText(tipoTramiteText, {
            x: 309,
            y: height - 332,
            size: 8,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // Matrícula - al principio de la línea de "indicar bastidor"
        firstPage.drawText(matriculaOBastidor, {
            x: 57,
            y: height - 351,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // Lugar - "En ___, a ___ de ___ de 2___"
        firstPage.drawText(lugar, {
            x: 180,
            y: height - 414,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // Día
        firstPage.drawText(String(dia), {
            x: 300,
            y: height - 414,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // Mes
        firstPage.drawText(mes, {
            x: 338,
            y: height - 414,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // Año (últimos 2 dígitos después de "2")
        firstPage.drawText(año, {
            x: 459,
            y: height - 414,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // Primer representante - Nombre y apellidos (debajo de "Nombre y apellidos")
        firstPage.drawText(rep1Nombre, {
            x: 57,
            y: height - 558,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // Primer representante - DNI (debajo de "DNI")
        firstPage.drawText(rep1DNI, {
            x: 446,
            y: height - 558,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // Si hay segundo representante
        if (haySegundoRep) {
            firstPage.drawText(rep2Nombre, {
                x: 57,
                y: height - 576,
                size: fontSize,
                font: font,
                color: rgb(0, 0, 0)
            });
            
            firstPage.drawText(rep2DNI, {
                x: 446,
                y: height - 576,
                size: fontSize,
                font: font,
                color: rgb(0, 0, 0)
            });
        }
        
        // Guardar PDF
        const pdfBytesModificado = await pdfDoc.save();
        
        const blob = new Blob([pdfBytesModificado], { type: 'application/pdf' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `Representacion_${cliente.nif}_${tipoTramite}.pdf`;
        link.click();
        
        mostrarAlerta('✓ Documento de representación generado correctamente', 'success');
        
    } catch (error) {
        console.error('Error generando documento de representación:', error);
        mostrarAlerta('Error al generar documento de representación: ' + error.message, 'error');
    }
}

// Función auxiliar para obtener el nombre de la provincia
function obtenerNombreProvincia(codigo) {
    const provincias = {
        '04': 'ALMERÍA',
        '11': 'CÁDIZ',
        '14': 'CÓRDOBA',
        '18': 'GRANADA',
        '21': 'HUELVA',
        '23': 'JAÉN',
        '29': 'MÁLAGA',
        '41': 'SEVILLA'
    };
    return provincias[codigo] || 'ALMERÍA';
}

// ==================== GENERACIÓN DE PDFs PARA VMP ====================

// Función principal para generar PDFs de VMP con menú de opciones
async function generarPDFsVMP(expediente) {
    const comprador = clientes.find(c => c.id == expediente.comprador);
    if (!comprador) {
        mostrarAlerta('No se encontró el comprador/titular del VMP', 'error');
        return;
    }
    
    const opcion = prompt(
        '¿Qué documento deseas generar?\n\n' +
        '1 - MOD-30 (Trámites de VMP)\n' +
        '2 - Mandato\n' +
        '3 - Ambos documentos\n\n' +
        'Escribe el número:'
    );
    
    if (opcion === '1') {
        await generarMOD30VMP(expediente);
    } else if (opcion === '2') {
        await generarMandatoVMP(expediente);
    } else if (opcion === '3') {
        await generarMOD30VMP(expediente);
        setTimeout(async () => await generarMandatoVMP(expediente), 500);
    } else if (opcion) {
        mostrarAlerta('Opción no válida', 'error');
    }
}

// Generar MOD-30 (Trámites de VMP)
async function generarMOD30VMP(expediente) {
    try {
        mostrarAlerta('Generando MOD-30 para VMP...', 'success');
        
        const comprador = clientes.find(c => c.id == expediente.comprador);
        if (!comprador) {
            mostrarAlerta('No se encontró el comprador/titular', 'error');
            return;
        }
        
        const vendedor = expediente.vendedor ? clientes.find(c => c.id == expediente.vendedor) : null;
        const representante = expediente.representante ? clientes.find(c => c.id == expediente.representante) : null;
        
        // Buscar el PDF del MOD-30
        const posiblesNombres = [
            'Mod_30-ES.pdf',
            'MOD_30-ES.pdf',
            'mod_30.pdf',
            'MOD-30.pdf',
            'mod30.pdf'
        ];
        
        let pdfBytes = null;
        
        for (const nombre of posiblesNombres) {
            try {
                const response = await fetch(nombre);
                if (response.ok) {
                    pdfBytes = await response.arrayBuffer();
                    console.log('✓ PDF MOD-30 encontrado:', nombre);
                    break;
                }
            } catch (error) {
                continue;
            }
        }
        
        if (!pdfBytes) {
            mostrarAlerta('No se encontró el PDF Mod_30-ES.pdf. Colócalo en la misma carpeta.', 'error');
            return;
        }
        
        const { PDFDocument, rgb } = PDFLib;
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const pages = pdfDoc.getPages();
        const firstPage = pages[0];
        const { width, height } = firstPage.getSize();
        
        const fontSize = 9;
        const font = await pdfDoc.embedFont('Helvetica');
        
        // Función auxiliar para convertir a string
        const toString = (val) => (val === null || val === undefined) ? '' : String(val);
        
        // Formatear fecha de nacimiento
        const formatearFechaNac = (fecha) => {
            if (!fecha) return '';
            const f = new Date(fecha);
            return `${String(f.getDate()).padStart(2, '0')}/${String(f.getMonth() + 1).padStart(2, '0')}/${f.getFullYear()}`;
        };
        
        const fechaActual = new Date();
        const dia = fechaActual.getDate();
        const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
        const mes = meses[fechaActual.getMonth()];
        const año = fechaActual.getFullYear();
        
        // =====================================================
        // COORDENADAS MOD-30 VMP (A4: 595 x 842)
        // =====================================================
        
        // --- DATOS DEL VEHÍCULO ---
        // Número de inscripción
        firstPage.drawText(toString(expediente.vmpNumInscripcion), {
            x: 95,
            y: height - 93,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // Fecha de inscripción
        if (expediente.vmpFechaInscripcion) {
            firstPage.drawText(formatearFechaNac(expediente.vmpFechaInscripcion), {
                x: 230,
                y: height - 93,
                size: fontSize,
                font: font,
                color: rgb(0, 0, 0)
            });
        }
        
        // Número de serie
        firstPage.drawText(toString(expediente.vmpNumSerie), {
            x: 400,
            y: height - 93,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // Número de certificado
        firstPage.drawText(toString(expediente.vmpNumCertificado), {
            x: 100,
            y: height - 118,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // Marca / modelo
        firstPage.drawText(toString(expediente.vmpMarca), {
            x: 230,
            y: height - 118,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // --- DOMICILIO FISCAL DEL VEHÍCULO (usamos datos del comprador) ---
        firstPage.drawText(toString(comprador.tipoVia), {
            x: 68,
            y: height - 155,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        firstPage.drawText(toString(comprador.nombreVia), {
            x: 145,
            y: height - 155,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        firstPage.drawText(toString(comprador.numero), {
            x: 530,
            y: height - 155,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // Bloque, portal, escalera, planta, puerta
        firstPage.drawText(toString(comprador.bloque), {
            x: 55,
            y: height - 180,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        firstPage.drawText(toString(comprador.portal), {
            x: 115,
            y: height - 180,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        firstPage.drawText(toString(comprador.escalera), {
            x: 200,
            y: height - 180,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        firstPage.drawText(toString(comprador.planta), {
            x: 290,
            y: height - 180,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        firstPage.drawText(toString(comprador.puerta), {
            x: 370,
            y: height - 180,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // CP, Provincia, Municipio, Localidad
        firstPage.drawText(toString(comprador.cp), {
            x: 85,
            y: height - 205,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        firstPage.drawText(toString(comprador.codigoProvincia) || 'ALMERIA', {
            x: 175,
            y: height - 205,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        const municipioComp = toString(comprador.localidad || comprador.municipioManual);
        firstPage.drawText(municipioComp, {
            x: 330,
            y: height - 205,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        firstPage.drawText(municipioComp, {
            x: 470,
            y: height - 205,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // --- DATOS DEL INTERESADO / COMPRADOR ---
        firstPage.drawText(toString(comprador.nif), {
            x: 75,
            y: height - 250,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        firstPage.drawText(formatearFechaNac(comprador.fechaNacimiento), {
            x: 185,
            y: height - 250,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        firstPage.drawText(toString(comprador.telefono), {
            x: 320,
            y: height - 250,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // Nombre / Razón social
        const nombreComprador = comprador.tipoCliente === 'juridica' 
            ? toString(comprador.nombre) 
            : toString(comprador.nombre);
        firstPage.drawText(nombreComprador, {
            x: 420,
            y: height - 250,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // Apellidos
        firstPage.drawText(toString(comprador.apellido1), {
            x: 85,
            y: height - 275,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        firstPage.drawText(toString(comprador.apellido2), {
            x: 230,
            y: height - 275,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        firstPage.drawText(toString(comprador.email), {
            x: 400,
            y: height - 275,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // --- CHECKBOXES DE TRÁMITE ---
        const subtipo = expediente.subtipoVMP;
        
        if (subtipo === 'inscripcion') {
            // Checkbox INSCRIPCIÓN - Ordinaria
            firstPage.drawText('X', { x: 270, y: height - 345, size: 11, font: font, color: rgb(0, 0, 0) });
            firstPage.drawText('X', { x: 270, y: height - 365, size: 11, font: font, color: rgb(0, 0, 0) });
        } else if (subtipo === 'transferencia') {
            // Checkbox para cambio titularidad - necesita sección vendedor
            // El cambio de titularidad no tiene checkbox específico, se indica con los datos del vendedor
        } else if (subtipo === 'duplicado') {
            // Checkbox DUPLICADOS
            firstPage.drawText('X', { x: 48, y: height - 345, size: 11, font: font, color: rgb(0, 0, 0) });
            
            // Marcar motivo específico
            const motivo = expediente.vmpMotivoDuplicado;
            if (motivo === 'extravio') {
                firstPage.drawText('X', { x: 48, y: height - 365, size: 11, font: font, color: rgb(0, 0, 0) });
            } else if (motivo === 'deterioro') {
                firstPage.drawText('X', { x: 48, y: height - 385, size: 11, font: font, color: rgb(0, 0, 0) });
            } else if (motivo === 'sustraccion') {
                firstPage.drawText('X', { x: 48, y: height - 405, size: 11, font: font, color: rgb(0, 0, 0) });
            } else if (motivo === 'cambio-domicilio') {
                firstPage.drawText('X', { x: 48, y: height - 425, size: 11, font: font, color: rgb(0, 0, 0) });
            } else if (motivo === 'variacion-nombre') {
                firstPage.drawText('X', { x: 145, y: height - 365, size: 11, font: font, color: rgb(0, 0, 0) });
            } else if (motivo === 'variacion-datos') {
                firstPage.drawText('X', { x: 145, y: height - 395, size: 11, font: font, color: rgb(0, 0, 0) });
            }
        } else if (subtipo === 'baja') {
            // Checkbox BAJA
            firstPage.drawText('X', { x: 380, y: height - 345, size: 11, font: font, color: rgb(0, 0, 0) });
            
            const tipoBaja = expediente.vmpTipoBaja;
            if (tipoBaja === 'definitiva') {
                firstPage.drawText('X', { x: 380, y: height - 365, size: 11, font: font, color: rgb(0, 0, 0) });
            } else if (tipoBaja === 'temporal' || tipoBaja === 'sustraccion') {
                firstPage.drawText('X', { x: 380, y: height - 385, size: 11, font: font, color: rgb(0, 0, 0) });
            }
        }
        
        // --- DATOS DEL VENDEDOR (si es transferencia) ---
        if (vendedor && subtipo === 'transferencia') {
            firstPage.drawText(toString(vendedor.nif), {
                x: 75,
                y: height - 475,
                size: fontSize,
                font: font,
                color: rgb(0, 0, 0)
            });
            
            firstPage.drawText(formatearFechaNac(vendedor.fechaNacimiento), {
                x: 200,
                y: height - 475,
                size: fontSize,
                font: font,
                color: rgb(0, 0, 0)
            });
            
            const nombreVendedor = vendedor.tipoCliente === 'juridica' 
                ? toString(vendedor.nombre) 
                : toString(vendedor.nombre);
            firstPage.drawText(nombreVendedor, {
                x: 380,
                y: height - 475,
                size: fontSize,
                font: font,
                color: rgb(0, 0, 0)
            });
            
            firstPage.drawText(toString(vendedor.apellido1), {
                x: 85,
                y: height - 500,
                size: fontSize,
                font: font,
                color: rgb(0, 0, 0)
            });
            
            firstPage.drawText(toString(vendedor.apellido2), {
                x: 280,
                y: height - 500,
                size: fontSize,
                font: font,
                color: rgb(0, 0, 0)
            });
        }
        
        // --- DATOS DEL REPRESENTANTE/TUTOR (si existe) ---
        if (representante) {
            firstPage.drawText(toString(representante.nif), {
                x: 75,
                y: height - 545,
                size: fontSize,
                font: font,
                color: rgb(0, 0, 0)
            });
            
            firstPage.drawText(formatearFechaNac(representante.fechaNacimiento), {
                x: 200,
                y: height - 545,
                size: fontSize,
                font: font,
                color: rgb(0, 0, 0)
            });
            
            const nombreRep = representante.tipoCliente === 'juridica' 
                ? toString(representante.nombre) 
                : toString(representante.nombre);
            firstPage.drawText(nombreRep, {
                x: 380,
                y: height - 545,
                size: fontSize,
                font: font,
                color: rgb(0, 0, 0)
            });
            
            firstPage.drawText(toString(representante.apellido1), {
                x: 85,
                y: height - 570,
                size: fontSize,
                font: font,
                color: rgb(0, 0, 0)
            });
            
            firstPage.drawText(toString(representante.apellido2), {
                x: 280,
                y: height - 570,
                size: fontSize,
                font: font,
                color: rgb(0, 0, 0)
            });
        }
        
        // --- FECHA Y LUGAR FINAL ---
        firstPage.drawText('Almería', {
            x: 160,
            y: height - 720,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        firstPage.drawText(String(dia), {
            x: 245,
            y: height - 720,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        firstPage.drawText(mes, {
            x: 285,
            y: height - 720,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        firstPage.drawText(String(año), {
            x: 365,
            y: height - 720,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        
        // Guardar PDF
        const pdfBytesModificado = await pdfDoc.save();
        
        const blob = new Blob([pdfBytesModificado], { type: 'application/pdf' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `MOD30_VMP_${expediente.numero}_${comprador.nif}.pdf`;
        link.click();
        
        mostrarAlerta('✓ MOD-30 VMP generado correctamente', 'success');
        
    } catch (error) {
        console.error('Error generando MOD-30 VMP:', error);
        mostrarAlerta('Error al generar MOD-30 VMP: ' + error.message, 'error');
    }
}

// Generar Mandato para VMP
async function generarMandatoVMP(expediente) {
    const comprador = clientes.find(c => c.id == expediente.comprador);
    if (!comprador) {
        mostrarAlerta('No se encontró el comprador/titular', 'error');
        return;
    }
    
    // Determinar el asunto según el subtipo
    let asunto = 'INSCRIPCIÓN DE VMP';
    switch(expediente.subtipoVMP) {
        case 'inscripcion': asunto = 'INSCRIPCIÓN DE VMP'; break;
        case 'transferencia': asunto = 'CAMBIO DE TITULARIDAD DE VMP'; break;
        case 'duplicado': asunto = 'DUPLICADO DE CERTIFICADO DE VMP'; break;
        case 'baja': asunto = 'BAJA DE VMP'; break;
    }
    
    // Añadir info del VMP al asunto
    if (expediente.vmpMarca) {
        asunto += ` - ${expediente.vmpMarca}`;
    }
    if (expediente.vmpNumSerie) {
        asunto += ` (N/S: ${expediente.vmpNumSerie})`;
    }
    
    // Crear un objeto vehículo "falso" para que funcione con el mandato existente
    const vehiculoVMP = {
        matricula: expediente.vmpNumInscripcion || expediente.vmpNumSerie || 'VMP',
        bastidor: expediente.vmpNumSerie || '',
        marca: expediente.vmpMarca || 'VMP',
        modelo: ''
    };
    
    // Usar la función de mandato existente
    await generarMandato(comprador, 'COMPRADOR', expediente, vehiculoVMP);
}
