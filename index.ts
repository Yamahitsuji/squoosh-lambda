import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { Readable, Stream } from 'stream'
import { cpus } from 'os'
const squoosh = require('@squoosh/lib')

const client = new S3Client({})

interface Params {
  sourceBucket: string
  targetBucket: string
  objectKey: string
}

// Lambda関数のエントリポイント
export const handler = async (params: Params) => {
  const object = await getObject(params.sourceBucket, params.objectKey)
  if (!object) {
    return
  }

  const buf = await streamToBuffer(object as Readable)
  const optimized = await optimizeImage(buf)

  await putObject(params.targetBucket, params.objectKey, optimized)
}

// S3からオブジェクトを取得する
const getObject = async (bucketName: string, objectKey: string) => {
  const getCommand = new GetObjectCommand({
    Bucket: bucketName,
    Key: objectKey,
  })
  const res = await client.send(getCommand)
  return res.Body
}

// S3へオブジェクトを保存する
const putObject = async (
  bucketName: string,
  objectKey: string,
  image: Uint8Array
) => {
  const outputCommand = new PutObjectCommand({
    Bucket: bucketName,
    Key: objectKey,
    Body: image,
  })
  await client.send(outputCommand)
}

// Stream型をUint8Array型に変換する
const streamToBuffer = async (stream: Stream): Promise<Uint8Array> => {
  return await new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = []
    stream.on('data', (chunk: Uint8Array) => {
      return chunks.push(chunk)
    })
    stream.on('error', reject)
    stream.on('end', () => resolve(Buffer.concat(chunks)))
  })
}

// Squooshを使って画像を最適化する
const optimizeImage = async (original: Uint8Array): Promise<Uint8Array> => {
  const imagePool = new squoosh.ImagePool(cpus().length)
  const image = imagePool.ingestImage(original)

  const encodeOptions = {
    mozjpeg: 'auto',
  }
  await image.encode(encodeOptions)
  const encoded = await image.encodedWith.mozjpeg

  await imagePool.close()
  return encoded.binary
}
