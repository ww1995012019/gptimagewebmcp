import sharp from 'sharp';
import type { ImageProvider, ImageRequest } from './types.js';
export class MockProvider implements ImageProvider {
  async generate(r:ImageRequest) { const [width,height] = r.size.split('x').map(Number); return sharp({create:{width:width||1024,height:height||1024,channels:4,background:{r:30,g:80,b:140,alpha:r.background==='transparent'?0:1}}}).png().toBuffer(); }
  async close() {}
}
