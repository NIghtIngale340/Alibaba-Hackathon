import OSS from "ali-oss";

export function getOSSClient() {
  return new OSS({
    region: process.env.OSS_REGION!,
    accessKeyId: process.env.OSS_ACCESS_KEY_ID!,
    accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET!,
    bucket: process.env.OSS_BUCKET!,
  });
}

export async function uploadToOSS(
  fileName: string,
  content: string | Buffer
): Promise<string> {
  const client = getOSSClient();
  const result = await client.put(fileName, Buffer.from(content));
  return result.url;
}

export async function getFromOSS(fileName: string): Promise<Buffer> {
  const client = getOSSClient();
  const result = await client.get(fileName);
  return result.content as Buffer;
}
