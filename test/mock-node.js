const web3 = require('../eth.js')
const BN = web3.utils.BN
const utils = require('../utils.js')
const TYPE_BYTE_SIZE = require('../constants.js').TYPE_BYTE_SIZE
const tSerializer = require('../transaction-serialization.js')

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

  async sendRandomTransaction () {
    if (this.ranges.length === 0) {
      // console.log('got no money to send!')
      return
    }
    let startIndex = Math.floor(Math.random() * (this.ranges.length / 2))
    startIndex -= startIndex % 2
    const startId = this.ranges[startIndex]
    const endId = this.ranges[startIndex + 1]
    const type = new BN(startId.toArrayLike(Buffer, 'big', 16).slice(0, TYPE_BYTE_SIZE))
    const start = new BN(startId.toArrayLike(Buffer, 'big', 16).slice(TYPE_BYTE_SIZE))
    const end = new BN(endId.toArrayLike(Buffer, 'big', 16).slice(TYPE_BYTE_SIZE))
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
    // console.log('sent a transaction!')
  }

  makeTx (sender, recipient, type, start, end, blocknumber) {
    const tr1 = new tSerializer.SimpleSerializableElement([sender, recipient, type, start, end, blocknumber], tSerializer.schemas.TransferRecord)
    const trList = new tSerializer.SimpleSerializableList([tr1], tSerializer.schemas.TransferRecord)
    const sig1 = new tSerializer.SimpleSerializableElement([0, 0, 0], tSerializer.schemas.Signature)
    const sigList = new tSerializer.SimpleSerializableList([sig1], tSerializer.schemas.Signature)
    const tx = new tSerializer.Transaction(trList, sigList)
    return tx
  }
}

module.exports = MockNode
