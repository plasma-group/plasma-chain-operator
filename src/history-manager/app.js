const levelup = require('levelup')
const leveldown = require('leveldown')
const BlockStore = require('./block-store.js')
const log = require('debug')('info:history-app')
const constants = require('../constants.js')

// Create global state object
let blockStore

async function startup (options) {
  const db = levelup(leveldown(options.dbDir))
  blockStore = new BlockStore(db, options.txLogDir)
}

process.on('message', async (m) => {
  log('History got request:', m.message)
  if (m.message.method === constants.INIT_METHOD) {
    await startup(m.message.params)
  } else if (m.message.method === constants.NEW_BLOCK_METHOD) {
    const isSuccessfullyStarted = await blockStore.generateBlock(m.message)
    if (!isSuccessfullyStarted) {
      process.send({ id: m.id, message: 'FAIL' })
    }
  } else {
    throw new Error('RPC method not recognized!')
  }
  process.send({ id: m.id, message: 'SUCESS' })
})
