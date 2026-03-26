import lzmaModule from "lzma/src/lzma_worker.js";
const LZMA = lzmaModule.LZMA;

console.log("[lzma] module loaded, LZMA object:", LZMA);

export function lzmaDecompress(arrayBuffer) {
  return new Promise((resolve, reject) => {
    const data = new Uint8Array(arrayBuffer);
    console.log(`[lzma] decompressing ${data.length} compressed bytes…`);

    LZMA.decompress(data, (result, error) => {
      if (error) {
        console.error("[lzma] decompress error:", error);
        return reject(new Error(String(error)));
      }
      // lzma package returns a plain Array of signed bytes
      const length = Array.isArray(result) ? result.length : result.byteLength ?? result.length;
      console.log(`[lzma] decompressed → ${length} bytes`);
      resolve(result);
    });
  });
}
