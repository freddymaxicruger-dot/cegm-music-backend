import express from 'express';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';
import YTMusic from 'ytmusic-api';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const ytmusic = new YTMusic();

app.use(cors());
app.use(express.json());

// Initialize YTMusic
let isYTMusicInit = false;
async function ensureYTMusic() {
  if (!isYTMusicInit) {
    await ytmusic.initialize();
    isYTMusicInit = true;
    console.log('✅ YTMusic Initialized');
  }
}

// Reliable Invidious instances for extraction ONLY
const EXTRACTION_INSTANCES = [
  'https://inv.thepixora.com',
  'https://iv.melmac.space',
  'https://yt.artemislena.eu'
];

/**
 * GET /api/search
 * Uses YTMusic API for highly reliable and relevant music search
 */
app.get('/api/search', async (req, res) => {
  try {
    const query = req.query.q as string;
    if (!query) return res.status(400).json({ error: 'Query is required' });

    await ensureYTMusic();
    console.log(`🔍 Searching YTMusic: ${query}`);
    const results = await ytmusic.searchSongs(query);
    
    const tracks = results.slice(0, 20).map((s: any) => ({
      id: s.videoId,
      title: s.name,
      artist: s.artists?.[0]?.name || 'Unknown Artist',
      thumbnail: s.thumbnails?.[s.thumbnails.length - 1]?.url || '',
      duration: `${Math.floor(s.duration / 60000)}:${(Math.floor((s.duration % 60000) / 1000)).toString().padStart(2, '0')}`,
    }));

    res.json({ results: tracks });
  } catch (error: any) {
    console.error('Search error:', error.message);
    res.status(500).json({ error: 'Search failed' });
  }
});

/**
 * GET /api/trending
 */
app.get('/api/trending', async (req, res) => {
  try {
    const query = 'hits 2026 latin'; // Custom trending-like search
    await ensureYTMusic();
    const results = await ytmusic.searchSongs(query);
    
    const tracks = results.slice(0, 20).map((s: any) => ({
      id: s.videoId,
      title: s.name,
      artist: s.artists?.[0]?.name || 'Unknown Artist',
      thumbnail: s.thumbnails?.[s.thumbnails.length - 1]?.url || '',
      duration: `${Math.floor(s.duration / 60000)}:${(Math.floor((s.duration % 60000) / 1000)).toString().padStart(2, '0')}`,
    }));

    res.json({ results: tracks });
  } catch (error: any) {
    res.status(500).json({ error: 'Trending failed' });
  }
});

/**
 * Proxy stream handler
 * Uses Invidious extraction nodes to get raw audio URLs
 */
app.get('/api/stream/proxy/:videoId', async (req, res) => {
  const videoId = req.params.videoId;
  let lastError;

  for (const instance of EXTRACTION_INSTANCES) {
    try {
      console.log(`🎵 Extracting ${videoId} via ${instance}`);
      const { data } = await axios.get(`${instance}/api/v1/videos/${videoId}`, { 
        timeout: 8000,
        headers: { 'User-Agent': 'Mozilla/5.0' } 
      });

      const audioStream = data.adaptiveFormats
        ?.filter((f: any) => f.type.includes('audio'))
        ?.sort((a: any, b: any) => (parseInt(b.bitrate) || 0) - (parseInt(a.bitrate) || 0))[0];

      if (audioStream?.url) {
        const streamResponse = await axios.get(audioStream.url, {
          responseType: 'stream',
          headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        res.setHeader('Content-Type', audioStream.container === 'm4a' ? 'audio/mp4' : 'audio/webm');
        return streamResponse.data.pipe(res);
      }
    } catch (e: any) {
      console.warn(`⚠️ Extraction via ${instance} failed: ${e.message}`);
      lastError = e;
    }
  }
  res.status(500).json({ error: 'Streaming failed', detail: lastError?.message });
});

app.get('/api/stream/audio/:videoId', (req, res) => {
  const host = process.env.RENDER_EXTERNAL_URL || `http://${req.headers.host}`;
  res.json({ url: `${host}/api/stream/proxy/${req.params.videoId}` });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', engine: 'YTMusic + Invidious' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🎵 Backend Ready on port ${PORT}`);
});
