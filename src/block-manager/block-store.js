const fs = require('fs')
const log = require('debug')('info:block-store')

class BlockStore {
  constructor (db) {
    log('Creating new block store')
    this.db = db
  }

  generateBlock (txLogPath) {
    log('Generating new block based on path:', txLogPath)
    const readStream = fs.createReadStream(txLogPath)
    readStream.on('data', function (chunk) {
      log(chunk.length)
    })
  }
}

module.exports = BlockStore
