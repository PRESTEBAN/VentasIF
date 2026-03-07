import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CajaPage } from './caja.page';

describe('CajaPage', () => {
  let component: CajaPage;
  let fixture: ComponentFixture<CajaPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(CajaPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
