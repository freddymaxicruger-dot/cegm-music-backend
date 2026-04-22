import express from 'express';
import cors from 'cors';
import axios from 'axios';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

const INSTANCES = ['https://inv.thepixora.com', 'https://yt.artemislena.eu', 'https://iv.melmac.space'];
let index = 0;

async function fetchAPI(url: string) {
    const host = INSTANCES[index++ % INSTANCES.length];
    const res = await axios.get(host + url, { timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0' } });
    return res.data;
}

app.get('/api/search', async (req, res) => {
    try {
        const data = await fetchAPI(`/api/v1/search?q=${encodeURIComponent(req.query.q as string)}&type=video`);
        const results = data.map((v: any) => ({
            id: v.videoId,
            title: v.title,
            artist: v.author,
            thumbnail: v.videoThumbnails?.[0]?.url,
            duration: v.lengthSeconds ? `${Math.floor(v.lengthSeconds / 60)}:${(v.lengthSeconds % 60).toString().padStart(2, '0')}` : '0:00'
        }));
        res.json({ results });
    } catch (e) { res.status(500).json({ error: 'fail' }); }
});

app.get('/api/trending', async (req, res) => {
    try {
        const data = await fetchAPI('/api/v1/trending?region=MX');
        const results = data.slice(0, 20).map((v: any) => ({
            id: v.videoId, title: v.title, artist: v.author, thumbnail: v.videoThumbnails?.[0]?.url,
            duration: v.lengthSeconds ? `${Math.floor(v.lengthSeconds / 60)}:${(v.lengthSeconds % 60).toString().padStart(2, '0')}` : '0:00'
        }));
        res.json({ results });
    } catch (e) { res.status(500).json({ error: 'fail' }); }
});

app.get('/api/stream/proxy/:id', async (req, res) => {
    try {
        const data = await fetchAPI(`/api/v1/videos/${req.params.id}`);
        const audio = data.adaptiveFormats.filter((f: any) => f.type.includes('audio')).sort((a: any, b: any) => b.bitrate - a.bitrate)[0];
        const stream = await axios.get(audio.url, { responseType: 'stream', headers: { 'User-Agent': 'Mozilla/5.0' } });
        res.setHeader('Content-Type', audio.container === 'm4a' ? 'audio/mp4' : 'audio/webm');
        stream.data.pipe(res);
    } catch (e) { res.status(500).send('fail'); }
});

app.get('/api/stream/audio/:id', (req, res) => {
    const host = process.env.RENDER_EXTERNAL_URL || `http://${req.headers.host}`;
    res.json({ url: `${host}/api/stream/proxy/${req.params.id}` });
});

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, '0.0.0.0', () => console.log('🚀 Server on 3001'));
