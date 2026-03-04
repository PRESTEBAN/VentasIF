import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class PrinterService {

  private impresora: { id: string; name: string } | null = null;

  get dispositivoConectado() { return this.impresora; }

  private get bt(): any {
    return (window as any).bluetoothSerial;
  }

  async escanearDispositivos(): Promise<any[]> {
    return new Promise((resolve) => {
      if (!this.bt) { resolve([]); return; }
      this.bt.list(
        (devices: any[]) => resolve(devices || []),
        () => resolve([])
      );
    });
  }

  async conectar(address: string, name: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.bt) { reject(new Error('Plugin no disponible')); return; }
      this.bt.connect(
        address,
        () => { this.impresora = { id: address, name }; resolve(); },
        (err: any) => reject(new Error(err || 'Error al conectar'))
      );
    });
  }

  async desconectar(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.bt) { resolve(); return; }
      this.bt.disconnect(
        () => { this.impresora = null; resolve(); },
        () => { this.impresora = null; resolve(); }
      );
    });
  }

  async estaConectado(): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.bt) { resolve(false); return; }
      this.bt.isConnected(() => resolve(true), () => resolve(false));
    });
  }

  async descubrirServicios(): Promise<string> {
    return 'Bluetooth clásico SPP - conexión directa sin UUIDs';
  }

  async imprimirRecibo(datos: DatosRecibo): Promise<void> {
    const conectado = await this.estaConectado();
    if (!conectado) throw new Error('Impresora no conectada');

    const ESC      = '\x1B';
    const LF       = '\n';
    const BOLD_ON  = ESC + 'E\x01';
    const BOLD_OFF = ESC + 'E\x00';
    const CENTER   = ESC + 'a\x01';
    const LEFT     = ESC + 'a\x00';
    const CUT      = ESC + 'm';
    const ANCHO    = 32;
    const LINEA    = '-'.repeat(ANCHO);

    const col2 = (izq: string, der: string): string => {
      return izq + ' '.repeat(Math.max(1, ANCHO - izq.length - der.length)) + der;
    };

    const ahora = new Date();
    const fecha = `${ahora.getDate().toString().padStart(2,'0')}/${(ahora.getMonth()+1).toString().padStart(2,'0')}/${ahora.getFullYear()}`;
    const hora  = `${ahora.getHours().toString().padStart(2,'0')}:${ahora.getMinutes().toString().padStart(2,'0')}`;

    let t = '';
    t += CENTER + BOLD_ON + 'INDUSTRIAL FATIMA' + LF + BOLD_OFF;
    t += 'Recibo de Venta' + LF + LINEA + LF + LEFT;
    t += col2('Fecha:', fecha) + LF;
    t += col2('Hora:',  hora)  + LF;
    t += col2('Cliente:', datos.clienteNombre.substring(0, 20)) + LF;
    if (datos.clienteCedula) t += col2('C.I.:', datos.clienteCedula) + LF;
    t += LINEA + LF;
    t += BOLD_ON + col2('PRODUCTO', 'SUBTOTAL') + BOLD_OFF + LF + LINEA + LF;

    datos.items.forEach((item: any) => {
      const nombre = item.nombre.length > ANCHO ? item.nombre.substring(0, ANCHO - 3) + '...' : item.nombre;
      t += nombre + LF;
      t += col2(`  ${item.cantidad} x $${item.precio_unitario.toFixed(2)}`, `$${item.subtotal.toFixed(2)}`) + LF;
      if (item.descuento > 0) t += col2('  Desc:', `-${item.descuento}%`) + LF;
    });

    t += LINEA + LF;
    t += col2('Subtotal:', `$${datos.subtotal.toFixed(2)}`) + LF;
    if (datos.descuento > 0) t += col2('Descuento:', `-$${datos.descuento.toFixed(2)}`) + LF;
    if (datos.iva > 0)       t += col2(`IVA (${datos.ivaPercent}%):`, `$${datos.iva.toFixed(2)}`) + LF;
    t += BOLD_ON + col2('TOTAL:', `$${datos.total.toFixed(2)}`) + BOLD_OFF + LF + LINEA + LF;
    t += col2('Forma de pago:', datos.formaPago) + LF;
    if (datos.formaPago === 'Efectivo' && datos.montoRecibido) {
      t += col2('Recibido:', `$${datos.montoRecibido.toFixed(2)}`) + LF;
      t += col2('Vuelto:',   `$${datos.vuelto.toFixed(2)}`)        + LF;
    }
    t += LINEA + LF + CENTER + '¡Gracias por su compra!' + LF + 'Industrial Fatima' + LF;
    t += LF + LF + LF + CUT;

    return new Promise((resolve, reject) => {
      this.bt.write(
        t,
        () => resolve(),
        (err: any) => reject(new Error(err || 'Error al escribir'))
      );
    });
  }
}

export interface DatosRecibo {
  clienteNombre:  string;
  clienteCedula?: string;
  items: {
    nombre:          string;
    cantidad:        number;
    precio_unitario: number;
    descuento:       number;
    subtotal:        number;
  }[];
  subtotal:      number;
  descuento:     number;
  iva:           number;
  ivaPercent:    number;
  total:         number;
  formaPago:     string;
  montoRecibido: number;
  vuelto:        number;
}