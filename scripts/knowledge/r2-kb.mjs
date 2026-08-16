// 知识库 R2 发布助手（共用）
// 复用 VueChestServer 的 R2 凭证与 @aws-sdk（不向前端仓库引入 aws-sdk 依赖）。
// 未配置 R2 环境变量时 getR2() 返回 null，调用方据此跳过上传（便于离线开发）。
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '../..')

function loadR2Env() {
  if (process.env.R2_ACCOUNT_ID) return true
  const envPath = resolve(ROOT, '../VueChestServer/.env')
  if (!existsSync(envPath)) return false
  const txt = readFileSync(envPath, 'utf8')
  for (const line of txt.split('\n')) {
    const m = line.match(/^\s*(R2_[A-Z_]+)\s*=\s*(.*?)\s*$/)
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return !!process.env.R2_ACCOUNT_ID
}

let _r2 = null
export function getR2() {
  if (_r2) return _r2
  if (!loadR2Env()) return null
  const s3ModulePath = resolve(ROOT, '../VueChestServer/node_modules/@aws-sdk/client-s3')
  const { S3Client, PutObjectCommand, ListObjectsV2Command, GetObjectCommand, DeleteObjectCommand, CopyObjectCommand } = require(
    s3ModulePath,
  )
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  })
  const BUCKET = process.env.R2_BUCKET_NAME || 'vuechest'
  const PUBLIC_URL = (process.env.R2_PUBLIC_URL || 'https://files.020201.xyz').replace(/\/$/, '')
  _r2 = {
    client,
    BUCKET,
    PUBLIC_URL,
    S3: { PutObjectCommand, ListObjectsV2Command, GetObjectCommand, DeleteObjectCommand, CopyObjectCommand },
    prefix: 'stock/knowledge',
  }
  return _r2
}

export async function uploadFile(r2, localPath, key, contentType = 'application/json; charset=utf-8') {
  const body = readFileSync(localPath)
  await r2.client.send(
    new r2.S3.PutObjectCommand({ Bucket: r2.BUCKET, Key: key, Body: body, ContentType: contentType }),
  )
  return `${r2.PUBLIC_URL}/${key}`
}

export async function listObjects(r2, prefix) {
  const out = []
  let token
  do {
    const res = await r2.client.send(
      new r2.S3.ListObjectsV2Command({ Bucket: r2.BUCKET, Prefix: prefix, ContinuationToken: token }),
    )
    for (const c of res.Contents || []) out.push(c.Key)
    token = res.NextContinuationToken
  } while (token)
  return out
}

export async function downloadFile(r2, key, localPath) {
  const res = await r2.client.send(new r2.S3.GetObjectCommand({ Bucket: r2.BUCKET, Key: key }))
  const bytes = await res.Body.transformToByteArray()
  mkdirSync(dirname(localPath), { recursive: true })
  writeFileSync(localPath, Buffer.from(bytes))
}

// 删除 R2 对象（清理孤儿产物用）。凭证需具备对象删除权限。
export async function deleteObjects(r2, keys) {
  for (const key of keys) {
    await r2.client.send(new r2.S3.DeleteObjectCommand({ Bucket: r2.BUCKET, Key: key }))
  }
}

// 服务端复制对象（改前缀迁移用，不下载内容）。凭证需具备对象读+写权限。
export async function copyObject(r2, fromKey, toKey) {
  await r2.client.send(
    new r2.S3.CopyObjectCommand({
      Bucket: r2.BUCKET,
      CopySource: `${r2.BUCKET}/${fromKey}`,
      Key: toKey,
    }),
  )
}
