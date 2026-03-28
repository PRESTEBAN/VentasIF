import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { SocketService } from '../services/socket';
import { Subscription } from 'rxjs';

export interface VentaDelDia {
  id: number;
  clienteNombre: string;
  clienteApellido: string;
  total: number;
}

export interface OrdenRetencion {
  numero: number;
  total: number;
  retencion: number; // monto calculado (editable)
  clienteNombre?: string;
  buscando?: boolean;
  error?: string;
}

export interface Ingreso {
  id?: number;
  cierre_id?: number;
  monto: number;
  motivo: string;
  tipo?: string;
  fecha?: string;
  metodo_pago?: string;
}

export interface Egreso {
  id?: number;
  detalle: string;
  responsable: string;
  beneficiario: string;
  valor: number;
  fecha?: string;
  cierre_id?: number;
  metodo_pago?: string;
}

export interface Usuario {
  id: number;
  nombre: string;
  apellido: string;
  username: string;
}

const METODOS_PAGO = ['efectivo', 'transferencia', 'cheques'];
const PORCENTAJE_RETENCION = 2;

@Component({
  selector: 'app-caja',
  templateUrl: 'caja.page.html',
  styleUrls: ['caja.page.scss'],
  standalone: false,
})
export class CajaPage implements OnInit, OnDestroy {

  private readonly API = 'https://ventasif-if-api.onrender.com/api/v1';

  menuAbierto = false;
  usuarioActual = '';
  usernameActual = '';
  tabActivo: 'ingresos' | 'egresos' = 'ingresos';

  readonly metodosPago = METODOS_PAGO;

  private pollingInterval: any = null;
  private readonly POLLING_MS = 15000;
  private socketSubs: Subscription[] = [];

  // ---- CALENDARIO ----
  fechaSeleccionada: Date = new Date();
  semanaBase: Date = new Date();
  semanaActual: Date[] = [];
  mostrarDatePicker = false;

  // ---- INGRESOS ----
  ingresos: Ingreso[] = [];
  fondoInicial = 40;
  fondoModificado = false;
  cierreActivoId = 0;
  cargando = false;

  get totalIngresos(): number {
    return this.ingresos.reduce((acc, i) => acc + +i.monto, 0);
  }

  mostrarModalFondo = false;
  guardandoFondo = false;
  nuevoFondo = 40;
  claveAdmin = '';
  erroresFondo: any = {};

  mostrarModalIngreso = false;
  guardandoIngreso = false;
  nuevoIngreso: Ingreso = { monto: 0, motivo: '', metodo_pago: 'efectivo' };
  erroresIngreso: any = {};

  mostrarEditarIngreso = false;
  guardandoEditarIngreso = false;
  ingresoEditando: Ingreso = { monto: 0, motivo: '', metodo_pago: 'efectivo' };
  erroresEditarIngreso: any = {};

  // ---- EGRESOS ----
  egresos: Egreso[] = [];
  usuarios: Usuario[] = [];

  get totalEgresos(): number {
    return this.egresos.reduce((acc, e) => acc + +e.valor, 0);
  }

  mostrarModalEgreso = false;
  guardandoEgreso = false;
  nuevoEgreso: Egreso = { detalle: '', responsable: '', beneficiario: '', valor: 0, metodo_pago: 'efectivo' };
  erroresEgreso: any = {};
  mostrarResponsableDropdown = false;
  mostrarBeneficiarioDropdown = false;

  // ---- RETENCIÓN (nuevo flujo) ----
  ordenesRetencion: OrdenRetencion[] = [];
  inputNumeroOrden = '';

  get totalRetencionCalculado(): number {
    return this.ordenesRetencion.reduce((s, o) => s + (o.retencion || 0), 0);
  }

  mostrarEditarModal = false;
  guardandoEdicion = false;
  egresoEditando: Egreso = { detalle: '', responsable: '', beneficiario: '', valor: 0, metodo_pago: 'efectivo' };
  erroresEditar: any = {};
  mostrarResponsableDropdownEditar = false;
  mostrarBeneficiarioDropdownEditar = false;

  mostrarConfirmarBorrar = false;
  borrando = false;
  private itemABorrar: { tipo: 'ingreso' | 'egreso'; id: number } | null = null;

  mostrarModalVer = false;
  itemVisualizando: any = null;
  tipoVisualizando: 'ingreso' | 'egreso' = 'ingreso';

  constructor(
    public router: Router,
    private authService: AuthService,
    private http: HttpClient,
    private socketService: SocketService
  ) { }

  ngOnInit() {
    const user = this.authService.getUsuario();
    this.usuarioActual = user?.nombre || user?.username || '';
    this.usernameActual = user?.username || '';
    const base = new Date(this.fechaSeleccionada);
    base.setDate(base.getDate() - 3);
    this.semanaBase = base;
    this.generarSemana(this.semanaBase);
  }

  ionViewWillEnter() { this.cargarUsuarios(); this.cargarDatos(); this.iniciarPolling(); this.iniciarSocket(); }
  ionViewWillLeave() { this.detenerPolling(); this.detenerSocket(); }
  ngOnDestroy() { this.detenerPolling(); this.detenerSocket(); }

  iniciarPolling() {
    this.detenerPolling();
    if (!this.authService.estaLogueado()) return;
    this.pollingInterval = setInterval(() => this.cargarDatosSilencioso(), this.POLLING_MS);
  }
  detenerPolling() { if (this.pollingInterval) { clearInterval(this.pollingInterval); this.pollingInterval = null; } }

  iniciarSocket() {
    if (!this.authService.estaLogueado()) return;
    this.socketService.connect();
    const s1 = this.socketService.on('egresos_actualizado').subscribe(() => { if (!this.authService.estaLogueado()) { this.detenerSocket(); return; } if (this.esDiaDeHoy) this.cargarDatosSilencioso(); });
    const s2 = this.socketService.on('ingresos_actualizado').subscribe(() => { if (!this.authService.estaLogueado()) { this.detenerSocket(); return; } if (this.esDiaDeHoy) this.cargarDatosSilencioso(); });
    this.socketSubs = [s1, s2];
  }
  detenerSocket() { this.socketSubs.forEach(s => s.unsubscribe()); this.socketSubs = []; }

  private getHeaders(): HttpHeaders {
    return new HttpHeaders({ Authorization: `Bearer ${this.authService.getToken()}` });
  }

  formatearFecha(fecha: Date): string {
    const d = fecha.getDate().toString().padStart(2, '0');
    const m = (fecha.getMonth() + 1).toString().padStart(2, '0');
    return `${fecha.getFullYear()}-${m}-${d}`;
  }

  get esDiaDeHoy(): boolean {
    const hoy = new Date(); const sel = this.fechaSeleccionada;
    return sel.getFullYear() === hoy.getFullYear() && sel.getMonth() === hoy.getMonth() && sel.getDate() === hoy.getDate();
  }

  getMetodoLabel(metodo: string): string {
    switch ((metodo || '').toLowerCase()) {
      case 'transferencia': return 'Transferencia';
      case 'cheques': return 'Cheques';
      default: return 'Efectivo';
    }
  }

  getMetodoIcon(metodo: string): string {
    switch ((metodo || '').toLowerCase()) {
      case 'transferencia': return 'phone-portrait-outline';
      case 'cheques': return 'document-outline';
      default: return 'cash-outline';
    }
  }

  // ---- CARGA -------------------------------------------------------
  cargarDatos(silent = false) {
    if (!silent) { this.cargando = true; this.egresos = []; this.ingresos = []; }
    const fechaStr = this.formatearFecha(this.fechaSeleccionada);
    this.http.get<Egreso[]>(`${this.API}/egresos?fecha=${fechaStr}`, { headers: this.getHeaders() }).subscribe({
      next: (data) => { this.egresos = data; this.cargando = false; },
      error: () => { if (!silent) this.egresos = []; this.cargando = false; }
    });
    if (this.esDiaDeHoy) {
      this.http.get<any>(`${this.API}/ingresos`, { headers: this.getHeaders() }).subscribe({
        next: (data) => { this.fondoInicial = parseFloat(data.fondo_inicial) || 40; this.fondoModificado = data.fondo_modificado || false; this.cierreActivoId = data.cierre_id || 0; this.ingresos = data.ingresos || []; },
        error: () => { if (!silent) this.ingresos = []; }
      });
    } else {
      this.http.get<any>(`${this.API}/ingresos/fecha/${fechaStr}`, { headers: this.getHeaders() }).subscribe({
        next: (data) => { this.fondoInicial = parseFloat(data.fondo_inicial) || 40; this.fondoModificado = data.fondo_modificado || false; this.cierreActivoId = data.cierre_id || 0; this.ingresos = data.ingresos || []; },
        error: () => { if (!silent) { this.ingresos = []; this.fondoInicial = 40; this.cierreActivoId = 0; } }
      });
    }
  }

  esIngresoEditable(ingreso: Ingreso): boolean { if (!this.esDiaDeHoy) return false; return ingreso.cierre_id === this.cierreActivoId; }
  cargarDatosSilencioso() { if (!this.authService.estaLogueado()) { this.detenerPolling(); return; } if (!this.esDiaDeHoy) return; this.cargarDatos(true); }

  cargarUsuarios() {
    this.http.get<Usuario[]>(`${this.API}/egresos/usuarios`, { headers: this.getHeaders() }).subscribe({
      next: (data) => { this.usuarios = data.filter(u => u.username?.toLowerCase() !== 'admin' && u.nombre?.toLowerCase() !== 'admin'); },
      error: () => { }
    });
  }

  get usuariosSinAdmin(): Usuario[] { return this.usuarios; }
  getLabelBeneficiario(username: string): string { const u = this.usuarios.find(u => u.username === username); return u ? `${u.nombre} ${u.apellido}` : username; }
  esEgresoEditable(egreso: Egreso): boolean { if (!this.esDiaDeHoy) return false; return !egreso.cierre_id || egreso.cierre_id === this.cierreActivoId; }

  // ---- RETENCIÓN: buscar orden por número -------------------------
  buscarOrdenRetencion() {
    const num = parseInt(this.inputNumeroOrden, 10);
    if (!num || num <= 0) return;

    // Evitar duplicados
    if (this.ordenesRetencion.some(o => o.numero === num)) {
      this.inputNumeroOrden = '';
      return;
    }

    const nueva: OrdenRetencion = { numero: num, total: 0, retencion: 0, buscando: true };
    this.ordenesRetencion = [...this.ordenesRetencion, nueva];
    this.inputNumeroOrden = '';

    this.http.get<any>(`${this.API}/ventas-ruta/${num}`, { headers: this.getHeaders() }).subscribe({
      next: (data) => {
        const total = parseFloat(data.total) || 0;
        const retencion = parseFloat(((total * PORCENTAJE_RETENCION) / 100).toFixed(2));
        const clienteNombre = data.cliente || `${data.clienteNombre || ''} ${data.clienteApellido || ''}`.trim();
        this.ordenesRetencion = this.ordenesRetencion.map(o =>
          o.numero === num ? { ...o, total, retencion, clienteNombre, buscando: false, error: undefined } : o
        );
        this.sincronizarValorRetencion();
        this.sincronizarDetalleRetencion();
      },
      error: () => {
        this.ordenesRetencion = this.ordenesRetencion.map(o =>
          o.numero === num ? { ...o, buscando: false, error: 'Orden no encontrada' } : o
        );
      }
    });
  }

  eliminarOrdenRetencion(num: number) {
    this.ordenesRetencion = this.ordenesRetencion.filter(o => o.numero !== num);
    this.sincronizarValorRetencion();
    this.sincronizarDetalleRetencion();
  }

  onRetencionChange() {
    this.sincronizarValorRetencion();
  }

  private sincronizarValorRetencion() {
    this.nuevoEgreso.valor = parseFloat(this.totalRetencionCalculado.toFixed(2));
  }

  private sincronizarDetalleRetencion() {
    if (this.nuevoEgreso.detalle.trim()) return; 

    const nums = this.ordenesRetencion.filter(o => !o.error).map(o => `#${o.numero}`).join(', ');
    if (nums) {
      this.nuevoEgreso.detalle = `Retención ${PORCENTAJE_RETENCION}% · Órdenes ${nums}`;
    }
  }

  // ---- CALENDARIO ------------------------------------------------
  generarSemana(base: Date) {
    const dias: Date[] = [];
    for (let i = 0; i < 7; i++) { const d = new Date(base); d.setDate(base.getDate() + i); dias.push(d); }
    this.semanaActual = dias;
  }
  semanaAnterior() { const n = new Date(this.semanaBase); n.setDate(n.getDate() - 7); this.semanaBase = n; this.generarSemana(n); this.fechaSeleccionada = new Date(this.semanaActual[6]); this.cargarDatos(); }
  semanaSiguiente() { const n = new Date(this.semanaBase); n.setDate(n.getDate() + 7); this.semanaBase = n; this.generarSemana(n); this.fechaSeleccionada = new Date(this.semanaActual[0]); this.cargarDatos(); }
  esSemanaActual(): boolean { const u = new Date(this.semanaActual[this.semanaActual.length - 1]); const h = new Date(); h.setHours(0, 0, 0, 0); u.setHours(0, 0, 0, 0); return u >= h; }
  seleccionarDia(dia: Date) { this.fechaSeleccionada = new Date(dia); this.cargarDatos(); }
  esDiaSeleccionado(dia: Date): boolean { return dia.toDateString() === this.fechaSeleccionada.toDateString(); }
  esHoy(dia: Date): boolean { return dia.toDateString() === new Date().toDateString(); }
  abrirDatePicker() { this.mostrarDatePicker = true; }
  cerrarDatePicker() { this.mostrarDatePicker = false; }
  onDatePickerChange(event: any) {
    const valor = event.target.value; if (!valor) return;
    const [anio, mes, dia] = valor.split('-').map(Number);
    const nueva = new Date(anio, mes - 1, dia);
    this.fechaSeleccionada = nueva;
    const base = new Date(nueva); base.setDate(nueva.getDate() - 3);
    this.semanaBase = base; this.generarSemana(this.semanaBase);
    this.cargarDatos(); this.cerrarDatePicker();
  }
  abrirModalSegunTab() { if (this.tabActivo === 'ingresos') this.abrirModalIngreso(); else this.abrirModalEgreso(); }

  // ---- FONDO -------------------------------------------------------
  abrirEditarFondo() { this.nuevoFondo = this.fondoInicial; this.claveAdmin = ''; this.erroresFondo = {}; this.mostrarModalFondo = true; }
  cerrarModalFondo() { this.mostrarModalFondo = false; this.erroresFondo = {}; }
  guardarFondo() {
    this.erroresFondo = {};
    if (!this.nuevoFondo || this.nuevoFondo < 0) { this.erroresFondo.monto = 'Ingresa un monto válido'; return; }
    if (this.fondoModificado && !this.claveAdmin.trim()) { this.erroresFondo.clave = 'La clave es requerida'; return; }
    this.guardandoFondo = true;
    const payload: any = { monto: this.nuevoFondo };
    if (this.fondoModificado) payload.clave_admin = this.claveAdmin;
    this.http.put<any>(`${this.API}/ingresos/fondo`, payload, { headers: this.getHeaders() }).subscribe({
      next: (res) => { this.fondoInicial = res.fondo_inicial; this.fondoModificado = true; this.guardandoFondo = false; this.cerrarModalFondo(); },
      error: (err) => { this.guardandoFondo = false; this.erroresFondo.general = err.error?.error || 'Error'; if (err.status === 403) this.erroresFondo.clave = 'Clave incorrecta'; }
    });
  }

  // ---- INGRESO -----------------------------------------------------
  abrirModalIngreso() { this.nuevoIngreso = { monto: 0, motivo: '', metodo_pago: 'efectivo' }; this.erroresIngreso = {}; this.mostrarModalIngreso = true; }
  cerrarModalIngreso() { this.mostrarModalIngreso = false; this.erroresIngreso = {}; }
  guardarIngreso() {
    this.erroresIngreso = {}; let v = true;
    if (!this.nuevoIngreso.motivo.trim()) { this.erroresIngreso.motivo = 'El motivo es requerido'; v = false; }
    if (!this.nuevoIngreso.monto || this.nuevoIngreso.monto <= 0) { this.erroresIngreso.monto = 'Ingresa un valor válido'; v = false; }
    if (!v) return;
    this.guardandoIngreso = true;
    this.http.post<any>(`${this.API}/ingresos`, { monto: this.nuevoIngreso.monto, motivo: this.nuevoIngreso.motivo.trim(), metodo_pago: this.nuevoIngreso.metodo_pago || 'efectivo' }, { headers: this.getHeaders() }).subscribe({
      next: () => { this.guardandoIngreso = false; this.cerrarModalIngreso(); this.cargarDatos(); },
      error: () => { this.guardandoIngreso = false; this.erroresIngreso.general = 'Error al guardar'; }
    });
  }

  abrirEditarIngreso(ingreso: Ingreso) { this.ingresoEditando = { ...ingreso, metodo_pago: ingreso.metodo_pago || 'efectivo' }; this.erroresEditarIngreso = {}; this.mostrarEditarIngreso = true; }
  cerrarEditarIngreso() { this.mostrarEditarIngreso = false; this.erroresEditarIngreso = {}; }
  guardarEdicionIngreso() {
    this.erroresEditarIngreso = {}; let v = true;
    if (!this.ingresoEditando.motivo?.trim()) { this.erroresEditarIngreso.motivo = 'El motivo es requerido'; v = false; }
    if (!this.ingresoEditando.monto || this.ingresoEditando.monto <= 0) { this.erroresEditarIngreso.monto = 'Ingresa un valor válido'; v = false; }
    if (!v) return;
    this.guardandoEditarIngreso = true;
    this.http.put<any>(`${this.API}/ingresos/${this.ingresoEditando.id}`, { monto: this.ingresoEditando.monto, motivo: this.ingresoEditando.motivo!.trim(), metodo_pago: this.ingresoEditando.metodo_pago || 'efectivo' }, { headers: this.getHeaders() }).subscribe({
      next: () => { this.guardandoEditarIngreso = false; this.cerrarEditarIngreso(); this.cargarDatos(); },
      error: () => { this.guardandoEditarIngreso = false; this.erroresEditarIngreso.general = 'Error al guardar'; }
    });
  }

  // ---- EGRESO -------------------------------------------------------
  abrirModalEgreso() {
    this.nuevoEgreso = { detalle: '', responsable: this.getResponsablePorDefecto(), beneficiario: '', valor: 0, metodo_pago: 'efectivo' };
    this.ordenesRetencion = []; this.inputNumeroOrden = '';
    this.erroresEgreso = {}; this.mostrarModalEgreso = true;
  }
  cerrarModalEgreso() {
    this.mostrarModalEgreso = false; this.mostrarResponsableDropdown = false;
    this.mostrarBeneficiarioDropdown = false; this.ordenesRetencion = [];
    this.inputNumeroOrden = ''; this.erroresEgreso = {};
  }
  private getResponsablePorDefecto(): string {
    const u = this.usuarios.find(u => u.username.toLowerCase().trim() === this.usernameActual.toLowerCase().trim());
    return u ? u.username : '';
  }
  toggleResponsable() { this.mostrarResponsableDropdown = !this.mostrarResponsableDropdown; }
  seleccionarResponsable(v: string) { this.nuevoEgreso.responsable = v; this.mostrarResponsableDropdown = false; }
  toggleBeneficiario() { this.mostrarBeneficiarioDropdown = !this.mostrarBeneficiarioDropdown; }
  seleccionarBeneficiario(v: string) {
    this.nuevoEgreso.beneficiario = v; this.mostrarBeneficiarioDropdown = false;
    if (v !== 'Retencion') { this.ordenesRetencion = []; this.inputNumeroOrden = ''; }
    else { this.nuevoEgreso.detalle = ''; this.nuevoEgreso.valor = 0; }
  }

  guardarEgreso() {
    this.erroresEgreso = {}; let valido = true;
    if (!this.nuevoEgreso.detalle.trim()) { this.erroresEgreso.detalle = 'Requerido'; valido = false; }
    if (!this.nuevoEgreso.responsable) { this.erroresEgreso.responsable = 'Requerido'; valido = false; }
    if (!this.nuevoEgreso.beneficiario) { this.erroresEgreso.beneficiario = 'Requerido'; valido = false; }
    if (!this.nuevoEgreso.valor || this.nuevoEgreso.valor <= 0) { this.erroresEgreso.valor = 'Valor inválido'; valido = false; }
    if (this.nuevoEgreso.beneficiario === 'Retencion' && this.ordenesRetencion.filter(o => !o.error).length === 0) {
      this.erroresEgreso.ordenes = 'Agrega al menos una orden válida'; valido = false;
    }
    if (!valido) return;
    this.guardandoEgreso = true;
    this.http.post<Egreso>(`${this.API}/egresos`, {
      detalle: this.nuevoEgreso.detalle.trim(), responsable: this.nuevoEgreso.responsable,
      beneficiario: this.nuevoEgreso.beneficiario, valor: this.nuevoEgreso.valor,
      metodo_pago: this.nuevoEgreso.metodo_pago || 'efectivo'
    }, { headers: this.getHeaders() }).subscribe({
      next: () => { this.guardandoEgreso = false; this.cerrarModalEgreso(); this.cargarDatos(); },
      error: () => { this.guardandoEgreso = false; this.erroresEgreso.general = 'Error al guardar'; }
    });
  }

  // ---- EDITAR EGRESO -----------------------------------------------
  abrirEditar(egreso: Egreso) {
    this.egresoEditando = { ...egreso, metodo_pago: egreso.metodo_pago || 'efectivo' };
    this.erroresEditar = {}; this.mostrarResponsableDropdownEditar = false;
    this.mostrarBeneficiarioDropdownEditar = false; this.mostrarEditarModal = true;
  }
  cerrarEditar() { this.mostrarEditarModal = false; this.mostrarResponsableDropdownEditar = false; this.mostrarBeneficiarioDropdownEditar = false; this.erroresEditar = {}; }
  toggleResponsableEditar() { this.mostrarResponsableDropdownEditar = !this.mostrarResponsableDropdownEditar; }
  seleccionarResponsableEditar(v: string) { this.egresoEditando.responsable = v; this.mostrarResponsableDropdownEditar = false; }
  toggleBeneficiarioEditar() { this.mostrarBeneficiarioDropdownEditar = !this.mostrarBeneficiarioDropdownEditar; }
  seleccionarBeneficiarioEditar(v: string) { this.egresoEditando.beneficiario = v; this.mostrarBeneficiarioDropdownEditar = false; }

  guardarEdicion() {
    this.erroresEditar = {}; let v = true;
    if (!this.egresoEditando.detalle.trim()) { this.erroresEditar.detalle = 'Requerido'; v = false; }
    if (!this.egresoEditando.responsable) { this.erroresEditar.responsable = 'Requerido'; v = false; }
    if (!this.egresoEditando.beneficiario) { this.erroresEditar.beneficiario = 'Requerido'; v = false; }
    if (!this.egresoEditando.valor || this.egresoEditando.valor <= 0) { this.erroresEditar.valor = 'Valor inválido'; v = false; }
    if (!v) return;
    this.guardandoEdicion = true;
    this.http.put<Egreso>(`${this.API}/egresos/${this.egresoEditando.id}`, {
      detalle: this.egresoEditando.detalle.trim(), responsable: this.egresoEditando.responsable,
      beneficiario: this.egresoEditando.beneficiario, valor: this.egresoEditando.valor,
      metodo_pago: this.egresoEditando.metodo_pago || 'efectivo'
    }, { headers: this.getHeaders() }).subscribe({
      next: (updated) => { this.egresos = this.egresos.map(e => e.id === updated.id ? updated : e); this.guardandoEdicion = false; this.cerrarEditar(); },
      error: () => { this.guardandoEdicion = false; this.erroresEditar.general = 'Error al guardar'; }
    });
  }

  // ---- BORRAR -------------------------------------------------------
  confirmarBorrarIngreso(ingreso: Ingreso) { this.itemABorrar = { tipo: 'ingreso', id: ingreso.id! }; this.mostrarConfirmarBorrar = true; }
  confirmarBorrarEgreso(egreso: Egreso) { this.itemABorrar = { tipo: 'egreso', id: egreso.id! }; this.mostrarConfirmarBorrar = true; }
  cancelarBorrar() { this.mostrarConfirmarBorrar = false; this.itemABorrar = null; }
  ejecutarBorrar() {
    if (!this.itemABorrar) return;
    this.borrando = true;
    const url = this.itemABorrar.tipo === 'ingreso' ? `${this.API}/ingresos/${this.itemABorrar.id}` : `${this.API}/egresos/${this.itemABorrar.id}`;
    this.http.delete(url, { headers: this.getHeaders() }).subscribe({
      next: () => {
        if (this.itemABorrar!.tipo === 'ingreso') this.ingresos = this.ingresos.filter(i => i.id !== this.itemABorrar!.id);
        else this.egresos = this.egresos.filter(e => e.id !== this.itemABorrar!.id);
        this.borrando = false; this.cancelarBorrar();
      },
      error: () => { this.borrando = false; this.cancelarBorrar(); }
    });
  }

  // ---- VER DETALLE -------------------------------------------------
  verIngreso(ingreso: Ingreso) { this.itemVisualizando = ingreso; this.tipoVisualizando = 'ingreso'; this.mostrarModalVer = true; }
  verEgreso(egreso: Egreso) { this.itemVisualizando = egreso; this.tipoVisualizando = 'egreso'; this.mostrarModalVer = true; }
  cerrarModalVer() { this.mostrarModalVer = false; this.itemVisualizando = null; }

  // ---- MENU --------------------------------------------------------
  abrirMenu() { this.menuAbierto = true; }
  cerrarMenu() { this.menuAbierto = false; }
  cerrarSesion() { this.authService.logout(); this.menuAbierto = false; this.router.navigate(['/login']); }
}