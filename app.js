// Base de datos local (usando localStorage del navegador)
let clientes = [];
let vehiculos = [];
let expedientes = [];

// ══════════════════════════════════════════════════════════════
// CONFIG CENTRAL — URLs cargadas automáticamente desde GitHub
// Para cambiarlas: edita config.json en el repo "consola"
// ══════════════════════════════════════════════════════════════
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
  } catch(e) {
    console.error('❌ Error cargando config central:', e);
  }
}
// ══════════════════════════════════════════════════════════════

// Cargar datos al iniciar
window.onload = async function() {
    await cargarConfigTrafico(); // primero cargamos las URLs
    cargarDatos();
    actualizarDashboard();
    cargarTablaClientes();
    cargarTablaVehiculos();
    cargarTablaExpedientes();
    cargarSelectsExpedientes();
};

// ==================== FUNCIONES DE ALMACENAMIENTO ====================

function cargarDatos() {
    const clientesGuardados = localStorage.getItem('gestoria_clientes');
    const vehiculosGuardados = localStorage.getItem('gestoria_vehiculos');
    const expedientesGuardados = localStorage.getItem('gestoria_expedientes');
    
    if (clientesGuardados) {
        clientes = JSON.parse(clientesGuardados);
    }
    if (vehiculosGuardados) {
        vehiculos = JSON.parse(vehiculosGuardados);
    }
    if (expedientesGuardados) {
        expedientes = JSON.parse(expedientesGuardados);
    }
}

function guardarDatos() {
    localStorage.setItem('gestoria_clientes', JSON.stringify(clientes));
    localStorage.setItem('gestoria_vehiculos', JSON.stringify(vehiculos));
    localStorage.setItem('gestoria_expedientes', JSON.stringify(expedientes));
}

// ==================== NAVEGACIÓN ENTRE PESTAÑAS ====================

function switchTab(tabName) {
    const tabs = document.querySelectorAll('.tab-content');
    tabs.forEach(tab => tab.classList.remove('active'));
    
    const buttons = document.querySelectorAll('.nav-tab');
    buttons.forEach(btn => btn.classList.remove('active'));
    
    document.getElementById(tabName).classList.add('active');
    event.target.classList.add('active');
    
    if (tabName === 'dashboard') {
        actualizarDashboard();
    } else if (tabName === 'clientes') {
        cargarTablaClientes();
    } else if (tabName === 'vehiculos') {
        cargarTablaVehiculos();
    } else if (tabName === 'expedientes') {
        cargarTablaExpedientes();
    } else if (tabName === 'nuevo-expediente') {
        cargarSelectsExpedientes();
    }
}

// ==================== DASHBOARD ====================

function actualizarDashboard() {
    document.getElementById('total-clientes').textContent = clientes.length;
    document.getElementById('total-vehiculos').textContent = vehiculos.length;
    
    const expedientesPendientes = expedientes.filter(exp => 
        exp.estado !== 'finalizado' && exp.estado !== 'recogido'
    ).length;
    document.getElementById('total-expedientes').textContent = expedientesPendientes;
    
    const ahora = new Date();
    const mesActual = ahora.getMonth();
    const añoActual = ahora.getFullYear();
    
    const expedientesMes = expedientes.filter(exp => {
        const fecha = new Date(exp.fecha);
        return fecha.getMonth() === mesActual && fecha.getFullYear() === añoActual;
    }).length;
    
    document.getElementById('expedientes-mes').textContent = expedientesMes;
    
    const tbody = document.querySelector('#tabla-ultimos-expedientes tbody');
    tbody.innerHTML = '';
    
    const ultimosExpedientes = expedientes.slice(-5).reverse();
    
    if (ultimosExpedientes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px;">No hay expedientes registrados</td></tr>';
    } else {
        ultimosExpedientes.forEach(exp => {
            const tr = document.createElement('tr');
            
            let badgeClass = '';
            switch(exp.tipo) {
                case 'transferencia': badgeClass = 'badge-transferencia'; break;
                case 'matriculacion': badgeClass = 'badge-matriculacion'; break;
                case 'baja': badgeClass = 'badge-baja'; break;
                case 'duplicado': badgeClass = 'badge-duplicado'; break;
                case 'canje': badgeClass = 'badge-canje'; break;
            }
            
            let nombreCliente = 'N/A';
            const idCliente = exp.comprador || exp.titular;
            if (idCliente) {
                const cliente = clientes.find(c => c.id == idCliente);
                if (cliente) {
                    if (cliente.tipoCliente === 'juridica') {
                        nombreCliente = cliente.razonSocial || '';
                    } else {
                        nombreCliente = `${cliente.nombre || ''} ${cliente.apellido1 || ''}`.trim();
                    }
                }
            }
            
            const vehiculo = vehiculos.find(v => v.id === exp.vehiculo);
            const matricula = vehiculo ? vehiculo.matricula : 'N/A';
            
            const estadoInfo = obtenerEstiloEstado(exp.estado);
            
            tr.innerHTML = `
                <td><strong>${exp.numero}</strong></td>
                <td><span class="expediente-badge ${badgeClass}">${exp.tipo.toUpperCase()}</span></td>
                <td>${nombreCliente}</td>
                <td>${matricula}</td>
                <td><span style="${estadoInfo.estilo}" onclick="cambiarEstadoExpediente('${exp.id}')">${estadoInfo.texto}</span></td>
                <td>${estadoFacturaBadge(exp.estadoFactura)}</td>
                <td>
                    <div class="action-buttons">
                        <button class="action-btn btn-primary" onclick="verExpediente('${exp.id}')">Ver</button>
                        <button class="action-btn btn-success" onclick="exportarAHermes('${exp.id}')">📤 Hermes</button>
                    <button class="action-btn btn-success" onclick="generarPDF('${exp.id}')">PDF</button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }
}

// ==================== CLIENTES ====================

function mostrarFormularioCliente() {
    document.getElementById('formulario-cliente').style.display = 'block';
    document.getElementById('form-cliente').reset();
}

function ocultarFormularioCliente() {
    document.getElementById('formulario-cliente').style.display = 'none';
    document.getElementById('form-cliente').reset();
}

function guardarCliente(event) {
    event.preventDefault();
    
    const tipoClienteElement = document.getElementById('cliente-tipo');
    const tipoCliente = tipoClienteElement ? tipoClienteElement.value : 'fisica';
    
    if (!tipoCliente) {
        mostrarAlerta('Selecciona el tipo de cliente', 'error');
        return;
    }
    
    const cliente = {
        id: clienteEditandoId || Date.now().toString(),
        tipoCliente: tipoCliente,
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
    
    if (cliente.codigoMunicipio === 'OTRO' && cliente.municipioManual) {
        cliente.localidad = cliente.municipioManual;
        cliente.codigoMunicipio = '';
    }
    
    if (tipoCliente === 'fisica') {
        cliente.nif = document.getElementById('cliente-nif').value;
        cliente.nombre = document.getElementById('cliente-nombre').value;
        cliente.apellido1 = document.getElementById('cliente-apellido1').value;
        cliente.apellido2 = document.getElementById('cliente-apellido2').value;
        cliente.fechaNacimiento = document.getElementById('cliente-fecha-nacimiento').value;
        cliente.sexo = document.getElementById('cliente-sexo').value;
    } else if (tipoCliente === 'juridica') {
        cliente.nif = document.getElementById('cliente-cif').value;
        cliente.nombre = document.getElementById('cliente-razon-social').value;
        cliente.apellido1 = '';
        cliente.apellido2 = '';
        cliente.dniRepresentante = document.getElementById('cliente-dni-representante').value;
        cliente.nombreRepresentante = document.getElementById('cliente-nombre-representante').value;
        cliente.apellido1Representante = document.getElementById('cliente-apellido1-representante').value;
        cliente.apellido2Representante = document.getElementById('cliente-apellido2-representante').value || '';
        cliente.dniRepresentante2 = document.getElementById('cliente-dni-representante2').value || '';
        cliente.nombreRepresentante2 = document.getElementById('cliente-nombre-representante2').value || '';
        cliente.apellido1Representante2 = document.getElementById('cliente-apellido1-representante2').value || '';
        cliente.apellido2Representante2 = document.getElementById('cliente-apellido2-representante2').value || '';
    }
    
    if (clienteEditandoId) {
        const index = clientes.findIndex(c => c.id === clienteEditandoId);
        if (index !== -1) {
            clientes[index] = cliente;
            mostrarAlerta('✅ Cliente actualizado. Subiendo a Google Sheets...', 'success');
        }
        clienteEditandoId = null;
    } else {
        clientes.push(cliente);
        mostrarAlerta('✅ Cliente guardado. Subiendo a Google Sheets...', 'success');
    }
    
    guardarDatos();
    ocultarFormularioCliente();
    cargarTablaClientes();
    actualizarDashboard();
    
    subirAGoogleSheets().then(() => {
        console.log('✓ Clientes sincronizados con Google Sheets');
    }).catch(err => {
        console.error('Error al sincronizar clientes:', err);
    });

    guardarEnMaestro({
        DNI_NIE:    (cliente.nif||'').toUpperCase().replace(/-/g,''),
        Nombre:     cliente.tipoCliente==='juridica' ? (cliente.nombre||'') : (cliente.nombre||''),
        Apellido1:  cliente.tipoCliente==='juridica' ? '' : (cliente.apellido1||''),
        Apellido2:  cliente.tipoCliente==='juridica' ? '' : (cliente.apellido2||''),
        Fecha_Nacimiento: cliente.fechaNacimiento || '',
        Telefono1:  cliente.telefono  || '',
        Email:      cliente.email     || '',
        Tipo_Via:   cliente.tipoVia   || '',
        Nombre_Via: cliente.nombreVia || '',
        Numero:     cliente.numero    || '',
        CP:         cliente.cp        || '',
        Municipio:  cliente.localidad || '',
        Provincia:  cliente.codigoProvincia || '',
        Codigo_INE: cliente.codigoMunicipio || '',
        Tipo:       cliente.tipoCliente     || 'fisica',
        Razon_Social: cliente.tipoCliente==='juridica' ? (cliente.nombre||'') : '',
        CIF:          cliente.tipoCliente==='juridica' ? (cliente.nif||'')    : '',
        Rep1_DNI:     cliente.dniRepresentante   || '',
        Rep1_Nombre:  cliente.nombreRepresentante || '',
        Rep1_Apellido1: cliente.apellido1Representante || '',
        Rep1_Apellido2: cliente.apellido2Representante || ''
    });
}

function cambiarTipoCliente() {
    const tipoCliente = document.getElementById('cliente-tipo').value;
    const datosFisica = document.getElementById('datos-persona-fisica');
    const datosJuridica = document.getElementById('datos-persona-juridica');
    
    if (tipoCliente === 'fisica') {
        datosFisica.style.display = 'block';
        datosJuridica.style.display = 'none';
        document.getElementById('cliente-nif').required = true;
        document.getElementById('cliente-nombre').required = true;
        document.getElementById('cliente-apellido1').required = true;
        document.getElementById('cliente-cif').required = false;
        document.getElementById('cliente-razon-social').required = false;
        document.getElementById('cliente-dni-representante').required = false;
        document.getElementById('cliente-nombre-representante').required = false;
        document.getElementById('cliente-apellido1-representante').required = false;
    } else if (tipoCliente === 'juridica') {
        datosFisica.style.display = 'none';
        datosJuridica.style.display = 'block';
        document.getElementById('cliente-cif').required = true;
        document.getElementById('cliente-razon-social').required = true;
        document.getElementById('cliente-dni-representante').required = true;
        document.getElementById('cliente-nombre-representante').required = true;
        document.getElementById('cliente-apellido1-representante').required = true;
        document.getElementById('cliente-nif').required = false;
        document.getElementById('cliente-nombre').required = false;
        document.getElementById('cliente-apellido1').required = false;
    } else {
        datosFisica.style.display = 'none';
        datosJuridica.style.display = 'none';
    }
}

function cargarTablaClientes() {
    const tbody = document.querySelector('#tabla-clientes tbody');
    tbody.innerHTML = '';
    
    if (clientes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px;">No hay clientes registrados. Haz clic en "Nuevo Cliente" para añadir uno.</td></tr>';
        return;
    }
    
    clientes.forEach(cliente => {
        const tr = document.createElement('tr');
        const nombreCompleto = `${cliente.nombre} ${cliente.apellido1 || ''} ${cliente.apellido2 || ''}`.trim();
        
        tr.innerHTML = `
            <td>${cliente.nif}</td>
            <td>${nombreCompleto}</td>
            <td>${cliente.telefono || '-'}</td>
            <td>${cliente.email || '-'}</td>
            <td>${cliente.localidad || '-'}</td>
            <td>
                <div class="action-buttons">
                    <button class="action-btn btn-primary" onclick="editarCliente('${cliente.id}')">Editar</button>
                    <button class="action-btn btn-danger" onclick="eliminarCliente('${cliente.id}')">Eliminar</button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function buscarClientes() {
    const busqueda = document.getElementById('buscar-cliente').value.toLowerCase();
    const tbody = document.querySelector('#tabla-clientes tbody');
    tbody.innerHTML = '';
    
    const resultados = clientes.filter(cliente => {
        const nombreCompleto = `${cliente.nombre} ${cliente.apellido1 || ''} ${cliente.apellido2 || ''}`.toLowerCase();
        return cliente.nif.toLowerCase().includes(busqueda) || nombreCompleto.includes(busqueda);
    });
    
    if (resultados.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px;">No se encontraron clientes</td></tr>';
        return;
    }
    
    resultados.forEach(cliente => {
        const tr = document.createElement('tr');
        const nombreCompleto = `${cliente.nombre} ${cliente.apellido1 || ''} ${cliente.apellido2 || ''}`.trim();
        tr.innerHTML = `
            <td>${cliente.nif}</td>
            <td>${nombreCompleto}</td>
            <td>${cliente.telefono || '-'}</td>
            <td>${cliente.email || '-'}</td>
            <td>${cliente.localidad || '-'}</td>
            <td>
                <div class="action-buttons">
                    <button class="action-btn btn-primary" onclick="editarCliente('${cliente.id}')">Editar</button>
                    <button class="action-btn btn-danger" onclick="eliminarCliente('${cliente.id}')">Eliminar</button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function eliminarCliente(id) {
    if (confirm('¿Estás seguro de que quieres eliminar este cliente?')) {
        clientes = clientes.filter(c => c.id !== id);
        guardarDatos();
        cargarTablaClientes();
        actualizarDashboard();
        mostrarAlerta('Cliente eliminado. Sincronizando...', 'success');
        subirAGoogleSheets().then(() => console.log('✓ Eliminación sincronizada')).catch(err => console.error(err));
    }
}

// ==================== VEHÍCULOS ====================

function mostrarFormularioVehiculo() {
    document.getElementById('formulario-vehiculo').style.display = 'block';
    document.getElementById('form-vehiculo').reset();
}

function ocultarFormularioVehiculo() {
    document.getElementById('formulario-vehiculo').style.display = 'none';
    document.getElementById('form-vehiculo').reset();
}

function guardarVehiculo(event) {
    event.preventDefault();
    
    const vehiculo = {
        id: vehiculoEditandoId || Date.now().toString(),
        matricula: document.getElementById('vehiculo-matricula').value.toUpperCase(),
        marca: document.getElementById('vehiculo-marca').value,
        modelo: document.getElementById('vehiculo-modelo').value,
        bastidor: document.getElementById('vehiculo-bastidor').value,
        kilometros: document.getElementById('vehiculo-kilometros').value,
        fechaMatriculacion: document.getElementById('vehiculo-fecha-matriculacion').value,
        servicio: document.getElementById('vehiculo-servicio') ? document.getElementById('vehiculo-servicio').value : 'B00',
        seguroHasta: document.getElementById('vehiculo-seguro-hasta') ? document.getElementById('vehiculo-seguro-hasta').value : '',
        itv: document.getElementById('vehiculo-itv') ? document.getElementById('vehiculo-itv').value : ''
    };
    
    if (vehiculoEditandoId) {
        const index = vehiculos.findIndex(v => v.id === vehiculoEditandoId);
        if (index !== -1) {
            vehiculos[index] = vehiculo;
            mostrarAlerta('✅ Vehículo actualizado. Subiendo a Google Sheets...', 'success');
        }
        vehiculoEditandoId = null;
    } else {
        vehiculos.push(vehiculo);
        mostrarAlerta('✅ Vehículo guardado. Subiendo a Google Sheets...', 'success');
    }
    
    guardarDatos();
    ocultarFormularioVehiculo();
    cargarTablaVehiculos();
    actualizarDashboard();
    subirAGoogleSheets().then(() => console.log('✓ Vehículos sincronizados')).catch(err => console.error(err));
}

function cargarTablaVehiculos() {
    const tbody = document.querySelector('#tabla-vehiculos tbody');
    tbody.innerHTML = '';
    
    if (vehiculos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px;">No hay vehículos registrados. Haz clic en "Nuevo Vehículo" para añadir uno.</td></tr>';
        return;
    }
    
    vehiculos.forEach(vehiculo => {
        const tr = document.createElement('tr');
        const marcaModelo = `${vehiculo.marca} ${vehiculo.modelo || ''}`.trim();
        tr.innerHTML = `
            <td><strong>${vehiculo.matricula}</strong></td>
            <td>${marcaModelo}</td>
            <td>${vehiculo.bastidor || '-'}</td>
            <td>${vehiculo.kilometros ? vehiculo.kilometros + ' km' : '-'}</td>
            <td>${vehiculo.servicio || '-'}</td>
            <td>
                <div class="action-buttons">
                    <button class="action-btn btn-primary" onclick="editarVehiculo('${vehiculo.id}')">Editar</button>
                    <button class="action-btn btn-danger" onclick="eliminarVehiculo('${vehiculo.id}')">Eliminar</button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function buscarVehiculos() {
    const busqueda = document.getElementById('buscar-vehiculo').value.toLowerCase();
    const tbody = document.querySelector('#tabla-vehiculos tbody');
    tbody.innerHTML = '';
    
    const resultados = vehiculos.filter(vehiculo => {
        return vehiculo.matricula.toLowerCase().includes(busqueda) ||
               vehiculo.marca.toLowerCase().includes(busqueda) ||
               (vehiculo.bastidor && vehiculo.bastidor.toLowerCase().includes(busqueda));
    });
    
    if (resultados.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px;">No se encontraron vehículos</td></tr>';
        return;
    }
    
    resultados.forEach(vehiculo => {
        const tr = document.createElement('tr');
        const marcaModelo = `${vehiculo.marca} ${vehiculo.modelo || ''}`.trim();
        tr.innerHTML = `
            <td><strong>${vehiculo.matricula}</strong></td>
            <td>${marcaModelo}</td>
            <td>${vehiculo.bastidor || '-'}</td>
            <td>${vehiculo.kilometros ? vehiculo.kilometros + ' km' : '-'}</td>
            <td>${vehiculo.servicio || '-'}</td>
            <td>
                <div class="action-buttons">
                    <button class="action-btn btn-primary" onclick="editarVehiculo('${vehiculo.id}')">Editar</button>
                    <button class="action-btn btn-danger" onclick="eliminarVehiculo('${vehiculo.id}')">Eliminar</button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function eliminarVehiculo(id) {
    if (confirm('¿Estás seguro de que quieres eliminar este vehículo?')) {
        vehiculos = vehiculos.filter(v => v.id !== id);
        guardarDatos();
        cargarTablaVehiculos();
        actualizarDashboard();
        mostrarAlerta('Vehículo eliminado. Sincronizando...', 'success');
        subirAGoogleSheets().then(() => console.log('✓ Eliminación sincronizada')).catch(err => console.error(err));
    }
}

// ==================== EXPEDIENTES ====================

function mostrarCamposExpediente() {
    const tipo = document.getElementById('expediente-tipo').value;
    
    document.getElementById('campos-transferencia').style.display = 'none';
    document.getElementById('campos-matriculacion').style.display = 'none';
    document.getElementById('campos-baja').style.display = 'none';
    document.getElementById('campos-duplicado').style.display = 'none';
    
    document.querySelectorAll('#form-expediente [required]').forEach(el => el.removeAttribute('required'));
    
    if (tipo === 'transferencia') {
        document.getElementById('campos-transferencia').style.display = 'block';
        document.getElementById('exp-vehiculo').setAttribute('required', 'required');
        document.getElementById('exp-vendedor').setAttribute('required', 'required');
        document.getElementById('exp-comprador').setAttribute('required', 'required');
    } else if (tipo === 'matriculacion') {
        document.getElementById('campos-matriculacion').style.display = 'block';
        document.getElementById('exp-titular-mat').setAttribute('required', 'required');
        document.getElementById('exp-vehiculo-mat').setAttribute('required', 'required');
    } else if (tipo === 'baja') {
        document.getElementById('campos-baja').style.display = 'block';
        document.getElementById('exp-vehiculo-baja').setAttribute('required', 'required');
        document.getElementById('exp-titular-baja').setAttribute('required', 'required');
    } else if (tipo === 'duplicado') {
        document.getElementById('campos-duplicado').style.display = 'block';
        document.getElementById('exp-vehiculo-dup').setAttribute('required', 'required');
        document.getElementById('exp-titular-dup').setAttribute('required', 'required');
    } else if (tipo === 'canje') {
        document.getElementById('campos-canje').style.display = 'block';
        document.getElementById('exp-titular-canje').setAttribute('required', 'required');
    } else if (tipo === 'vmp') {
        document.getElementById('campos-vmp').style.display = 'block';
        document.getElementById('exp-vmp-comprador').setAttribute('required', 'required');
    }
}

function cargarSelectsExpedientes() {
    const selectsClientes = [
        'exp-vendedor', 'exp-comprador', 'exp-titular-mat', 'exp-titular-baja',
        'exp-titular-dup', 'exp-titular-canje', 'exp-vmp-comprador',
        'exp-vmp-vendedor', 'exp-vmp-representante'
    ];
    
    selectsClientes.forEach(selectId => {
        const select = document.getElementById(selectId);
        if (select) {
            select.innerHTML = '<option value="">Seleccionar cliente...</option>';
            clientes.forEach(cliente => {
                const nombreCompleto = `${cliente.nombre} ${cliente.apellido1 || ''} ${cliente.apellido2 || ''}`.trim();
                const option = document.createElement('option');
                option.value = cliente.id;
                option.textContent = `${cliente.nif} - ${nombreCompleto}`;
                select.appendChild(option);
            });
        }
    });
    
    const selectsVehiculos = ['exp-vehiculo', 'exp-vehiculo-mat', 'exp-vehiculo-baja', 'exp-vehiculo-dup'];
    
    selectsVehiculos.forEach(selectId => {
        const select = document.getElementById(selectId);
        if (select) {
            select.innerHTML = '<option value="">Seleccionar vehículo...</option>';
            vehiculos.forEach(vehiculo => {
                const marcaModelo = `${vehiculo.marca} ${vehiculo.modelo || ''}`.trim();
                const option = document.createElement('option');
                option.value = vehiculo.id;
                option.textContent = `${vehiculo.matricula} - ${marcaModelo}`;
                select.appendChild(option);
            });
        }
    });
}

function generarNumeroExpediente() {
    const año = new Date().getFullYear();
    const numero = expedientes.length + 1;
    return `EXP-${año}-${String(numero).padStart(4, '0')}`;
}

function guardarExpediente(event) {
    event.preventDefault();
    document.querySelectorAll('#form-expediente [required]').forEach(el => el.removeAttribute('required'));
    
    const tipo = document.getElementById('expediente-tipo').value;
    if (!tipo) { mostrarAlerta('Por favor, selecciona un tipo de expediente', 'error'); return; }
    
    const expediente = {
        id: Date.now().toString(),
        numero: generarNumeroExpediente(),
        tipo: tipo,
        fecha: new Date().toISOString(),
        estado: 'pendiente_doc',
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
        retencion: parseFloat(document.getElementById('exp-retencion').value) || 0,
        estadoFactura: document.getElementById('exp-estado-factura').value || 'pendiente'
    };
    
    if (tipo === 'transferencia') {
        expediente.vehiculo = document.getElementById('exp-vehiculo').value;
        expediente.vendedor = document.getElementById('exp-vendedor').value;
        expediente.comprador = document.getElementById('exp-comprador').value;
        expediente.precio = document.getElementById('exp-precio').value;
        expediente.fechaOperacion = document.getElementById('exp-fecha-operacion').value;
        expediente.hora = document.getElementById('exp-hora').value;
        expediente.lugar = document.getElementById('exp-lugar').value;
        if (!expediente.vehiculo || !expediente.vendedor || !expediente.comprador) {
            mostrarAlerta('Por favor, completa todos los campos obligatorios', 'error'); return;
        }
    } else if (tipo === 'matriculacion') {
        expediente.titular = document.getElementById('exp-titular-mat').value;
        expediente.vehiculo = document.getElementById('exp-vehiculo-mat').value;
        if (!expediente.titular || !expediente.vehiculo) { mostrarAlerta('Por favor, selecciona el titular y el vehículo', 'error'); return; }
    } else if (tipo === 'baja') {
        expediente.vehiculo = document.getElementById('exp-vehiculo-baja').value;
        expediente.titular = document.getElementById('exp-titular-baja').value;
        expediente.motivoBaja = document.getElementById('exp-motivo-baja').value;
        if (!expediente.vehiculo || !expediente.titular) { mostrarAlerta('Por favor, selecciona el vehículo y el titular', 'error'); return; }
    } else if (tipo === 'duplicado') {
        expediente.vehiculo = document.getElementById('exp-vehiculo-dup').value;
        expediente.titular = document.getElementById('exp-titular-dup').value;
        expediente.documentoDuplicar = document.getElementById('exp-doc-duplicar').value;
        if (!expediente.vehiculo || !expediente.titular) { mostrarAlerta('Por favor, selecciona el vehículo y el titular', 'error'); return; }
    } else if (tipo === 'canje') {
        expediente.titular = document.getElementById('exp-titular-canje').value;
        expediente.origen = document.getElementById('exp-canje-origen').value;
        expediente.pais = (document.getElementById('exp-canje-pais').value || '').toUpperCase();
        expediente.clasePermiso = document.getElementById('exp-canje-clase').value;
        expediente.numeroPermiso = document.getElementById('exp-canje-numero').value;
        expediente.fechaExpedicion = document.getElementById('exp-canje-fecha-exp').value;
        expediente.fechaCaducidad = document.getElementById('exp-canje-fecha-cad').value;
        expediente.localizadorDGT = document.getElementById('exp-canje-localizador').value;
        expediente.recogerColegio = document.getElementById('exp-canje-colegio').value;
        if (!expediente.titular) { mostrarAlerta('Por favor, selecciona el cliente titular', 'error'); return; }
    } else if (tipo === 'vmp') {
        expediente.subtipoVMP = document.getElementById('exp-vmp-subtipo').value;
        expediente.vmpNumSerie = document.getElementById('exp-vmp-numserie').value;
        expediente.vmpMarca = document.getElementById('exp-vmp-marca').value;
        expediente.vmpNumInscripcion = document.getElementById('exp-vmp-numinscripcion').value;
        expediente.vmpFechaInscripcion = document.getElementById('exp-vmp-fechainscripcion').value;
        expediente.vmpNumCertificado = document.getElementById('exp-vmp-numcertificado').value;
        expediente.comprador = document.getElementById('exp-vmp-comprador').value;
        expediente.vendedor = document.getElementById('exp-vmp-vendedor').value || '';
        expediente.representante = document.getElementById('exp-vmp-representante').value || '';
        expediente.vmpMotivoDuplicado = document.getElementById('exp-vmp-motivo-duplicado')?.value || '';
        expediente.vmpTipoBaja = document.getElementById('exp-vmp-tipo-baja')?.value || '';
        if (!expediente.comprador || !expediente.vmpNumSerie || !expediente.subtipoVMP) {
            mostrarAlerta('Por favor, completa los campos obligatorios', 'error'); return;
        }
        if (expediente.subtipoVMP === 'transferencia' && !expediente.vendedor) {
            mostrarAlerta('Para transferencias debes seleccionar un vendedor', 'error'); return;
        }
    }
    
    if (expedienteEditandoId) {
        const index = expedientes.findIndex(e => e.id === expedienteEditandoId);
        if (index !== -1) {
            expediente.id = expedienteEditandoId;
            expediente.numero = expedientes[index].numero;
            expediente.fecha = expedientes[index].fecha;
            expedientes[index] = expediente;
            mostrarAlerta(`✅ Expediente ${expediente.numero} actualizado.`, 'success');
        }
        expedienteEditandoId = null;
    } else {
        expedientes.push(expediente);
        mostrarAlerta(`✅ Expediente ${expediente.numero} creado correctamente.`, 'success');
    }
    
    guardarDatos();
    comprobarVtoTrafico(expediente);
    limpiarFormularioExpediente();
    actualizarDashboard();
    cargarTablaExpedientes();
    
    subirAGoogleSheets().then(() => console.log('✓ Datos sincronizados')).catch(err => console.error(err));
    
    setTimeout(() => {
        document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
        document.querySelectorAll('.nav-tab').forEach(btn => btn.classList.remove('active'));
        document.getElementById('expedientes').classList.add('active');
        document.querySelectorAll('.nav-tab')[3].classList.add('active');
        cargarTablaExpedientes();
    }, 1500);
}

function limpiarFormularioExpediente() {
    document.getElementById('form-expediente').reset();
    ['campos-transferencia','campos-matriculacion','campos-baja','campos-duplicado','campos-canje','campos-vmp'].forEach(id => {
        document.getElementById(id).style.display = 'none';
    });
    ['campos-vmp-vendedor','campos-vmp-representante','campos-vmp-duplicado','campos-vmp-baja'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
}

function cargarTablaExpedientes() {
    const tbody = document.querySelector('#tabla-expedientes tbody');
    tbody.innerHTML = '';
    
    if (expedientes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 40px;">No hay expedientes registrados.</td></tr>';
        return;
    }
    
    expedientes.slice().reverse().forEach(exp => {
        const tr = document.createElement('tr');
        
        let badgeClass = '';
        switch(exp.tipo) {
            case 'transferencia': badgeClass = 'badge-transferencia'; break;
            case 'matriculacion': badgeClass = 'badge-matriculacion'; break;
            case 'baja': badgeClass = 'badge-baja'; break;
            case 'duplicado': badgeClass = 'badge-duplicado'; break;
            case 'canje': badgeClass = 'badge-canje'; break;
            case 'vmp': badgeClass = 'badge-vmp'; break;
        }
        
        let nombreCliente = 'N/A';
        const idCliente = exp.comprador || exp.titular;
        if (idCliente) {
            const cliente = clientes.find(c => c.id == idCliente);
            if (cliente) {
                nombreCliente = cliente.tipoCliente === 'juridica'
                    ? cliente.razonSocial || ''
                    : `${cliente.nombre || ''} ${cliente.apellido1 || ''}`.trim();
            }
        }
        
        let matricula = 'N/A';
        if (exp.tipo === 'canje') {
            matricula = exp.clasePermiso ? `Permiso ${exp.clasePermiso}` : 'Canje';
        } else if (exp.tipo === 'vmp') {
            matricula = exp.vmpMarca ? `🛴 ${exp.vmpMarca}` : 'VMP';
        } else {
            const vehiculo = vehiculos.find(v => v.id === exp.vehiculo);
            matricula = vehiculo ? vehiculo.matricula : 'N/A';
        }
        
        const estadoInfo = obtenerEstiloEstado(exp.estado);
        
        tr.innerHTML = `
            <td><strong>${exp.numero}</strong></td>
            <td><span class="expediente-badge ${badgeClass}">${exp.tipo.toUpperCase()}</span></td>
            <td>${nombreCliente}</td>
            <td>${matricula}</td>
            <td>${formatearFecha(exp.fecha)}</td>
            <td><span style="${estadoInfo.estilo}" onclick="cambiarEstadoExpediente('${exp.id}')" title="Clic para cambiar estado">${estadoInfo.texto}</span></td>
            <td>
                <div class="action-buttons">
                    <button class="action-btn btn-primary" onclick="verExpediente('${exp.id}')">Ver</button>
                    <button class="action-btn btn-success" onclick="exportarAHermes('${exp.id}')">📤 Hermes</button>
                    <button class="action-btn btn-success" onclick="generarPDF('${exp.id}')">PDF</button>
                    <button class="action-btn btn-warning" onclick="modificarExpediente('${exp.id}')" style="background: #ff9800; color: white;">✏️ Modificar</button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function buscarExpedientes() {
    const busqueda = document.getElementById('buscar-expediente').value.toLowerCase();
    const tbody = document.querySelector('#tabla-expedientes tbody');
    tbody.innerHTML = '';
    
    const resultados = expedientes.filter(exp => {
        const vehiculo = vehiculos.find(v => v.id == exp.vehiculo);
        const matricula = vehiculo ? vehiculo.matricula.toLowerCase() : '';
        let nombreCliente = '';
        const idCliente = exp.comprador || exp.titular;
        if (idCliente) {
            const cliente = clientes.find(c => c.id == idCliente);
            if (cliente) {
                nombreCliente = cliente.tipoCliente === 'juridica'
                    ? (cliente.razonSocial || '').toLowerCase()
                    : `${cliente.nombre || ''} ${cliente.apellido1 || ''}`.toLowerCase();
            }
        }
        return exp.numero.toLowerCase().includes(busqueda) || matricula.includes(busqueda) || nombreCliente.includes(busqueda);
    });
    
    if (resultados.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 40px;">No se encontraron expedientes</td></tr>';
        return;
    }
    
    resultados.slice().reverse().forEach(exp => {
        const tr = document.createElement('tr');
        let badgeClass = '';
        switch(exp.tipo) {
            case 'transferencia': badgeClass = 'badge-transferencia'; break;
            case 'matriculacion': badgeClass = 'badge-matriculacion'; break;
            case 'baja': badgeClass = 'badge-baja'; break;
            case 'duplicado': badgeClass = 'badge-duplicado'; break;
            case 'canje': badgeClass = 'badge-canje'; break;
            case 'vmp': badgeClass = 'badge-vmp'; break;
        }
        let nombreCliente = 'N/A';
        const idCliente = exp.comprador || exp.titular;
        if (idCliente) {
            const cliente = clientes.find(c => c.id == idCliente);
            if (cliente) {
                nombreCliente = cliente.tipoCliente === 'juridica'
                    ? cliente.razonSocial || ''
                    : `${cliente.nombre || ''} ${cliente.apellido1 || ''}`.trim();
            }
        }
        let matricula = 'N/A';
        if (exp.tipo === 'canje') { matricula = exp.clasePermiso ? `Permiso ${exp.clasePermiso}` : 'Canje'; }
        else if (exp.tipo === 'vmp') { matricula = exp.vmpMarca ? `🛴 ${exp.vmpMarca}` : 'VMP'; }
        else { const vehiculo = vehiculos.find(v => v.id === exp.vehiculo); matricula = vehiculo ? vehiculo.matricula : 'N/A'; }
        const estadoInfo = obtenerEstiloEstado(exp.estado);
        tr.innerHTML = `
            <td><strong>${exp.numero}</strong></td>
            <td><span class="expediente-badge ${badgeClass}">${exp.tipo.toUpperCase()}</span></td>
            <td>${nombreCliente}</td><td>${matricula}</td>
            <td>${formatearFecha(exp.fecha)}</td>
            <td><span style="${estadoInfo.estilo}" onclick="cambiarEstadoExpediente('${exp.id}')">${estadoInfo.texto}</span></td>
            <td>
                <div class="action-buttons">
                    <button class="action-btn btn-primary" onclick="verExpediente('${exp.id}')">Ver</button>
                    <button class="action-btn btn-success" onclick="exportarAHermes('${exp.id}')">📤 Hermes</button>
                    <button class="action-btn btn-success" onclick="generarPDF('${exp.id}')">PDF</button>
                    <button class="action-btn btn-warning" onclick="modificarExpediente('${exp.id}')" style="background: #ff9800; color: white;">✏️ Modificar</button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function verExpediente(id) {
    const expediente = expedientes.find(e => e.id === id);
    if (!expediente) return;
    let detalles = `Expediente: ${expediente.numero}\nTipo: ${expediente.tipo.toUpperCase()}\nFecha: ${formatearFecha(expediente.fecha)}\n`;
    if (expediente.tipo === 'transferencia') {
        const vendedor = clientes.find(c => c.id === expediente.vendedor);
        const comprador = clientes.find(c => c.id === expediente.comprador);
        const vehiculo = vehiculos.find(v => v.id === expediente.vehiculo);
        detalles += `Vehículo: ${vehiculo ? vehiculo.matricula + ' - ' + vehiculo.marca : 'N/A'}\n`;
        detalles += `Vendedor: ${vendedor ? vendedor.nombre + ' ' + (vendedor.apellido1 || '') : 'N/A'}\n`;
        detalles += `Comprador: ${comprador ? comprador.nombre + ' ' + (comprador.apellido1 || '') : 'N/A'}\n`;
        detalles += `Precio: ${expediente.precio ? expediente.precio + '€' : 'N/A'}\n`;
    }
    if (expediente.observaciones) detalles += `Observaciones: ${expediente.observaciones}`;
    alert(detalles);
}

let expedienteEditandoId = null;

function modificarExpediente(id) {
    const expediente = expedientes.find(e => e.id == id);
    if (!expediente) { mostrarAlerta('No se encontró el expediente', 'error'); return; }
    expedienteEditandoId = id;
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.nav-tab').forEach(btn => btn.classList.remove('active'));
    document.getElementById('nuevo-expediente').classList.add('active');
    document.querySelectorAll('.nav-tab')[4].classList.add('active');
    document.getElementById('expediente-tipo').value = expediente.tipo;
    mostrarCamposExpedienteOriginal();
    setTimeout(() => {
        if (expediente.tipo === 'transferencia') {
            if (document.getElementById('exp-vehiculo')) document.getElementById('exp-vehiculo').value = expediente.vehiculo || '';
            if (document.getElementById('exp-vendedor')) document.getElementById('exp-vendedor').value = expediente.vendedor || '';
            if (document.getElementById('exp-comprador')) document.getElementById('exp-comprador').value = expediente.comprador || '';
            if (document.getElementById('exp-precio')) document.getElementById('exp-precio').value = expediente.precio || '';
            if (document.getElementById('exp-fecha-operacion')) document.getElementById('exp-fecha-operacion').value = expediente.fechaOperacion || '';
            if (document.getElementById('exp-hora')) document.getElementById('exp-hora').value = expediente.hora || '';
            if (document.getElementById('exp-lugar')) document.getElementById('exp-lugar').value = expediente.lugar || '';
        } else if (expediente.tipo === 'matriculacion') {
            if (document.getElementById('exp-titular-mat')) document.getElementById('exp-titular-mat').value = expediente.titular || '';
            if (document.getElementById('exp-vehiculo-mat')) document.getElementById('exp-vehiculo-mat').value = expediente.vehiculo || '';
        } else if (expediente.tipo === 'baja') {
            if (document.getElementById('exp-vehiculo-baja')) document.getElementById('exp-vehiculo-baja').value = expediente.vehiculo || '';
            if (document.getElementById('exp-titular-baja')) document.getElementById('exp-titular-baja').value = expediente.titular || '';
            if (document.getElementById('exp-motivo-baja')) document.getElementById('exp-motivo-baja').value = expediente.motivoBaja || '';
        } else if (expediente.tipo === 'canje') {
            if (document.getElementById('exp-titular-canje')) document.getElementById('exp-titular-canje').value = expediente.titular || expediente.comprador || '';
            if (document.getElementById('exp-canje-origen')) document.getElementById('exp-canje-origen').value = expediente.origen || '';
            if (document.getElementById('exp-canje-pais')) document.getElementById('exp-canje-pais').value = expediente.pais || '';
            if (document.getElementById('exp-canje-clase')) document.getElementById('exp-canje-clase').value = expediente.clasePermiso || '';
            if (document.getElementById('exp-canje-numero')) document.getElementById('exp-canje-numero').value = expediente.numeroPermiso || '';
            if (document.getElementById('exp-canje-localizador')) document.getElementById('exp-canje-localizador').value = expediente.localizadorDGT || '';
        }
        document.getElementById('exp-tasa-trafico').value = expediente.tasaTrafico || 0;
        document.getElementById('exp-impuesto').value = expediente.impuesto || 0;
        document.getElementById('exp-honorarios').value = expediente.honorarios || 0;
        document.getElementById('exp-pago-cliente').value = expediente.pagoCliente || 0;
        document.getElementById('exp-es-empresa').checked = expediente.esEmpresa || false;
        calcularTotales();
        document.getElementById('exp-observaciones').value = expediente.observaciones || '';
        mostrarAlerta(`✏️ Editando expediente ${expediente.numero}`, 'success');
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
    const estadoEncontrado = ESTADOS_EXPEDIENTE.find(e => e.valor === estado);
    if (estadoEncontrado) {
        return {
            texto: estadoEncontrado.texto,
            estilo: `color: white; background-color: ${estadoEncontrado.color}; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 12px;`
        };
    }
    return { texto: '📋 Pendiente Doc', estilo: 'color: white; background-color: #ff9800; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 12px;' };
}

function cambiarEstadoExpediente(id) {
    const expediente = expedientes.find(e => e.id === id);
    if (!expediente) return;
    let opciones = ESTADOS_EXPEDIENTE.map((e, i) => `${i + 1} - ${e.texto}`).join('\n');
    const seleccion = prompt(`Cambiar estado del expediente ${expediente.numero}\n\nEstado actual: ${obtenerEstiloEstado(expediente.estado).texto}\n\nSelecciona nuevo estado:\n\n${opciones}\n\nEscribe el número:`);
    if (seleccion) {
        const indice = parseInt(seleccion) - 1;
        if (indice >= 0 && indice < ESTADOS_EXPEDIENTE.length) {
            expediente.estado = ESTADOS_EXPEDIENTE[indice].valor;
            guardarDatos();
            cargarTablaExpedientes();
            actualizarDashboard();
            mostrarAlerta(`Estado cambiado a: ${ESTADOS_EXPEDIENTE[indice].texto}`, 'success');
            comprobarVtoTrafico(expediente);
            subirAGoogleSheets().then(() => console.log('✓ Estado sincronizado')).catch(err => console.error(err));
        } else { mostrarAlerta('Opción no válida', 'error'); }
    }
}

function generarPDF(id) {
    const expediente = expedientes.find(e => e.id === id);
    if (!expediente) { mostrarAlerta('No se encontró el expediente', 'error'); return; }
    generarPDFExpediente(id);
}

// ==================== UTILIDADES ====================

function formatearFecha(fechaISO) {
    const fecha = new Date(fechaISO);
    const dia = String(fecha.getDate()).padStart(2, '0');
    const mes = String(fecha.getMonth() + 1).padStart(2, '0');
    const año = fecha.getFullYear();
    return `${dia}/${mes}/${año}`;
}

function mostrarAlerta(mensaje, tipo) {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${tipo === 'success' ? 'success' : 'error'}`;
    alertDiv.textContent = mensaje;
    alertDiv.style.position = 'fixed';
    alertDiv.style.top = '20px';
    alertDiv.style.right = '20px';
    alertDiv.style.zIndex = '9999';
    alertDiv.style.minWidth = '300px';
    document.body.appendChild(alertDiv);
    setTimeout(() => alertDiv.remove(), 3000);
}

let clienteEditandoId = null;
let vehiculoEditandoId = null;

function editarCliente(id) {
    const cliente = clientes.find(c => c.id === id);
    if (!cliente) { mostrarAlerta('Cliente no encontrado', 'error'); return; }
    clienteEditandoId = id;
    document.getElementById('formulario-cliente').style.display = 'block';
    const formTitle = document.querySelector('#formulario-cliente h3');
    if (formTitle) formTitle.textContent = '✏️ Editar Cliente';
    const tipoClienteSelect = document.getElementById('cliente-tipo');
    if (tipoClienteSelect) { tipoClienteSelect.value = cliente.tipoCliente || 'fisica'; cambiarTipoCliente(); }
    if (cliente.tipoCliente === 'juridica') {
        document.getElementById('cliente-cif').value = cliente.nif || '';
        document.getElementById('cliente-razon-social').value = cliente.nombre || '';
        document.getElementById('cliente-dni-representante').value = cliente.dniRepresentante || '';
        document.getElementById('cliente-nombre-representante').value = cliente.nombreRepresentante || '';
        document.getElementById('cliente-apellido1-representante').value = cliente.apellido1Representante || '';
        document.getElementById('cliente-apellido2-representante').value = cliente.apellido2Representante || '';
        document.getElementById('cliente-dni-representante2').value = cliente.dniRepresentante2 || '';
        document.getElementById('cliente-nombre-representante2').value = cliente.nombreRepresentante2 || '';
        document.getElementById('cliente-apellido1-representante2').value = cliente.apellido1Representante2 || '';
        document.getElementById('cliente-apellido2-representante2').value = cliente.apellido2Representante2 || '';
    } else {
        document.getElementById('cliente-nif').value = cliente.nif || '';
        document.getElementById('cliente-nombre').value = cliente.nombre || '';
        document.getElementById('cliente-apellido1').value = cliente.apellido1 || '';
        document.getElementById('cliente-apellido2').value = cliente.apellido2 || '';
        document.getElementById('cliente-fecha-nacimiento').value = cliente.fechaNacimiento || '';
        const sexoSelect = document.getElementById('cliente-sexo');
        if (sexoSelect) sexoSelect.value = cliente.sexo || 'V';
    }
    document.getElementById('cliente-telefono').value = cliente.telefono || '';
    document.getElementById('cliente-email').value = cliente.email || '';
    const tipoViaSelect = document.getElementById('cliente-tipo-via');
    if (tipoViaSelect) tipoViaSelect.value = cliente.tipoVia || '';
    document.getElementById('cliente-nombre-via').value = cliente.nombreVia || '';
    document.getElementById('cliente-numero').value = cliente.numero || '';
    document.getElementById('cliente-bloque').value = cliente.bloque || '';
    document.getElementById('cliente-portal').value = cliente.portal || '';
    document.getElementById('cliente-escalera').value = cliente.escalera || '';
    document.getElementById('cliente-planta').value = cliente.planta || '';
    document.getElementById('cliente-puerta').value = cliente.puerta || '';
    document.getElementById('cliente-cp').value = cliente.cp || '';
    const provinciaSelect = document.getElementById('cliente-provincia');
    if (provinciaSelect) provinciaSelect.value = cliente.codigoProvincia || '';
    document.getElementById('cliente-codigo-municipio').value = cliente.codigoMunicipio || '';
    document.getElementById('cliente-localidad').value = cliente.localidad || '';
    document.getElementById('formulario-cliente').scrollIntoView({ behavior: 'smooth' });
    mostrarAlerta('Editando cliente: ' + (cliente.nombre || cliente.nif), 'success');
}

function editarVehiculo(id) {
    const vehiculo = vehiculos.find(v => v.id === id);
    if (!vehiculo) { mostrarAlerta('Vehículo no encontrado', 'error'); return; }
    vehiculoEditandoId = id;
    document.getElementById('formulario-vehiculo').style.display = 'block';
    const formTitle = document.querySelector('#formulario-vehiculo h3');
    if (formTitle) formTitle.textContent = '✏️ Editar Vehículo';
    document.getElementById('vehiculo-matricula').value = vehiculo.matricula || '';
    document.getElementById('vehiculo-bastidor').value = vehiculo.bastidor || '';
    document.getElementById('vehiculo-marca').value = vehiculo.marca || '';
    document.getElementById('vehiculo-modelo').value = vehiculo.modelo || '';
    document.getElementById('vehiculo-fecha-matriculacion').value = vehiculo.fechaMatriculacion || '';
    document.getElementById('vehiculo-kilometros').value = vehiculo.kilometros || '';
    document.getElementById('formulario-vehiculo').scrollIntoView({ behavior: 'smooth' });
    mostrarAlerta('Editando vehículo: ' + vehiculo.matricula, 'success');
}

// ==================== EXPORTACIÓN A PLATAFORMA HERMES ====================

function exportarAHermes(expedienteId) {
    const expediente = expedientes.find(e => e.id === expedienteId);
    if (!expediente) { mostrarAlerta('No se encontró el expediente', 'error'); return; }
    const vehiculo = vehiculos.find(v => v.id === expediente.vehiculo);
    const vendedor = clientes.find(c => c.id === expediente.vendedor);
    const comprador = clientes.find(c => c.id === expediente.comprador);
    if (!vehiculo || !vendedor || !comprador) { mostrarAlerta('Faltan datos del expediente', 'error'); return; }
    const tipoTramite = prompt('Tipo de transferencia:\n\n1 - Conjunta por Venta\n2 - Conjunta por Herencia\n3 - Notificación entre Particulares\n\nEscribe el número:');
    let tipo, motivo, submotivo;
    if (tipoTramite === '1') { tipo = '1'; motivo = '11'; submotivo = '111'; }
    else if (tipoTramite === '2') { tipo = '1'; motivo = '11'; submotivo = '113'; }
    else if (tipoTramite === '3') { tipo = '2'; motivo = '21'; submotivo = ''; }
    else { mostrarAlerta('Opción no válida', 'error'); return; }
    const xml = generarXMLHermes(expediente, vehiculo, vendedor, comprador, tipo, motivo, submotivo);
    const blob = new Blob([xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Hermes_Exp_${expediente.numero}_${vehiculo.matricula}.xml`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    mostrarAlerta('✅ XML generado. Ahora ve a Hermes > Transferencias > Importar', 'success');
}

function generarXMLHermes(expediente, vehiculo, vendedor, comprador, tipo, motivo, submotivo) {
    const formatFecha = (fecha) => {
        if (!fecha) return '';
        const d = new Date(fecha);
        return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
    };
    const escape = (str) => {
        if (!str) return '';
        return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
    };
    const provinciaLetraANumero = {
        'AL':'04','GR':'18','J':'23','CA':'11','CO':'14','H':'21','MA':'29','SE':'41',
        'A':'03','AB':'02','AV':'05','B':'08','BA':'06','BI':'48','BU':'09','C':'15',
        'CC':'10','CE':'51','CR':'13','CS':'12','CU':'16','GI':'17','GU':'19','HU':'22',
        'LE':'24','L':'25','LO':'26','LU':'27','M':'28','ML':'52','MU':'30','NA':'31',
        'O':'33','OR':'32','P':'34','PM':'07','PO':'36','S':'39','SA':'37','SG':'40',
        'SO':'42','SS':'20','T':'43','TE':'44','TF':'38','TO':'45','V':'46','VA':'47',
        'VI':'01','Z':'50','ZA':'49','GC':'35'
    };
    const tipoViaACodigo = {
        'Calle':'CL','CALLE':'CL','Avenida':'AV','AVENIDA':'AV','Plaza':'PZ','PLAZA':'PZ',
        'Paseo':'PS','PASEO':'PS','Carretera':'CTRA','CARRETERA':'CTRA','Camino':'CMNO','CAMINO':'CMNO',
        'Urbanización':'URB','URBANIZACIÓN':'URB','Travesía':'TRAV','TRAVESÍA':'TRAV',
        'Callejón':'CJON','CALLEJÓN':'CJON','Glorieta':'GLTA','GLORIETA':'GLTA','Ronda':'RONDA'
    };
    const codigoProvinciaNumerico = provinciaLetraANumero[comprador.codigoProvincia] || comprador.codigoProvincia;
    let tipoViaComprador = comprador.tipoVia || '';
    if (tipoViaACodigo[tipoViaComprador]) tipoViaComprador = tipoViaACodigo[tipoViaComprador];
    if (tipoViaComprador.length > 5) tipoViaComprador = tipoViaComprador.substring(0, 5);

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<LISTA_SOLICITUDES>\n\t<SOLICITUD>\n';
    xml += '\t\t<DATOS_EXPEDIENTE>\n';
    xml += '\t\t\t<ID_GESTOR>493</ID_GESTOR>\n';
    xml += '\t\t\t<TIPO_TRAMITE>' + tipo + '</TIPO_TRAMITE>\n';
    xml += '\t\t\t<MOTIVO_TRANSMISION>' + motivo + '</MOTIVO_TRANSMISION>\n';
    if (submotivo) xml += '\t\t\t<SUBMOTIVO_TRANSMISION>' + submotivo + '</SUBMOTIVO_TRANSMISION>\n';
    xml += '\t\t\t<JEFATURA>AL</JEFATURA>\n\t\t\t<SUCURSAL>1</SUCURSAL>\n\t\t\t<IMPRESION_PERMISO_CIRCULACION>SI</IMPRESION_PERMISO_CIRCULACION>\n\t\t</DATOS_EXPEDIENTE>\n';
    xml += '\t\t<DATOS_VEHICULO>\n\t\t\t<DATOS_MATRICULACION>\n';
    xml += '\t\t\t\t<MATRICULA>' + escape(vehiculo.matricula) + '</MATRICULA>\n';
    if (vehiculo.fechaMatriculacion) xml += '\t\t\t\t<FECHA_MATRICULACION>' + formatFecha(vehiculo.fechaMatriculacion) + '</FECHA_MATRICULACION>\n';
    xml += '\t\t\t</DATOS_MATRICULACION>\n\t\t\t<DATOS_SERVICIO>\n\t\t\t\t<SERVICIO_ACTUAL>B00</SERVICIO_ACTUAL>\n\t\t\t\t<CAMBIO_SERVICIO>NO</CAMBIO_SERVICIO>\n\t\t\t</DATOS_SERVICIO>\n\t\t\t<RENTING>NO</RENTING>\n\t\t\t<TIPO_VEHICULO>40</TIPO_VEHICULO>\n\t\t</DATOS_VEHICULO>\n';
    // Vendedor
    xml += '\t\t<TITULAR_TRANSMITENTE>\n\t\t\t<DATOS_TRANSMITENTE>\n\t\t\t\t<DATOS_FILIACION>\n';
    if (vendedor.tipoCliente === 'juridica') {
        xml += '\t\t\t\t\t<PERSONA_JURIDICA>\n\t\t\t\t\t\t<RAZON_SOCIAL>' + escape(vendedor.nombre) + '</RAZON_SOCIAL>\n\t\t\t\t\t</PERSONA_JURIDICA>\n';
    } else {
        xml += '\t\t\t\t\t<PERSONA_FISICA>\n\t\t\t\t\t\t<NOMBRE>' + escape(vendedor.nombre) + '</NOMBRE>\n';
        xml += '\t\t\t\t\t\t<PRIMER_APELLIDO>' + escape(vendedor.apellido1 || '') + '</PRIMER_APELLIDO>\n';
        xml += '\t\t\t\t\t\t<SEGUNDO_APELLIDO>' + escape(vendedor.apellido2 || '') + '</SEGUNDO_APELLIDO>\n';
        if (vendedor.fechaNacimiento) xml += '\t\t\t\t\t\t<FECHA_NACIMIENTO>' + formatFecha(vendedor.fechaNacimiento) + '</FECHA_NACIMIENTO>\n';
        xml += '\t\t\t\t\t</PERSONA_FISICA>\n';
    }
    xml += '\t\t\t\t</DATOS_FILIACION>\n';
    xml += '\t\t\t\t<SEXO>' + (vendedor.tipoCliente === 'juridica' ? 'X' : (vendedor.sexo || 'V')) + '</SEXO>\n';
    xml += '\t\t\t\t<DOI>' + escape(vendedor.nif) + '</DOI>\n\t\t\t</DATOS_TRANSMITENTE>\n\t\t</TITULAR_TRANSMITENTE>\n';
    // Comprador
    xml += '\t\t<TITULAR_ADQUIRENTE>\n\t\t\t<DATOS_ADQUIRENTE>\n\t\t\t\t<DATOS_FILIACION>\n';
    if (comprador.tipoCliente === 'juridica') {
        xml += '\t\t\t\t\t<PERSONA_JURIDICA>\n\t\t\t\t\t\t<RAZON_SOCIAL>' + escape(comprador.nombre) + '</RAZON_SOCIAL>\n\t\t\t\t\t</PERSONA_JURIDICA>\n';
    } else {
        xml += '\t\t\t\t\t<PERSONA_FISICA>\n\t\t\t\t\t\t<NOMBRE>' + escape(comprador.nombre) + '</NOMBRE>\n';
        xml += '\t\t\t\t\t\t<PRIMER_APELLIDO>' + escape(comprador.apellido1 || '') + '</PRIMER_APELLIDO>\n';
        xml += '\t\t\t\t\t\t<SEGUNDO_APELLIDO>' + escape(comprador.apellido2 || '') + '</SEGUNDO_APELLIDO>\n';
        if (comprador.fechaNacimiento) xml += '\t\t\t\t\t\t<FECHA_NACIMIENTO>' + formatFecha(comprador.fechaNacimiento) + '</FECHA_NACIMIENTO>\n';
        xml += '\t\t\t\t\t</PERSONA_FISICA>\n';
    }
    xml += '\t\t\t\t</DATOS_FILIACION>\n';
    xml += '\t\t\t\t<SEXO>' + (comprador.tipoCliente === 'juridica' ? 'X' : (comprador.sexo || 'V')) + '</SEXO>\n';
    xml += '\t\t\t\t<DOI>' + escape(comprador.nif) + '</DOI>\n\t\t\t</DATOS_ADQUIRENTE>\n';
    xml += '\t\t\t<ACTUALIZACION_DOMICILIO>NO</ACTUALIZACION_DOMICILIO>\n\t\t\t<DOMICILIO>\n';
    if (comprador.codigoMunicipio) xml += '\t\t\t\t<MUNICIPIO>' + escape(comprador.codigoMunicipio) + '</MUNICIPIO>\n';
    if (comprador.localidad) xml += '\t\t\t\t<LOCALIDAD>' + escape(comprador.localidad.toUpperCase()) + '</LOCALIDAD>\n';
    if (codigoProvinciaNumerico) xml += '\t\t\t\t<PROVINCIA>' + escape(codigoProvinciaNumerico) + '</PROVINCIA>\n';
    if (comprador.cp) xml += '\t\t\t\t<CODIGO_POSTAL>' + escape(comprador.cp) + '</CODIGO_POSTAL>\n';
    if (tipoViaComprador) xml += '\t\t\t\t<TIPO_VIA>' + escape(tipoViaComprador) + '</TIPO_VIA>\n';
    if (comprador.nombreVia) xml += '\t\t\t\t<NOMBRE_VIA>' + escape(comprador.nombreVia.toUpperCase()) + '</NOMBRE_VIA>\n';
    if (comprador.numero) xml += '\t\t\t\t<NUMERO>' + escape(comprador.numero) + '</NUMERO>\n';
    xml += '\t\t\t\t<KILOMETRO>0</KILOMETRO>\n\t\t\t\t<HECTOMETRO>0</HECTOMETRO>\n\t\t\t\t<BLOQUE/>\n\t\t\t\t<PORTAL/>\n\t\t\t\t<ESCALERA/>\n';
    xml += (comprador.planta ? '\t\t\t\t<PLANTA>' + escape(comprador.planta) + '</PLANTA>\n' : '\t\t\t\t<PLANTA/>\n');
    xml += (comprador.puerta ? '\t\t\t\t<PUERTA>' + escape(comprador.puerta) + '</PUERTA>\n' : '\t\t\t\t<PUERTA/>\n');
    xml += '\t\t\t\t<PAIS>ESP</PAIS>\n\t\t\t</DOMICILIO>\n\t\t</TITULAR_ADQUIRENTE>\n';
    xml += '\t\t<ACREDITACION_DERECHO>\n\t\t\t<SOLICITUD>SI</SOLICITUD>\n\t\t\t<CONSENTIMIENTO>N/A</CONSENTIMIENTO>\n\t\t\t<MOTIVO_TRANSMISION>\n';
    if (submotivo === '111') xml += '\t\t\t\t<CONTRATO_COMPRAVENTA>SI</CONTRATO_COMPRAVENTA>\n';
    else if (submotivo === '113') xml += '\t\t\t\t<HERENCIA>SI</HERENCIA>\n';
    xml += '\t\t\t</MOTIVO_TRANSMISION>\n\t\t</ACREDITACION_DERECHO>\n';
    xml += '\t\t<ACREDITACION_FISCAL>\n\t\t\t<ITP>\n\t\t\t\t<ACREDITACION_NO_OBLIGACION>\n\t\t\t\t\t<MODELO>620</MODELO>\n\t\t\t\t\t<NO_OBLIGACION>SI</NO_OBLIGACION>\n\t\t\t\t</ACREDITACION_NO_OBLIGACION>\n\t\t\t</ITP>\n\t\t\t<DUA>NO</DUA>\n\t\t\t<IVTM>\n\t\t\t\t<ALTA_IVTM>NO</ALTA_IVTM>\n\t\t\t</IVTM>\n\t\t</ACREDITACION_FISCAL>\n';
    xml += '\t\t<ACREDITACION_ACTIVIDAD>\n\t\t\t<VEHICULOS_AGRICOLAS>NO</VEHICULOS_AGRICOLAS>\n\t\t</ACREDITACION_ACTIVIDAD>\n';
    xml += '\t</SOLICITUD>\n</LISTA_SOLICITUDES>\n';
    return xml;
}

// ==================== FUNCIONES AUXILIARES VMP ====================

function mostrarCamposVMPSubtipo() {
    const subtipo = document.getElementById('exp-vmp-subtipo').value;
    document.getElementById('campos-vmp-vendedor').style.display = 'none';
    document.getElementById('campos-vmp-duplicado').style.display = 'none';
    document.getElementById('campos-vmp-baja').style.display = 'none';
    if (subtipo === 'transferencia') document.getElementById('campos-vmp-vendedor').style.display = 'block';
    else if (subtipo === 'duplicado') document.getElementById('campos-vmp-duplicado').style.display = 'block';
    else if (subtipo === 'baja') document.getElementById('campos-vmp-baja').style.display = 'block';
}

function toggleRepresentanteVMP() {
    const checkbox = document.getElementById('exp-vmp-tiene-representante');
    const campos = document.getElementById('campos-vmp-representante');
    if (checkbox.checked) { campos.style.display = 'block'; }
    else { campos.style.display = 'none'; document.getElementById('exp-vmp-representante').value = ''; }
}

// ==================== SINCRONIZACIÓN CON GOOGLE SHEETS ====================

async function subirAGoogleSheets() {
    if (!GOOGLE_SHEETS_URL) { console.warn('URL de Sheets no cargada aún'); return; }
    mostrarAlerta('⏳ Subiendo datos a Google Sheets...', 'success');
    
    try {
        await subirHoja('Clientes', clientes, [
            'id','tipoCliente','nif','nombre','apellido1','apellido2','fechaNacimiento','sexo','telefono','email',
            'tipoVia','nombreVia','numero','bloque','portal','escalera','planta','puerta',
            'cp','codigoProvincia','codigoMunicipio','localidad',
            'dniRepresentante','nombreRepresentante','apellido1Representante','apellido2Representante',
            'dniRepresentante2','nombreRepresentante2','apellido1Representante2','apellido2Representante2'
        ]);
        await subirHoja('Vehiculos', vehiculos, [
            'id','matricula','marca','modelo','bastidor','kilometros','fechaMatriculacion','servicio','seguroHasta','itv'
        ]);
        const expedientesParaSheets = expedientes.map(exp => {
            const idCliente = exp.comprador || exp.titular || '';
            const cliente = clientes.find(c => c.id == idCliente);
            let nombreCliente = '';
            if (cliente) nombreCliente = cliente.tipoCliente === 'juridica' ? (cliente.razonSocial || '') : `${cliente.nombre||''} ${cliente.apellido1||''} ${cliente.apellido2||''}`.trim();
            const idVendedor = exp.vendedor || '';
            const vendedor = clientes.find(c => c.id == idVendedor);
            let nombreVendedor = '';
            if (vendedor) nombreVendedor = vendedor.tipoCliente === 'juridica' ? (vendedor.razonSocial || '') : `${vendedor.nombre||''} ${vendedor.apellido1||''} ${vendedor.apellido2||''}`.trim();
            const idVehiculo = exp.vehiculo || '';
            const vehiculo = vehiculos.find(v => v.id == idVehiculo);
            return { ...exp, vendedor: idVendedor, comprador: idCliente, vehiculo: idVehiculo, nombreVendedor, nombreComprador: nombreCliente, matriculaVehiculo: vehiculo ? vehiculo.matricula : '' };
        });
        await subirHoja('Expedientes', expedientesParaSheets, [
            'id','numero','fecha','tipo','estado','vendedor','nombreVendedor','comprador','nombreComprador','vehiculo','matriculaVehiculo',
            'precio','observaciones','tasaTrafico','impuesto','honorarios','ivaHonorarios','totalSuplidos','totalFactura','pagoCliente','difHonorarios','esEmpresa','retencion'
        ]);
        mostrarAlerta('✅ Datos subidos correctamente a Google Sheets', 'success');
    } catch (error) {
        console.error('Error al subir:', error);
        mostrarAlerta('❌ Error al subir datos: ' + error.message, 'error');
    }
}

async function subirHoja(nombreHoja, datos, columnas) {
    if (!GOOGLE_SHEETS_URL) return;
    const filas = [columnas];
    datos.forEach(item => { filas.push(columnas.map(col => item[col] || '')); });
    const response = await fetch(GOOGLE_SHEETS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ hoja: nombreHoja, datos: filas })
    });
    const resultado = await response.json();
    console.log(`Hoja ${nombreHoja}:`, resultado);
    return resultado.success;
}

async function descargarDeGoogleSheets() {
    if (!GOOGLE_SHEETS_URL) { mostrarAlerta('Config central no cargada aún', 'error'); return; }
    mostrarAlerta('⏳ Descargando datos de Google Sheets...', 'success');
    try {
        const clientesData = await descargarHoja('Clientes');
        if (clientesData && clientesData.length > 0) {
            clientes = clientesData.map(c => { const obj = {}; for (const k in c) obj[k] = (c[k]===null||c[k]===undefined||c[k]==='') ? '' : String(c[k]); return obj; });
        }
        const vehiculosData = await descargarHoja('Vehiculos');
        if (vehiculosData && vehiculosData.length > 0) {
            vehiculos = vehiculosData.map(v => { const obj = {}; for (const k in v) obj[k] = (v[k]===null||v[k]===undefined||v[k]==='') ? '' : String(v[k]); return obj; });
        }
        const expedientesData = await descargarHoja('Expedientes');
        if (expedientesData && expedientesData.length > 0) {
            expedientes = expedientesData.map(exp => { const obj = {}; for (const k in exp) obj[k] = (exp[k]===null||exp[k]===undefined||exp[k]==='') ? '' : String(exp[k]); return obj; });
        }
        guardarDatos();
        actualizarDashboard(); cargarTablaClientes(); cargarTablaVehiculos(); cargarTablaExpedientes(); cargarSelectsExpedientes();
        mostrarAlerta('✅ Datos descargados correctamente', 'success');
    } catch (error) {
        console.error('Error al descargar:', error);
        mostrarAlerta('❌ Error al descargar datos: ' + error.message, 'error');
    }
}

async function descargarHoja(nombreHoja) {
    if (!GOOGLE_SHEETS_URL) return [];
    const response = await fetch(GOOGLE_SHEETS_URL + '?hoja=' + nombreHoja);
    const data = await response.json();
    if (!data || data.length === 0) return [];
    return data.filter(obj => { const id = obj.id; return id !== null && id !== undefined && id !== '' && id !== 0 && String(id).trim() !== ''; });
}

function mostrarMenuSync() {
    const menu = document.getElementById('menu-sync');
    menu.style.display = (menu.style.display === 'none' || menu.style.display === '') ? 'block' : 'none';
}

// ==================== TARIFAS ====================

const TARIFAS_DEFAULT = {
    transferencia: { codigo: 'TRF', tasa: 65.23, impuesto: 0, honorarios: 70.00 },
    baja: { codigo: 'BAJ', tasa: 14.72, impuesto: 0, honorarios: 40.00 },
    duplicado: { codigo: 'DUP', tasa: 23.23, impuesto: 0, honorarios: 40.00 },
    canje: { codigo: 'CNJ', tasa: 40.97, impuesto: 0, honorarios: 200.00 },
    matriculacion: { codigo: 'MAT', tasa: 109.33, impuesto: 576.00, honorarios: 150.00 },
    vmp: { codigo: 'VMP', tasa: 15.00, impuesto: 0, honorarios: 35.00 }
};

function cargarTarifas() {
    const tarifasGuardadas = localStorage.getItem('gestoria_tarifas');
    if (tarifasGuardadas) return JSON.parse(tarifasGuardadas);
    return { ...TARIFAS_DEFAULT, iva: 21, retencion: 15 };
}

function guardarTarifas() {
    const tarifas = {
        transferencia: { codigo:'TRF', tasa:parseFloat(document.getElementById('tarifa-trf-tasa')?.value)||65.23, impuesto:0, honorarios:parseFloat(document.getElementById('tarifa-trf-honorarios')?.value)||70.00 },
        baja: { codigo:'BAJ', tasa:parseFloat(document.getElementById('tarifa-baj-tasa')?.value)||14.72, impuesto:0, honorarios:parseFloat(document.getElementById('tarifa-baj-honorarios')?.value)||40.00 },
        duplicado: { codigo:'DUP', tasa:parseFloat(document.getElementById('tarifa-dup-tasa')?.value)||23.23, impuesto:0, honorarios:parseFloat(document.getElementById('tarifa-dup-honorarios')?.value)||40.00 },
        canje: { codigo:'CNJ', tasa:parseFloat(document.getElementById('tarifa-cnj-tasa')?.value)||40.97, impuesto:0, honorarios:parseFloat(document.getElementById('tarifa-cnj-honorarios')?.value)||200.00 },
        matriculacion: { codigo:'MAT', tasa:parseFloat(document.getElementById('tarifa-mat-tasa')?.value)||109.33, impuesto:parseFloat(document.getElementById('tarifa-mat-impuesto')?.value)||576.00, honorarios:parseFloat(document.getElementById('tarifa-mat-honorarios')?.value)||150.00 },
        vmp: { codigo:'VMP', tasa:parseFloat(document.getElementById('tarifa-vmp-tasa')?.value)||15.00, impuesto:0, honorarios:parseFloat(document.getElementById('tarifa-vmp-honorarios')?.value)||35.00 },
        iva: parseFloat(document.getElementById('config-iva')?.value)||21,
        retencion: parseFloat(document.getElementById('config-retencion')?.value)||15
    };
    localStorage.setItem('gestoria_tarifas', JSON.stringify(tarifas));
}

function cargarTarifasEnFormulario() {
    const tarifas = cargarTarifas();
    if (document.getElementById('tarifa-trf-tasa')) {
        document.getElementById('tarifa-trf-tasa').value = tarifas.transferencia?.tasa || 65.23;
        document.getElementById('tarifa-trf-honorarios').value = tarifas.transferencia?.honorarios || 70.00;
        document.getElementById('tarifa-baj-tasa').value = tarifas.baja?.tasa || 14.72;
        document.getElementById('tarifa-baj-honorarios').value = tarifas.baja?.honorarios || 40.00;
        document.getElementById('tarifa-dup-tasa').value = tarifas.duplicado?.tasa || 23.23;
        document.getElementById('tarifa-dup-honorarios').value = tarifas.duplicado?.honorarios || 40.00;
        document.getElementById('tarifa-cnj-tasa').value = tarifas.canje?.tasa || 40.97;
        document.getElementById('tarifa-cnj-honorarios').value = tarifas.canje?.honorarios || 200.00;
        document.getElementById('tarifa-mat-tasa').value = tarifas.matriculacion?.tasa || 109.33;
        document.getElementById('tarifa-mat-impuesto').value = tarifas.matriculacion?.impuesto || 576.00;
        document.getElementById('tarifa-mat-honorarios').value = tarifas.matriculacion?.honorarios || 150.00;
        document.getElementById('tarifa-vmp-tasa').value = tarifas.vmp?.tasa || 15.00;
        document.getElementById('tarifa-vmp-honorarios').value = tarifas.vmp?.honorarios || 35.00;
    }
    if (document.getElementById('config-iva')) {
        document.getElementById('config-iva').value = tarifas.iva || 21;
        document.getElementById('config-retencion').value = tarifas.retencion || 15;
    }
}

function aplicarTarifasPorTipo(tipo) {
    const tarifas = cargarTarifas();
    const tarifa = tarifas[tipo];
    if (tarifa) {
        document.getElementById('exp-tasa-trafico').value = tarifa.tasa.toFixed(2);
        document.getElementById('exp-impuesto').value = tarifa.impuesto.toFixed(2);
        document.getElementById('exp-honorarios').value = tarifa.honorarios.toFixed(2);
        document.getElementById('exp-pago-cliente').value = '0.00';
        calcularTotales();
    }
}

function calcularTotales() {
    const tarifas = cargarTarifas();
    const ivaPorc = tarifas.iva || 21;
    const retencionPorc = tarifas.retencion || 15;
    const tasaTrafico = parseFloat(document.getElementById('exp-tasa-trafico').value) || 0;
    const impuesto = parseFloat(document.getElementById('exp-impuesto').value) || 0;
    const honorarios = parseFloat(document.getElementById('exp-honorarios').value) || 0;
    const pagoCliente = parseFloat(document.getElementById('exp-pago-cliente').value) || 0;
    const esEmpresa = document.getElementById('exp-es-empresa').checked;
    const ivaHonorarios = honorarios * (ivaPorc / 100);
    document.getElementById('exp-iva-honorarios').value = ivaHonorarios.toFixed(2);
    const totalSuplidos = tasaTrafico + impuesto;
    document.getElementById('exp-total-suplidos').value = totalSuplidos.toFixed(2);
    let totalFactura = totalSuplidos + honorarios + ivaHonorarios;
    let retencion = 0;
    if (esEmpresa) {
        retencion = honorarios * (retencionPorc / 100);
        document.getElementById('exp-retencion').value = retencion.toFixed(2);
        document.getElementById('grupo-retencion').style.display = 'block';
        totalFactura -= retencion;
    } else { document.getElementById('grupo-retencion').style.display = 'none'; }
    document.getElementById('exp-total-factura').value = totalFactura.toFixed(2);
    const totalReal = totalSuplidos + honorarios + ivaHonorarios;
    const difHonorarios = pagoCliente - totalReal;
    document.getElementById('exp-dif-honorarios').value = difHonorarios.toFixed(2);
    const difInput = document.getElementById('exp-dif-honorarios');
    if (difHonorarios > 0) { difInput.style.background = '#e8f5e9'; difInput.style.color = '#2e7d32'; }
    else if (difHonorarios < 0) { difInput.style.background = '#ffebee'; difInput.style.color = '#c62828'; }
    else { difInput.style.background = '#fff3e0'; difInput.style.color = '#333'; }
}

const mostrarCamposExpedienteOriginal = mostrarCamposExpediente;
mostrarCamposExpediente = function() {
    mostrarCamposExpedienteOriginal();
    const tipo = document.getElementById('expediente-tipo').value;
    if (tipo) aplicarTarifasPorTipo(tipo);
};

document.addEventListener('DOMContentLoaded', function() {
    cargarTarifasEnFormulario();
});

// ═══ VENCIMIENTOS CENTRALES — TRÁFICO ════════════════════════════════════

function comprobarVtoTrafico(exp) {
    if (!URL_VTO_TRA) return;
    const estadosCerrados = ['finalizado', 'recogido', 'entregado', 'cancelado'];
    const cerrado = estadosCerrados.includes((exp.estado || '').toLowerCase());
    if (cerrado) {
        fetch(URL_VTO_TRA, { method: 'POST', mode: 'no-cors', body: JSON.stringify({
            action: 'completar', app: 'Tráfico', expediente: exp.numero, tipo: 'Expediente sin finalizar (+20d)'
        })});
        return;
    }
    const fechaEntrada = exp.fecha ? new Date(exp.fecha) : null;
    if (!fechaEntrada) return;
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const diasTranscurridos = Math.floor((hoy - fechaEntrada) / 86400000);
    if (diasTranscurridos >= 20) {
        const fecha20 = new Date(fechaEntrada);
        fecha20.setDate(fecha20.getDate() + 20);
        const fecha20ISO = fecha20.toISOString().slice(0, 10);
        let nombreCliente = '—';
        const idCliente = exp.comprador || exp.titular;
        if (idCliente) {
            const cli = clientes.find(c => c.id === idCliente);
            if (cli) nombreCliente = [cli.nombre, cli.apellido1, cli.apellido2].filter(Boolean).join(' ');
        }
        fetch(URL_VTO_TRA, { method: 'POST', mode: 'no-cors', body: JSON.stringify({
            action: 'upsert', app: 'Tráfico', expediente: exp.numero, cliente: nombreCliente,
            fecha: fecha20ISO, tipo: 'Expediente sin finalizar (+20d)', observaciones: exp.tipo || '', estado: 'Pendiente'
        })});
    }
}

// ═══ CLIENTESMAESTRO ══════════════════════════════════════════════════════

function guardarEnMaestro(datos) {
    if (!URL_MAESTRO || !datos.DNI_NIE || !datos.Nombre) return;
    fetch(URL_MAESTRO, { method: 'POST', mode: 'no-cors', body: JSON.stringify({ action: 'upsert', datos }) });
}

async function buscarEnMaestro(dni) {
    if (!URL_MAESTRO || !dni || dni.length < 7) return null;
    try {
        const r = await fetch(URL_MAESTRO + '?action=buscar&dni=' + encodeURIComponent(dni.toUpperCase().replace(/-/g, '')));
        const d = await r.json();
        if (d && d.encontrado) return d.cliente;
    } catch(e) {}
    return null;
}

async function rellenarDesdeMaestroTRA() {
    const nif = (document.getElementById('cliente-nif')?.value || document.getElementById('cliente-cif')?.value || '').trim();
    if (!nif || nif.length < 7) { mostrarAlerta('Escribe el DNI/NIE/CIF primero', 'error'); return; }
    mostrarAlerta('🔍 Buscando en ClientesMAESTRO...', 'success');
    const cli = await buscarEnMaestro(nif);
    if (!cli) { mostrarAlerta('❌ No encontrado en ClientesMAESTRO', 'error'); return; }
    const set = (id, val) => { const el = document.getElementById(id); if (el && !el.value && val) el.value = val; };
    set('cliente-nombre', cli.Nombre || '');
    set('cliente-apellido1', cli.Apellido1 || '');
    set('cliente-apellido2', cli.Apellido2 || '');
    set('cliente-fecha-nacimiento', cli.Fecha_Nacimiento || '');
    set('cliente-razon-social', cli.Razon_Social || '');
    set('cliente-cif', cli.CIF || '');
    set('cliente-dni-representante', cli.Rep1_DNI || '');
    set('cliente-nombre-representante', cli.Rep1_Nombre || '');
    set('cliente-apellido1-representante', cli.Rep1_Apellido1 || '');
    set('cliente-apellido2-representante', cli.Rep1_Apellido2 || '');
    set('cliente-telefono', cli.Telefono1 || '');
    set('cliente-email', cli.Email || '');
    set('cliente-tipo-via', cli.Tipo_Via || '');
    set('cliente-nombre-via', cli.Nombre_Via || '');
    set('cliente-numero', cli.Numero || '');
    set('cliente-cp', cli.CP || '');
    set('cliente-localidad', cli.Municipio || '');
    if (cli.Codigo_INE) {
        const sel = document.getElementById('cliente-codigo-municipio');
        if (sel) { const opt = [...sel.options].find(o => o.value === cli.Codigo_INE); if (opt) sel.value = cli.Codigo_INE; }
    }
    if (cli.Tipo) {
        const sel = document.getElementById('cliente-tipo');
        if (sel) { sel.value = cli.Tipo === 'juridica' ? 'juridica' : 'fisica'; cambiarTipoCliente(); }
    }
    mostrarAlerta('✅ Datos cargados desde ClientesMAESTRO', 'success');
}
