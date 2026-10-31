#!/usr/bin/env node
import { run } from '../lib/cli.js'

run().catch((error) => {
  // errors of the user's input are printed without a stack
  console.error(error?.name === 'CommandError' ? `error: ${error.message}` : error?.stack ?? error)
  process.exit(1)
})
