const web3 = require('../src/eth.js')
const BN = web3.utils.BN
const utils = require('../src/utils.js')
const TYPE_BYTE_SIZE = require('../src/constants.js').TYPE_BYTE_SIZE
const encoder = require('plasma-utils').encoder
const log = require('debug')('info:node')

class MockNode {
  constructor (state, account, peerList) {
    this.state = state
    this.account = account
    this.peerList = peerList
    this.ranges = []
    this.pendingRanges = []
    this.addLog = []
  }

  processPendingRanges () {
    for (const pr of this.pendingRanges) {
      utils.addRange(this.ranges, pr[0], pr[1])
    }
    this.pendingRanges = []
  }

  async deposit (tokenType, amount) {
    const deposit = await this.state.addDeposit(Buffer.from(web3.utils.hexToBytes(this.account.address)), tokenType, amount)
    const start = new BN(utils.getTokenId(deposit.type, deposit.start))
    const end = new BN(utils.getTokenId(deposit.type, deposit.end))
    utils.addRange(this.ranges, start, end)
  }

  getRandomSubrange (startBound, endBound) {
    const totalSize = endBound.sub(startBound).toNumber()
    const startOffset = Math.floor(Math.random() * totalSize)
    const endOffset = Math.floor(Math.random() * (totalSize - startOffset))
    const start = startBound.add(new BN(startOffset))
    const end = endBound.sub(new BN(endOffset))
    return [start, end]
  }

  async sendRandomTransaction () {
    if (this.ranges.length === 0) {
      log('got no money to send!')
      return
    }
    let startIndex = Math.floor(Math.random() * (this.ranges.length / 2))
    startIndex -= startIndex % 2
    const startBoundId = this.ranges[startIndex]
    const endBoundId = this.ranges[startIndex + 1]
    // Come up with a random range within some bounds
    const startBound = new BN(startBoundId.toArrayLike(Buffer, 'big', 16).slice(TYPE_BYTE_SIZE))
    const endBound = new BN(endBoundId.toArrayLike(Buffer, 'big', 16).slice(TYPE_BYTE_SIZE))
    // Get the actual thing
    const [start, end] = this.getRandomSubrange(startBound, endBound)
    const type = new BN(startBoundId.toArrayLike(Buffer, 'big', 16).slice(0, TYPE_BYTE_SIZE))
    const startId = new BN(utils.getTokenId(type, start))
    const endId = new BN(utils.getTokenId(type, end))
    // Get a random recipient that isn't us
    let recipient = this.peerList[Math.floor(Math.random() * this.peerList.length)]
    while (recipient === this) {
      recipient = this.peerList[Math.floor(Math.random() * this.peerList.length)]
    }
    const tx = this.makeTx(this.account.address, recipient.account.address, type, start, end, this.state.blocknumber)
    await this.state.addTransaction(tx)
    // Update ranges
    utils.subtractRange(this.ranges, startId, endId)
    recipient.pendingRanges.push([new BN(startId), new BN(endId)])
    recipient.addLog.push([this.account.address, start, end])
    log('sent a transaction!')
  }

  makeTx (sender, recipient, type, start, end, blocknumber) {
    return new encoder.Transaction([[sender, recipient, type, start, end, blocknumber]], [[0, 0, 0]])
  }
}

module.exports = MockNode
