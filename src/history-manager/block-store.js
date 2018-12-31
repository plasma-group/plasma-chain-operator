const log = require('debug')('info:history-store')

class BlockStore {
  constructor (db) {
    log('Creating new history store')
    this.db = db
  }

  generateBlock (txLogPath) {
    log('Generating new block based on path:', txLogPath)
  }
}

module.exports = BlockStore
