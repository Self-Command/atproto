import { Database, PlcServer } from '@did-plc/server'

const postgresUrl = process.env.PLC_DB_POSTGRES_URL
const db = postgresUrl
  ? Database.postgres({
      url: postgresUrl,
      schema: process.env.PLC_DB_POSTGRES_SCHEMA || 'plc',
    })
  : Database.mock()

if (postgresUrl) {
  await db.migrateToLatestOrThrow()
}

const port = Number(process.env.PLC_PORT || 3000)
const server = PlcServer.create({
  db,
  port,
  version: process.env.PLC_VERSION || 'workspace-dev',
})
await server.start()
console.log(`PLC listening on ${port} (${postgresUrl ? 'postgres' : 'memory'})`)

const shutdown = async () => {
  await server.destroy()
  await db.close()
  process.exit(0)
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
