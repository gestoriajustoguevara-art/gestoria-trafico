// Base de datos local (usando localStorage del navegador)
let clientes = [];
let vehiculos = [];
let expedientes = [];

const CONFIG_URL = 'https://gestoriajustoguevara-art.github.io/consola/config.json';
let GOOGLE_SHEETS_URL = '';
let URL_VTO_TRA = '';
let URL_MAESTRO = '';

async function cargarConfigTrafico() {
  try {
    const res = await fetch(CONFIG_URL);
    const cfg = await res.json();
    GOOGLE_SHEETS_URL = cfg.trafico.scriptUrl;
    URL_VTO_TRA       = cfg.vencimientos.scriptUrl;
    URL_MAESTRO       = cfg.clientesMaestro.scriptUrl;
    console.log('✅ Config central cargada — Tráfico listo');
  } catch(e) { console.error('❌ Error cargando config central:', e); }
}

window.onload = async function() {
    await cargarConfigTrafico();
    cargarDatos();          // carga localStorage como fallback mientras descarga
    actualizarDashboard();
    cargarTablaClientes();
    cargarTablaVehiculos();
    cargarTablaExpedientes();
    cargarSelectsExpedientes();
    await descargarDeGoogleSheets();  // siempre sincroniza desde Sheets al arrancar
};

function cargarDatos() {
    const c = localStorage.getItem('gestoria_clientes');
    const v = localStorage.getItem('gestoria_vehiculos');
    const e = localStorage.getItem('gestoria_expedientes');
    if (c) clientes = JSON.parse(c);
    if (v) vehiculos = JSON.parse(v);
    if (e) expedientes = JSON.parse(e);
}

function guardarDatos() {
    localStorage.setItem('gestoria_clientes', JSON.stringify(clientes));
    localStorage.setItem('gestoria_vehiculos', JSON.stringify(vehiculos));
    localStorage.setItem('gestoria_expedientes', JSON.stringify(expedientes));
}

function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
    document.getElementById(tabName).classList.add('active');
    event.target.classList.add('active');
    if (tabName === 'dashboard') actualizarDashboard();
    else if (tabName === 'clientes') cargarTablaClientes();
    else if (tabName === 'vehiculos') cargarTablaVehiculos();
    else if (tabName === 'expedientes') cargarTablaExpedientes();
    else if (tabName === 'nuevo-expediente') cargarSelectsExpedientes();
}

function actualizarDashboard() {
    document.getElementById('total-clientes').textContent = clientes.length;
    document.getElementById('total-vehiculos').textContent = vehiculos.length;
    document.getElementById('total-expedientes').textContent = expedientes.filter(e => e.estado !== 'finalizado' && e.estado !== 'recogido').length;
    const ahora = new Date();
    document.getElementById('expedientes-mes').textContent = expedientes.filter(e => { const f = new Date(e.fecha); return f.getMonth() === ahora.getMonth() && f.getFullYear() === ahora.getFullYear(); }).length;
    const tbody = document.querySelector('#tabla-ultimos-expedientes tbody');
    tbody.innerHTML = '';
    const ultimos = expedientes.slice(-5).reverse();
    if (!ultimos.length) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px">No hay expedientes</td></tr>'; return; }
    ultimos.forEach(exp => {
        const tr = document.createElement('tr');
        const badgeClass = 'badge-' + exp.tipo;
        let nombreCliente = 'N/A';
        const idCli = exp.comprador || exp.titular;
        if (idCli) { const c = clientes.find(c => c.id == idCli); if (c) nombreCliente = c.tipoCliente === 'juridica' ? c.razonSocial || '' : `${c.nombre||''} ${c.apellido1||''}`.trim(); }
        const v = vehiculos.find(v => v.id === exp.vehiculo);
        const estadoInfo = obtenerEstiloEstado(exp.estado);
        tr.innerHTML = `<td><strong>${exp.numero}</strong></td><td><span class="expediente-badge ${badgeClass}">${exp.tipo.toUpperCase()}</span></td><td>${nombreCliente}</td><td>${v ? v.matricula : 'N/A'}</td><td><span style="${estadoInfo.estilo}" onclick="cambiarEstadoExpediente('${exp.id}')">${estadoInfo.texto}</span></td><td><div class="action-buttons"><button class="action-btn btn-primary" onclick="verExpediente('${exp.id}')">Ver</button><button class="action-btn btn-success" onclick="exportarAHermes('${exp.id}')">📤 Hermes</button><button class="action-btn btn-success" onclick="generarPDF('${exp.id}')">PDF</button></div></td>`;
        tbody.appendChild(tr);
    });
}

function mostrarFormularioCliente() { document.getElementById('formulario-cliente').style.display = 'block'; document.getElementById('form-cliente').reset(); }
function ocultarFormularioCliente() { document.getElementById('formulario-cliente').style.display = 'none'; document.getElementById('form-cliente').reset(); }

function guardarCliente(event) {
    event.preventDefault();
    const tipoCliente = document.getElementById('cliente-tipo').value;
    if (!tipoCliente) { mostrarAlerta('Selecciona el tipo de cliente', 'error'); return; }
    const cliente = {
        id: clienteEditandoId || Date.now().toString(), tipoCliente,
        telefono: document.getElementById('cliente-telefono').value,
        email: document.getElementById('cliente-email').value,
        tipoVia: document.getElementById('cliente-tipo-via').value,
        nombreVia: document.getElementById('cliente-nombre-via').value,
        numero: document.getElementById('cliente-numero').value,
        bloque: document.getElementById('cliente-bloque').value,
        portal: document.getElementById('cliente-portal').value,
        escalera: document.getElementById('cliente-escalera').value,
        planta: document.getElementById('cliente-planta').value,
        puerta: document.getElementById('cliente-puerta').value,
        cp: document.getElementById('cliente-cp').value,
        codigoProvincia: document.getElementById('cliente-provincia').value,
        codigoMunicipio: document.getElementById('cliente-codigo-municipio').value,
        localidad: document.getElementById('cliente-localidad').value,
        municipioManual: document.getElementById('cliente-municipio-manual') ? document.getElementById('cliente-municipio-manual').value : ''
    };
    if (cliente.codigoMunicipio === 'OTRO' && cliente.municipioManual) { cliente.localidad = cliente.municipioManual; cliente.codigoMunicipio = ''; }
    if (tipoCliente === 'fisica') {
        cliente.nif = document.getElementById('cliente-nif').value;
        cliente.nombre = document.getElementById('cliente-nombre').value;
        cliente.apellido1 = document.getElementById('cliente-apellido1').value;
        cliente.apellido2 = document.getElementById('cliente-apellido2').value;
        cliente.fechaNacimiento = document.getElementById('cliente-fecha-nacimiento').value;
        cliente.sexo = document.getElementById('cliente-sexo').value;
    } else {
        cliente.nif = document.getElementById('cliente-cif').value;
        cliente.nombre = document.getElementById('cliente-razon-social').value;
        cliente.apellido1 = ''; cliente.apellido2 = '';
        cliente.dniRepresentante = document.getElementById('cliente-dni-representante').value;
        cliente.nombreRepresentante = document.getElementById('cliente-nombre-representante').value;
        cliente.apellido1Representante = document.getElementById('cliente-apellido1-representante').value;
        cliente.apellido2Representante = document.getElementById('cliente-apellido2-representante').value || '';
        cliente.dniRepresentante2 = document.getElementById('cliente-dni-representante2').value || '';
        cliente.nombreRepresentante2 = document.getElementById('cliente-nombre-representante2').value || '';
        cliente.apellido1Representante2 = document.getElementById('cliente-apellido1-representante2').value || '';
        cliente.apellido2Representante2 = document.getElementById('cliente-apellido2-representante2').value || '';
    }
    if (clienteEditandoId) { const idx = clientes.findIndex(c => c.id === clienteEditandoId); if (idx !== -1) { clientes[idx] = cliente; mostrarAlerta('✅ Cliente actualizado.', 'success'); } clienteEditandoId = null; }
    else { clientes.push(cliente); mostrarAlerta('✅ Cliente guardado.', 'success'); }
    guardarDatos(); ocultarFormularioCliente(); cargarTablaClientes(); actualizarDashboard();
    subirAGoogleSheets().catch(err => console.error(err));
    guardarEnMaestro({ DNI_NIE:(cliente.nif||'').toUpperCase().replace(/-/g,''), Nombre:cliente.nombre||'', Apellido1:tipoCliente==='juridica'?'':(cliente.apellido1||''), Apellido2:tipoCliente==='juridica'?'':(cliente.apellido2||''), Fecha_Nacimiento:cliente.fechaNacimiento||'', Telefono1:cliente.telefono||'', Email:cliente.email||'', Tipo_Via:cliente.tipoVia||'', Nombre_Via:cliente.nombreVia||'', Numero:cliente.numero||'', CP:cliente.cp||'', Municipio:cliente.localidad||'', Provincia:cliente.codigoProvincia||'', Codigo_INE:cliente.codigoMunicipio||'', Tipo:tipoCliente, Razon_Social:tipoCliente==='juridica'?(cliente.nombre||''):'', CIF:tipoCliente==='juridica'?(cliente.nif||''):'', Rep1_DNI:cliente.dniRepresentante||'', Rep1_Nombre:cliente.nombreRepresentante||'', Rep1_Apellido1:cliente.apellido1Representante||'', Rep1_Apellido2:cliente.apellido2Representante||'' });
}

function cambiarTipoCliente() {
    const t = document.getElementById('cliente-tipo').value;
    document.getElementById('datos-persona-fisica').style.display = t === 'fisica' ? 'block' : 'none';
    document.getElementById('datos-persona-juridica').style.display = t === 'juridica' ? 'block' : 'none';
    ['cliente-nif','cliente-nombre','cliente-apellido1'].forEach(id => document.getElementById(id).required = t === 'fisica');
    ['cliente-cif','cliente-razon-social','cliente-dni-representante','cliente-nombre-representante','cliente-apellido1-representante'].forEach(id => document.getElementById(id).required = t === 'juridica');
}

function cargarTablaClientes() {
    const tbody = document.querySelector('#tabla-clientes tbody');
    tbody.innerHTML = '';
    if (!clientes.length) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px">No hay clientes registrados.</td></tr>'; return; }
    clientes.forEach(c => {
        const tr = document.createElement('tr');
        const nom = `${c.nombre} ${c.apellido1||''} ${c.apellido2||''}`.trim();
        tr.innerHTML = `<td>${c.nif}</td><td>${nom}</td><td>${c.telefono||'-'}</td><td>${c.email||'-'}</td><td>${c.localidad||'-'}</td><td><div class="action-buttons"><button class="action-btn btn-primary" onclick="editarCliente('${c.id}')">Editar</button><button class="action-btn btn-danger" onclick="eliminarCliente('${c.id}')">Eliminar</button></div></td>`;
        tbody.appendChild(tr);
    });
}

function buscarClientes() {
    const q = document.getElementById('buscar-cliente').value.toLowerCase();
    const tbody = document.querySelector('#tabla-clientes tbody');
    tbody.innerHTML = '';
    const res = clientes.filter(c => { const n = `${c.nombre} ${c.apellido1||''} ${c.apellido2||''}`.toLowerCase(); return c.nif.toLowerCase().includes(q) || n.includes(q); });
    if (!res.length) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px">No se encontraron clientes</td></tr>'; return; }
    res.forEach(c => { const tr = document.createElement('tr'); const n = `${c.nombre} ${c.apellido1||''} ${c.apellido2||''}`.trim(); tr.innerHTML = `<td>${c.nif}</td><td>${n}</td><td>${c.telefono||'-'}</td><td>${c.email||'-'}</td><td>${c.localidad||'-'}</td><td><div class="action-buttons"><button class="action-btn btn-primary" onclick="editarCliente('${c.id}')">Editar</button><button class="action-btn btn-danger" onclick="eliminarCliente('${c.id}')">Eliminar</button></div></td>`; tbody.appendChild(tr); });
}

function eliminarCliente(id) { if (confirm('¿Eliminar este cliente?')) { clientes = clientes.filter(c => c.id !== id); guardarDatos(); cargarTablaClientes(); actualizarDashboard(); mostrarAlerta('Cliente eliminado.', 'success'); subirAGoogleSheets().catch(console.error); } }

function mostrarFormularioVehiculo() { document.getElementById('formulario-vehiculo').style.display = 'block'; document.getElementById('form-vehiculo').reset(); }
function ocultarFormularioVehiculo() { document.getElementById('formulario-vehiculo').style.display = 'none'; document.getElementById('form-vehiculo').reset(); }

function guardarVehiculo(event) {
    event.preventDefault();
    const vehiculo = { id: vehiculoEditandoId || Date.now().toString(), matricula: document.getElementById('vehiculo-matricula').value.toUpperCase(), marca: document.getElementById('vehiculo-marca').value, modelo: document.getElementById('vehiculo-modelo').value, bastidor: document.getElementById('vehiculo-bastidor').value, kilometros: document.getElementById('vehiculo-kilometros').value, fechaMatriculacion: document.getElementById('vehiculo-fecha-matriculacion').value, servicio: document.getElementById('vehiculo-servicio')?.value || 'B00', seguroHasta: document.getElementById('vehiculo-seguro-hasta')?.value || '', itv: document.getElementById('vehiculo-itv')?.value || '' };
    if (vehiculoEditandoId) { const idx = vehiculos.findIndex(v => v.id === vehiculoEditandoId); if (idx !== -1) { vehiculos[idx] = vehiculo; mostrarAlerta('✅ Vehículo actualizado.', 'success'); } vehiculoEditandoId = null; }
    else { vehiculos.push(vehiculo); mostrarAlerta('✅ Vehículo guardado.', 'success'); }
    guardarDatos(); ocultarFormularioVehiculo(); cargarTablaVehiculos(); actualizarDashboard(); subirAGoogleSheets().catch(console.error);
}

function cargarTablaVehiculos() {
    const tbody = document.querySelector('#tabla-vehiculos tbody');
    tbody.innerHTML = '';
    if (!vehiculos.length) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px">No hay vehículos registrados.</td></tr>'; return; }
    vehiculos.forEach(v => { const tr = document.createElement('tr'); tr.innerHTML = `<td><strong>${v.matricula}</strong></td><td>${v.marca} ${v.modelo||''}</td><td>${v.bastidor||'-'}</td><td>${v.kilometros ? v.kilometros+' km' : '-'}</td><td>${v.servicio||'-'}</td><td><div class="action-buttons"><button class="action-btn btn-primary" onclick="editarVehiculo('${v.id}')">Editar</button><button class="action-btn btn-danger" onclick="eliminarVehiculo('${v.id}')">Eliminar</button></div></td>`; tbody.appendChild(tr); });
}

function buscarVehiculos() {
    const q = document.getElementById('buscar-vehiculo').value.toLowerCase();
    const tbody = document.querySelector('#tabla-vehiculos tbody');
    tbody.innerHTML = '';
    const res = vehiculos.filter(v => v.matricula.toLowerCase().includes(q) || v.marca.toLowerCase().includes(q) || (v.bastidor && v.bastidor.toLowerCase().includes(q)));
    if (!res.length) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px">No se encontraron vehículos</td></tr>'; return; }
    res.forEach(v => { const tr = document.createElement('tr'); tr.innerHTML = `<td><strong>${v.matricula}</strong></td><td>${v.marca} ${v.modelo||''}</td><td>${v.bastidor||'-'}</td><td>${v.kilometros ? v.kilometulos+' km' : '-'}</td><td>${v.servicio||'-'}</td><td><div class="action-buttons"><button class="action-btn btn-primary" onclick="editarVehiculo('${v.id}')">Editar</button><button class="action-btn btn-danger" onclick="eliminarVehiculo('${v.id}')">Eliminar</button></div></td>`; tbody.appendChild(tr); });
}

function eliminarVehiculo(id) { if (confirm('¿Eliminar este vehículo?')) { vehiculos = vehiculos.filter(v => v.id !== id); guardarDatos(); cargarTablaVehiculos(); actualizarDashboard(); mostrarAlerta('Vehículo eliminado.', 'success'); subirAGoogleSheets().catch(console.error); } }

function mostrarCamposExpediente() {
    const tipo = document.getElementById('expediente-tipo').value;
    ['campos-transferencia','campos-matriculacion','campos-baja','campos-duplicado'].forEach(id => document.getElementById(id).style.display = 'none');
    document.querySelectorAll('#form-expediente [required]').forEach(el => el.removeAttribute('required'));
    if (tipo === 'transferencia') { document.getElementById('campos-transferencia').style.display = 'block'; ['exp-vehiculo','exp-vendedor','exp-comprador'].forEach(id => document.getElementById(id).setAttribute('required','required')); }
    else if (tipo === 'matriculacion') { document.getElementById('campos-matriculacion').style.display = 'block'; ['exp-titular-mat','exp-vehiculo-mat'].forEach(id => document.getElementById(id).setAttribute('required','required')); }
    else if (tipo === 'baja') { document.getElementById('campos-baja').style.display = 'block'; ['exp-vehiculo-baja','exp-titular-baja'].forEach(id => document.getElementById(id).setAttribute('required','required')); }
    else if (tipo === 'duplicado') { document.getElementById('campos-duplicado').style.display = 'block'; ['exp-vehiculo-dup','exp-titular-dup'].forEach(id => document.getElementById(id).setAttribute('required','required')); }
    else if (tipo === 'canje') { document.getElementById('campos-canje').style.display = 'block'; document.getElementById('exp-titular-canje').setAttribute('required','required'); }
    else if (tipo === 'vmp') { document.getElementById('campos-vmp').style.display = 'block'; document.getElementById('exp-vmp-comprador').setAttribute('required','required'); }
}

function cargarSelectsExpedientes() {
    ['exp-vendedor','exp-comprador','exp-titular-mat','exp-titular-baja','exp-titular-dup','exp-titular-canje','exp-vmp-comprador','exp-vmp-vendedor','exp-vmp-representante'].forEach(id => {
        const sel = document.getElementById(id);
        if (!sel) return;
        sel.innerHTML = '<option value="">Seleccionar cliente...</option>';
        clientes.forEach(c => { const n = `${c.nombre} ${c.apellido1||''} ${c.apellido2||''}`.trim(); const o = document.createElement('option'); o.value = c.id; o.textContent = `${c.nif} - ${n}`; sel.appendChild(o); });
    });
    ['exp-vehiculo','exp-vehiculo-mat','exp-vehiculo-baja','exp-vehiculo-dup'].forEach(id => {
        const sel = document.getElementById(id);
        if (!sel) return;
        sel.innerHTML = '<option value="">Seleccionar vehículo...</option>';
        vehiculos.forEach(v => { const o = document.createElement('option'); o.value = v.id; o.textContent = `${v.matricula} - ${v.marca} ${v.modelo||''}`; sel.appendChild(o); });
    });
}

function generarNumeroExpediente() { return `EXP-${new Date().getFullYear()}-${String(expedientes.length + 1).padStart(4, '0')}`; }

function guardarExpediente(event) {
    event.preventDefault();
    document.querySelectorAll('#form-expediente [required]').forEach(el => el.removeAttribute('required'));
    const tipo = document.getElementById('expediente-tipo').value;
    if (!tipo) { mostrarAlerta('Selecciona un tipo de expediente', 'error'); return; }
    const expediente = {
        id: Date.now().toString(), numero: generarNumeroExpediente(), tipo, fecha: new Date().toISOString(), estado: 'pendiente_doc',
        estadoFactura: document.getElementById('exp-estado-factura')?.value || 'pendiente',
        observaciones: document.getElementById('exp-observaciones').value,
        tasaTrafico: parseFloat(document.getElementById('exp-tasa-trafico').value) || 0,
        impuesto: parseFloat(document.getElementById('exp-impuesto').value) || 0,
        honorarios: parseFloat(document.getElementById('exp-honorarios').value) || 0,
        pagoCliente: parseFloat(document.getElementById('exp-pago-cliente').value) || 0,
        ivaHonorarios: parseFloat(document.getElementById('exp-iva-honorarios').value) || 0,
        totalSuplidos: parseFloat(document.getElementById('exp-total-suplidos').value) || 0,
        totalFactura: parseFloat(document.getElementById('exp-total-factura').value) || 0,
        difHonorarios: parseFloat(document.getElementById('exp-dif-honorarios').value) || 0,
        esEmpresa: document.getElementById('exp-es-empresa').checked,
        retencion: parseFloat(document.getElementById('exp-retencion').value) || 0
    };
    if (tipo === 'transferencia') { expediente.vehiculo = document.getElementById('exp-vehiculo').value; expediente.vendedor = document.getElementById('exp-vendedor').value; expediente.comprador = document.getElementById('exp-comprador').value; expediente.precio = document.getElementById('exp-precio').value; expediente.fechaOperacion = document.getElementById('exp-fecha-operacion').value; expediente.hora = document.getElementById('exp-hora').value; expediente.lugar = document.getElementById('exp-lugar').value; if (!expediente.vehiculo || !expediente.vendedor || !expediente.comprador) { mostrarAlerta('Completa todos los campos obligatorios', 'error'); return; } }
    else if (tipo === 'matriculacion') { expediente.titular = document.getElementById('exp-titular-mat').value; expediente.vehiculo = document.getElementById('exp-vehiculo-mat').value; if (!expediente.titular || !expediente.vehiculo) { mostrarAlerta('Selecciona el titular y el vehículo', 'error'); return; } }
    else if (tipo === 'baja') { expediente.vehiculo = document.getElementById('exp-vehiculo-baja').value; expediente.titular = document.getElementById('exp-titular-baja').value; expediente.motivoBaja = document.getElementById('exp-motivo-baja').value; if (!expediente.vehiculo || !expediente.titular) { mostrarAlerta('Selecciona el vehículo y el titular', 'error'); return; } }
    else if (tipo === 'duplicado') { expediente.vehiculo = document.getElementById('exp-vehiculo-dup').value; expediente.titular = document.getElementById('exp-titular-dup').value; expediente.documentoDuplicar = document.getElementById('exp-doc-duplicar').value; if (!expediente.vehiculo || !expediente.titular) { mostrarAlerta('Selecciona el vehículo y el titular', 'error'); return; } }
    else if (tipo === 'canje') { expediente.titular = document.getElementById('exp-titular-canje').value; expediente.origen = document.getElementById('exp-canje-origen').value; expediente.pais = (document.getElementById('exp-canje-pais').value||'').toUpperCase(); expediente.clasePermiso = document.getElementById('exp-canje-clase').value; expediente.numeroPermiso = document.getElementById('exp-canje-numero').value; expediente.fechaExpedicion = document.getElementById('exp-canje-fecha-exp').value; expediente.fechaCaducidad = document.getElementById('exp-canje-fecha-cad').value; expediente.localizadorDGT = document.getElementById('exp-canje-localizador').value; expediente.recogerColegio = document.getElementById('exp-canje-colegio').value; if (!expediente.titular) { mostrarAlerta('Selecciona el cliente titular', 'error'); return; } }
    else if (tipo === 'vmp') { expediente.subtipoVMP = document.getElementById('exp-vmp-subtipo').value; expediente.vmpNumSerie = document.getElementById('exp-vmp-numserie').value; expediente.vmpMarca = document.getElementById('exp-vmp-marca').value; expediente.vmpNumInscripcion = document.getElementById('exp-vmp-numinscripcion').value; expediente.vmpFechaInscripcion = document.getElementById('exp-vmp-fechainscripcion').value; expediente.vmpNumCertificado = document.getElementById('exp-vmp-numcertificado').value; expediente.comprador = document.getElementById('exp-vmp-comprador').value; expediente.vendedor = document.getElementById('exp-vmp-vendedor').value||''; expediente.representante = document.getElementById('exp-vmp-representante').value||''; expediente.vmpMotivoDuplicado = document.getElementById('exp-vmp-motivo-duplicado')?.value||''; expediente.vmpTipoBaja = document.getElementById('exp-vmp-tipo-baja')?.value||''; if (!expediente.comprador || !expediente.vmpNumSerie || !expediente.subtipoVMP) { mostrarAlerta('Completa los campos obligatorios', 'error'); return; } if (expediente.subtipoVMP === 'transferencia' && !expediente.vendedor) { mostrarAlerta('Selecciona un vendedor', 'error'); return; } }
    if (expedienteEditandoId) { const idx = expedientes.findIndex(e => e.id === expedienteEditandoId); if (idx !== -1) { expediente.id = expedienteEditandoId; expediente.numero = expedientes[idx].numero; expediente.fecha = expedientes[idx].fecha; expedientes[idx] = expediente; mostrarAlerta(`✅ Expediente ${expediente.numero} actualizado.`, 'success'); } expedienteEditandoId = null; }
    else { expedientes.push(expediente); mostrarAlerta(`✅ Expediente ${expediente.numero} creado.`, 'success'); }
    guardarDatos(); comprobarVtoTrafico(expediente); limpiarFormularioExpediente(); actualizarDashboard(); cargarTablaExpedientes(); subirAGoogleSheets().catch(console.error);
    setTimeout(() => { document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active')); document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active')); document.getElementById('expedientes').classList.add('active'); document.querySelectorAll('.nav-tab')[3].classList.add('active'); cargarTablaExpedientes(); }, 1500);
}

function limpiarFormularioExpediente() {
    document.getElementById('form-expediente').reset();
    ['campos-transferencia','campos-matriculacion','campos-baja','campos-duplicado','campos-canje','campos-vmp'].forEach(id => document.getElementById(id).style.display = 'none');
    ['campos-vmp-vendedor','campos-vmp-representante','campos-vmp-duplicado','campos-vmp-baja'].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
}

// ══════════════════════════════════════
// BADGE DE ESTADO DE FACTURACIÓN
// ══════════════════════════════════════
function estadoFacturaBadge(ef) {
    if (ef === 'facturado') return '<span style="background:#dcfce7;color:#166534;padding:3px 8px;border-radius:10px;font-size:11px;font-weight:700">📋 Facturado</span>';
    if (ef === 'listo') return '<span style="background:#ede9fe;color:#6d28d9;padding:3px 8px;border-radius:10px;font-size:11px;font-weight:700">🔵 Listo</span>';
    if (ef === 'nf') return '<span style="background:#fee2e2;color:#991b1b;padding:3px 8px;border-radius:10px;font-size:11px;font-weight:700">🚫 NF</span>';
    return '<span style="background:#fef3c7;color:#92400e;padding:3px 8px;border-radius:10px;font-size:11px;font-weight:700">⏳ Pendiente</span>';
}

function _renderExpRow(exp) {
    const badgeClass = 'badge-' + (exp.tipo || 'transferencia');
    let nombreCliente = 'N/A';
    const idCli = exp.comprador || exp.titular;
    if (idCli) { const c = clientes.find(c => c.id == idCli); if (c) nombreCliente = c.tipoCliente === 'juridica' ? c.razonSocial||'' : `${c.nombre||''} ${c.apellido1||''}`.trim(); }
    let matricula = 'N/A';
    if (exp.tipo === 'canje') matricula = exp.clasePermiso ? `Permiso ${exp.clasePermiso}` : 'Canje';
    else if (exp.tipo === 'vmp') matricula = exp.vmpMarca ? `🛴 ${exp.vmpMarca}` : 'VMP';
    else { const v = vehiculos.find(v => v.id === exp.vehiculo); matricula = v ? v.matricula : 'N/A'; }
    const estadoInfo = obtenerEstiloEstado(exp.estado);
    return `<td><strong>${exp.numero}</strong></td><td><span class="expediente-badge ${badgeClass}">${exp.tipo.toUpperCase()}</span></td><td>${nombreCliente}</td><td>${matricula}</td><td>${formatearFecha(exp.fecha)}</td><td><span style="${estadoInfo.estilo}" onclick="cambiarEstadoExpediente('${exp.id}')" title="Clic para cambiar estado">${estadoInfo.texto}</span></td><td>${estadoFacturaBadge(exp.estadoFactura)}</td><td><div class="action-buttons"><button class="action-btn btn-primary" onclick="verExpediente('${exp.id}')">Ver</button><button class="action-btn btn-success" onclick="exportarAHermes('${exp.id}')">📤 Hermes</button><button class="action-btn btn-success" onclick="generarPDF('${exp.id}')">PDF</button><button class="action-btn btn-warning" onclick="modificarExpediente('${exp.id}')" style="background:#ff9800;color:white;">✏️ Modificar</button></div></td>`;
}

function cargarTablaExpedientes() {
    const tbody = document.querySelector('#tabla-expedientes tbody');
    tbody.innerHTML = '';
    if (!expedientes.length) { tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:40px">No hay expedientes registrados.</td></tr>'; return; }
    expedientes.slice().reverse().forEach(exp => { const tr = document.createElement('tr'); tr.innerHTML = _renderExpRow(exp); tbody.appendChild(tr); });
}

function buscarExpedientes() {
    const q = document.getElementById('buscar-expediente').value.toLowerCase();
    const tbody = document.querySelector('#tabla-expedientes tbody');
    tbody.innerHTML = '';
    const res = expedientes.filter(exp => {
        const v = vehiculos.find(v => v.id == exp.vehiculo);
        const mat = v ? v.matricula.toLowerCase() : '';
        let nom = '';
        const idCli = exp.comprador || exp.titular;
        if (idCli) { const c = clientes.find(c => c.id == idCli); if (c) nom = c.tipoCliente === 'juridica' ? (c.razonSocial||'').toLowerCase() : `${c.nombre||''} ${c.apellido1||''}`.toLowerCase(); }
        return exp.numero.toLowerCase().includes(q) || mat.includes(q) || nom.includes(q);
    });
    if (!res.length) { tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:40px">No se encontraron expedientes</td></tr>'; return; }
    res.slice().reverse().forEach(exp => { const tr = document.createElement('tr'); tr.innerHTML = _renderExpRow(exp); tbody.appendChild(tr); });
}

function verExpediente(id) {
    const exp = expedientes.find(e => e.id === id);
    if (!exp) return;
    let txt = `Expediente: ${exp.numero}\nTipo: ${exp.tipo.toUpperCase()}\nFecha: ${formatearFecha(exp.fecha)}\n`;
    if (exp.tipo === 'transferencia') { const vend = clientes.find(c => c.id === exp.vendedor); const comp = clientes.find(c => c.id === exp.comprador); const veh = vehiculos.find(v => v.id === exp.vehiculo); txt += `Vehículo: ${veh ? veh.matricula+' - '+veh.marca : 'N/A'}\nVendedor: ${vend ? vend.nombre+' '+(vend.apellido1||'') : 'N/A'}\nComprador: ${comp ? comp.nombre+' '+(comp.apellido1||'') : 'N/A'}\nPrecio: ${exp.precio ? exp.precio+'€' : 'N/A'}\n`; }
    if (exp.observaciones) txt += `Observaciones: ${exp.observaciones}`;
    alert(txt);
}

let expedienteEditandoId = null;

function modificarExpediente(id) {
    const exp = expedientes.find(e => e.id == id);
    if (!exp) { mostrarAlerta('No se encontró el expediente', 'error'); return; }
    expedienteEditandoId = id;
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
    document.getElementById('nuevo-expediente').classList.add('active');
    document.querySelectorAll('.nav-tab')[4].classList.add('active');
    document.getElementById('expediente-tipo').value = exp.tipo;
    mostrarCamposExpedienteOriginal();
    setTimeout(() => {
        if (exp.tipo === 'transferencia') { if (document.getElementById('exp-vehiculo')) document.getElementById('exp-vehiculo').value = exp.vehiculo||''; if (document.getElementById('exp-vendedor')) document.getElementById('exp-vendedor').value = exp.vendedor||''; if (document.getElementById('exp-comprador')) document.getElementById('exp-comprador').value = exp.comprador||''; if (document.getElementById('exp-precio')) document.getElementById('exp-precio').value = exp.precio||''; if (document.getElementById('exp-fecha-operacion')) document.getElementById('exp-fecha-operacion').value = exp.fechaOperacion||''; if (document.getElementById('exp-hora')) document.getElementById('exp-hora').value = exp.hora||''; if (document.getElementById('exp-lugar')) document.getElementById('exp-lugar').value = exp.lugar||''; }
        else if (exp.tipo === 'matriculacion') { if (document.getElementById('exp-titular-mat')) document.getElementById('exp-titular-mat').value = exp.titular||''; if (document.getElementById('exp-vehiculo-mat')) document.getElementById('exp-vehiculo-mat').value = exp.vehiculo||''; }
        else if (exp.tipo === 'baja') { if (document.getElementById('exp-vehiculo-baja')) document.getElementById('exp-vehiculo-baja').value = exp.vehiculo||''; if (document.getElementById('exp-titular-baja')) document.getElementById('exp-titular-baja').value = exp.titular||''; if (document.getElementById('exp-motivo-baja')) document.getElementById('exp-motivo-baja').value = exp.motivoBaja||''; }
        else if (exp.tipo === 'canje') { if (document.getElementById('exp-titular-canje')) document.getElementById('exp-titular-canje').value = exp.titular||exp.comprador||''; if (document.getElementById('exp-canje-origen')) document.getElementById('exp-canje-origen').value = exp.origen||''; if (document.getElementById('exp-canje-pais')) document.getElementById('exp-canje-pais').value = exp.pais||''; if (document.getElementById('exp-canje-clase')) document.getElementById('exp-canje-clase').value = exp.clasePermiso||''; if (document.getElementById('exp-canje-numero')) document.getElementById('exp-canje-numero').value = exp.numeroPermiso||''; if (document.getElementById('exp-canje-localizador')) document.getElementById('exp-canje-localizador').value = exp.localizadorDGT||''; }
        document.getElementById('exp-tasa-trafico').value = exp.tasaTrafico || 0;
        document.getElementById('exp-impuesto').value = exp.impuesto || 0;
        document.getElementById('exp-honorarios').value = exp.honorarios || 0;
        document.getElementById('exp-pago-cliente').value = exp.pagoCliente || 0;
        document.getElementById('exp-es-empresa').checked = exp.esEmpresa || false;
        if (document.getElementById('exp-estado-factura')) document.getElementById('exp-estado-factura').value = exp.estadoFactura || 'pendiente';
        calcularTotales();
        document.getElementById('exp-observaciones').value = exp.observaciones || '';
        mostrarAlerta(`✏️ Editando expediente ${exp.numero}`, 'success');
    }, 100);
}

const ESTADOS_EXPEDIENTE = [
    { valor: 'pendiente_doc', texto: '📋 Pendiente Doc', color: '#ff9800' },
    { valor: 'enviado_ctit', texto: '📤 Enviado CTIT', color: '#2196f3' },
    { valor: 'envio_pdf', texto: '📄 Envío PDF', color: '#9c27b0' },
    { valor: 'remesado', texto: '💰 Remesado', color: '#00bcd4' },
    { valor: 'finalizado', texto: '✅ Finalizado', color: '#4caf50' },
    { valor: 'recogido', texto: '📦 Recogido', color: '#8bc34a' },
    { valor: 'con_defectos', texto: '⚠️ Con Defectos', color: '#f44336' }
];

function obtenerEstiloEstado(estado) {
    const e = ESTADOS_EXPEDIENTE.find(e => e.valor === estado);
    if (e) return { texto: e.texto, estilo: `color:white;background-color:${e.color};padding:4px 8px;border-radius:4px;cursor:pointer;font-size:12px;` };
    return { texto: '📋 Pendiente Doc', estilo: 'color:white;background-color:#ff9800;padding:4px 8px;border-radius:4px;cursor:pointer;font-size:12px;' };
}

function cambiarEstadoExpediente(id) {
    const exp = expedientes.find(e => e.id === id);
    if (!exp) return;
    const opciones = ESTADOS_EXPEDIENTE.map((e, i) => `${i+1} - ${e.texto}`).join('\n');
    const sel = prompt(`Cambiar estado del expediente ${exp.numero}\n\nEstado actual: ${obtenerEstiloEstado(exp.estado).texto}\n\nSelecciona nuevo estado:\n\n${opciones}\n\nEscribe el número:`);
    if (sel) {
        const idx = parseInt(sel) - 1;
        if (idx >= 0 && idx < ESTADOS_EXPEDIENTE.length) { exp.estado = ESTADOS_EXPEDIENTE[idx].valor; guardarDatos(); cargarTablaExpedientes(); actualizarDashboard(); mostrarAlerta(`Estado cambiado a: ${ESTADOS_EXPEDIENTE[idx].texto}`, 'success'); comprobarVtoTrafico(exp); subirAGoogleSheets().catch(console.error); }
        else mostrarAlerta('Opción no válida', 'error');
    }
}

function generarPDF(id) { const exp = expedientes.find(e => e.id === id); if (!exp) { mostrarAlerta('No se encontró el expediente', 'error'); return; } generarPDFExpediente(id); }

function formatearFecha(fechaISO) { const f = new Date(fechaISO); return `${String(f.getDate()).padStart(2,'0')}/${String(f.getMonth()+1).padStart(2,'0')}/${f.getFullYear()}`; }

function mostrarAlerta(mensaje, tipo) {
    const d = document.createElement('div');
    d.className = `alert alert-${tipo === 'success' ? 'success' : 'error'}`;
    d.textContent = mensaje;
    Object.assign(d.style, { position:'fixed', top:'20px', right:'20px', zIndex:'9999', minWidth:'300px' });
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 3000);
}

let clienteEditandoId = null;
let vehiculoEditandoId = null;

function editarCliente(id) {
    const c = clientes.find(c => c.id === id);
    if (!c) { mostrarAlerta('Cliente no encontrado', 'error'); return; }
    clienteEditandoId = id;
    document.getElementById('formulario-cliente').style.display = 'block';
    const sel = document.getElementById('cliente-tipo');
    if (sel) { sel.value = c.tipoCliente || 'fisica'; cambiarTipoCliente(); }
    if (c.tipoCliente === 'juridica') {
        document.getElementById('cliente-cif').value = c.nif||''; document.getElementById('cliente-razon-social').value = c.nombre||'';
        document.getElementById('cliente-dni-representante').value = c.dniRepresentante||''; document.getElementById('cliente-nombre-representante').value = c.nombreRepresentante||'';
        document.getElementById('cliente-apellido1-representante').value = c.apellido1Representante||''; document.getElementById('cliente-apellido2-representante').value = c.apellido2Representante||'';
        document.getElementById('cliente-dni-representante2').value = c.dniRepresentante2||''; document.getElementById('cliente-nombre-representante2').value = c.nombreRepresentante2||'';
        document.getElementById('cliente-apellido1-representante2').value = c.apellido1Representante2||''; document.getElementById('cliente-apellido2-representante2').value = c.apellido2Representante2||'';
    } else {
        document.getElementById('cliente-nif').value = c.nif||''; document.getElementById('cliente-nombre').value = c.nombre||'';
        document.getElementById('cliente-apellido1').value = c.apellido1||''; document.getElementById('cliente-apellido2').value = c.apellido2||'';
        document.getElementById('cliente-fecha-nacimiento').value = c.fechaNacimiento||'';
        const sexoSel = document.getElementById('cliente-sexo'); if (sexoSel) sexoSel.value = c.sexo||'V';
    }
    document.getElementById('cliente-telefono').value = c.telefono||''; document.getElementById('cliente-email').value = c.email||'';
    const tvSel = document.getElementById('cliente-tipo-via'); if (tvSel) tvSel.value = c.tipoVia||'';
    document.getElementById('cliente-nombre-via').value = c.nombreVia||''; document.getElementById('cliente-numero').value = c.numero||'';
    document.getElementById('cliente-bloque').value = c.bloque||''; document.getElementById('cliente-portal').value = c.portal||'';
    document.getElementById('cliente-escalera').value = c.escalera||''; document.getElementById('cliente-planta').value = c.planta||'';
    document.getElementById('cliente-puerta').value = c.puerta||''; document.getElementById('cliente-cp').value = c.cp||'';
    const provSel = document.getElementById('cliente-provincia'); if (provSel) provSel.value = c.codigoProvincia||'';
    document.getElementById('cliente-codigo-municipio').value = c.codigoMunicipio||''; document.getElementById('cliente-localidad').value = c.localidad||'';
    document.getElementById('formulario-cliente').scrollIntoView({ behavior:'smooth' });
    mostrarAlerta('Editando cliente: ' + (c.nombre||c.nif), 'success');
}

function editarVehiculo(id) {
    const v = vehiculos.find(v => v.id === id);
    if (!v) { mostrarAlerta('Vehículo no encontrado', 'error'); return; }
    vehiculoEditandoId = id;
    document.getElementById('formulario-vehiculo').style.display = 'block';
    document.getElementById('vehiculo-matricula').value = v.matricula||''; document.getElementById('vehiculo-bastidor').value = v.bastidor||'';
    document.getElementById('vehiculo-marca').value = v.marca||''; document.getElementById('vehiculo-modelo').value = v.modelo||'';
    document.getElementById('vehiculo-fecha-matriculacion').value = v.fechaMatriculacion||''; document.getElementById('vehiculo-kilometros').value = v.kilometros||'';
    document.getElementById('formulario-vehiculo').scrollIntoView({ behavior:'smooth' });
    mostrarAlerta('Editando vehículo: ' + v.matricula, 'success');
}

function exportarAHermes(expedienteId) {
    const exp = expedientes.find(e => e.id === expedienteId);
    if (!exp) { mostrarAlerta('No se encontró el expediente', 'error'); return; }
    const veh = vehiculos.find(v => v.id === exp.vehiculo);
    const vend = clientes.find(c => c.id === exp.vendedor);
    const comp = clientes.find(c => c.id === exp.comprador);
    if (!veh || !vend || !comp) { mostrarAlerta('Faltan datos del expediente', 'error'); return; }
    const t = prompt('Tipo de transferencia:\n\n1 - Conjunta por Venta\n2 - Conjunta por Herencia\n3 - Notificación entre Particulares\n\nEscribe el número:');
    let tipo, motivo, submotivo;
    if (t==='1'){tipo='1';motivo='11';submotivo='111';} else if(t==='2'){tipo='1';motivo='11';submotivo='113';} else if(t==='3'){tipo='2';motivo='21';submotivo='';} else{mostrarAlerta('Opción no válida','error');return;}
    const xml = generarXMLHermes(exp, veh, vend, comp, tipo, motivo, submotivo);
    const blob = new Blob([xml], { type:'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `Hermes_Exp_${exp.numero}_${veh.matricula}.xml`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    mostrarAlerta('✅ XML generado.', 'success');
}

function generarXMLHermes(exp, vehiculo, vendedor, comprador, tipo, motivo, submotivo) {
    const fD = f => { if(!f)return''; const d=new Date(f); return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`; };
    const esc = s => { if(!s)return''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;'); };
    const pLN = {'AL':'04','GR':'18','J':'23','CA':'11','CO':'14','H':'21','MA':'29','SE':'41','A':'03','AB':'02','AV':'05','B':'08','BA':'06','BI':'48','BU':'09','C':'15','CC':'10','CE':'51','CR':'13','CS':'12','CU':'16','GI':'17','GU':'19','HU':'22','LE':'24','L':'25','LO':'26','LU':'27','M':'28','ML':'52','MU':'30','NA':'31','O':'33','OR':'32','P':'34','PM':'07','PO':'36','S':'39','SA':'37','SG':'40','SO':'42','SS':'20','T':'43','TE':'44','TF':'38','TO':'45','V':'46','VA':'47','VI':'01','Z':'50','ZA':'49','GC':'35'};
    const tVC = {'Calle':'CL','CALLE':'CL','Avenida':'AV','AVENIDA':'AV','Plaza':'PZ','PLAZA':'PZ','Paseo':'PS','PASEO':'PS','Carretera':'CTRA','CARRETERA':'CTRA'};
    const provNum = pLN[comprador.codigoProvincia] || comprador.codigoProvincia;
    let tvComp = comprador.tipoVia||''; if(tVC[tvComp])tvComp=tVC[tvComp]; if(tvComp.length>5)tvComp=tvComp.substring(0,5);
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<LISTA_SOLICITUDES>\n\t<SOLICITUD>\n\t\t<DATOS_EXPEDIENTE>\n\t\t\t<ID_GESTOR>493</ID_GESTOR>\n\t\t\t<TIPO_TRAMITE>'+tipo+'</TIPO_TRAMITE>\n\t\t\t<MOTIVO_TRANSMISION>'+motivo+'</MOTIVO_TRANSMISION>\n';
    if(submotivo)xml+='\t\t\t<SUBMOTIVO_TRANSMISION>'+submotivo+'</SUBMOTIVO_TRANSMISION>\n';
    xml+='\t\t\t<JEFATURA>AL</JEFATURA>\n\t\t\t<SUCURSAL>1</SUCURSAL>\n\t\t\t<IMPRESION_PERMISO_CIRCULACION>SI</IMPRESION_PERMISO_CIRCULACION>\n\t\t</DATOS_EXPEDIENTE>\n\t\t<DATOS_VEHICULO>\n\t\t\t<DATOS_MATRICULACION>\n\t\t\t\t<MATRICULA>'+esc(vehiculo.matricula)+'</MATRICULA>\n';
    if(vehiculo.fechaMatriculacion)xml+='\t\t\t\t<FECHA_MATRICULACION>'+fD(vehiculo.fechaMatriculacion)+'</FECHA_MATRICULACION>\n';
    xml+='\t\t\t</DATOS_MATRICULACION>\n\t\t\t<DATOS_SERVICIO>\n\t\t\t\t<SERVICIO_ACTUAL>B00</SERVICIO_ACTUAL>\n\t\t\t\t<CAMBIO_SERVICIO>NO</CAMBIO_SERVICIO>\n\t\t\t</DATOS_SERVICIO>\n\t\t\t<RENTING>NO</RENTING>\n\t\t\t<TIPO_VEHICULO>40</TIPO_VEHICULO>\n\t\t</DATOS_VEHICULO>\n';
    xml+='\t\t<TITULAR_TRANSMITENTE>\n\t\t\t<DATOS_TRANSMITENTE>\n\t\t\t\t<DATOS_FILIACION>\n';
    if(vendedor.tipoCliente==='juridica'){xml+='\t\t\t\t\t<PERSONA_JURIDICA>\n\t\t\t\t\t\t<RAZON_SOCIAL>'+esc(vendedor.nombre)+'</RAZON_SOCIAL>\n\t\t\t\t\t</PERSONA_JURIDICA>\n';}
    else{xml+='\t\t\t\t\t<PERSONA_FISICA>\n\t\t\t\t\t\t<NOMBRE>'+esc(vendedor.nombre)+'</NOMBRE>\n\t\t\t\t\t\t<PRIMER_APELLIDO>'+esc(vendedor.apellido1||'')+'</PRIMER_APELLIDO>\n\t\t\t\t\t\t<SEGUNDO_APELLIDO>'+esc(vendedor.apellido2||'')+'</SEGUNDO_APELLIDO>\n';if(vendedor.fechaNacimiento)xml+='\t\t\t\t\t\t<FECHA_NACIMIENTO>'+fD(vendedor.fechaNacimiento)+'</FECHA_NACIMIENTO>\n';xml+='\t\t\t\t\t</PERSONA_FISICA>\n';}
    xml+='\t\t\t\t</DATOS_FILIACION>\n\t\t\t\t<SEXO>'+(vendedor.tipoCliente==='juridica'?'X':(vendedor.sexo||'V'))+'</SEXO>\n\t\t\t\t<DOI>'+esc(vendedor.nif)+'</DOI>\n\t\t\t</DATOS_TRANSMITENTE>\n\t\t</TITULAR_TRANSMITENTE>\n';
    xml+='\t\t<TITULAR_ADQUIRENTE>\n\t\t\t<DATOS_ADQUIRENTE>\n\t\t\t\t<DATOS_FILIACION>\n';
    if(comprador.tipoCliente==='juridica'){xml+='\t\t\t\t\t<PERSONA_JURIDICA>\n\t\t\t\t\t\t<RAZON_SOCIAL>'+esc(comprador.nombre)+'</RAZON_SOCIAL>\n\t\t\t\t\t</PERSONA_JURIDICA>\n';}
    else{xml+='\t\t\t\t\t<PERSONA_FISICA>\n\t\t\t\t\t\t<NOMBRE>'+esc(comprador.nombre)+'</NOMBRE>\n\t\t\t\t\t\t<PRIMER_APELLIDO>'+esc(comprador.apellido1||'')+'</PRIMER_APELLIDO>\n\t\t\t\t\t\t<SEGUNDO_APELLIDO>'+esc(comprador.apellido2||'')+'</SEGUNDO_APELLIDO>\n';if(comprador.fechaNacimiento)xml+='\t\t\t\t\t\t<FECHA_NACIMIENTO>'+fD(comprador.fechaNacimiento)+'</FECHA_NACIMIENTO>\n';xml+='\t\t\t\t\t</PERSONA_FISICA>\n';}
    xml+='\t\t\t\t</DATOS_FILIACION>\n\t\t\t\t<SEXO>'+(comprador.tipoCliente==='juridica'?'X':(comprador.sexo||'V'))+'</SEXO>\n\t\t\t\t<DOI>'+esc(comprador.nif)+'</DOI>\n\t\t\t</DATOS_ADQUIRENTE>\n\t\t\t<ACTUALIZACION_DOMICILIO>NO</ACTUALIZACION_DOMICILIO>\n\t\t\t<DOMICILIO>\n';
    if(comprador.codigoMunicipio)xml+='\t\t\t\t<MUNICIPIO>'+esc(comprador.codigoMunicipio)+'</MUNICIPIO>\n';
    if(comprador.localidad)xml+='\t\t\t\t<LOCALIDAD>'+esc(comprador.localidad.toUpperCase())+'</LOCALIDAD>\n';
    if(provNum)xml+='\t\t\t\t<PROVINCIA>'+esc(provNum)+'</PROVINCIA>\n';
    if(comprador.cp)xml+='\t\t\t\t<CODIGO_POSTAL>'+esc(comprador.cp)+'</CODIGO_POSTAL>\n';
    if(tvComp)xml+='\t\t\t\t<TIPO_VIA>'+esc(tvComp)+'</TIPO_VIA>\n';
    if(comprador.nombreVia)xml+='\t\t\t\t<NOMBRE_VIA>'+esc(comprador.nombreVia.toUpperCase())+'</NOMBRE_VIA>\n';
    if(comprador.numero)xml+='\t\t\t\t<NUMERO>'+esc(comprador.numero)+'</NUMERO>\n';
    xml+='\t\t\t\t<KILOMETRO>0</KILOMETRO>\n\t\t\t\t<HECTOMETRO>0</HECTOMETRO>\n\t\t\t\t<BLOQUE/>\n\t\t\t\t<PORTAL/>\n\t\t\t\t<ESCALERA/>\n';
    xml+=(comprador.planta?'\t\t\t\t<PLANTA>'+esc(comprador.planta)+'</PLANTA>\n':'\t\t\t\t<PLANTA/>\n');
    xml+=(comprador.puerta?'\t\t\t\t<PUERTA>'+esc(comprador.puerta)+'</PUERTA>\n':'\t\t\t\t<PUERTA/>\n');
    xml+='\t\t\t\t<PAIS>ESP</PAIS>\n\t\t\t</DOMICILIO>\n\t\t</TITULAR_ADQUIRENTE>\n\t\t<ACREDITACION_DERECHO>\n\t\t\t<SOLICITUD>SI</SOLICITUD>\n\t\t\t<CONSENTIMIENTO>N/A</CONSENTIMIENTO>\n\t\t\t<MOTIVO_TRANSMISION>\n';
    if(submotivo==='111')xml+='\t\t\t\t<CONTRATO_COMPRAVENTA>SI</CONTRATO_COMPRAVENTA>\n';
    else if(submotivo==='113')xml+='\t\t\t\t<HERENCIA>SI</HERENCIA>\n';
    xml+='\t\t\t</MOTIVO_TRANSMISION>\n\t\t</ACREDITACION_DERECHO>\n\t\t<ACREDITACION_FISCAL>\n\t\t\t<ITP>\n\t\t\t\t<ACREDITACION_NO_OBLIGACION>\n\t\t\t\t\t<MODELO>620</MODELO>\n\t\t\t\t\t<NO_OBLIGACION>SI</NO_OBLIGACION>\n\t\t\t\t</ACREDITACION_NO_OBLIGACION>\n\t\t\t</ITP>\n\t\t\t<DUA>NO</DUA>\n\t\t\t<IVTM>\n\t\t\t\t<ALTA_IVTM>NO</ALTA_IVTM>\n\t\t\t</IVTM>\n\t\t</ACREDITACION_FISCAL>\n\t\t<ACREDITACION_ACTIVIDAD>\n\t\t\t<VEHICULOS_AGRICOLAS>NO</VEHICULOS_AGRICOLAS>\n\t\t</ACREDITACION_ACTIVIDAD>\n\t</SOLICITUD>\n</LISTA_SOLICITUDES>\n';
    return xml;
}

function mostrarCamposVMPSubtipo() {
    const s = document.getElementById('exp-vmp-subtipo').value;
    ['campos-vmp-vendedor','campos-vmp-duplicado','campos-vmp-baja'].forEach(id => document.getElementById(id).style.display = 'none');
    if(s==='transferencia')document.getElementById('campos-vmp-vendedor').style.display='block';
    else if(s==='duplicado')document.getElementById('campos-vmp-duplicado').style.display='block';
    else if(s==='baja')document.getElementById('campos-vmp-baja').style.display='block';
}

function toggleRepresentanteVMP() {
    const cb = document.getElementById('exp-vmp-tiene-representante');
    const c = document.getElementById('campos-vmp-representante');
    if(cb.checked)c.style.display='block'; else{c.style.display='none';document.getElementById('exp-vmp-representante').value='';}
}

async function subirAGoogleSheets() {
    if (!GOOGLE_SHEETS_URL) return;
    try {
        await subirHoja('Clientes', clientes, ['id','tipoCliente','nif','nombre','apellido1','apellido2','fechaNacimiento','sexo','telefono','email','tipoVia','nombreVia','numero','bloque','portal','escalera','planta','puerta','cp','codigoProvincia','codigoMunicipio','localidad','dniRepresentante','nombreRepresentante','apellido1Representante','apellido2Representante','dniRepresentante2','nombreRepresentante2','apellido1Representante2','apellido2Representante2']);
        await subirHoja('Vehiculos', vehiculos, ['id','matricula','marca','modelo','bastidor','kilometros','fechaMatriculacion','servicio','seguroHasta','itv']);
        const expsSheets = expedientes.map(exp => {
            const idCli = exp.comprador || exp.titular || '';
            const c = clientes.find(c => c.id == idCli);
            const nomCli = c ? (c.tipoCliente==='juridica' ? c.razonSocial||'' : `${c.nombre||''} ${c.apellido1||''} ${c.apellido2||''}`.trim()) : '';
            const idVend = exp.vendedor||'';
            const v = clientes.find(c => c.id == idVend);
            const nomVend = v ? (v.tipoCliente==='juridica' ? v.razonSocial||'' : `${v.nombre||''} ${v.apellido1||''} ${v.apellido2||''}`.trim()) : '';
            const veh = vehiculos.find(v => v.id == exp.vehiculo);
            const dniComp = c ? (c.nif||'') : '';
            const dniVend = v ? (v.nif||'') : '';
            return { ...exp, vendedor:idVend, comprador:idCli, vehiculo:exp.vehiculo||'', nombreVendedor:nomVend, nombreComprador:nomCli, matriculaVehiculo:veh?veh.matricula:'', dniComprador:dniComp, dniVendedor:dniVend };
        });
        await subirHoja('Expedientes', expsSheets, ['id','numero','fecha','tipo','estado','estadoFactura','vendedor','nombreVendedor','dniVendedor','comprador','nombreComprador','dniComprador','vehiculo','matriculaVehiculo','precio','observaciones','tasaTrafico','impuesto','honorarios','ivaHonorarios','totalSuplidos','totalFactura','pagoCliente','difHonorarios','esEmpresa','retencion']);
        mostrarAlerta('✅ Datos subidos correctamente', 'success');
    } catch(e) { console.error(e); mostrarAlerta('❌ Error: '+e.message, 'error'); }
}

async function subirHoja(nombreHoja, datos, columnas) {
    if (!GOOGLE_SHEETS_URL) return;
    const filas = [columnas];
    datos.forEach(item => filas.push(columnas.map(col => item[col] || '')));
    const r = await fetch(GOOGLE_SHEETS_URL, { method:'POST', headers:{'Content-Type':'text/plain'}, body:JSON.stringify({hoja:nombreHoja, datos:filas}) });
    return (await r.json()).success;
}

async function descargarDeGoogleSheets() {
    if (!GOOGLE_SHEETS_URL) { mostrarAlerta('Config central no cargada', 'error'); return; }
    mostrarAlerta('⏳ Sincronizando con Sheets...', 'success');
    try {
        const toStr = arr => arr.map(obj => { const o={}; for(const k in obj)o[k]=(obj[k]===null||obj[k]===undefined||obj[k]==='')? '':String(obj[k]); return o; });
        const c = await descargarHoja('Clientes'); if(c&&c.length) clientes=toStr(c);
        const v = await descargarHoja('Vehiculos'); if(v&&v.length) vehiculos=toStr(v);
        const e = await descargarHoja('Expedientes'); if(e&&e.length) expedientes=toStr(e);
        guardarDatos(); actualizarDashboard(); cargarTablaClientes(); cargarTablaVehiculos(); cargarTablaExpedientes(); cargarSelectsExpedientes();
        mostrarAlerta('✅ Datos sincronizados desde Sheets', 'success');
    } catch(e) { mostrarAlerta('⚠️ Sin conexión a Sheets — usando datos locales', 'error'); }
}

async function descargarHoja(nombreHoja) {
    if (!GOOGLE_SHEETS_URL) return [];
    const r = await fetch(GOOGLE_SHEETS_URL+'?hoja='+nombreHoja);
    const data = await r.json();
    if (!data||!data.length) return [];
    return data.filter(obj => { const id=obj.id; return id!==null&&id!==undefined&&id!==''&&id!==0&&String(id).trim()!==''; });
}

function mostrarMenuSync() { const m = document.getElementById('menu-sync'); m.style.display = (m.style.display==='none'||m.style.display==='') ? 'block' : 'none'; }

const TARIFAS_DEFAULT = { transferencia:{codigo:'TRF',tasa:65.23,impuesto:0,honorarios:70.00}, baja:{codigo:'BAJ',tasa:14.72,impuesto:0,honorarios:40.00}, duplicado:{codigo:'DUP',tasa:23.23,impuesto:0,honorarios:40.00}, canje:{codigo:'CNJ',tasa:40.97,impuesto:0,honorarios:200.00}, matriculacion:{codigo:'MAT',tasa:109.33,impuesto:576.00,honorarios:150.00}, vmp:{codigo:'VMP',tasa:15.00,impuesto:0,honorarios:35.00} };

function cargarTarifas() { const t = localStorage.getItem('gestoria_tarifas'); return t ? JSON.parse(t) : {...TARIFAS_DEFAULT, iva:21, retencion:15}; }

function guardarTarifas() {
    const t = { transferencia:{codigo:'TRF',tasa:parseFloat(document.getElementById('tarifa-trf-tasa')?.value)||65.23,impuesto:0,honorarios:parseFloat(document.getElementById('tarifa-trf-honorarios')?.value)||70.00}, baja:{codigo:'BAJ',tasa:parseFloat(document.getElementById('tarifa-baj-tasa')?.value)||14.72,impuesto:0,honorarios:parseFloat(document.getElementById('tarifa-baj-honorarios')?.value)||40.00}, duplicado:{codigo:'DUP',tasa:parseFloat(document.getElementById('tarifa-dup-tasa')?.value)||23.23,impuesto:0,honorarios:parseFloat(document.getElementById('tarifa-dup-honorarios')?.value)||40.00}, canje:{codigo:'CNJ',tasa:parseFloat(document.getElementById('tarifa-cnj-tasa')?.value)||40.97,impuesto:0,honorarios:parseFloat(document.getElementById('tarifa-cnj-honorarios')?.value)||200.00}, matriculacion:{codigo:'MAT',tasa:parseFloat(document.getElementById('tarifa-mat-tasa')?.value)||109.33,impuesto:parseFloat(document.getElementById('tarifa-mat-impuesto')?.value)||576.00,honorarios:parseFloat(document.getElementById('tarifa-mat-honorarios')?.value)||150.00}, vmp:{codigo:'VMP',tasa:parseFloat(document.getElementById('tarifa-vmp-tasa')?.value)||15.00,impuesto:0,honorarios:parseFloat(document.getElementById('tarifa-vmp-honorarios')?.value)||35.00}, iva:parseFloat(document.getElementById('config-iva')?.value)||21, retencion:parseFloat(document.getElementById('config-retencion')?.value)||15 };
    localStorage.setItem('gestoria_tarifas', JSON.stringify(t));
}

function cargarTarifasEnFormulario() {
    const t = cargarTarifas();
    if (document.getElementById('tarifa-trf-tasa')) {
        document.getElementById('tarifa-trf-tasa').value = t.transferencia?.tasa||65.23; document.getElementById('tarifa-trf-honorarios').value = t.transferencia?.honorarios||70.00;
        document.getElementById('tarifa-baj-tasa').value = t.baja?.tasa||14.72; document.getElementById('tarifa-baj-honorarios').value = t.baja?.honorarios||40.00;
        document.getElementById('tarifa-dup-tasa').value = t.duplicado?.tasa||23.23; document.getElementById('tarifa-dup-honorarios').value = t.duplicado?.honorarios||40.00;
        document.getElementById('tarifa-cnj-tasa').value = t.canje?.tasa||40.97; document.getElementById('tarifa-cnj-honorarios').value = t.canje?.honorarios||200.00;
        document.getElementById('tarifa-mat-tasa').value = t.matriculacion?.tasa||109.33; document.getElementById('tarifa-mat-impuesto').value = t.matriculacion?.impuesto||576.00; document.getElementById('tarifa-mat-honorarios').value = t.matriculacion?.honorarios||150.00;
        document.getElementById('tarifa-vmp-tasa').value = t.vmp?.tasa||15.00; document.getElementById('tarifa-vmp-honorarios').value = t.vmp?.honorarios||35.00;
    }
    if (document.getElementById('config-iva')) { document.getElementById('config-iva').value = t.iva||21; document.getElementById('config-retencion').value = t.retencion||15; }
}

function aplicarTarifasPorTipo(tipo) {
    const t = cargarTarifas(); const tar = t[tipo];
    if (tar) { document.getElementById('exp-tasa-trafico').value = tar.tasa.toFixed(2); document.getElementById('exp-impuesto').value = tar.impuesto.toFixed(2); document.getElementById('exp-honorarios').value = tar.honorarios.toFixed(2); document.getElementById('exp-pago-cliente').value = '0.00'; calcularTotales(); }
}

function calcularTotales() {
    const t = cargarTarifas(); const ivaP = t.iva||21; const retP = t.retencion||15;
    const tasa = parseFloat(document.getElementById('exp-tasa-trafico').value)||0;
    const imp = parseFloat(document.getElementById('exp-impuesto').value)||0;
    const hon = parseFloat(document.getElementById('exp-honorarios').value)||0;
    const pago = parseFloat(document.getElementById('exp-pago-cliente').value)||0;
    const esEmp = document.getElementById('exp-es-empresa').checked;
    const iva = hon*(ivaP/100); document.getElementById('exp-iva-honorarios').value = iva.toFixed(2);
    const supl = tasa+imp; document.getElementById('exp-total-suplidos').value = supl.toFixed(2);
    let total = supl+hon+iva; let ret = 0;
    if (esEmp) { ret = hon*(retP/100); document.getElementById('exp-retencion').value = ret.toFixed(2); document.getElementById('grupo-retencion').style.display = 'block'; total -= ret; }
    else document.getElementById('grupo-retencion').style.display = 'none';
    document.getElementById('exp-total-factura').value = total.toFixed(2);
    const dif = pago-(supl+hon+iva); document.getElementById('exp-dif-honorarios').value = dif.toFixed(2);
    const difEl = document.getElementById('exp-dif-honorarios');
    if(dif>0){difEl.style.background='#e8f5e9';difEl.style.color='#2e7d32';}
    else if(dif<0){difEl.style.background='#ffebee';difEl.style.color='#c62828';}
    else{difEl.style.background='#fff3e0';difEl.style.color='#333';}
}

const mostrarCamposExpedienteOriginal = mostrarCamposExpediente;
mostrarCamposExpediente = function() { mostrarCamposExpedienteOriginal(); const tipo = document.getElementById('expediente-tipo').value; if(tipo)aplicarTarifasPorTipo(tipo); };

document.addEventListener('DOMContentLoaded', function() { cargarTarifasEnFormulario(); });

function comprobarVtoTrafico(exp) {
    if (!URL_VTO_TRA) return;
    const cerrado = ['finalizado','recogido','entregado','cancelado'].includes((exp.estado||'').toLowerCase());
    if (cerrado) { fetch(URL_VTO_TRA,{method:'POST',mode:'no-cors',body:JSON.stringify({action:'completar',app:'Tráfico',expediente:exp.numero,tipo:'Expediente sin finalizar (+20d)'})}); return; }
    const fe = exp.fecha ? new Date(exp.fecha) : null; if(!fe)return;
    const hoy = new Date(); hoy.setHours(0,0,0,0);
    const dias = Math.floor((hoy-fe)/86400000);
    if (dias >= 20) {
        const f20 = new Date(fe); f20.setDate(f20.getDate()+20);
        let nom = '—'; const idCli = exp.comprador||exp.titular;
        if(idCli){const c=clientes.find(c=>c.id===idCli);if(c)nom=[c.nombre,c.apellido1,c.apellido2].filter(Boolean).join(' ');}
        fetch(URL_VTO_TRA,{method:'POST',mode:'no-cors',body:JSON.stringify({action:'upsert',app:'Tráfico',expediente:exp.numero,cliente:nom,fecha:f20.toISOString().slice(0,10),tipo:'Expediente sin finalizar (+20d)',observaciones:exp.tipo||'',estado:'Pendiente'})});
    }
}

function guardarEnMaestro(datos) { if(!URL_MAESTRO||!datos.DNI_NIE||!datos.Nombre)return; fetch(URL_MAESTRO,{method:'POST',mode:'no-cors',body:JSON.stringify({action:'upsert',datos})}); }

async function buscarEnMaestro(dni) {
    if(!URL_MAESTRO||!dni||dni.length<7)return null;
    try { const r=await fetch(URL_MAESTRO+'?action=buscar&dni='+encodeURIComponent(dni.toUpperCase().replace(/-/g,''))); const d=await r.json(); if(d&&d.encontrado)return d.cliente; } catch(e){}
    return null;
}

async function rellenarDesdeMaestroTRA() {
    const nif = (document.getElementById('cliente-nif')?.value||document.getElementById('cliente-cif')?.value||'').trim();
    if(!nif||nif.length<7){mostrarAlerta('Escribe el DNI/NIE/CIF primero','error');return;}
    mostrarAlerta('🔍 Buscando en ClientesMAESTRO...','success');
    const cli = await buscarEnMaestro(nif);
    if(!cli){mostrarAlerta('❌ No encontrado en ClientesMAESTRO','error');return;}
    const set=(id,val)=>{const el=document.getElementById(id);if(el&&!el.value&&val)el.value=val;};
    set('cliente-nombre',cli.Nombre||''); set('cliente-apellido1',cli.Apellido1||''); set('cliente-apellido2',cli.Apellido2||'');
    set('cliente-fecha-nacimiento',cli.Fecha_Nacimiento||''); set('cliente-razon-social',cli.Razon_Social||''); set('cliente-cif',cli.CIF||'');
    set('cliente-dni-representante',cli.Rep1_DNI||''); set('cliente-nombre-representante',cli.Rep1_Nombre||'');
    set('cliente-apellido1-representante',cli.Rep1_Apellido1||''); set('cliente-apellido2-representante',cli.Rep1_Apellido2||'');
    set('cliente-telefono',cli.Telefono1||''); set('cliente-email',cli.Email||''); set('cliente-tipo-via',cli.Tipo_Via||'');
    set('cliente-nombre-via',cli.Nombre_Via||''); set('cliente-numero',cli.Numero||''); set('cliente-cp',cli.CP||''); set('cliente-localidad',cli.Municipio||'');
    if(cli.Codigo_INE){const sel=document.getElementById('cliente-codigo-municipio');if(sel){const opt=[...sel.options].find(o=>o.value===cli.Codigo_INE);if(opt)sel.value=cli.Codigo_INE;}}
    if(cli.Tipo){const sel=document.getElementById('cliente-tipo');if(sel){sel.value=cli.Tipo==='juridica'?'juridica':'fisica';cambiarTipoCliente();}}
    mostrarAlerta('✅ Datos cargados desde ClientesMAESTRO','success');
}
