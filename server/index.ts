import express from 'express';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// List of Invidious instances for search and extraction
const INSTANCES = [
  'https://inv.thepixora.com',
  'https://yt.artemislena.eu',
  'https://iv.melmac.space'
];

let instanceIndex = 0;
function getNextInstance() {
  const inst = INSTANCES[instanceIndex];
  instanceIndex = (instanceIndex + 1) % INSTANCES.length;
  return inst;
}

async function requestInvidious(endpoint: string) {
  let lastError;
  for (let i = 0; i < INSTANCES.length; i++) {
    const host = getNextInstance();
    try {
      const res = await axios.get(`${host}${endpoint}`, {
        timeout: 10000,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      return res.data;
    } catch (e: any) {
      console.warn(`⚠️ ${host} failed: ${e.message}`);
      lastError = e;
    }
  }
  throw lastError;
}

app.get('/api/search', async (req, res) => {
  try {
    const q = req.query.q as string;
    if (!q) return res.status(400).json({ error: 'Query required' });
    
    console.log(`🔍 Search: ${q}`);
    const data = await requestInvidious(`/api/v1/search?q=${encodeURIComponent(q)}&type=video`);
    
    const results = data.slice(0, 20).map((v: any) => ({
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

app.get('/api/trending', async (req, res) => {
  try {
    const data = await requestInvidious('/api/v1/trending?region=MX');
    const results = data.slice(0, 20).map((v: any) => ({
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

app.get('/api/stream/proxy/:videoId', async (req, res) => {
  try {
    const videoId = req.params.videoId;
    const data = await requestInvidious(`/api/v1/videos/${videoId}`);
    const audio = data.adaptiveFormats
      ?.filter((f: any) => f.type.includes('audio'))
      ?.sort((a: any, b: any) => (parseInt(b.bitrate) || 0) - (parseInt(a.bitrate) || 0))[0];

    if (!audio?.url) return res.status(404).send('No audio');

    const stream = await axios.get(audio.url, { responseType: 'stream', headers: { 'User-Agent': 'Mozilla/5.0' } });
    res.setHeader('Content-Type', audio.container === 'm4a' ? 'audio/mp4' : 'audio/webm');
    stream.data.pipe(res);
  } catch (error) {
    res.status(500).send('Stream error');
  }
});

app.get('/api/stream/audio/:videoId', (req, res) => {
  const host = process.env.RENDER_EXTERNAL_URL || `http://${req.headers.host}`;
  res.json({ url: `${host}/api/stream/proxy/${req.params.videoId}` });
});

app.get('/api/health', (req, res) => {
  res.send({ status: 'ok' });
});

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Ready on ${PORT}`));
