import YTMusic from 'ytmusic-api';

/**
 * YouTube Music API wrapper (unofficial)
 * Replaces the limited YouTube Data API v3 for better music discovery
 */

const ytmusic = new YTMusic();
let isInitialized = false;

async function ensureInitialized() {
  if (!isInitialized) {
    await ytmusic.initialize();
    isInitialized = true;
    console.log('✅ YTMusic API initialized');
  }
}

// Interfaces to maintain compatibility with the existing frontend
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

/**
 * Format view count to human-readable (e.g. 1234567 -> 1.2M)
 */
function formatViewCount(count: number | string): string {
    const num = typeof count === 'string' ? parseInt(count.replace(/[^\d]/g, '')) : count;
    if (isNaN(num)) return '0';
    if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(1)}B`;
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
    return String(num);
}

/**
 * Format duration (seconds to M:SS)
 */
function formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
}

/**
 * Search YouTube Music for songs
 */
export async function searchMusic(query: string, maxResults: number = 20): Promise<YouTubeSearchResult[]> {
  await ensureInitialized();
  
  // Buscamos específicamente CANCIONES para mayor calidad
  const results = await ytmusic.searchSongs(query);
  
  return results.slice(0, maxResults).map((item: any) => ({
    id: item.videoId,
    title: item.name,
    artist: item.artist.name,
    thumbnail: item.thumbnails[item.thumbnails.length - 1]?.url || '',
    duration: formatDuration(item.duration),
    publishedAt: new Date().toISOString(), // YTMusic no siempre da la fecha exacta en búsqueda
    channelId: item.artist.artistId || '',
    viewCount: 'Music Track',
  }));
}

/**
 * Get trending music videos (Charts)
 */
export async function getTrendingMusic(maxResults: number = 20, _regionCode: string = 'MX'): Promise<YouTubeVideoDetail[]> {
  await ensureInitialized();
  
  // YTMusic no tiene un "getTrending" universal simple, usamos la búsqueda por "charts"
  const results = await ytmusic.searchSongs("charts mexico");
  
  return results.slice(0, maxResults).map((item: any) => ({
    id: item.videoId,
    title: item.name,
    artist: item.artist.name,
    thumbnail: item.thumbnails[0]?.url || '',
    thumbnailHigh: item.thumbnails[item.thumbnails.length - 1]?.url || '',
    duration: formatDuration(item.duration),
    publishedAt: new Date().toISOString(),
    channelId: item.artist.artistId || '',
    viewCount: 'Popular',
    likeCount: 'N/A',
    description: `Canción popular de ${item.artist.name}`,
  }));
}

/**
 * Get a single video's full details
 */
export async function getVideoById(videoId: string): Promise<YouTubeVideoDetail | null> {
  await ensureInitialized();
  
  // Realizamos una búsqueda exacta para obtener los metadatos si no hay getSongByID directo confiable
  const results = await ytmusic.searchSongs(videoId);
  const item = results.find(r => r.videoId === videoId);
  
  if (!item) return null;

  return {
    id: item.videoId,
    title: item.name,
    artist: item.artist.name,
    thumbnail: item.thumbnails[0]?.url || '',
    thumbnailHigh: item.thumbnails[item.thumbnails.length - 1]?.url || '',
    duration: formatDuration(item.duration),
    publishedAt: new Date().toISOString(),
    channelId: item.artist.artistId || '',
    viewCount: 'Music Detail',
    likeCount: 'N/A',
    description: `Track: ${item.name} by ${item.artist.name}`,
  };
}

/**
 * Get related videos / Recommendations
 */
export async function getRelatedVideos(videoId: string, maxResults: number = 10): Promise<YouTubeSearchResult[]> {
  await ensureInitialized();
  
  try {
    // YTMusic usa "Up Next" para recomendaciones
    // Si la librería no tiene getRecommendations, usamos la búsqueda del artista
    const song = await getVideoById(videoId);
    if (!song) return [];

    const results = await ytmusic.searchSongs(`${song.artist} radio`);
    
    return results
      .filter(item => item.videoId !== videoId)
      .slice(0, maxResults)
      .map((item: any) => ({
        id: item.videoId,
        title: item.name,
        artist: item.artist.name,
        thumbnail: item.thumbnails[item.thumbnails.length - 1]?.url || '',
        duration: formatDuration(item.duration),
        publishedAt: new Date().toISOString(),
        channelId: item.artist.artistId || '',
      }));
  } catch (e) {
    console.error('getRelatedVideos error:', e);
    return [];
  }
}

/**
 * Get artist details
 */
export async function getChannel(artistId: string): Promise<YouTubeChannel | null> {
  await ensureInitialized();
  
  try {
    const artist = await ytmusic.getArtist(artistId);
    if (!artist) return null;

    return {
      id: artist.artistId,
      name: artist.name,
      thumbnail: artist.thumbnails[artist.thumbnails.length - 1]?.url || '',
      subscriberCount: 'N/A', // YTMusic no siempre da subs
      videoCount: 'Music Artist',
    };
  } catch (e) {
      // Fallback a búsqueda si el ID falla
      return null;
  }
}

/**
 * Search for Artists
 */
export async function searchChannels(query: string, maxResults: number = 10): Promise<YouTubeChannel[]> {
  await ensureInitialized();
  
  const results = await ytmusic.searchArtists(query);
  
  return results.slice(0, maxResults).map((item: any) => ({
    id: item.artistId,
    name: item.name,
    thumbnail: item.thumbnails[item.thumbnails.length - 1]?.url || '',
    subscriberCount: 'Artist',
    videoCount: 'Music',
  }));
}

/**
 * Search for music playlists
 */
export async function getMusicPlaylists(query: string, maxResults: number = 6): Promise<any[]> {
  await ensureInitialized();
  
  const results = await ytmusic.searchPlaylists(query);
  
  return results.slice(0, maxResults).map((item: any) => ({
    id: item.playlistId,
    title: item.name,
    description: `Playlist by ${item.artist?.name || 'YouTube Music'}`,
    thumbnail: item.thumbnails[item.thumbnails.length - 1]?.url || '',
    channelTitle: item.artist?.name || 'YouTube Music',
  }));
}

/**
 * Get items from a playlist
 */
export async function getPlaylistItems(playlistId: string, maxResults: number = 25): Promise<YouTubePlaylistItem[]> {
  await ensureInitialized();
  
  const playlist = await ytmusic.getPlaylist(playlistId);
  if (!playlist) return [];

  return playlist.tracks.slice(0, maxResults).map((item: any, index: number) => ({
    id: `${playlistId}_${index}`,
    title: item.name,
    thumbnail: item.thumbnails[0]?.url || '',
    channelTitle: item.artist.name,
    videoId: item.videoId,
    position: index,
  }));
}
