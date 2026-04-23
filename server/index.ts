import express from 'express';
import cors from 'cors';
import axios from 'axios';
import { Innertube } from 'youtubei.js';
import { Readable } from 'stream';

const app = express();
const PORT = process.env.PORT || 3001;

// Global Innertube instance with auto-reinit
let youtube: any;
let youtubeInitTime = 0;

async function getYouTube() {
  const now = Date.now();
  if (!youtube || (now - youtubeInitTime > 30 * 60 * 1000)) {
    try {
      youtube = await Innertube.create();
      youtubeInitTime = now;
      console.log('✅ YouTubei.js (InnerTube) initialized/refreshed');
    } catch (err) {
      console.error('❌ Failed to initialize YouTubei.js:', err);
      youtube = null;
    }
  }
  return youtube;
}

getYouTube();

app.use(cors());
app.use(express.json());

// Invidious instances for failover
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
  throw new Error('All Invidious instances failed.');
}

/**
 * Get the best audio format info using YouTubei.js v17.
 */
async function getInnertubeAudio(videoId: string) {
  const yt = await getYouTube();
  if (!yt) return null;

  try {
    const info = await yt.getBasicInfo(videoId, { client: 'ANDROID' });
    const format = info.chooseFormat({ type: 'audio', quality: 'best' });
    if (!format?.url) return null;

    return {
      url: format.url,
      contentType: format.mime_type?.split(';')[0] || 'audio/mp4',
      contentLength: parseInt(format.content_length) || 0
    };
  } catch (err: any) {
    console.warn(`[InnerTube] Failed for ${videoId}: ${err.message}`);
    if (err.message?.includes('Could not extract') || err.message?.includes('sign') || err.message?.includes('cipher')) {
      youtube = null;
      youtubeInitTime = 0;
    }
    return null;
  }
}

/**
 * Stream audio in chunks using native fetch with bounded Range headers.
 * YouTube blocks open-ended Range requests, so we use bounded ranges.
 * Includes retry with backoff and URL refresh on 403 errors.
 */
const CHUNK_SIZE = 256 * 1024; // 256KB chunks
const MAX_RETRIES = 3;

function createChunkedStream(
  audioUrl: string,
  totalSize: number,
  startByte: number = 0,
  videoId?: string,
  firstBuffer?: Buffer
): Readable {
  let currentUrl = audioUrl;
  let offset = startByte;
  let aborted = false;
  let consecutiveFailures = 0;
  let hasPushedFirst = false;

  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

  return new Readable({
    async read() {
      if (firstBuffer && !hasPushedFirst) {
        hasPushedFirst = true;
        offset += firstBuffer.length;
        this.push(firstBuffer);
        return;
      }

      if (aborted || offset >= totalSize) {
        this.push(null);
        return;
      }

      const end = Math.min(offset + CHUNK_SIZE - 1, totalSize - 1);

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        if (aborted) { this.push(null); return; }

        try {
          const resp = await fetch(currentUrl, {
            headers: { 'Range': `bytes=${offset}-${end}` }
          });

          if (resp.status === 206 || resp.status === 200) {
            const buffer = Buffer.from(await resp.arrayBuffer());
            offset += buffer.length;
            consecutiveFailures = 0;
            this.push(buffer);
            return;
          }

          if (resp.status === 403) {
            console.warn(`[Chunked] 403 at offset ${offset}, attempt ${attempt + 1}/${MAX_RETRIES + 1}`);

            if (videoId && attempt < MAX_RETRIES) {
              await sleep(500 * (attempt + 1));
              const freshAudio = await getInnertubeAudio(videoId);
              if (freshAudio?.url && freshAudio.url !== currentUrl) {
                console.log('[Chunked] Refreshed InnerTube URL, retrying...');
                currentUrl = freshAudio.url;
                continue;
              }
            }
            continue;
          }

          console.error(`[Chunked] Unexpected status ${resp.status} at offset ${offset}`);
          this.push(null);
          return;
        } catch (err: any) {
          if (aborted) { this.push(null); return; }
          console.error(`[Chunked] Error at offset ${offset}, attempt ${attempt + 1}: ${err.message}`);
          if (attempt < MAX_RETRIES) {
            await sleep(300 * (attempt + 1));
          }
        }
      }

      consecutiveFailures++;
      if (consecutiveFailures >= 3) {
        console.error(`[Chunked] Too many consecutive failures, stopping stream`);
        this.push(null);
        return;
      }

      console.warn(`[Chunked] Skipping chunk at offset ${offset}, moving to next...`);
      offset = end + 1;
      this.push(Buffer.alloc(0));
    },
    destroy() {
      aborted = true;
    }
  });
}

// 1. Search
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

// 5. Search Channels
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

// 9. Genres
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

// 10. Streaming Proxy (InnerTube chunked -> Invidious fallback)
app.get('/api/stream/proxy/:id', async (req, res) => {
  const videoId = req.params.id;
  console.log(`[Stream] Requesting: ${videoId}`);

  const audio = await getInnertubeAudio(videoId);
  if (audio && audio.contentLength > 0) {
    try {
      console.log(`[Stream] Strategy 1: InnerTube chunked (${(audio.contentLength / 1024 / 1024).toFixed(1)}MB)...`);

      let startByte = 0;
      if (req.headers.range) {
        const match = req.headers.range.match(/bytes=(\d+)-/);
        if (match) startByte = parseInt(match[1]);
      }

      const testEnd = Math.min(startByte + CHUNK_SIZE - 1, audio.contentLength - 1);
      const testResp = await fetch(audio.url, { headers: { 'Range': `bytes=${startByte}-${testEnd}` }});
      if (testResp.status !== 206 && testResp.status !== 200) {
        throw new Error(`InnerTube rejected range ${startByte}-${testEnd} with status ${testResp.status}`);
      }
      const firstBuffer = Buffer.from(await testResp.arrayBuffer());

      const stream = createChunkedStream(audio.url, audio.contentLength, startByte, videoId, firstBuffer);

      res.setHeader('Content-Type', audio.contentType);
      res.setHeader('Accept-Ranges', 'bytes');

      if (startByte > 0) {
        res.setHeader('Content-Range', `bytes ${startByte}-${audio.contentLength - 1}/${audio.contentLength}`);
        res.setHeader('Content-Length', audio.contentLength - startByte);
        res.status(206);
      } else {
        res.setHeader('Content-Length', audio.contentLength);
      }

      stream.pipe(res);
      req.on('close', () => { stream.destroy(); });
      return;
    } catch (err: any) {
      console.warn(`[Stream] InnerTube chunked failed: ${err.message}`);
    }
  }

  // Strategy 2: Invidious fallback via proxy
  try {
    console.log(`[Stream] Strategy 2: Invidious Fallback...`);
    const headers: any = { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.youtube.com/' };
    if (req.headers.range) {
      headers['Range'] = req.headers.range;
    }

    let success = false;
    for (const host of INSTANCES) {
      try {
        const proxyUrl = `${host}/latest_version?id=${videoId}&itag=140&local=true`;
        console.log(`[Stream] Trying Invidious proxy: ${host}`);
        
        const axStream = await axios.get(proxyUrl, {
          responseType: 'stream',
          timeout: 15000,
          headers
        });

        res.status(axStream.status);
        if (axStream.headers['content-type']) res.setHeader('Content-Type', axStream.headers['content-type']);
        if (axStream.headers['content-length']) res.setHeader('Content-Length', axStream.headers['content-length']);
        if (axStream.headers['content-range']) res.setHeader('Content-Range', axStream.headers['content-range']);
        res.setHeader('Accept-Ranges', 'bytes');

        axStream.data.pipe(res);
        success = true;
        break; // Stop trying instances
      } catch (e: any) {
        console.warn(`[Stream] Invidious proxy failed for ${host}: ${e.message}`);
      }
    }
    
    if (!success) {
      throw new Error('All Invidious proxy instances failed');
    }
  } catch (error: any) {
    console.error(`[Stream] All strategies failed for ${videoId}:`, error.message);
    if (!res.headersSent) {
      res.status(500).send('Streaming failed');
    }
  }
});

// 11. Stream Info
app.get('/api/stream/audio/:id', (req, res) => {
  const host = process.env.RENDER_EXTERNAL_URL || `http://${req.headers.host}`;
  res.json({ url: `${host}/api/stream/proxy/${req.params.id}` });
});

// 12. Download
app.get('/api/download/:id', async (req, res) => {
  const videoId = req.params.id;
  const title = req.query.title ? `${req.query.title}.mp3` : `${videoId}.mp3`;

  const audio = await getInnertubeAudio(videoId);
  if (audio && audio.contentLength > 0) {
    try {
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(title)}"`);
      res.setHeader('Content-Type', audio.contentType);
      res.setHeader('Content-Length', audio.contentLength);

      const stream = createChunkedStream(audio.url, audio.contentLength, 0, videoId);
      stream.pipe(res);
      req.on('close', () => { stream.destroy(); });
      return;
    } catch (err: any) {
      console.warn(`[Download] InnerTube failed: ${err.message}`);
    }
  }

  try {
    const title = req.query.title ? `${req.query.title}.mp3` : `${videoId}.mp3`;
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(title)}"`);
    
    let success = false;
    for (const host of INSTANCES) {
      try {
        const proxyUrl = `${host}/latest_version?id=${videoId}&itag=140&local=true`;
        const axStream = await axios.get(proxyUrl, { responseType: 'stream', timeout: 15000 });
        axStream.data.pipe(res);
        success = true;
        break;
      } catch (e: any) {
        console.warn(`[Download] Invidious proxy failed for ${host}: ${e.message}`);
      }
    }
    
    if (!success) throw new Error('All Invidious proxy instances failed');
  } catch (e: any) {
    res.status(500).send(e.message);
  }
});

app.get('/api/health', (req, res) => res.json({ status: 'ok', innertube: !!youtube }));

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Stable Backend on port ${PORT}`));
