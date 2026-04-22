import express from 'express';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// List of public Invidious instances for redundancy
const INVIDIOUS_INSTANCES = [
  'https://inv.thepixora.com',
  'https://invidious.private.coffee',
  'https://invidious.asir.dev',
  'https://invidious.flokinet.to'
];

let currentInstanceIndex = 0;

function getNextInstance() {
  const instance = INVIDIOUS_INSTANCES[currentInstanceIndex];
  currentInstanceIndex = (currentInstanceIndex + 1) % INVIDIOUS_INSTANCES.length;
  return instance;
}

// Helper for Invidious API requests with automatic failover
async function invidiousRequest(endpoint: string) {
  let lastError;
  for (let i = 0; i < INVIDIOUS_INSTANCES.length; i++) {
    const instance = getNextInstance();
    try {
      const response = await axios.get(`${instance}${endpoint}`, { timeout: 8000 });
      return response.data;
    } catch (error: any) {
      console.warn(`⚠️ Instance ${instance} failed: ${error.message}`);
      lastError = error;
    }
  }
  throw lastError;
}

/**
 * GET /api/search
 */
app.get('/api/search', async (req, res) => {
  try {
    const query = req.query.q as string;
    const max = parseInt(req.query.max as string) || 20;
    
    console.log(`🔍 Searching (Invidious): ${query}`);
    const results = await invidiousRequest(`/api/v1/search?q=${encodeURIComponent(query)}&type=video`);
    
    const tracks = results.slice(0, max).map((v: any) => ({
      id: v.videoId,
      title: v.title,
      artist: v.author,
      thumbnail: v.videoThumbnails?.find((t: any) => t.quality === 'high')?.url || v.videoThumbnails?.[0]?.url,
      duration: v.lengthSeconds ? `${Math.floor(v.lengthSeconds / 60)}:${(v.lengthSeconds % 60).toString().padStart(2, '0')}` : '0:00',
      views: v.viewCountText || '0'
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
    const region = (req.query.region as string) || 'US';
    console.log(`🔥 Fetching trending (${region})`);
    
    const results = await invidiousRequest(`/api/v1/trending?region=${region}`);
    
    const tracks = results.slice(0, 20).map((v: any) => ({
      id: v.videoId,
      title: v.title,
      artist: v.author,
      thumbnail: v.videoThumbnails?.[0]?.url,
      duration: v.lengthSeconds ? `${Math.floor(v.lengthSeconds / 60)}:${(v.lengthSeconds % 60).toString().padStart(2, '0')}` : '0:00'
    }));

    res.json({ results: tracks });
  } catch (error: any) {
    res.status(500).json({ error: 'Trending failed' });
  }
});

/**
 * GET /api/video/:id
 */
app.get('/api/video/:id', async (req, res) => {
  try {
    const videoId = req.params.id;
    const v = await invidiousRequest(`/api/v1/videos/${videoId}`);
    
    res.json({
      id: v.videoId,
      title: v.title,
      artist: v.author,
      thumbnail: v.videoThumbnails?.[0]?.url,
      duration: v.lengthSeconds ? `${Math.floor(v.lengthSeconds / 60)}:${(v.lengthSeconds % 60).toString().padStart(2, '0')}` : '0:00',
      description: v.description,
      viewCount: v.viewCount?.toString()
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Video fetch failed' });
  }
});

/**
 * Proxy stream handler
 * Invidious adaptive formats provide direct googlevideo URLs
 */
app.get('/api/stream/proxy/:videoId', async (req, res) => {
  try {
    const videoId = req.params.videoId;
    console.log(`🎵 Streaming proxy for: ${videoId}`);
    
    const data = await invidiousRequest(`/api/v1/videos/${videoId}`);
    
    // Find the best audio-only stream
    const audioStream = data.adaptiveFormats
      ?.filter((f: any) => f.type.includes('audio'))
      ?.sort((a: any, b: any) => (parseInt(b.bitrate) || 0) - (parseInt(a.bitrate) || 0))[0];

    if (!audioStream || !audioStream.url) {
      return res.status(404).json({ error: 'No audio stream found' });
    }

    const audioUrl = audioStream.url;
    
    const response = await axios.get(audioUrl, {
      responseType: 'stream',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    res.setHeader('Content-Type', audioStream.container === 'm4a' ? 'audio/mp4' : 'audio/webm');
    response.data.pipe(res);
    
  } catch (error: any) {
    console.error('Proxy error:', error.message);
    res.status(500).json({ error: 'Proxy failed' });
  }
});

// Legacy stream endpoint for compat
app.get('/api/stream/audio/:videoId', async (req, res) => {
  res.json({ url: `${process.env.RENDER_EXTERNAL_URL || ''}/api/stream/proxy/${req.params.videoId}` });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', source: 'Invidious Proxy' });
});

app.listen(PORT, () => {
  console.log(`🎵 CEGM Music Server running on http://localhost:${PORT}`);
  console.log(`📡 Extraction Method: Public Invidious API (Failover enabled)`);
});
