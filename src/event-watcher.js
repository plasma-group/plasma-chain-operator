const log = require('debug')('info:event-watcher')

class EventWatcher {
  constructor (web3, contract, topic, finalityDepth, pollInterval) {
    this.web3 = web3
    this.contract = contract
    this.topic = topic
    this.finalityDepth = finalityDepth
    this.pollInterval = pollInterval
    this.lastLoggedBlock = 0
  }

  subscribe (callback) {
    if (this.pollInterval !== undefined) {
      this.subscribePolling(callback)
    } else {
      this.subscribeWebSockets(callback)
    }
  }

  subscribePolling (callback) {
    log('Subscribing to topic by polling')
    // Poll for the most recent events every $pollInterval milliseconds
    setInterval(async () => {
      const block = await this.web3.eth.getBlockNumber()
      if (block === this.lastLoggedBlock) {
        return
      }
      log('New block event triggered! Last logged block:', this.lastLoggedBlock)
      // Get most recent events
      this.contract.getPastEvents(this.topic, {
        fromBlock: this.lastLoggedBlock + 1,
        toBlock: block - this.finalityDepth
      }, callback)
      this.lastLoggedBlock = block - this.finalityDepth
    }, this.pollInterval)
  }

  subscribeWebSockets (callback) {
    log('Subscribing to topic with websockets')
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
      this.lastLoggedBlock = block.number - this.finalityDepth
    })
  }
}

module.exports = EventWatcher
