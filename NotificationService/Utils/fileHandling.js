import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const s3Client = new S3Client({
  endpoint: "https://your-hetzner-bucket-name.obs.eu-central-1.hetzner.cloud",
  region: "eu-central-1",
  credentials: {
    accessKeyId: process.env.HETZNER_ACCESS_KEY,
    secretAccessKey: process.env.HETZNER_SECRET_KEY,
  },
  forcePathStyle: true,
});

export async function uploadFile(fileData) {
  try {
    const { fileName, fileType, fileData: base64Data } = fileData;

    // Generate unique file key
    const fileKey = `uploads/${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 8)}-${fileName}`;

    // Upload to Hetzner
    await s3Client.send(
      new PutObjectCommand({
        Bucket: process.env.HETZNER_BUCKET_NAME,
        Key: fileKey,
        Body: Buffer.from(base64Data, "base64"),
        ContentType: fileType,
        ACL: "public-read",
      })
    );

    // Return public URL
    return {
      url: `https://${process.env.HETZNER_BUCKET_NAME}.obs.eu-central-1.hetzner.cloud/${fileKey}`,
      type: getFileType(fileType),
      filename: fileName,
      size: Buffer.byteLength(Buffer.from(base64Data, "base64")),
    };
  } catch (error) {
    console.error("File upload error:", error);
    throw error;
  }
}

function getFileType(mimeType) {
  if (mimeType.startsWith("image/")) {
    return mimeType.includes("gif") ? "gif" : "image";
  }
  return "file";
}
