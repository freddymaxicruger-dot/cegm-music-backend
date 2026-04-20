/**
 * CEGM Music Player - Backend Server
 * Express API server with YouTube Data API v3 integration
 */

import express from 'express';
import cors from 'cors';
import { Innertube, UniversalCache } from 'youtubei.js';
import axios from 'axios';
import dotenv from 'dotenv';
import play from 'play-dl';
// import https from 'https'; // Reemplazado por Innertube logic
import {
  searchMusic,
  getTrendingMusic,
  getVideoById,
  getRelatedVideos,
  getChannel,
  searchChannels,
  getMusicPlaylists,
  getPlaylistItems,
} from './youtube.js';

dotenv.config();

// Configurar Cookies de YouTube para evitar deteccin de bots (Necesario en Render)
if (process.env.YOUTUBE_COOKIE) {
  play.setToken({
    youtube: {
      cookie: process.env.YOUTUBE_COOKIE
    }
  });
  console.log('YouTube cookies loaded successfully');
}

// Configurar un User-Agent global para Play-DL
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Escudo Anti-Caídas Global
process.on('uncaughtException', (err) => {
  console.error('🔥 CRITICAL: Uncaught Exception:', err.message);
});

process.on('unhandledRejection', (reason: any) => {
  console.error('🔥 CRITICAL: Unhandled Rejection:', reason?.message || reason);
});

const app = express();
const PORT = process.env.PORT || 3001;

// Inicializacin de Innertube (Cargado una sola vez para mayor eficiencia)
let innertube: Innertube | null = null;

async function initInnertube() {
  try {
    // Usamos caché para evitar peticiones repetitivas de configuracin
    innertube = await Innertube.create({
      cache: new UniversalCache(false),
      generate_session_locally: true
    });
    
    if (process.env.YOUTUBE_COOKIE) {
      try {
        await innertube.session.signIn({
          cookie: process.env.YOUTUBE_COOKIE
        });
        console.log('✅ Innertube: Sesin iniciada con cookies');
      } catch (signInError: any) {
        console.error('⚠️ Innertube SignIn Error:', signInError.message);
        console.log('🔄 Cayendo a modo invitado para no bloquear el arranque...');
      }
    } else {
      console.log('⚠️ Innertube: Iniciado en modo invitado (sin cookies)');
    }
  } catch (error: any) {
    console.error('❌ Innertube Init Error:', error.message);
  }
}

initInnertube();

// Middleware
app.use(cors());
app.use(express.json());

// ===== API ROUTES =====

/**
 * GET /api/search?q=<query>&max=<maxResults>
 * Search YouTube for music videos
 */
app.get('/api/search', async (req, res) => {
  try {
    const query = req.query.q as string;
    const max = parseInt(req.query.max as string) || 20;
    
    if (!query) {
      return res.status(400).json({ error: 'Query parameter "q" is required' });
    }

    const results = await searchMusic(query, max);
    res.json({ results, total: results.length });
  } catch (error: any) {
    console.error('Search error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/trending?max=<maxResults>&region=<regionCode>
 * Get trending music videos
 */
app.get('/api/trending', async (req, res) => {
  try {
    const max = parseInt(req.query.max as string) || 20;
    const region = (req.query.region as string) || 'MX';
    
    const results = await getTrendingMusic(max, region);
    res.json({ results, total: results.length });
  } catch (error: any) {
    console.error('Trending error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/video/:id
 * Get a single video's details
 */
app.get('/api/video/:id', async (req, res) => {
  try {
    const video = await getVideoById(req.params.id);
    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }
    res.json(video);
  } catch (error: any) {
    console.error('Video detail error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/video/:id/related?max=<maxResults>
 * Get related videos
 */
app.get('/api/video/:id/related', async (req, res) => {
  try {
    const max = parseInt(req.query.max as string) || 10;
    const results = await getRelatedVideos(req.params.id, max);
    res.json({ results, total: results.length });
  } catch (error: any) {
    console.error('Related videos error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/channel/:id
 * Get channel details
 */
app.get('/api/channel/:id', async (req, res) => {
  try {
    const channel = await getChannel(req.params.id);
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }
    res.json(channel);
  } catch (error: any) {
    console.error('Channel error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/channels/search?q=<query>&max=<maxResults>
 * Search for YouTube channels (artists)
 */
app.get('/api/channels/search', async (req, res) => {
  try {
    const query = req.query.q as string;
    const max = parseInt(req.query.max as string) || 10;
    
    if (!query) {
      return res.status(400).json({ error: 'Query parameter "q" is required' });
    }

    const results = await searchChannels(query, max);
    res.json({ results, total: results.length });
  } catch (error: any) {
    console.error('Channel search error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/playlists/search?q=<query>&max=<maxResults>
 * Search for music playlists
 */
app.get('/api/playlists/search', async (req, res) => {
  try {
    const query = req.query.q as string;
    const max = parseInt(req.query.max as string) || 6;
    
    if (!query) {
      return res.status(400).json({ error: 'Query parameter "q" is required' });
    }

    const results = await getMusicPlaylists(query, max);
    res.json({ results, total: results.length });
  } catch (error: any) {
    console.error('Playlist search error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/playlist/:id/items?max=<maxResults>
 * Get items from a playlist
 */
app.get('/api/playlist/:id/items', async (req, res) => {
  try {
    const max = parseInt(req.query.max as string) || 25;
    const results = await getPlaylistItems(req.params.id, max);
    res.json({ results, total: results.length });
  } catch (error: any) {
    console.error('Playlist items error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/genres
 * Get genre-based playlists for browsing
 */
app.get('/api/genres', async (_req, res) => {
  try {
    const genres = ['Pop', 'Rock', 'Hip Hop', 'Electronic', 'Jazz', 'Reggaeton', 'Classical', 'R&B'];
    
    const genreResults = await Promise.all(
      genres.map(async (genre) => {
        const playlists = await getMusicPlaylists(genre, 1);
        const playlist = playlists[0];
        return {
          name: genre,
          image: playlist?.thumbnail || `https://picsum.photos/seed/${genre.toLowerCase()}/200/200`,
          playlistId: playlist?.id || null,
        };
      })
    );

    res.json({ genres: genreResults });
  } catch (error: any) {
    console.error('Genres error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/stream/audio/:videoId
 * Specialized streaming proxy for ExoPlayer/HTML5 Audio
 * Supports HTTP Range requests for seeking and fast buffering.
 */
app.get('/api/stream/audio/:videoId', async (req, res) => {
  try {
    const videoId = req.params.videoId;
    if (!videoId) return res.status(400).json({ error: 'Video ID is required' });

    const url = `https://www.youtube.com/watch?v=${videoId}`;
    console.log(`📡 Streaming request for: ${videoId}`);

    if (!innertube) {
       await initInnertube();
    }

    if (!innertube) {
       throw new Error('Streaming engine not initialized');
    }

    // Obtenemos la informacin del video usando la API interna "Innertube"
    const info = await innertube.getInfo(videoId);
    
    // Filtramos para obtener el mejor formato de audio
    const format = info.chooseFormat({ type: 'audio', quality: 'best' });

    if (!format) {
       throw new Error('No valid audio format found');
    }

    // Algunas canciones ya vienen con la URL directa, otras necesitan descifrado
    let downloadUrl = format.url;
    if (!downloadUrl) {
        try {
            downloadUrl = format.decipher(innertube.session.player);
        } catch (e) {
            console.error('Decipher warning:', e);
        }
    }

    if (!downloadUrl) throw new Error('Decipher failed or no URL available');

    // ¡NUEVA ARQUITECTURA!
    // Ya no hacemos un "pipe" infinito que consume el ancho de banda
    // de Render y dispara las alertas Anti-Bot.
    // Simplemente le damos al Frontend la URL directa descifrada.
    
    res.json({ url: downloadUrl, quality: format.audio_quality, mime: format.mime_type });

  } catch (error: any) {
    console.error('❌ Stream proxy error:', error.message);
    if (!res.headersSent) {
       const status = error.message.includes('429') ? 429 : 500;
       res.status(status).json({ error: error.message });
    }
  }
});

/**
 * GET /api/stream/:videoId
 * Original endpoint for compatibility - still returns direct URL if needed
 */
app.get('/api/stream/:videoId', async (req, res) => {
  // ... (existing logic kept for compat)
  try {
    const videoId = req.params.videoId;
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const info = await play.video_info(url);
    const format = info.format
      .filter(f => f.mimeType?.includes('audio'))
      .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
    
    if (format && format.url) {
      res.json({ url: format.url });
    } else {
      res.status(500).json({ error: 'Extraction failed' });
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

import https from 'https';

/**
 * GET /api/download/:videoId
 * Downloads the video as an audio file
 */
app.get('/api/download/:videoId', async (req, res) => {
  try {
    const videoId = req.params.videoId;
    if (!videoId) {
      return res.status(400).json({ error: 'Video ID is required' });
    }

    const title = req.query.title ? String(req.query.title).replace(/[^\w\s-]/gi, '') : videoId;
    const url = `https://www.youtube.com/watch?v=${videoId}`;

    // Extract the raw media URL using play-dl (much faster than youtube-dl-exec)
    const info = await play.video_info(url);
    const format = info.format
      .filter(f => f.mimeType?.includes('audio'))
      .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
    
    if (!format || !format.url) {
      return res.status(500).json({ error: 'Could not extract audio url' });
    }

    // Set headers for file download
    res.setHeader('Content-Disposition', `attachment; filename="${title}.mp3"`);
    res.setHeader('Content-Type', 'audio/mpeg');

    // Pipe the audio stream securely via https
    https.get(format.url, (audioStream) => {
      audioStream.pipe(res);
      
      audioStream.on('error', (err) => {
        console.error('Audio stream error:', err);
        if (!res.headersSent) res.status(500).end();
      });
    }).on('error', (err) => {
      console.error('HTTPS get error:', err);
      if (!res.headersSent) res.status(500).end();
    });

  } catch (error: any) {
    console.error('Download error:', error.message);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    }
  }
});

/**
 * GET /api/health
 * Health check endpoint
 */
app.get('/api/health', (_req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    hasApiKey: !!process.env.YOUTUBE_API_KEY 
  });
});

// Start server
app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`\n🎵 CEGM Music Server running on http://localhost:${PORT}`);
  console.log(`📡 YouTube API Key: ${process.env.YOUTUBE_API_KEY ? '✅ Configured' : '❌ Missing'}`);
  console.log(`\nEndpoints:`);
  console.log(`  GET /api/search?q=<query>`);
  console.log(`  GET /api/trending`);
  console.log(`  GET /api/video/:id`);
  console.log(`  GET /api/video/:id/related`);
  console.log(`  GET /api/channel/:id`);
  console.log(`  GET /api/channels/search?q=<query>`);
  console.log(`  GET /api/playlists/search?q=<query>`);
  console.log(`  GET /api/playlist/:id/items`);
  console.log(`  GET /api/genres`);
  console.log(`  GET /api/stream/:videoId`);
  console.log(`  GET /api/health\n`);
});
