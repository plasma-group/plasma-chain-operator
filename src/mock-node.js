const Web3 = require('web3')
const BN = Web3.utils.BN
const utils = require('../src/utils.js')
const TYPE_BYTE_SIZE = require('../src/constants.js').TYPE_BYTE_SIZE
const models = require('plasma-utils').serialization.models
const Signature = require('plasma-utils').serialization.models.Signature
const UnsignedTransaction = require('plasma-utils').serialization.models
  .UnsignedTransaction
const SignedTransaction = models.SignedTransaction
const log = require('debug')('info:node')

const fakeSig = {
  // Used when isSigned is set to false
  v: 'ff',
  r: '0000000000000000000000000000000000000000000000000000000000000000',
  s: '0000000000000000000000000000000000000000000000000000000000000000',
}

class MockNode {
  constructor(operator, account, peerList) {
    this.operator = operator
    this.account = account
    this.peerList = peerList
    this.ranges = []
    this.pendingRanges = []
  }

  processPendingRanges() {
    for (const pr of this.pendingRanges) {
      utils.addRange(this.ranges, pr[0], pr[1])
    }
    this.pendingRanges = []
  }

  async deposit(coinType, amount) {
    const encodedDeposit = await this.operator.addDeposit(
      Buffer.from(Web3.utils.hexToBytes(this.account.address)),
      coinType,
      amount
    )
    const deposit = new UnsignedTransaction(encodedDeposit).transfers[0]
    const start = new BN(utils.getCoinId(deposit.token, deposit.start))
    const end = new BN(utils.getCoinId(deposit.token, deposit.end))
    log(
      this.account.address,
      'adding range from deposit with start:',
      start.toString('hex'),
      '- end:',
      end.toString('hex')
    )
    utils.addRange(this.ranges, new BN(start), new BN(end))
  }

  getRandomSubrange(startBound, endBound, maxSize) {
    const totalSize = endBound.sub(startBound).toNumber()
    const startOffset = Math.floor(Math.random() * totalSize)
    const endOffset = Math.floor(Math.random() * (totalSize - startOffset))
    const start = startBound.add(new BN(startOffset))
    const end = endBound.sub(new BN(endOffset))
    return [start, end]
  }

  async sendRandomTransaction(blockNumber, maxSize, isSigned) {
    if (this.ranges.length === 0) {
      log('got no money to send!')
      return
    }
    let startIndex = Math.floor(Math.random() * (this.ranges.length / 2))
    startIndex -= startIndex % 2
    const startBoundId = this.ranges[startIndex]
    const endBoundId = this.ranges[startIndex + 1]
    // Come up with a random range within some bounds
    const startBound = new BN(
      startBoundId.toArrayLike(Buffer, 'big', 16).slice(TYPE_BYTE_SIZE)
    )
    const endBound = new BN(
      endBoundId.toArrayLike(Buffer, 'big', 16).slice(TYPE_BYTE_SIZE)
    )
    // Get the actual thing
    let start, end
    if (maxSize === undefined) {
      ;[start, end] = this.getRandomSubrange(startBound, endBound)
    } else {
      start = startBound
      end = startBound.add(new BN(Math.floor(Math.random()) * maxSize + 1))
    }
    const type = new BN(
      startBoundId.toArrayLike(Buffer, 'big', 16).slice(0, TYPE_BYTE_SIZE)
    )
    const startId = new BN(utils.getCoinId(type, start))
    const endId = new BN(utils.getCoinId(type, end))
    // Get a random recipient that isn't us
    let recipient = this.peerList[
      Math.floor(Math.random() * this.peerList.length)
    ]
    while (recipient === this) {
      recipient = this.peerList[
        Math.floor(Math.random() * this.peerList.length)
      ]
    }
    const tx = this.makeTx(
      {
        sender: this.account.address,
        recipient: recipient.account.address,
        token: type,
        start,
        end,
      },
      blockNumber,
      isSigned
    )
    // Add transaction
    const txResult = await this.operator.addTransaction(tx)
    if (txResult.error !== undefined) {
      // This means we got an error! Probably need to update the block number
      log('Error in transaction! We may need to update the block number...')
      return false
    }
    // Update ranges
    log(
      this.account.address,
      'trying to send a transaction with',
      'start:',
      new BN(startId).toString('hex'),
      '-- end',
      new BN(endId).toString('hex')
    )
    // TODO: Move this over to the range manager code in `core`
    try {
      utils.subtractRange(this.ranges, startId, endId)
    } catch (err) {
      console.log('WARNING: squashing subtract range error')
      return
      // throw err
    }
    recipient.pendingRanges.push([new BN(startId), new BN(endId)])
    log('sent a transaction!')
  }

  makeTx(tr, block, isSigned) {
    let sig
    if (isSigned) {
      const txHash = new UnsignedTransaction({ block, transfers: [tr] }).hash
      const encodedSig = this.account.sign(txHash)
      sig = new Signature(encodedSig)
    } else {
      sig = fakeSig
    }
    const tx = new SignedTransaction({
      transfers: [tr],
      signatures: [sig],
      block: block,
    })
    return tx
  }
}

module.exports = MockNode
