/**
 * CEGM Music Player - Backend Server (Render Deploy)
 * Express API server with YouTube Data API v3 integration
 * 
 * IMPORTANT: This file must stay in sync with the local server/index.ts
 * for all streaming endpoints to work on the APK.
 */

import express from 'express';
import cors from 'cors';
import { Innertube, UniversalCache } from 'youtubei.js';
import axios from 'axios';
import dotenv from 'dotenv';
import play from 'play-dl';
import https from 'https';
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

// Configurar Cookies de YouTube para evitar detección de bots (Necesario en Render)
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

// Inicialización de Innertube (Cargado una sola vez para mayor eficiencia)
let innertube: Innertube | null = null;

async function initInnertube() {
  try {
    // Usamos caché para evitar peticiones repetitivas de configuración
    innertube = await Innertube.create({
      cache: new UniversalCache(false),
      generate_session_locally: true,
      retrieve_player: true
    });

    if (process.env.YOUTUBE_COOKIE) {
      try {
        await innertube.session.signIn({
          cookie: process.env.YOUTUBE_COOKIE
        });
        console.log('✅ Innertube: Sesión iniciada con cookies');
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

// ===== STREAMING ENDPOINTS =====

/**
 * Helper: Extract best audio URL using multiple strategies
 * Tries Innertube first, then play-dl as fallback
 * 
 * IMPORTANT: In youtubei.js v17, format.decipher() returns a Promise<string>,
 * and format.url may be undefined for encrypted streams.
 */
async function extractAudioUrl(videoId: string): Promise<{ url: string, mime?: string } | null> {
  // Strategy 1: Innertube (preferred — supports more formats)
  try {
    if (!innertube) await initInnertube();
    if (innertube) {
      const info = await innertube.getInfo(videoId);
      const format = info.chooseFormat({ type: 'audio', quality: 'best' });
      
      if (format) {
        let downloadUrl: string | undefined;
        
        // format.url may be a string or undefined
        if (format.url) {
          downloadUrl = String(format.url);
        }
        
        // If no direct URL, decipher it (returns a Promise in v17!)
        if (!downloadUrl) {
          try {
            const deciphered = await format.decipher(innertube.session.player);
            if (deciphered) {
              downloadUrl = String(deciphered);
            }
          } catch (e) {
            console.warn('Innertube decipher failed:', (e as any)?.message);
          }
        }
        
        if (downloadUrl && typeof downloadUrl === 'string' && downloadUrl.startsWith('http')) {
          console.log('✅ Innertube extracted audio URL');
          return { url: downloadUrl, mime: format.mime_type };
        }
      }
    }
  } catch (e: any) {
    console.warn('⚠️ Innertube strategy failed:', e.message);
  }

  // Strategy 2: play-dl (fallback — uses different extraction method)
  try {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const info = await play.video_info(url);
    const format = info.format
      .filter(f => f.mimeType?.includes('audio'))
      .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
    
    if (format?.url) {
      console.log('✅ play-dl extracted audio URL');
      return { url: String(format.url), mime: format.mimeType };
    }
  } catch (e: any) {
    console.warn('⚠️ play-dl strategy failed:', e.message);
  }

  // Strategy 3: Reinitialize Innertube with fresh session and retry
  try {
    console.log('🔄 Reinitializing Innertube with fresh session...');
    innertube = await Innertube.create({
      cache: new UniversalCache(false),
      generate_session_locally: true
    });
    
    const info = await innertube.getInfo(videoId);
    const format = info.chooseFormat({ type: 'audio', quality: 'best' });
    
    if (format) {
      let downloadUrl: string | undefined;
      
      if (format.url) {
        downloadUrl = String(format.url);
      }
      
      if (!downloadUrl) {
        try {
          const deciphered = await format.decipher(innertube.session.player);
          if (deciphered) {
            downloadUrl = String(deciphered);
          }
        } catch (e) {
          // ignore
        }
      }
      
      if (downloadUrl && typeof downloadUrl === 'string' && downloadUrl.startsWith('http')) {
        console.log('✅ Fresh Innertube session extracted audio URL');
        return { url: downloadUrl, mime: format.mime_type };
      }
    }
  } catch (e: any) {
    console.warn('⚠️ Fresh Innertube strategy failed:', e.message);
  }

  return null;
}

/**
 * GET /api/stream/audio/:videoId
 * Returns the deciphered direct audio URL as JSON.
 * Used by the frontend to get a playable URL.
 */
app.get('/api/stream/audio/:videoId', async (req, res) => {
  try {
    const videoId = req.params.videoId;
    if (!videoId) return res.status(400).json({ error: 'Video ID is required' });

    console.log(`📡 Stream URL request for: ${videoId}`);
    
    const result = await extractAudioUrl(videoId);
    
    if (!result) {
      throw new Error('All extraction strategies failed');
    }

    res.json({ url: result.url, mime: result.mime });

  } catch (error: any) {
    console.error('❌ Stream audio error:', error.message);
    if (!res.headersSent) {
       const status = error.message.includes('429') ? 429 : 500;
       res.status(status).json({ error: error.message });
    }
  }
});

/**
 * GET /api/stream/proxy/:videoId
 * REAL audio proxy — pipes audio bytes directly through the server.
 * This is the KEY endpoint for the APK: ExoPlayer consumes this URL directly.
 * Supports HTTP Range requests for seeking.
 */
app.get('/api/stream/proxy/:videoId', async (req, res) => {
  try {
    const videoId = req.params.videoId;
    if (!videoId) return res.status(400).json({ error: 'Video ID is required' });

    console.log(`🎧 Proxy stream request for: ${videoId}`);
    
    const result = await extractAudioUrl(videoId);
    
    if (!result) {
      throw new Error('All extraction strategies failed for proxy');
    }

    // Forward the Range header from the client (ExoPlayer uses this for seeking)
    const rangeHeader = req.headers.range;
    const headers: Record<string, string> = {
      'User-Agent': USER_AGENT,
    };
    if (rangeHeader) {
      headers['Range'] = rangeHeader;
    }

    // Fetch the audio from YouTube and pipe it to the client
    const audioResponse = await axios.get(result.url, {
      headers,
      responseType: 'stream',
      timeout: 30000,
      // Don't validate status because 206 (Partial Content) is valid
      validateStatus: (status) => status >= 200 && status < 400,
    });

    // Forward important headers to the client
    const contentType = result.mime || audioResponse.headers['content-type'] || 'audio/webm';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-cache');
    
    if (audioResponse.headers['content-length']) {
      res.setHeader('Content-Length', audioResponse.headers['content-length']);
    }
    if (audioResponse.headers['content-range']) {
      res.setHeader('Content-Range', audioResponse.headers['content-range']);
    }

    // Use the same status code (200 or 206 for Range)
    res.status(audioResponse.status);

    // Pipe the audio stream to the response
    audioResponse.data.pipe(res);

    audioResponse.data.on('error', (err: any) => {
      console.error('Proxy pipe error:', err.message);
      if (!res.headersSent) res.status(500).end();
    });

    // Clean up on client disconnect
    req.on('close', () => {
      if (audioResponse.data && typeof audioResponse.data.destroy === 'function') {
        audioResponse.data.destroy();
      }
    });

  } catch (error: any) {
    console.error('❌ Proxy stream error:', error.message);
    if (!res.headersSent) {
       const status = error.message.includes('429') ? 429 : 500;
       res.status(status).json({ error: error.message });
    }
  }
});

/**
 * GET /api/stream/:videoId
 * Legacy endpoint for compatibility
 */
app.get('/api/stream/:videoId', async (req, res) => {
  try {
    const videoId = req.params.videoId;
    
    const result = await extractAudioUrl(videoId);
    if (result) {
      res.json({ url: result.url });
    } else {
      res.status(500).json({ error: 'Extraction failed' });
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

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
    hasApiKey: !!process.env.YOUTUBE_API_KEY,
    hasCookies: !!process.env.YOUTUBE_COOKIE,
    innertubeReady: !!innertube,
  });
});

// Start server
app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`\n🎵 CEGM Music Server running on http://localhost:${PORT}`);
  console.log(`📡 YouTube API Key: ${process.env.YOUTUBE_API_KEY ? '✅ Configured' : '❌ Missing'}`);
  console.log(`🍪 YouTube Cookies: ${process.env.YOUTUBE_COOKIE ? '✅ Configured' : '❌ Missing'}`);
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
  console.log(`  GET /api/stream/audio/:videoId  (Deciphered URL)`);
  console.log(`  GET /api/stream/proxy/:videoId  (Audio proxy for APK)`);
  console.log(`  GET /api/stream/:videoId        (Legacy)`);
  console.log(`  GET /api/download/:videoId`);
  console.log(`  GET /api/health\n`);
});
