import { TestBed } from '@angular/core/testing';

import { VentasRuta } from './ventas-ruta';

describe('VentasRuta', () => {
  let service: VentasRuta;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(VentasRuta);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
