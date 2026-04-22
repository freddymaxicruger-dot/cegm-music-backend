import express from 'express';
import cors from 'cors';
import axios from 'axios';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// List of Invidious instances for failover
const INSTANCES = [
  'https://inv.thepixora.com',
  'https://invidious.flokinet.to',
  'https://inv.vern.cc',
  'https://invidious.projectsegfau.lt',
  'https://yewtu.be',
  'https://invidious.nerdvpn.de',
  'https://invidious.tiekoetter.com',
  'https://inv.tux.pizza',
  'https://invidious.privacydev.net'
];

async function fetchInvidious(endpoint: string) {
  for (const host of INSTANCES) {
    try {
      const res = await axios.get(host + endpoint, {
        timeout: 10000,
        headers: { 
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36' 
        }
      });
      return res.data;
    } catch (e: any) {
      console.warn(`[Invidious] ${host} error: ${e.message}`);
    }
  }
  throw new Error('All Invidious instances failed. Please try again later.');
}

// 1. Search Videos
app.get('/api/search', async (req, res) => {
  try {
    const q = req.query.q as string;
    const data = await fetchInvidious(`/api/v1/search?q=${encodeURIComponent(q)}&type=video`);
    const results = data.map((v: any) => ({
      id: v.videoId,
      title: v.title,
      artist: v.author,
      thumbnail: v.videoThumbnails?.[0]?.url || '',
      duration: v.lengthSeconds ? `${Math.floor(v.lengthSeconds / 60)}:${(v.lengthSeconds % 60).toString().padStart(2, '0')}` : '0:00',
      viewCount: v.viewCountText || ''
    }));
    res.json({ results });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 2. Trending
app.get('/api/trending', async (req, res) => {
  try {
    const region = req.query.region || 'MX';
    const data = await fetchInvidious(`/api/v1/trending?region=${region}`);
    const results = data.slice(0, 20).map((v: any) => ({
      id: v.videoId,
      title: v.title,
      artist: v.author,
      thumbnail: v.videoThumbnails?.[0]?.url || '',
      duration: v.lengthSeconds ? `${Math.floor(v.lengthSeconds / 60)}:${(v.lengthSeconds % 60).toString().padStart(2, '0')}` : '0:00',
      viewCount: v.viewCountText || ''
    }));
    res.json({ results });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 3. Video Details
app.get('/api/video/:id', async (req, res) => {
  try {
    const data = await fetchInvidious(`/api/v1/videos/${req.params.id}`);
    res.json({
      id: data.videoId,
      title: data.title,
      artist: data.author,
      thumbnail: data.videoThumbnails?.[0]?.url || '',
      duration: data.lengthSeconds ? `${Math.floor(data.lengthSeconds / 60)}:${(data.lengthSeconds % 60).toString().padStart(2, '0')}` : '0:00',
      viewCount: data.viewCountText || '',
      likeCount: data.likeCount || 0,
      description: data.description || '',
      channelId: data.authorId
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 4. Related Videos
app.get('/api/video/:id/related', async (req, res) => {
  try {
    const data = await fetchInvidious(`/api/v1/videos/${req.params.id}`);
    const results = (data.recommendedVideos || []).map((v: any) => ({
      id: v.videoId,
      title: v.title,
      artist: v.author,
      thumbnail: `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`,
      duration: v.lengthSeconds ? `${Math.floor(v.lengthSeconds / 60)}:${(v.lengthSeconds % 60).toString().padStart(2, '0')}` : '0:00'
    }));
    res.json({ results });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 5. Search Channels (Artists)
app.get('/api/channels/search', async (req, res) => {
  try {
    const q = req.query.q as string;
    const data = await fetchInvidious(`/api/v1/search?q=${encodeURIComponent(q)}&type=channel`);
    const results = data.map((c: any) => ({
      id: c.authorId,
      name: c.author,
      thumbnail: c.authorThumbnails?.[0]?.url || '',
      subscriberCount: c.subCountText || '0',
      videoCount: c.videoCount || 0
    }));
    res.json({ results });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 6. Search Playlists
app.get('/api/playlists/search', async (req, res) => {
  try {
    const q = req.query.q as string;
    const data = await fetchInvidious(`/api/v1/search?q=${encodeURIComponent(q)}&type=playlist`);
    const results = data.map((p: any) => ({
      id: p.playlistId,
      title: p.title,
      thumbnail: p.playlistThumbnail || '',
      channelTitle: p.author,
      description: ''
    }));
    res.json({ results });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 7. Playlist Items
app.get('/api/playlist/:id/items', async (req, res) => {
  try {
    const data = await fetchInvidious(`/api/v1/playlists/${req.params.id}`);
    const results = (data.videos || []).map((v: any) => ({
      videoId: v.videoId,
      title: v.title,
      channelTitle: v.author,
      thumbnail: v.videoThumbnails?.[0]?.url || ''
    }));
    res.json({ results });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 8. Channel Details
app.get('/api/channel/:id', async (req, res) => {
  try {
    const data = await fetchInvidious(`/api/v1/channels/${req.params.id}`);
    res.json({
      id: data.authorId,
      name: data.author,
      thumbnail: data.authorThumbnails?.[0]?.url || '',
      subscriberCount: data.subCountText || '0',
      videoCount: data.videoCount || 0
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 9. Genres (Hardcoded to match UI)
app.get('/api/genres', (req, res) => {
  res.json({
    genres: [
      { name: 'Rock', image: 'https://picsum.photos/seed/rock/200/200', playlistId: 'PLH6pfj4uuyfgh' },
      { name: 'Pop', image: 'https://picsum.photos/seed/pop/200/200', playlistId: 'PLDcnymzs18LWRUe36M1hK8oH0S2Xy_Z' },
      { name: 'Electronic', image: 'https://picsum.photos/seed/electronic/200/200', playlistId: 'PLH6pfj4uuyfgk' },
      { name: 'Jazz', image: 'https://picsum.photos/seed/jazz/200/200', playlistId: 'PLH6pfj4uuyfgi' },
      { name: 'Hip-Hop', image: 'https://picsum.photos/seed/hiphop/200/200', playlistId: 'PLH6pfj4uuyfgj' },
      { name: 'Classical', image: 'https://picsum.photos/seed/classical/200/200', playlistId: 'PLH6pfj4uuyfgl' }
    ]
  });
});

// 10. Streaming Proxy (Pipes audio directly)
app.get('/api/stream/proxy/:id', async (req, res) => {
  try {
    const data = await fetchInvidious(`/api/v1/videos/${req.params.id}`);
    let audio = data.adaptiveFormats
      ?.filter((f: any) => f.type && f.type.includes('audio'))
      ?.sort((a: any, b: any) => (parseInt(b.bitrate) || 0) - (parseInt(a.bitrate) || 0))[0];

    if (!audio) {
      audio = data.formatStreams?.filter((f: any) => f.type && f.type.includes('audio'))[0];
    }

    if (!audio?.url) return res.status(404).send('No stream');

    const stream = await axios.get(audio.url, { 
      responseType: 'stream', 
      headers: { 
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://www.youtube.com/'
      } 
    });
    
    res.setHeader('Content-Type', audio.container === 'm4a' ? 'audio/mp4' : 'audio/webm');
    stream.data.pipe(res);
  } catch (e: any) {
    res.status(500).send(e.message);
  }
});

// 11. Stream Info
app.get('/api/stream/audio/:id', (req, res) => {
  const host = process.env.RENDER_EXTERNAL_URL || `http://${req.headers.host}`;
  res.json({ url: `${host}/api/stream/proxy/${req.params.id}` });
});

// 12. Download Proxy
app.get('/api/download/:id', async (req, res) => {
  try {
    const data = await fetchInvidious(`/api/v1/videos/${req.params.id}`);
    let audio = data.adaptiveFormats
      ?.filter((f: any) => f.type && f.type.includes('audio'))
      ?.sort((a: any, b: any) => (parseInt(b.bitrate) || 0) - (parseInt(a.bitrate) || 0))[0];

    if (!audio) {
      audio = data.formatStreams?.filter((f: any) => f.type && f.type.includes('audio'))[0];
    }

    if (!audio?.url) return res.status(404).send('No stream');

    const title = req.query.title ? `${req.query.title}.mp3` : `${req.params.id}.mp3`;
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(title)}"`);
    
    const stream = await axios.get(audio.url, { responseType: 'stream' });
    stream.data.pipe(res);
  } catch (e: any) {
    res.status(500).send(e.message);
  }
});

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Stable Backend on port ${PORT}`));
