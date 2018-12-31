const log = require('debug')('info:block-store')

class BlockStore {
  constructor (db) {
    log('Creating new block store')
    this.db = db
  }

  generateBlock (txLogPath) {
    log('Generating new block based on path:', txLogPath)
  }
}

module.exports = BlockStore
