const Web3 = require('web3')
const BN = Web3.utils.BN
const utils = require('../src/utils.js')
const TYPE_BYTE_SIZE = require('../src/constants.js').TYPE_BYTE_SIZE
const models = require('plasma-utils').serialization.models
const Transfer = models.Transfer
const Signature = models.Signature
const UnsignedTransaction = require('plasma-utils').serialization.models.UnsignedTransaction
const SignedTransaction = models.SignedTransaction
const log = require('debug')('info:node')

const fakeSig = {
  v: 'ff',
  r: '0000000000000000000000000000000000000000000000000000000000000000',
  s: '0000000000000000000000000000000000000000000000000000000000000000'
}

class MockNode {
  constructor (operator, account, peerList) {
    this.operator = operator
    this.account = account
    this.peerList = peerList
    this.ranges = []
    this.pendingRanges = []
  }

  processPendingRanges () {
    for (const pr of this.pendingRanges) {
      utils.addRange(this.ranges, pr[0], pr[1])
    }
    this.pendingRanges = []
  }

  async deposit (coinType, amount) {
    const encodedDeposit = await this.operator.addDeposit(Buffer.from(Web3.utils.hexToBytes(this.account.address)), coinType, amount)
    const deposit = new UnsignedTransaction(encodedDeposit).transfers[0]

    const start = new BN(utils.getCoinId(deposit.token, deposit.start))
    const end = new BN(utils.getCoinId(deposit.token, deposit.end)).subn(1)
    log(this.account.address, 'adding range from deposit with start:', deposit.start.toString('hex'), '- end:', deposit.end.toString('hex'))
    utils.addRange(this.ranges, start, end)
  }

  getRandomSubrange (startBound, endBound, maxSize) {
    const totalSize = endBound.sub(startBound).toNumber()
    const startOffset = Math.floor(Math.random() * totalSize)
    const endOffset = Math.floor(Math.random() * (totalSize - startOffset))
    const start = startBound.add(new BN(startOffset))
    const end = endBound.sub(new BN(endOffset))
    return [start, end]
  }

  async sendRandomTransaction (blockNumber, maxSize) {
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
    let start, end
    if (maxSize === undefined) {
      [start, end] = this.getRandomSubrange(startBound, endBound)
    } else {
      start = startBound
      end = startBound.add(new BN(Math.floor(Math.random()) * maxSize + 1))
    }
    const type = new BN(startBoundId.toArrayLike(Buffer, 'big', 16).slice(0, TYPE_BYTE_SIZE))
    const startId = new BN(utils.getCoinId(type, start))
    const endId = new BN(utils.getCoinId(type, end))
    // Get a random recipient that isn't us
    let recipient = this.peerList[Math.floor(Math.random() * this.peerList.length)]
    while (recipient === this) {
      recipient = this.peerList[Math.floor(Math.random() * this.peerList.length)]
    }
    const tx = this.makeTx(
      [{ sender: this.account.address, recipient: recipient.account.address, token: type, start, end }],
      [fakeSig],
      blockNumber
    )
    // Update ranges
    log(this.account.address, 'trying to send a transaction with', 'start:', new BN(startId).toString('hex'), '-- end', new BN(endId).toString('hex'))
    utils.subtractRange(this.ranges, startId, endId)
    recipient.pendingRanges.push([new BN(startId), new BN(endId)])
    // Add transaction
    await this.operator.addTransaction(tx)
    log('sent a transaction!')
  }

  makeTx (rawTrs, rawSigs, block) {
    const trs = []
    const sigs = []
    for (let i = 0; i < rawTrs.length; i++) {
      trs.push(new Transfer(rawTrs[i]))
      sigs.push(new Signature(rawSigs[i]))
    }
    const tx = new SignedTransaction({transfers: trs, signatures: sigs, block: block})
    return tx
  }
}

module.exports = MockNode
