import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Two build targets:
//   `npm run dev` / `npm run build`       — normal multi-file app, for development.
//   `npm run build:singlefile`            — bundles everything (JS, CSS, no
//                                            external chunks) into one
//                                            dist/UwUTensors.html, matching
//                                            the project's "bundled into a
//                                            single UwUTensors.html" spec and
//                                            the original waifu-magnet
//                                            single-file distribution model.
const singlefile = process.env.BUILD_TARGET === 'singlefile'

export default defineConfig({
  plugins: [react(), ...(singlefile ? [viteSingleFile()] : [])],
  build: {
    assetsInlineLimit: singlefile ? Infinity : 4096,
    cssCodeSplit: !singlefile,
  },
})
