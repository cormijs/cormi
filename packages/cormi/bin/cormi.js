#!/usr/bin/env node
import { run } from '../lib/cli.js'

run().catch((error) => {
  console.error(error?.stack ?? error)
  process.exit(1)
})
