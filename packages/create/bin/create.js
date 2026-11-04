#!/usr/bin/env node
import { run } from '../lib/index.js'

run().catch((error) => {
  console.error(error?.name === 'CreateError' ? `error: ${error.message}` : error?.stack ?? error)
  process.exit(1)
})
