import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { SocketService } from '../services/socket';
import { Subscription } from 'rxjs';

export interface Egreso {
  id?: number;
  detalle: string;
  responsable: string;
  beneficiario: string;
  valor: number;
  fecha?: string;
}

export interface Usuario {
  id: number;
  nombre: string;
  apellido: string;
  username: string;
}

@Component({
  selector: 'app-egresos',
  templateUrl: 'egresos.page.html',
  styleUrls: ['egresos.page.scss'],
  standalone: false,
})
export class EgresosPage implements OnInit, OnDestroy {

  private readonly API = 'https://ventasif-if-api.onrender.com/api/v1';

  menuAbierto   = false;
  usuarioActual = '';

  private pollingInterval: any = null;
  private readonly POLLING_MS  = 15000;
  private socketSubs: Subscription[] = [];

  // ---- CALENDARIO ----
  fechaSeleccionada: Date = new Date();
  semanaBase: Date        = new Date();
  semanaActual: Date[]    = [];
  mostrarDatePicker       = false;

  // ---- DATOS ----
  egresos:          Egreso[]  = [];
  usuarios:         Usuario[] = [];
  cargando          = false;
  ingresosDelDia    = 0;
  advertenciaExceso = false;
  cierreActivoId    = 0;

  get totalEgresos(): number {
    return this.egresos.reduce((acc, e) => acc + +e.valor, 0);
  }

  get saldoDisponible(): number {
    return Math.max(0, this.ingresosDelDia - this.totalEgresos);
  }

  // ---- MODAL AÑADIR ----
  mostrarModal = false;
  guardando    = false;
  mostrarBeneficiarioDropdown = false;
  mostrarResponsableDropdown  = false;
  nuevoEgreso: Egreso = { detalle: '', responsable: '', beneficiario: '', valor: 0 };
  errores: any = {};

  // ---- MODAL EDITAR ----
  mostrarEditarModal = false;
  guardandoEdicion   = false;
  mostrarBeneficiarioDropdownEditar = false;
  mostrarResponsableDropdownEditar  = false;
  egresoEditando: Egreso = { detalle: '', responsable: '', beneficiario: '', valor: 0 };
  erroresEditar: any = {};

  // ---- BORRAR ----
  mostrarConfirmarBorrar = false;
  egresoABorrar: Egreso | null = null;
  borrando = false;

  readonly OPCIONES_ESPECIALES = ['Vehiculo', 'Fabrica'];

  constructor(
    public router: Router,
    private authService: AuthService,
    private http: HttpClient,
    private socketService: SocketService
  ) {}

  ngOnInit() {
    const user = this.authService.getUsuario();
    this.usuarioActual = user?.nombre || user?.username || '';
    const base = new Date(this.fechaSeleccionada);
    base.setDate(base.getDate() - 3);
    this.semanaBase = base;
    this.generarSemana(this.semanaBase);
  }

  ionViewWillEnter() {
    this.cargarUsuarios();
    this.cargarDatos();
    this.iniciarPolling();
    this.iniciarSocket();
  }

  ionViewWillLeave() {
    this.detenerPolling();
    this.detenerSocket();
  }

  ngOnDestroy() {
    this.detenerPolling();
    this.detenerSocket();
  }

  iniciarPolling() {
    this.detenerPolling();
    if (!this.authService.estaLogueado()) return;
    this.pollingInterval = setInterval(() => this.cargarDatosSilencioso(), this.POLLING_MS);
  }

  detenerPolling() {
    if (this.pollingInterval) { clearInterval(this.pollingInterval); this.pollingInterval = null; }
  }

  iniciarSocket() {
    if (!this.authService.estaLogueado()) return;
    this.socketService.connect();

    const egresoSub = this.socketService.on<{ accion: string; egreso?: Egreso; id?: string }>('egresos_actualizado').subscribe((data) => {
      if (!this.authService.estaLogueado()) { this.detenerSocket(); return; }

      const hoyStr   = this.formatearFecha(new Date());
      const selecStr = this.formatearFecha(this.fechaSeleccionada);
      const esHoy    = selecStr === hoyStr;

      // Solo actualizamos en tiempo real si estamos viendo hoy
      if (!esHoy) return;

      if (data?.accion === 'crear' && data.egreso) {
        const yaExiste = this.egresos.some(e => e.id === data.egreso!.id);
        if (!yaExiste) this.egresos = [...this.egresos, data.egreso];
      } else if (data?.accion === 'editar' && data.egreso) {
        this.egresos = this.egresos.map(e => e.id === data.egreso!.id ? data.egreso! : e);
      } else if (data?.accion === 'borrar' && data.id) {
        this.egresos = this.egresos.filter(e => e.id !== +data.id!);
      }
      this.actualizarAdvertencia();
    });

    this.socketSubs = [egresoSub];
  }

  detenerSocket() {
    this.socketSubs.forEach(s => s.unsubscribe());
    this.socketSubs = [];
  }

  private getHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }

  formatearFecha(fecha: Date): string {
    const d = fecha.getDate().toString().padStart(2, '0');
    const m = (fecha.getMonth() + 1).toString().padStart(2, '0');
    return `${fecha.getFullYear()}-${m}-${d}`;
  }

  // ---- CARGA PRINCIPAL -------------------------------------------------------
  cargarDatos() {
    this.cargando = true;
    this.egresos  = [];

    const hoyStr     = this.formatearFecha(new Date());
    const selecStr   = this.formatearFecha(this.fechaSeleccionada);
    const esDiaDeHoy = selecStr === hoyStr;

    if (esDiaDeHoy) {
      // Hoy → usar cierre activo (ingresos + egresos del cierre)
      this.http.get<any>(`${this.API}/cierres/activo`, { headers: this.getHeaders() }).subscribe({
        next: (cierre) => {
          this.cierreActivoId = cierre.id;
          this.ingresosDelDia = (parseFloat(cierre.efectivo_ventas)      || 0)
                              + (parseFloat(cierre.transferencia_ventas) || 0)
                              + (parseFloat(cierre.cheques_ventas)       || 0)
                              + (parseFloat(cierre.abonos_total)         || 0);
          this.http.get<Egreso[]>(`${this.API}/egresos?cierre_id=${cierre.id}`, { headers: this.getHeaders() }).subscribe({
            next: (egresos) => { this.egresos = egresos; this.actualizarAdvertencia(); this.cargando = false; },
            error: () => { this.egresos = []; this.cargando = false; }
          });
        },
        error: () => { this.cargando = false; }
      });
    } else {
      // Día pasado → solo mostrar egresos por fecha (solo lectura, sin saldo)
      this.ingresosDelDia = 0;
      this.cierreActivoId = 0;
      this.http.get<Egreso[]>(`${this.API}/egresos?fecha=${selecStr}`, { headers: this.getHeaders() }).subscribe({
        next: (egresos) => { this.egresos = egresos; this.actualizarAdvertencia(); this.cargando = false; },
        error: () => { this.egresos = []; this.cargando = false; }
      });
    }
  }

  cargarDatosSilencioso() {
    if (!this.authService.estaLogueado()) { this.detenerPolling(); return; }

    const hoyStr     = this.formatearFecha(new Date());
    const selecStr   = this.formatearFecha(this.fechaSeleccionada);
    const esDiaDeHoy = selecStr === hoyStr;

    if (!esDiaDeHoy) return; // días pasados no necesitan polling

    this.http.get<any>(`${this.API}/cierres/activo`, { headers: this.getHeaders() }).subscribe({
      next: (cierre) => {
        const nuevosIngresos = (parseFloat(cierre.efectivo_ventas)      || 0)
                             + (parseFloat(cierre.transferencia_ventas) || 0)
                             + (parseFloat(cierre.cheques_ventas)       || 0)
                             + (parseFloat(cierre.abonos_total)         || 0);
        // Solo actualizar ingresos si cambiaron
        if (nuevosIngresos !== this.ingresosDelDia) {
          this.ingresosDelDia = nuevosIngresos;
          this.actualizarAdvertencia();
        }
        this.cierreActivoId = cierre.id;
        this.http.get<Egreso[]>(`${this.API}/egresos?cierre_id=${cierre.id}`, { headers: this.getHeaders() }).subscribe({
          next: (egresos) => {
            // Solo reasignar si la cantidad o algún valor cambió (evita re-render innecesario)
            const cambio = egresos.length !== this.egresos.length ||
              egresos.some((e, i) => e.id !== this.egresos[i]?.id || +e.valor !== +this.egresos[i]?.valor);
            if (cambio) { this.egresos = egresos; this.actualizarAdvertencia(); }
          },
          error: () => {}
        });
      },
      error: () => {}
    });
  }

  cargarEgresos() { this.cargarDatos(); }

  private actualizarAdvertencia() {
    this.advertenciaExceso = this.totalEgresos > this.ingresosDelDia;
  }

  cargarUsuarios() {
    this.http.get<Usuario[]>(`${this.API}/egresos/usuarios`, { headers: this.getHeaders() })
      .subscribe({
        next: (data) => {
          this.usuarios = data.filter(u =>
            u.username?.toLowerCase() !== 'admin' &&
            u.nombre?.toLowerCase()   !== 'admin'
          );
        },
        error: () => {}
      });
  }

  get esDiaDeHoy(): boolean {
    return this.formatearFecha(this.fechaSeleccionada) === this.formatearFecha(new Date());
  }

  get usuariosSinAdmin(): Usuario[] { return this.usuarios; }

  // ---- CALENDARIO --------------------------------------------------------
  generarSemana(base: Date) {
    const dias: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      dias.push(d);
    }
    this.semanaActual = dias;
  }

  semanaAnterior() {
    const nueva = new Date(this.semanaBase);
    nueva.setDate(nueva.getDate() - 7);
    this.semanaBase = nueva;
    this.generarSemana(nueva);
    this.fechaSeleccionada = new Date(this.semanaActual[6]);
    this.cargarDatos();
  }

  semanaSiguiente() {
    const nueva = new Date(this.semanaBase);
    nueva.setDate(nueva.getDate() + 7);
    this.semanaBase = nueva;
    this.generarSemana(nueva);
    this.fechaSeleccionada = new Date(this.semanaActual[0]);
    this.cargarDatos();
  }

  esSemanaActual(): boolean {
    const ultimoDia = new Date(this.semanaActual[this.semanaActual.length - 1]);
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0); ultimoDia.setHours(0, 0, 0, 0);
    return ultimoDia >= hoy;
  }

  seleccionarDia(dia: Date) { this.fechaSeleccionada = new Date(dia); this.cargarDatos(); }
  esDiaSeleccionado(dia: Date): boolean { return dia.toDateString() === this.fechaSeleccionada.toDateString(); }
  esHoy(dia: Date): boolean { return dia.toDateString() === new Date().toDateString(); }
  abrirDatePicker()  { this.mostrarDatePicker = true;  }
  cerrarDatePicker() { this.mostrarDatePicker = false; }

  onDatePickerChange(event: any) {
    const valor = event.target.value;
    if (!valor) return;
    const [anio, mes, dia] = valor.split('-').map(Number);
    const nueva = new Date(anio, mes - 1, dia);
    this.fechaSeleccionada = nueva;
    const base = new Date(nueva);
    base.setDate(nueva.getDate() - 3);
    this.semanaBase = base;
    this.generarSemana(this.semanaBase);
    this.cargarDatos();
    this.cerrarDatePicker();
  }

  // ---- MODAL AÑADIR ------------------------------------------------------
  abrirModal() {
    this.nuevoEgreso = { detalle: '', responsable: this.usuarios[0]?.username || '', beneficiario: '', valor: 0 };
    this.errores = {};
    this.mostrarModal = true;
  }

  toggleResponsable() { this.mostrarResponsableDropdown = !this.mostrarResponsableDropdown; }
  seleccionarResponsable(valor: string) { this.nuevoEgreso.responsable = valor; this.mostrarResponsableDropdown = false; }
  toggleBeneficiario() { this.mostrarBeneficiarioDropdown = !this.mostrarBeneficiarioDropdown; }
  seleccionarBeneficiario(valor: string) { this.nuevoEgreso.beneficiario = valor; this.mostrarBeneficiarioDropdown = false; }

  getLabelBeneficiario(username: string): string {
    const u = this.usuarios.find(u => u.username === username);
    return u ? `${u.nombre} ${u.apellido}` : username;
  }

  cerrarModal() {
    this.mostrarModal = false;
    this.mostrarBeneficiarioDropdown = false;
    this.mostrarResponsableDropdown  = false;
    this.errores = {};
  }

  guardarEgreso() {
    this.errores = {};
    let valido = true;
    if (!this.nuevoEgreso.detalle.trim())    { this.errores.detalle      = 'El detalle es requerido'; valido = false; }
    if (!this.nuevoEgreso.responsable)       { this.errores.responsable  = 'Requerido'; valido = false; }
    if (!this.nuevoEgreso.beneficiario)      { this.errores.beneficiario = 'Requerido'; valido = false; }
    if (!this.nuevoEgreso.valor || this.nuevoEgreso.valor <= 0) { this.errores.valor = 'Ingresa un valor válido'; valido = false; }

    if (valido && +this.nuevoEgreso.valor > this.saldoDisponible) {
      this.errores.valor = `Excede el saldo disponible ($${this.saldoDisponible.toFixed(2)})`;
      valido = false;
    }

    if (!valido) return;

    this.guardando = true;
    this.http.post<Egreso>(`${this.API}/egresos`,
      { detalle: this.nuevoEgreso.detalle.trim(), responsable: this.nuevoEgreso.responsable, beneficiario: this.nuevoEgreso.beneficiario, valor: this.nuevoEgreso.valor },
      { headers: this.getHeaders() }
    ).subscribe({
      next: () => { this.guardando = false; this.cerrarModal(); this.cargarDatos(); },
      error: () => { this.guardando = false; this.errores.general = 'Error al guardar, intenta de nuevo'; }
    });
  }

  // ---- MODAL EDITAR -------------------------------------------------------
  abrirEditar(egreso: Egreso) {
    this.egresoEditando = { ...egreso };
    this.erroresEditar = {};
    this.mostrarBeneficiarioDropdownEditar = false;
    this.mostrarResponsableDropdownEditar  = false;
    this.mostrarEditarModal = true;
  }

  cerrarEditar() {
    this.mostrarEditarModal = false;
    this.mostrarBeneficiarioDropdownEditar = false;
    this.mostrarResponsableDropdownEditar  = false;
    this.erroresEditar = {};
  }

  toggleResponsableEditar() { this.mostrarResponsableDropdownEditar = !this.mostrarResponsableDropdownEditar; }
  seleccionarResponsableEditar(valor: string) { this.egresoEditando.responsable = valor; this.mostrarResponsableDropdownEditar = false; }
  toggleBeneficiarioEditar() { this.mostrarBeneficiarioDropdownEditar = !this.mostrarBeneficiarioDropdownEditar; }
  seleccionarBeneficiarioEditar(valor: string) { this.egresoEditando.beneficiario = valor; this.mostrarBeneficiarioDropdownEditar = false; }

  guardarEdicion() {
    this.erroresEditar = {};
    let valido = true;
    if (!this.egresoEditando.detalle.trim())    { this.erroresEditar.detalle      = 'El detalle es requerido'; valido = false; }
    if (!this.egresoEditando.responsable)       { this.erroresEditar.responsable  = 'Requerido'; valido = false; }
    if (!this.egresoEditando.beneficiario)      { this.erroresEditar.beneficiario = 'Requerido'; valido = false; }
    if (!this.egresoEditando.valor || this.egresoEditando.valor <= 0) { this.erroresEditar.valor = 'Ingresa un valor válido'; valido = false; }

    if (valido) {
      const valorOriginal   = +(this.egresos.find(e => e.id === this.egresoEditando.id)?.valor || 0);
      const saldoConEdicion = this.saldoDisponible + valorOriginal;
      if (+this.egresoEditando.valor > saldoConEdicion) {
        this.erroresEditar.valor = `Excede el saldo disponible ($${saldoConEdicion.toFixed(2)})`;
        valido = false;
      }
    }

    if (!valido) return;

    this.guardandoEdicion = true;
    this.http.put<Egreso>(`${this.API}/egresos/${this.egresoEditando.id}`,
      { detalle: this.egresoEditando.detalle.trim(), responsable: this.egresoEditando.responsable, beneficiario: this.egresoEditando.beneficiario, valor: this.egresoEditando.valor },
      { headers: this.getHeaders() }
    ).subscribe({
      next: (updated) => {
        this.egresos = this.egresos.map(e => e.id === updated.id ? updated : e);
        this.actualizarAdvertencia();
        this.guardandoEdicion = false;
        this.cerrarEditar();
      },
      error: () => { this.guardandoEdicion = false; this.erroresEditar.general = 'Error al guardar, intenta de nuevo'; }
    });
  }

  // ---- BORRAR ------------------------------------------------------------
  confirmarBorrar(egreso: Egreso) { this.egresoABorrar = egreso; this.mostrarConfirmarBorrar = true; }
  cancelarBorrar() { this.mostrarConfirmarBorrar = false; this.egresoABorrar = null; }

  borrarEgreso() {
    if (!this.egresoABorrar?.id) return;
    this.borrando = true;
    this.http.delete(`${this.API}/egresos/${this.egresoABorrar.id}`, { headers: this.getHeaders() })
      .subscribe({
        next: () => {
          this.egresos = this.egresos.filter(e => e.id !== this.egresoABorrar!.id);
          this.actualizarAdvertencia();
          this.borrando = false;
          this.cancelarBorrar();
        },
        error: () => { this.borrando = false; this.cancelarBorrar(); }
      });
  }

  abrirMenu()  { this.menuAbierto = true;  }
  cerrarMenu() { this.menuAbierto = false; }
  cerrarSesion() { this.authService.logout(); this.menuAbierto = false; this.router.navigate(['/login']); }
  irAClientes()   { this.cerrarMenu(); this.router.navigate(['/clientes']);   }
  irAHistorial()  { this.cerrarMenu(); this.router.navigate(['/historial']);  }
  irAInventario() { this.cerrarMenu(); this.router.navigate(['/inventario']); }
  irAEgresos()    { this.cerrarMenu(); this.router.navigate(['/egresos']);    }
}