import express from 'express';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// PURE INVIDIOUS BACKEND - No legacy YouTube/Saavn code.
const INSTANCES = [
  'https://inv.thepixora.com',
  'https://yt.artemislena.eu',
  'https://iv.melmac.space',
  'https://invidious.private.coffee'
];

let instanceIndex = 0;
function getNextHost() {
  const host = INSTANCES[instanceIndex];
  instanceIndex = (instanceIndex + 1) % INSTANCES.length;
  return host;
}

// Global request helper with failover
async function fetchInvidious(endpoint: string) {
  let lastError;
  for (let i = 0; i < INSTANCES.length; i++) {
    const host = getNextHost();
    try {
      console.log(`[Invidious] Fetching from: ${host}${endpoint}`);
      const res = await axios.get(`${host}${endpoint}`, {
        timeout: 12000,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36' }
      });
      return res.data;
    } catch (e: any) {
      console.error(`[Invidious] Host ${host} failed: ${e.message}`);
      lastError = e;
    }
  }
  throw lastError;
}

/**
 * Search Tracks
 */
app.get('/api/search', async (req, res) => {
  try {
    const q = req.query.q as string;
    if (!q) return res.status(400).json({ error: 'Query required' });
    
    const data = await fetchInvidious(`/api/v1/search?q=${encodeURIComponent(q)}&type=video`);
    const results = data.map((v: any) => ({
      id: v.videoId,
      title: v.title,
      artist: v.author,
      thumbnail: v.videoThumbnails?.[0]?.url,
      duration: v.lengthSeconds ? `${Math.floor(v.lengthSeconds / 60)}:${(v.lengthSeconds % 60).toString().padStart(2, '0')}` : '0:00'
    }));
    res.json({ results });
  } catch (error: any) {
    res.status(500).json({ error: 'Search failed' });
  }
});

/**
 * Trending Tracks
 */
app.get('/api/trending', async (req, res) => {
  try {
    const data = await fetchInvidious('/api/v1/trending?region=MX');
    const results = data.slice(0, 24).map((v: any) => ({
      id: v.videoId,
      title: v.title,
      artist: v.author,
      thumbnail: v.videoThumbnails?.[0]?.url,
      duration: v.lengthSeconds ? `${Math.floor(v.lengthSeconds / 60)}:${(v.lengthSeconds % 60).toString().padStart(2, '0')}` : '0:00'
    }));
    res.json({ results });
  } catch (error) {
    res.status(500).json({ error: 'Trending failed' });
  }
});

/**
 * Audio Streaming Proxy
 */
app.get('/api/stream/proxy/:videoId', async (req, res) => {
  try {
    const videoId = req.params.videoId;
    const data = await fetchInvidious(`/api/v1/videos/${videoId}`);
    
    // Pick the best audio-only stream
    const audio = data.adaptiveFormats
      ?.filter((f: any) => f.type.includes('audio'))
      ?.sort((a: any, b: any) => (parseInt(b.bitrate) || 0) - (parseInt(a.bitrate) || 0))[0];

    if (!audio?.url) return res.status(404).send('Audio not found');

    const stream = await axios.get(audio.url, { 
      responseType: 'stream', 
      headers: { 'User-Agent': 'Mozilla/5.0' } 
    });

    res.setHeader('Content-Type', audio.container === 'm4a' ? 'audio/mp4' : 'audio/webm');
    stream.data.pipe(res);
  } catch (error) {
    res.status(500).send('Streaming error');
  }
});

/**
 * Legacy Audio Endpoint (Redirects to Proxy)
 */
app.get('/api/stream/audio/:videoId', (req, res) => {
  const host = process.env.RENDER_EXTERNAL_URL || `http://${req.headers.host}`;
  res.json({ url: `${host}/api/stream/proxy/${req.params.videoId}` });
});

app.get('/api/health', (req, res) => res.json({ status: 'ok', engine: 'pure-invidious' }));

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Pure Invidious Server on port ${PORT}`));
