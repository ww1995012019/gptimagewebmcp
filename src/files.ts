import path from 'node:path';
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import sharp from 'sharp';
export class SafeFiles {
  constructor(readonly roots: string[]) {}
  async check(target: string) {
    const absolute = path.resolve(target);
    const root = this.roots.find(r => { const rel = path.relative(path.resolve(r),absolute); return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel)); });
    if (!root || /[<>"|?*\x00-\x1f]/.test(path.basename(absolute)) || /:/.test(absolute.slice(path.parse(absolute).root.length))) throw new Error(`PATH_DENIED: ${absolute} is outside the allowed folders (${this.roots.join('; ')}) or has an invalid filename. Add the folder to IMAGE_ALLOWED_DIRS in .env if needed.`);
    // Check all existing ancestors, including root ancestors, for symlinks/junctions.
    let cursor = path.parse(absolute).root;
    for (const part of absolute.slice(cursor.length).split(path.sep).filter(Boolean)) {
      cursor = path.join(cursor,part);
      try { if ((await fs.lstat(cursor)).isSymbolicLink()) throw new Error('PATH_DENIED: symbolic link or junction'); }
      catch(e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
    }
    return absolute;
  }
  async read(target: string) {
    const p = await this.check(target); const stat = await fs.stat(p);
    if (!stat.isFile() || stat.size > 25*1024*1024) throw new Error('INPUT_INVALID: maximum 25 MB');
    const data = await fs.readFile(p); await sharp(data).metadata(); return data;
  }
  async save(target: string, data: Buffer, overwrite = false) {
    const p = await this.check(target);
    if (!['.png','.webp'].includes(path.extname(p).toLowerCase())) throw new Error('FORMAT_INVALID: use .png or .webp');
    const encoded = await sharp(data).toFormat(p.toLowerCase().endsWith('.webp') ? 'webp' : 'png').toBuffer();
    await fs.mkdir(path.dirname(p), {recursive:true}); await this.check(p);
    const handle = await fs.open(p, constants.O_WRONLY | constants.O_CREAT | (overwrite ? constants.O_TRUNC : constants.O_EXCL) | (constants.O_NOFOLLOW || 0));
    try { await handle.writeFile(encoded); } finally { await handle.close(); }
    const meta = await sharp(encoded).metadata();
    return {absolute_path:p, relative_path:path.relative(this.roots[0],p),width:meta.width,height:meta.height,bytes:encoded.length,mime_type:p.endsWith('.webp')?'image/webp':'image/png'};
  }
}
