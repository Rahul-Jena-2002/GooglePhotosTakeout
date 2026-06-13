// Type declarations for piexifjs (no official @types package)
declare module 'piexifjs' {
  interface ExifObj {
    '0th': Record<number, unknown>;
    'Exif': Record<number, unknown>;
    'GPS': Record<number, unknown>;
    '1st': Record<number, unknown>;
    thumbnail: string | null;
  }

  const ImageIFD: Record<string, number>;
  const ExifIFD: Record<string, number>;
  const GPSIFD:  Record<string, number>;

  function load(jpegData: string): ExifObj;
  function dump(exifObj: ExifObj): string;
  function insert(exifStr: string, jpegData: string): string;
  function remove(jpegData: string): string;

  export default {
    load,
    dump,
    insert,
    remove,
    ImageIFD,
    ExifIFD,
    GPSIFD,
  };
}
