import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Whitelist the Digital Ocean app domain to prevent the "Host not allowed" error.
    // The leading dot acts as a wildcard for any subdomains.
    allowedHosts: ['.ondigitalocean.app'],
  },
  preview: {
    // Configure the preview server to listen on all network interfaces and on the correct port.
    host: '0.0.0.0',
    port: 8080,
  }
})