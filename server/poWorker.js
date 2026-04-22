import { generate } from 'youtube-po-token-generator';

async function run() {
  try {
    const result = await generate();
    if (result && result.poToken && result.visitorData) {
      console.log(JSON.stringify(result));
    } else {
      console.error('Invalid result');
      process.exit(1);
    }
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

run();
