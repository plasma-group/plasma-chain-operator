const log = require('debug')('info:event-watcher')

class EventWatcher {
  constructor (web3, contract, topic, finalityDepth) {
    this.web3 = web3
    this.contract = contract
    this.topic = topic
    this.finalityDepth = finalityDepth
    this.lastLoggedBlock = 0
  }

  subscribe (callback) {
    log('Subscribing to topic')
    this.web3.eth.subscribe('newBlockHeaders', (err, block) => {
      if (err) {
        throw err
      }
      log('New block event triggered! Last logged block:', this.lastLoggedBlock)
      // Get most recent events
      this.contract.getPastEvents(this.topic, {
        fromBlock: this.lastLoggedBlock + 1,
        toBlock: block.number - this.finalityDepth
      }, callback)
      this.lastLoggedBlock = block.number
    })
  }
}

module.exports = EventWatcher
