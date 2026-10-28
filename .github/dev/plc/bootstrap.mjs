// One-shot bootstrap for the workspace dev stack: registers the PDS, AppView
// and Ozone service DIDs in the local PLC and writes the resulting secrets to
// the file mounted at PLC_BOOTSTRAP_OUT. Idempotent: existing DIDs and keys
// are reused when the local PLC still knows them.
import fs from 'node:fs'
import plcLib from '@did-plc/lib'
import cryptoLib from '@atproto/crypto'

const { Client, createOp, createUpdateOp } = plcLib
const { Secp256k1Keypair } = cryptoLib

const plcUrl = process.env.PLC_URL || 'http://plc:3000'
const outputPath = process.env.PLC_BOOTSTRAP_OUT || '/out/service.env'
const pdsUrl = process.env.PDS_PUBLIC_URL || 'http://localhost:2583'
const ozoneUrl = process.env.OZONE_PUBLIC_URL || 'http://localhost:2586'
const handleDomain = process.env.PLC_BOOTSTRAP_HANDLE_DOMAIN || 'local.test'

const client = new Client(plcUrl)
const values = readEnvFile(outputPath)
const logs = []

const pdsRotationKey = await keypair(
  'PDS_PLC_ROTATION_KEY_K256_PRIVATE_KEY_HEX',
)
const appviewRotationKey = await keypair('STACK_APPVIEW_ROTATION_KEY_HEX')
const ozoneRotationKey = await keypair('STACK_OZONE_ROTATION_KEY_HEX')
const appviewSigningKey = await keypair('BSKY_SERVICE_SIGNING_KEY')
const ozoneSigningKey = await keypair('OZONE_SIGNING_KEY_HEX')

values.PDS_JWT_SECRET ??= randomHex(32)
values.PDS_ADMIN_PASSWORD ??= randomHex(16)
values.OZONE_ADMIN_PASSWORD ??= randomHex(16)
values.BSYNC_API_KEYS ??= randomHex(24)
values.BSKY_BSYNC_API_KEY = values.BSYNC_API_KEYS

values.PDS_SERVICE_DID = await ensureDid({
  envKey: 'PDS_SERVICE_DID',
  label: 'pds',
  handle: `pds.${handleDomain}`,
  rotationKey: pdsRotationKey,
  signingKey: pdsRotationKey,
})

values.BSKY_SERVER_DID = await ensureDid({
  envKey: 'BSKY_SERVER_DID',
  label: 'appview',
  handle: `appview.${handleDomain}`,
  rotationKey: appviewRotationKey,
  signingKey: appviewSigningKey,
})

values.OZONE_SERVER_DID = await ensureDid({
  envKey: 'OZONE_SERVER_DID',
  label: 'ozone',
  handle: `ozone.${handleDomain}`,
  rotationKey: ozoneRotationKey,
  signingKey: ozoneSigningKey,
})

await ensureOzoneLabelerIdentity({
  did: values.OZONE_SERVER_DID,
  rotationKey: ozoneRotationKey,
  signingKey: ozoneSigningKey,
})

values.OZONE_APPVIEW_DID = values.BSKY_SERVER_DID
values.OZONE_PDS_DID = values.PDS_SERVICE_DID
values.PLC_BOOTSTRAP_COMPLETED_AT = new Date().toISOString()

writeEnvFile(outputPath, values)
for (const line of logs) console.log(line)
console.log(
  `bootstrap complete: pds=${values.PDS_SERVICE_DID} appview=${values.BSKY_SERVER_DID} ozone=${values.OZONE_SERVER_DID}`,
)

async function keypair(envKey) {
  if (values[envKey]) {
    return Secp256k1Keypair.import(values[envKey], { exportable: true })
  }
  const created = await Secp256k1Keypair.create({ exportable: true })
  values[envKey] = toHex(await created.export())
  return created
}

async function ensureDid({ envKey, label, handle, rotationKey, signingKey }) {
  const existingDid = values[envKey]
  if (existingDid) {
    const data = await getDocumentData(existingDid)
    if (data) {
      logs.push(`${label}: reusing ${existingDid}`)
      return existingDid
    }
    logs.push(
      `${label}: ${existingDid} is unknown to the local PLC, recreating`,
    )
  }
  const { op, did } = await createOp({
    signingKey: signingKey.did(),
    rotationKeys: [rotationKey.did()],
    handle,
    pds: pdsUrl,
    signer: rotationKey,
  })
  await client.sendOperation(did, op)
  logs.push(`${label}: created ${did}`)
  return did
}

async function ensureOzoneLabelerIdentity({ did, rotationKey, signingKey }) {
  const data = await getDocumentData(did)
  if (!data) throw new Error('ozone DID is not resolvable in the local PLC')
  const hasKey = !!data.verificationMethods?.atproto_label
  const hasService = !!data.services?.atproto_labeler
  if (hasKey && hasService) {
    logs.push('ozone: labeler identity already present')
    return
  }
  const lastOp = await client.getLastOp(did)
  const updated = await createUpdateOp(lastOp, rotationKey, (normalized) => ({
    ...normalized,
    verificationMethods: {
      ...normalized.verificationMethods,
      atproto_label: signingKey.did(),
    },
    services: {
      ...normalized.services,
      atproto_labeler: {
        type: 'AtprotoLabeler',
        endpoint: ozoneUrl,
      },
    },
  }))
  await client.sendOperation(did, updated)
  logs.push('ozone: added atproto_label key and atproto_labeler service')
}

async function getDocumentData(did) {
  try {
    return await client.getDocumentData(did)
  } catch (err) {
    if (err?.status === 404) return null
    throw err
  }
}

function readEnvFile(file) {
  const result = {}
  if (!fs.existsSync(file)) return result
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue
    const separator = line.indexOf('=')
    if (separator <= 0) continue
    result[line.slice(0, separator)] = line.slice(separator + 1)
  }
  return result
}

function writeEnvFile(file, entries) {
  const lines = ['# Generated by .github/dev/plc/bootstrap.mjs; local only.']
  for (const key of Object.keys(entries).sort()) {
    lines.push(`${key}=${entries[key]}`)
  }
  fs.writeFileSync(file, `${lines.join('\n')}\n`)
}

function randomHex(bytes) {
  return toHex(globalThis.crypto.getRandomValues(new Uint8Array(bytes)))
}

function toHex(buffer) {
  return Buffer.from(buffer).toString('hex')
}
