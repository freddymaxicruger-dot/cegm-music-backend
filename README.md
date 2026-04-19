# CEGM Music Player Backend

Este es el backend para la aplicación CEGM Music Player. Proporciona una API para buscar música, obtener tendencias y realizar streaming/descarga de audio utilizando la API de YouTube.

## Despliegue en Render

Para subir este proyecto a Render y tenerlo 24/7, sigue estos pasos:

1. **GitHub**: Crea un repositorio nuevo en GitHub y sube todos los archivos de esta carpeta.
2. **Render**:
   - Crea un nuevo **Web Service**.
   - Conecta tu repositorio de GitHub.
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Environment Variables**:
     - `YOUTUBE_API_KEY`: Tu clave de API de YouTube (obtenla en Google Cloud Console).
     - `PORT`: (Opcional) Render asigna un puerto automáticamente, pero puedes poner `3001` si prefieres.

## Estructura de archivos

- `server/index.ts`: Punto de entrada del servidor Express.
- `server/youtube.ts`: Lógica de integración con YouTube.
- `package.json`: Definición de dependencias y scripts.
- `tsconfig.json`: Configuración de TypeScript.

## Dependencias principales

- `express`: Framework web.
- `cors`: Habilitar peticiones desde el frontend.
- `tsx`: Ejecutor de TypeScript para Node.js.
- `play-dl` / `youtube-dl-exec`: Herramientas para manejar contenido de YouTube.
