export const maxImageBytes=5*1024*1024;
export const maxImagePixels=40000000;
export function isLocalImagePath(value){
 return typeof value==='string'&&/^(?:\/assets\/original\/[a-f\d]+\.(?:png|jpe?g|gif|webp)|\/assets\/uploads\/[a-f\d]{64}\.webp)$/i.test(value);
}
