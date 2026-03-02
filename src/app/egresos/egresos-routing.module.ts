import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { EgresosPage } from './egresos.page';

const routes: Routes = [
  {
    path: '',
    component: EgresosPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class EgresosPageRoutingModule {}
