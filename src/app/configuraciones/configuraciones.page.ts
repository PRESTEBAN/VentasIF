import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth';
import { PrinterService } from '../services/printer';
import { PushNotificationsService } from '../services/push-notifications';
import { Capacitor } from '@capacitor/core';
import { ToastController } from '@ionic/angular';

const PREFS_KEY = 'ventasif_prefs';

export interface AppPrefs {
  ivaDefecto: number;
  fondoInicialCaja: number;
  autoReconectarImpresora: boolean;
  confirmarFinalizarVenta: boolean;
  mostrarStockGrid: boolean;
  vibracionAlVender: boolean;
  tamanoFuenteImpresora: 'normal' | 'grande';
  mostrarPrecioMenorPrimero: boolean;
}

const PREFS_DEFAULT: AppPrefs = {
  ivaDefecto: 0,
  fondoInicialCaja: 40,
  autoReconectarImpresora: true,
  confirmarFinalizarVenta: false,
  mostrarStockGrid: true,
  vibracionAlVender: true,
  tamanoFuenteImpresora: 'normal',
  mostrarPrecioMenorPrimero: false,
};

@Component({
  selector: 'app-configuraciones',
  templateUrl: 'configuraciones.page.html',
  styleUrls: ['configuraciones.page.scss'],
  standalone: false,
})
export class ConfiguracionesPage implements OnInit {

  menuAbierto = false;
  usuarioActual = '';

  // ── Impresora ─────────────────────────────────────────────────────────
  escaneandoBT = false;
  conectandoBT = '';
  dispositivosBT: any[] = [];
  mostrarListaBT = false;

  // ── Estado permisos ───────────────────────────────────────────────────
  permisoNotificaciones: 'concedido' | 'denegado' | 'desconocido' = 'desconocido';
  permisoBluetooth: 'concedido' | 'denegado' | 'desconocido' = 'desconocido';
  permisoUbicacion: 'concedido' | 'denegado' | 'desconocido' = 'desconocido';

  // ── Info dispositivo ──────────────────────────────────────────────────
  esNativo = false;
  plataforma = '';
  versionApp = '1.0.0';

  // ── Preferencias ──────────────────────────────────────────────────────
  prefs: AppPrefs = { ...PREFS_DEFAULT };
  guardandoPrefs = false;

  constructor(
    public router: Router,
    private authService: AuthService,
    public printerService: PrinterService,
    private pushService: PushNotificationsService,
    private toastCtrl: ToastController,
  ) {}

  ngOnInit() {
    const user = this.authService.getUsuario();
    this.usuarioActual = user?.nombre || user?.username || '';
    this.esNativo = Capacitor.isNativePlatform();
    this.plataforma = Capacitor.getPlatform();
    this.cargarPrefs();
    this.verificarPermisos();
  }

  ionViewWillEnter() { this.verificarPermisos(); }

  // ── Preferencias ──────────────────────────────────────────────────────
  cargarPrefs() {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      if (raw) this.prefs = { ...PREFS_DEFAULT, ...JSON.parse(raw) };
    } catch { this.prefs = { ...PREFS_DEFAULT }; }
  }

  async guardarPrefs() {
    this.guardandoPrefs = true;
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(this.prefs));
      await this.mostrarToast('Preferencias guardadas ✓', 'success');
    } catch {
      await this.mostrarToast('Error al guardar', 'danger');
    } finally {
      this.guardandoPrefs = false;
    }
  }

  resetearPrefs() {
    this.prefs = { ...PREFS_DEFAULT };
    localStorage.setItem(PREFS_KEY, JSON.stringify(this.prefs));
    this.mostrarToast('Preferencias restauradas', 'medium');
  }

  // ── Permisos ──────────────────────────────────────────────────────────
  async verificarPermisos() {
    if (!this.esNativo) return;
    try {
      const { PushNotifications } = await import('@capacitor/push-notifications');
      const status = await PushNotifications.checkPermissions();
      this.permisoNotificaciones = status.receive === 'granted' ? 'concedido' : 'denegado';
    } catch { this.permisoNotificaciones = 'desconocido'; }

    const permissions = (window as any).cordova?.plugins?.permissions;
    if (permissions) {
      this.checkPermission(permissions, 'android.permission.BLUETOOTH_CONNECT', (ok) => this.permisoBluetooth = ok ? 'concedido' : 'denegado');
      this.checkPermission(permissions, 'android.permission.ACCESS_FINE_LOCATION', (ok) => this.permisoUbicacion = ok ? 'concedido' : 'denegado');
    }
  }

  private checkPermission(permissions: any, perm: string, cb: (ok: boolean) => void) {
    permissions.checkPermission(perm, (s: any) => cb(s.hasPermission), () => cb(false));
  }

  async solicitarPermisoNotificaciones() {
    try {
      const { PushNotifications } = await import('@capacitor/push-notifications');
      const result = await PushNotifications.requestPermissions();
      this.permisoNotificaciones = result.receive === 'granted' ? 'concedido' : 'denegado';
      if (result.receive === 'granted') {
        await PushNotifications.register();
        this.mostrarToast('Notificaciones activadas ✓', 'success');
      } else {
        this.mostrarToast('Permiso denegado — actívalo en Ajustes del teléfono', 'warning');
      }
    } catch { this.mostrarToast('Error al solicitar permiso', 'danger'); }
  }

  async solicitarPermisoBluetooth() {
    const permissions = (window as any).cordova?.plugins?.permissions;
    if (!permissions) { this.mostrarToast('Plugin de permisos no disponible en web', 'warning'); return; }
    const perms = ['android.permission.BLUETOOTH_CONNECT', 'android.permission.BLUETOOTH_SCAN', 'android.permission.ACCESS_FINE_LOCATION'];
    let todos = true;
    for (const p of perms) {
      await new Promise<void>(res => {
        permissions.requestPermission(p, (s: any) => { if (!s.hasPermission) todos = false; res(); }, () => { todos = false; res(); });
      });
    }
    this.verificarPermisos();
    this.mostrarToast(todos ? 'Permisos Bluetooth concedidos ✓' : 'Algunos permisos fueron denegados', todos ? 'success' : 'warning');
  }

  // ── Impresora ─────────────────────────────────────────────────────────
  async escanearImpresoras() {
    this.escaneandoBT = true;
    this.mostrarListaBT = true;
    this.dispositivosBT = [];
    try {
      const devices = await this.printerService.escanearDispositivos();
      this.dispositivosBT = devices;
      if (devices.length === 0) this.mostrarToast('No se encontraron dispositivos pareados', 'warning');
    } catch { this.mostrarToast('Error al escanear', 'danger'); }
    finally { this.escaneandoBT = false; }
  }

  async conectarImpresora(dispositivo: any) {
    if (this.conectandoBT === dispositivo.address) return;
    this.conectandoBT = dispositivo.address;
    try {
      await this.printerService.conectar(dispositivo.address, dispositivo.name || dispositivo.address);
      this.mostrarToast(`Conectado a ${dispositivo.name || dispositivo.address} ✓`, 'success');
    } catch { this.mostrarToast('Error al conectar. Verifica que esté encendida.', 'danger'); }
    finally { this.conectandoBT = ''; }
  }

  async desconectarImpresora() {
    await this.printerService.desconectar();
    this.mostrarToast('Impresora desconectada', 'medium');
  }

  async imprimirPrueba() {
    try {
      const conectado = await this.printerService.estaConectado();
      if (!conectado) { this.mostrarToast('No hay impresora conectada', 'warning'); return; }
      await this.printerService.imprimirRecibo({
        ventaId: 0,
        clienteNombre: 'PRUEBA DE IMPRESION',
        clienteCedula: '0000000000',
        clienteTelefono: '-',
        clienteDireccion: '-',
        vendedor: this.usuarioActual,
        items: [{ nombre: 'Producto de prueba', cantidad: 1, precio_unitario: 1.00, descuento: 0, subtotal: 1.00 }],
        subtotal: 1.00, descuento: 0, iva: 0, ivaPercent: 0,
        total: 1.00, formaPago: 'Efectivo', montoRecibido: 1.00, vuelto: 0,
      });
      this.mostrarToast('Impresión de prueba enviada ✓', 'success');
    } catch (e: any) { this.mostrarToast(`Error: ${e?.message || 'desconocido'}`, 'danger'); }
  }

  // ── Utils ─────────────────────────────────────────────────────────────
  async mostrarToast(msg: string, color: string) {
    const t = await this.toastCtrl.create({ message: msg, duration: 2500, position: 'bottom', color });
    await t.present();
  }

  getLabelPermiso(estado: string): string {
    if (estado === 'concedido') return 'Concedido';
    if (estado === 'denegado') return 'Denegado';
    return 'Desconocido';
  }

  getColorPermiso(estado: string): string {
    if (estado === 'concedido') return '#2E7D32';
    if (estado === 'denegado') return '#C62828';
    return '#888';
  }

  abrirMenu() { this.menuAbierto = true; }
  cerrarMenu() { this.menuAbierto = false; }
  cerrarSesion() { this.authService.logout(); this.router.navigate(['/login']); }
}