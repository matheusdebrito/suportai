import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({plugins:[react()],server:{proxy:{'/auth':'http://localhost:4000','/admin':'http://localhost:4000','/knowledge':'http://localhost:4000','/conversations':'http://localhost:4000','/spaces':'http://localhost:4000','/feedback':'http://localhost:4000'}}});
