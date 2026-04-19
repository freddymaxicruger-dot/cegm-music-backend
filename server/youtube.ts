/**
 * YouTube Data API v3 wrapper
 * Handles all interactions with the YouTube API
 */

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

interface YouTubeSearchResult {
  id: string;
  title: string;
  artist: string;
  thumbnail: string;
  duration?: string;
  publishedAt: string;
  channelId: string;
  viewCount?: string;
}

interface YouTubeVideoDetail {
  id: string;
  title: string;
  artist: string;
  thumbnail: string;
  thumbnailHigh: string;
  duration: string;
  publishedAt: string;
  channelId: string;
  viewCount: string;
  likeCount: string;
  description: string;
}

interface YouTubeChannel {
  id: string;
  name: string;
  thumbnail: string;
  subscriberCount: string;
  videoCount: string;
}

interface YouTubePlaylistItem {
  id: string;
  title: string;
  thumbnail: string;
  channelTitle: string;
  videoId: string;
  position: number;
}

function getApiKey(): string {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error('YOUTUBE_API_KEY is not set');
  return key;
}

/**
 * Parse ISO 8601 duration to human-readable format (e.g. PT4M13S -> 4:13)
 */
function parseDuration(iso: string): string {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return '0:00';
  const hours = parseInt(match[1] || '0');
  const minutes = parseInt(match[2] || '0');
  const seconds = parseInt(match[3] || '0');
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Format view count to human-readable (e.g. 1234567 -> 1.2M)
 */
function formatViewCount(count: string): string {
  const num = parseInt(count);
  if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(1)}B`;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return count;
}

/**
 * Search YouTube for music videos
 */
export async function searchMusic(query: string, maxResults: number = 20): Promise<YouTubeSearchResult[]> {
  const params = new URLSearchParams({
    part: 'snippet',
    q: query,
    type: 'video',
    videoCategoryId: '10', // Music category
    maxResults: String(maxResults),
    key: getApiKey(),
  });

  const res = await fetch(`${YOUTUBE_API_BASE}/search?${params}`);
  if (!res.ok) {
    const err = await res.json();
    throw new Error(`YouTube API error: ${err.error?.message || res.statusText}`);
  }

  const data = await res.json();
  const videoIds = data.items.map((item: any) => item.id.videoId).join(',');

  // Get durations and view counts
  const details = await getVideoDetails(videoIds);
  const detailMap = new Map(details.map((d: any) => [d.id, d]));

  return data.items.map((item: any) => {
    const detail = detailMap.get(item.id.videoId);
    return {
      id: item.id.videoId,
      title: item.snippet.title,
      artist: item.snippet.channelTitle,
      thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default?.url,
      duration: detail?.duration || '',
      publishedAt: item.snippet.publishedAt,
      channelId: item.snippet.channelId,
      viewCount: detail?.viewCount || '0',
    };
  });
}

/**
 * Get trending music videos
 */
export async function getTrendingMusic(maxResults: number = 20, regionCode: string = 'MX'): Promise<YouTubeVideoDetail[]> {
  const params = new URLSearchParams({
    part: 'snippet,contentDetails,statistics',
    chart: 'mostPopular',
    videoCategoryId: '10', // Music category
    maxResults: String(maxResults),
    regionCode,
    key: getApiKey(),
  });

  const res = await fetch(`${YOUTUBE_API_BASE}/videos?${params}`);
  if (!res.ok) {
    const err = await res.json();
    throw new Error(`YouTube API error: ${err.error?.message || res.statusText}`);
  }

  const data = await res.json();
  return data.items.map((item: any) => ({
    id: item.id,
    title: item.snippet.title,
    artist: item.snippet.channelTitle,
    thumbnail: item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default?.url,
    thumbnailHigh: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.maxres?.url || item.snippet.thumbnails.medium?.url,
    duration: parseDuration(item.contentDetails.duration),
    publishedAt: item.snippet.publishedAt,
    channelId: item.snippet.channelId,
    viewCount: formatViewCount(item.statistics.viewCount || '0'),
    likeCount: formatViewCount(item.statistics.likeCount || '0'),
    description: item.snippet.description,
  }));
}

/**
 * Get video details by IDs (comma-separated)
 */
async function getVideoDetails(videoIds: string): Promise<any[]> {
  const params = new URLSearchParams({
    part: 'contentDetails,statistics',
    id: videoIds,
    key: getApiKey(),
  });

  const res = await fetch(`${YOUTUBE_API_BASE}/videos?${params}`);
  if (!res.ok) return [];

  const data = await res.json();
  return data.items.map((item: any) => ({
    id: item.id,
    duration: parseDuration(item.contentDetails.duration),
    viewCount: formatViewCount(item.statistics.viewCount || '0'),
    likeCount: formatViewCount(item.statistics.likeCount || '0'),
  }));
}

/**
 * Get a single video's full details
 */
export async function getVideoById(videoId: string): Promise<YouTubeVideoDetail | null> {
  const params = new URLSearchParams({
    part: 'snippet,contentDetails,statistics',
    id: videoId,
    key: getApiKey(),
  });

  const res = await fetch(`${YOUTUBE_API_BASE}/videos?${params}`);
  if (!res.ok) return null;

  const data = await res.json();
  if (!data.items || data.items.length === 0) return null;

  const item = data.items[0];
  return {
    id: item.id,
    title: item.snippet.title,
    artist: item.snippet.channelTitle,
    thumbnail: item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default?.url,
    thumbnailHigh: item.snippet.thumbnails.maxres?.url || item.snippet.thumbnails.high?.url || item.snippet.thumbnails.medium?.url,
    duration: parseDuration(item.contentDetails.duration),
    publishedAt: item.snippet.publishedAt,
    channelId: item.snippet.channelId,
    viewCount: formatViewCount(item.statistics.viewCount || '0'),
    likeCount: formatViewCount(item.statistics.likeCount || '0'),
    description: item.snippet.description,
  };
}

/**
 * Get related videos by searching for the artist/title
 * (Note: YouTube API v3 deprecated relatedToVideoId in Aug 2023)
 */
export async function getRelatedVideos(videoId: string, maxResults: number = 10): Promise<YouTubeSearchResult[]> {
  try {
    // 1. Get current video details to find artist/title
    const videoParams = new URLSearchParams({
      part: 'snippet',
      id: videoId,
      key: getApiKey(),
    });
    const videoRes = await fetch(`${YOUTUBE_API_BASE}/videos?${videoParams}`);
    if (!videoRes.ok) return [];
    
    const videoData = await videoRes.json();
    if (!videoData.items || videoData.items.length === 0) return [];
    
    // Use the channel title (artist) for search
    const artist = videoData.items[0].snippet.channelTitle;
    
    // 2. Search for the artist's music to serve as recommendations
    const searchParams = new URLSearchParams({
      part: 'snippet',
      q: `${artist} music`,
      type: 'video',
      videoCategoryId: '10', // Music Category
      maxResults: String(maxResults + 1), // Fetch 1 extra in case we filter out the exact playing track
      key: getApiKey(),
    });

    const searchRes = await fetch(`${YOUTUBE_API_BASE}/search?${searchParams}`);
    if (!searchRes.ok) return [];

    const searchData = await searchRes.json();
    return searchData.items
      .filter((item: any) => item.id?.videoId && item.id.videoId !== videoId)
      .slice(0, maxResults)
      .map((item: any) => ({
        id: item.id.videoId,
        title: item.snippet.title,
        artist: item.snippet.channelTitle,
        thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.medium?.url,
        duration: '',
        publishedAt: item.snippet.publishedAt,
        channelId: item.snippet.channelId,
      }));
  } catch (e) {
    console.error('getRelatedVideos error:', e);
    return [];
  }
}


/**
 * Get channel details
 */
export async function getChannel(channelId: string): Promise<YouTubeChannel | null> {
  const params = new URLSearchParams({
    part: 'snippet,statistics',
    id: channelId,
    key: getApiKey(),
  });

  const res = await fetch(`${YOUTUBE_API_BASE}/channels?${params}`);
  if (!res.ok) return null;

  const data = await res.json();
  if (!data.items || data.items.length === 0) return null;

  const item = data.items[0];
  return {
    id: item.id,
    name: item.snippet.title,
    thumbnail: item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default?.url,
    subscriberCount: formatViewCount(item.statistics.subscriberCount || '0'),
    videoCount: item.statistics.videoCount || '0',
  };
}

/**
 * Search for YouTube channels
 */
export async function searchChannels(query: string, maxResults: number = 10): Promise<YouTubeChannel[]> {
  const params = new URLSearchParams({
    part: 'snippet',
    q: query,
    type: 'channel',
    maxResults: String(maxResults),
    key: getApiKey(),
  });

  const res = await fetch(`${YOUTUBE_API_BASE}/search?${params}`);
  if (!res.ok) return [];

  const data = await res.json();
  const channelIds = data.items.map((item: any) => item.snippet.channelId).join(',');

  // Get full channel details
  const detailParams = new URLSearchParams({
    part: 'snippet,statistics',
    id: channelIds,
    key: getApiKey(),
  });

  const detailRes = await fetch(`${YOUTUBE_API_BASE}/channels?${detailParams}`);
  if (!detailRes.ok) return [];

  const detailData = await detailRes.json();
  return detailData.items.map((item: any) => ({
    id: item.id,
    name: item.snippet.title,
    thumbnail: item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default?.url,
    subscriberCount: formatViewCount(item.statistics.subscriberCount || '0'),
    videoCount: item.statistics.videoCount || '0',
  }));
}

/**
 * Get music categories / genres with popular playlists
 */
export async function getMusicPlaylists(query: string, maxResults: number = 6): Promise<any[]> {
  const params = new URLSearchParams({
    part: 'snippet',
    q: query + ' music playlist',
    type: 'playlist',
    maxResults: String(maxResults),
    key: getApiKey(),
  });

  const res = await fetch(`${YOUTUBE_API_BASE}/search?${params}`);
  if (!res.ok) return [];

  const data = await res.json();
  return data.items.map((item: any) => ({
    id: item.id.playlistId,
    title: item.snippet.title,
    description: item.snippet.description,
    thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.medium?.url,
    channelTitle: item.snippet.channelTitle,
  }));
}

/**
 * Get items from a playlist
 */
export async function getPlaylistItems(playlistId: string, maxResults: number = 25): Promise<YouTubePlaylistItem[]> {
  const params = new URLSearchParams({
    part: 'snippet',
    playlistId,
    maxResults: String(maxResults),
    key: getApiKey(),
  });

  const res = await fetch(`${YOUTUBE_API_BASE}/playlistItems?${params}`);
  if (!res.ok) return [];

  const data = await res.json();
  return data.items
    .filter((item: any) => item.snippet.resourceId?.videoId)
    .map((item: any) => ({
      id: item.id,
      title: item.snippet.title,
      thumbnail: item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default?.url,
      channelTitle: item.snippet.channelTitle,
      videoId: item.snippet.resourceId.videoId,
      position: item.snippet.position,
    }));
}
