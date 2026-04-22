import express from 'express';
import cors from 'cors';
import axios from 'axios';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

const INSTANCES = [
  'https://inv.thepixora.com',
  'https://yt.artemislena.eu',
  'https://iv.melmac.space'
];

async function fetchInvidious(endpoint: string) {
  for (const host of INSTANCES) {
    try {
      const res = await axios.get(host + endpoint, {
        timeout: 10000,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
      });
      return res.data;
    } catch (e: any) {
      console.warn(`[Invidious] ${host} error: ${e.message}`);
    }
  }
  throw new Error('All instances failed');
}

app.get('/api/search', async (req, res) => {
  try {
    const q = req.query.q as string;
    const data = await fetchInvidious(`/api/v1/search?q=${encodeURIComponent(q)}&type=video`);
    const results = data.map((v: any) => ({
      id: v.videoId,
      title: v.title,
      artist: v.author,
      thumbnail: v.videoThumbnails?.[0]?.url || '',
      duration: v.lengthSeconds ? `${Math.floor(v.lengthSeconds / 60)}:${(v.lengthSeconds % 60).toString().padStart(2, '0')}` : '0:00'
    }));
    res.json({ results });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/trending', async (req, res) => {
  try {
    const data = await fetchInvidious('/api/v1/trending?region=MX');
    const results = data.slice(0, 20).map((v: any) => ({
      id: v.videoId,
      title: v.title,
      artist: v.author,
      thumbnail: v.videoThumbnails?.[0]?.url || '',
      duration: v.lengthSeconds ? `${Math.floor(v.lengthSeconds / 60)}:${(v.lengthSeconds % 60).toString().padStart(2, '0')}` : '0:00'
    }));
    res.json({ results });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/stream/proxy/:id', async (req, res) => {
  try {
    const data = await fetchInvidious(`/api/v1/videos/${req.params.id}`);
    const audio = data.adaptiveFormats
      ?.filter((f: any) => f.type.includes('audio'))
      ?.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0))[0];

    if (!audio?.url) return res.status(404).send('No stream');

    const stream = await axios.get(audio.url, { 
      responseType: 'stream', 
      headers: { 'User-Agent': 'Mozilla/5.0' } 
    });
    res.setHeader('Content-Type', audio.container === 'm4a' ? 'audio/mp4' : 'audio/webm');
    stream.data.pipe(res);
  } catch (e: any) {
    res.status(500).send(e.message);
  }
});

app.get('/api/stream/audio/:id', (req, res) => {
  const host = process.env.RENDER_EXTERNAL_URL || `http://${req.headers.host}`;
  res.json({ url: `${host}/api/stream/proxy/${req.params.id}` });
});

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Stable Server on ${PORT}`));
