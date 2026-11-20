import {defineConfig,devices} from '@playwright/test';

export default defineConfig({
 testDir:'./e2e',
 timeout:90_000,
 expect:{timeout:15_000},
 retries:0,
 workers:1,
 reporter:process.env.CI?'list':'html',
 use:{
   baseURL:'http://localhost:5173',
   actionTimeout:15_000,
   navigationTimeout:20_000,
   ...devices['Desktop Chrome'],
   screenshot:'only-on-failure',
   trace:'retain-on-failure'
 },
 webServer:[
   {command:'npm run dev:api',url:'http://localhost:4000/health',
    timeout:120_000,reuseExistingServer:!process.env.CI,
    env:{NODE_ENV:'development'}},
   {command:'npm run dev:web',url:'http://localhost:5173',
    timeout:120_000,reuseExistingServer:!process.env.CI}
 ]
});
