import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.ionic.starter',
  appName: 'VentasIF',
  webDir: 'www',
   server: {
    allowNavigation: ['ventasif-if-api.onrender.com']
  }
};

export default config;
