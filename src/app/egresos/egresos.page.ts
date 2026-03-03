import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth';
import { HttpClient, HttpHeaders } from '@angular/common/http';

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

  menuAbierto    = false;
  usuarioActual  = '';

  private pollingInterval: any = null;
  private readonly POLLING_MS  = 15000;

  // ---- CALENDARIO (igual que historial) ----
  fechaSeleccionada: Date = new Date();
  semanaActual: Date[]    = [];
  mostrarDatePicker       = false;

  // ---- DATOS ----
  egresos:  Egreso[]  = [];
  usuarios: Usuario[] = [];
  cargando = false;

  get totalEgresos(): number {
    return this.egresos.reduce((acc, e) => acc + +e.valor, 0);
  }

  // ---- MODAL ----
  mostrarModal = false;
  guardando    = false;
  nuevoEgreso: Egreso = { detalle: '', responsable: '', beneficiario: '', valor: 0 };
  errores: any = {};

  // Opciones extra para beneficiario
  readonly OPCIONES_EXTRA = ['Vehiculo', 'Fabrica'];

  constructor(
    public router: Router,
    private authService: AuthService,
    private http: HttpClient
  ) {}

  ngOnInit() {
    const user = this.authService.getUsuario();
    this.usuarioActual = user?.nombre || user?.username || '';
    this.generarSemana(this.fechaSeleccionada);
  }

  ionViewWillEnter() {
    this.cargarUsuarios();
    this.cargarEgresos();
    this.iniciarPolling();
  }

  ionViewWillLeave() {
    this.detenerPolling();
  }

  ngOnDestroy() {
    this.detenerPolling();
  }

  iniciarPolling() {
    this.detenerPolling();
    this.pollingInterval = setInterval(() => {
      this.cargarEgresosSilencioso();
    }, this.POLLING_MS);
  }

  detenerPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  cargarEgresosSilencioso() {
    const fechaStr = this.formatearFecha(this.fechaSeleccionada);
    this.http.get<Egreso[]>(`${this.API}/egresos?fecha=${fechaStr}`, { headers: this.getHeaders() })
      .subscribe({
        next: (data) => {
          const idsActuales = new Set(this.egresos.map(e => e.id));
          data.forEach(egreso => {
            if (!idsActuales.has(egreso.id)) {
              this.egresos = [...this.egresos, egreso];
            }
          });
        },
        error: () => {}
      });
  }

  private getHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }

  // ---- USUARIOS ----
  cargarUsuarios() {
    this.http.get<Usuario[]>(`${this.API}/egresos/usuarios`, { headers: this.getHeaders() })
      .subscribe({
        next: (data) => {
          this.usuarios = data;
          // Por defecto responsable = usuario Admin
          const admin = data.find(u => u.username?.toLowerCase() === 'admin');
          if (admin && !this.nuevoEgreso.responsable) {
            this.nuevoEgreso.responsable = admin.username;
          }
        },
        error: () => {}
      });
  }

  // Opciones beneficiario = usuarios + Vehiculo + Fabrica
  get opcionesBeneficiario(): string[] {
    const usernames = this.usuarios.map(u => u.username);
    return [...usernames, ...this.OPCIONES_EXTRA];
  }

  // ---- CALENDARIO ----
  generarSemana(fecha: Date) {
    const dias: Date[] = [];
    for (let i = -3; i <= 3; i++) {
      const d = new Date(fecha);
      d.setDate(fecha.getDate() + i);
      dias.push(d);
    }
    this.semanaActual = dias;
  }

  semanaAnterior() {
    const nueva = new Date(this.fechaSeleccionada);
    nueva.setDate(nueva.getDate() - 7);
    this.fechaSeleccionada = nueva;
    this.generarSemana(nueva);
    this.cargarEgresos();
  }

  semanaSiguiente() {
    const nueva = new Date(this.fechaSeleccionada);
    nueva.setDate(nueva.getDate() + 7);
    this.fechaSeleccionada = nueva;
    this.generarSemana(nueva);
    this.cargarEgresos();
  }

  esSemanaActual(): boolean {
    return this.formatearFecha(this.fechaSeleccionada) >= this.formatearFecha(new Date());
  }

  seleccionarDia(dia: Date) {
    this.fechaSeleccionada = new Date(dia);
    this.cargarEgresos();
  }

  esDiaSeleccionado(dia: Date): boolean {
    return dia.toDateString() === this.fechaSeleccionada.toDateString();
  }

  esHoy(dia: Date): boolean {
    return dia.toDateString() === new Date().toDateString();
  }

  abrirDatePicker()  { this.mostrarDatePicker = true;  }
  cerrarDatePicker() { this.mostrarDatePicker = false; }

  onDatePickerChange(event: any) {
    const valor = event.target.value;
    if (!valor) return;
    const [anio, mes, dia] = valor.split('-').map(Number);
    const nueva = new Date(anio, mes - 1, dia);
    this.fechaSeleccionada = nueva;
    this.generarSemana(nueva);
    this.cargarEgresos();
    this.cerrarDatePicker();
  }

  formatearFecha(fecha: Date): string {
    const d = fecha.getDate().toString().padStart(2, '0');
    const m = (fecha.getMonth() + 1).toString().padStart(2, '0');
    const a = fecha.getFullYear();
    return `${a}-${m}-${d}`;
  }

  // ---- EGRESOS ----
  cargarEgresos() {
    this.cargando = true;
    this.egresos  = [];
    const fechaStr = this.formatearFecha(this.fechaSeleccionada);

    this.http.get<Egreso[]>(`${this.API}/egresos?fecha=${fechaStr}`, { headers: this.getHeaders() })
      .subscribe({
        next: (data) => {
          this.egresos  = data;
          this.cargando = false;
        },
        error: () => {
          this.egresos  = [];
          this.cargando = false;
        }
      });
  }

  // ---- MODAL ----
  abrirModal() {
    // Responsable por defecto = Admin
    const admin = this.usuarios.find(u => u.username?.toLowerCase() === 'admin');
    this.nuevoEgreso = {
      detalle:      '',
      responsable:  admin ? admin.username : (this.usuarios[0]?.username || ''),
      beneficiario: '',
      valor:        0
    };
    this.errores = {};
    this.mostrarModal = true;
  }

  cerrarModal() {
    this.mostrarModal = false;
    this.errores = {};
  }

  guardarEgreso() {
    this.errores = {};
    let valido = true;

    if (!this.nuevoEgreso.detalle.trim()) {
      this.errores.detalle = 'El detalle es requerido'; valido = false;
    }
    if (!this.nuevoEgreso.responsable) {
      this.errores.responsable = 'El responsable es requerido'; valido = false;
    }
    if (!this.nuevoEgreso.beneficiario) {
      this.errores.beneficiario = 'El beneficiario es requerido'; valido = false;
    }
    if (!this.nuevoEgreso.valor || this.nuevoEgreso.valor <= 0) {
      this.errores.valor = 'Ingresa un valor válido'; valido = false;
    }

    if (!valido) return;

    this.guardando = true;
    this.http.post<Egreso>(
      `${this.API}/egresos`,
      {
        detalle:     this.nuevoEgreso.detalle.trim(),
        responsable: this.nuevoEgreso.responsable,
        beneficiario: this.nuevoEgreso.beneficiario,
        valor:       this.nuevoEgreso.valor
      },
      { headers: this.getHeaders() }
    ).subscribe({
      next: () => {
        this.guardando = false;
        this.cerrarModal();
        this.cargarEgresos();
      },
      error: () => {
        this.guardando = false;
        this.errores.general = 'Error al guardar, intenta de nuevo';
      }
    });
  }

  // ---- MENU ----
  abrirMenu()  { this.menuAbierto = true;  }
  cerrarMenu() { this.menuAbierto = false; }

  cerrarSesion() {
    this.authService.logout();
    this.menuAbierto = false;
    this.router.navigate(['/login']);
  }

  irAClientes()   { this.cerrarMenu(); this.router.navigate(['/clientes']);  }
  irAHistorial()  { this.cerrarMenu(); this.router.navigate(['/historial']); }
  irAInventario() { this.cerrarMenu(); this.router.navigate(['/inventario']); }
  irAEgresos()    { this.cerrarMenu(); this.router.navigate(['/egresos']);   }
}