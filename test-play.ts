import play from 'play-dl';
import fs from 'fs';

async function test() {
  try {
    const rawCookies = fs.readFileSync('../cookies.txt', 'utf8');
    const cookieLines = rawCookies.split('\n').filter(l => l && !l.startsWith('#'));
    let cookieStr = '';
    for (const line of cookieLines) {
      const parts = line.split('\t');
      if (parts.length >= 7) {
        cookieStr += `${parts[5]}=${parts[6].trim()}; `;
      }
    }
    
    console.log('Cookies loaded:', cookieStr.substring(0, 50) + '...');
    play.setToken({ youtube: { cookie: cookieStr } });
    
    const stream = await play.stream('https://www.youtube.com/watch?v=juRFjpB5Ppg');
    console.log('Stream URL:', stream.url.substring(0, 100));
    
  } catch (e) {
    console.error(e);
  }
}
test();
