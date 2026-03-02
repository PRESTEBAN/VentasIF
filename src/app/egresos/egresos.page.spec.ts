import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EgresosPage } from './egresos.page';

describe('EgresosPage', () => {
  let component: EgresosPage;
  let fixture: ComponentFixture<EgresosPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(EgresosPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
