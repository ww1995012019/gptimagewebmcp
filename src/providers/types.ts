// input: the image to edit (edit_image). references: style/character reference images for a new image.
export interface ImageRequest { prompt:string; size:string; quality:string; background:string; input?:Buffer; references?:Buffer[] }
export interface ImageProvider { generate(request:ImageRequest):Promise<Buffer>; close():Promise<void> }
