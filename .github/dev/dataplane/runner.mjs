import {
  BsyncSubscription,
  Database,
  DataPlaneServer,
  RepoSubscription,
  ServerConfig,
} from '@atproto/bsky'

const db = new Database({
  url: process.env.BSKY_DB_POSTGRES_URL,
  schema: process.env.BSKY_DB_POSTGRES_SCHEMA,
  poolSize: Number(process.env.BSKY_DB_POOL_SIZE || 10),
})
await db.migrateToLatestOrThrow()
console.log('dataplane db migrated')

const port = Number(process.env.DATAPLANE_PORT || 3000)
const server = await DataPlaneServer.create(
  db,
  port,
  process.env.BSKY_DID_PLC_URL,
  globalThis.fetch,
)
console.log(`dataplane listening on ${port}`)

let repoSub
if (process.env.REPO_PROVIDER) {
  repoSub = new RepoSubscription({
    service: process.env.REPO_PROVIDER,
    db,
    idResolver: server.idResolver,
  })
  void repoSub.start().catch((err) => {
    console.error('repo subscription failed', err)
    process.exit(1)
  })
  console.log(`repo subscription started: ${process.env.REPO_PROVIDER}`)
}

let bsyncSub
if (process.env.BSKY_BSYNC_URL) {
  bsyncSub = new BsyncSubscription({ db, config: ServerConfig.readEnv() })
  bsyncSub.start()
  console.log(`bsync subscription started: ${process.env.BSKY_BSYNC_URL}`)
}

const shutdown = async () => {
  await bsyncSub?.destroy()
  await repoSub?.destroy()
  await server.destroy()
  await db.close()
  process.exit(0)
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
