import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth';

export interface Egreso {
  id?: number;
  detalle: string;
  creadoPor: string;
  beneficiario: string;
  valor: number;
  fecha?: string;
}

@Component({
  selector: 'app-egresos',
  templateUrl: 'egresos.page.html',
  styleUrls: ['egresos.page.scss'],
  standalone: false,
})
export class EgresosPage implements OnInit {

  menuAbierto = false;
  usuarioActual: string = '';

  diaSemana: string = '';
  fechaHoy: string = '';

  egresos: Egreso[] = [];
  cargando = false;

  get totalEgresos(): number {
    return this.egresos.reduce((acc, e) => acc + e.valor, 0);
  }

  // Modal
  mostrarModal = false;
  guardando = false;
  nuevoEgreso: Egreso = { detalle: '', creadoPor: '', beneficiario: '', valor: 0 };
  errores: any = {};

  constructor(
    public router: Router,
    private authService: AuthService
  ) {}

  ngOnInit() {
    const user = this.authService.getUsuario();
    this.usuarioActual = user?.nombre || user?.username || '';
    this.setFecha();
    this.cargarEgresos();
  }

  setFecha() {
    const dias = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
    const hoy = new Date();
    this.diaSemana = dias[hoy.getDay()];
    this.fechaHoy = `${hoy.getDate().toString().padStart(2,'0')}/${(hoy.getMonth()+1).toString().padStart(2,'0')}/${hoy.getFullYear()}`;
  }

  cargarEgresos() {
    this.cargando = true;
    // TODO: reemplazar con tu servicio real
    // this.egresosService.getHoy().subscribe({ next: data => { this.egresos = data; this.cargando = false; } })
    setTimeout(() => {
      this.egresos = [
        { detalle: 'Adelanto',  creadoPor: 'PPanjon', beneficiario: 'PPanjon', valor: 40 },
        { detalle: 'Desayuno',  creadoPor: 'PPanjon', beneficiario: 'PPanjon', valor: 4  },
        { detalle: 'Gasolina',  creadoPor: 'PPanjon', beneficiario: 'Carro',   valor: 15 },
        { detalle: 'Adelanto',  creadoPor: 'PPanjon', beneficiario: 'PPanjon', valor: 40 },
        { detalle: 'Adelanto',  creadoPor: 'PPanjon', beneficiario: 'PPanjon', valor: 40 },
        { detalle: 'Adelanto',  creadoPor: 'PPanjon', beneficiario: 'PPanjon', valor: 40 },
        { detalle: 'Adelanto',  creadoPor: 'PPanjon', beneficiario: 'PPanjon', valor: 40 },
        { detalle: 'Adelanto',  creadoPor: 'PPanjon', beneficiario: 'PPanjon', valor: 40 },
      ];
      this.cargando = false;
    }, 400);
  }

  // ---- MODAL ----
  abrirModal() {
    this.nuevoEgreso = { detalle: '', creadoPor: this.usuarioActual, beneficiario: '', valor: 0 };
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
    if (!this.nuevoEgreso.creadoPor.trim()) {
      this.errores.creadoPor = 'El responsable es requerido'; valido = false;
    }
    if (!this.nuevoEgreso.beneficiario.trim()) {
      this.errores.beneficiario = 'El beneficiario es requerido'; valido = false;
    }
    if (!this.nuevoEgreso.valor || this.nuevoEgreso.valor <= 0) {
      this.errores.valor = 'Ingresa un valor válido'; valido = false;
    }

    if (!valido) return;

    this.guardando = true;
    // TODO: reemplazar con tu servicio real
    // this.egresosService.create(this.nuevoEgreso).subscribe({ next: () => { ... } })
    setTimeout(() => {
      this.egresos = [...this.egresos, { ...this.nuevoEgreso }];
      this.guardando = false;
      this.cerrarModal();
    }, 500);
  }

  seleccionarEgreso(egreso: Egreso) {
    // TODO: abrir detalle o edición si se necesita
  }

  // ---- MENU ----
  irAClientes() { this.cerrarMenu(); this.router.navigate(['/clientes']); }
  irAHistorial() { this.cerrarMenu(); this.router.navigate(['/historial']); }
  irAInventario() { this.cerrarMenu(); this.router.navigate(['/inventario']); }
  irAEgresos() { this.cerrarMenu(); this.router.navigate(['/egresos']); }

  abrirMenu() { this.menuAbierto = true; }
  cerrarMenu() { this.menuAbierto = false; }

  cerrarSesion() {
    this.authService.logout();
    this.menuAbierto = false;
    this.router.navigate(['/login']);
  }
}